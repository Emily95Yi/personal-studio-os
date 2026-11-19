import { collections, imageDataHeader } from '../site/studio-data.js';
import { applyStudioDelta } from '../site/studio-delta.js';

const layout = 'json-rows-v1';
const layeredLayout = 'studio-layers-v1';
const collectionStart = key => ',"' + key + '":[';
const encodedAsset = Symbol('encoded asset data');
const catalogKey = key => key + '.catalog.json';

// Capture needs record references and image signatures, never attachment bytes.
function studioCatalog(state) {
  return { ...state, assets: state.assets.map(asset => ({
    ...Object.fromEntries(Object.keys(asset).filter(key => key !== 'data').map(key => [key, asset[key]])),
    data: asset[imageDataHeader] ?? asset.data.slice(0, 32),
  })) };
}

export async function readStudioCatalog(storage, key) {
  const object = await storage.get(catalogKey(key));
  return object ? object.json() : null;
}

export async function ensureStudioCatalog(storage, key, state) {
  if (await storage.head(catalogKey(key))) return;
  await putStudioCatalog(storage, key, state);
}

function putStudioCatalog(storage, key, state) {
  return storage.put(catalogKey(key), JSON.stringify(studioCatalog(state)), {
    httpMetadata: { contentType: 'application/json' }, customMetadata: { layout: 'studio-catalog-v1' },
  });
}

async function snapshotReferences(storage, key) {
  if (!key) return [];
  const references = [key, catalogKey(key)];
  if ((await storage.head(key))?.customMetadata?.layout === layeredLayout) {
    const manifest = await (await storage.get(key)).json();
    references.push(manifest.baseKey, catalogKey(manifest.baseKey), ...manifest.deltaKeys);
  }
  return references;
}

export async function deleteStudioSnapshot(storage, key, retainedKeys = []) {
  const retained = new Set((await Promise.all(retainedKeys.filter(Boolean).map(key => snapshotReferences(storage, key)))).flat());
  const references = await snapshotReferences(storage, key);
  return Promise.all(references.filter(key => !retained.has(key)).map(key => storage.delete(key)));
}

// Metadata edits append a small immutable delta. Existing image bytes stay in
// their original snapshot instead of being parsed and rewritten on each save.
export async function putStudioDelta(storage, key, currentKey, delta, state, saveId) {
  let manifest = { baseKey: currentKey, deltaKeys: [] };
  if ((await storage.head(currentKey))?.customMetadata?.layout === layeredLayout) {
    manifest = await (await storage.get(currentKey)).json();
  }
  const deltaKey = key + '.delta.json';
  await storage.put(deltaKey, JSON.stringify(delta), { httpMetadata: { contentType: 'application/json' } });
  await Promise.all([
    storage.put(key, JSON.stringify({ baseKey: manifest.baseKey, deltaKeys: [...manifest.deltaKeys, deltaKey] }), {
      httpMetadata: { contentType: 'application/json' }, customMetadata: { layout: layeredLayout, ...(saveId && { saveId }) },
    }),
    putStudioCatalog(storage, key, state),
  ]);
}

// Keep standard JSON on disk and over HTTP. Separate records with newlines
// so R2 reads can parse them without buffering the complete Studio.
function* snapshotParts(state) {
  yield ['{\n"revision":' + JSON.stringify(state.revision ?? 0) + '\n'];
  for (const key of collections) {
    yield [collectionStart(key) + '\n'];
    for (const [index, row] of (state[key] ?? []).entries()) {
      const separator = index ? ',' : '';
      if (key === 'assets') {
        const metadata = Object.fromEntries(Object.keys(row).filter(key => key !== 'data').map(key => [key, row[key]]));
        const prefix = JSON.stringify(metadata).replace(/[^\x00-\x7f]/g,
          character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
        yield [separator + prefix.slice(0, -1) + ',"data":"'];
        // Asset data is validated base64, so it is ASCII and needs no JSON escaping.
        if (row[encodedAsset]) {
          for (const part of row[encodedAsset]) yield [part, part.byteLength];
        } else {
          yield [row.data, row.data.length];
        }
        yield ['"}\n'];
      } else {
        yield [separator + JSON.stringify(row) + '\n'];
      }
    }
    yield [']\n'];
  }
  yield ['}\n'];
}

export function streamStudioSnapshot(state) {
  const encoder = new TextEncoder();
  const parts = snapshotParts(state);
  return new ReadableStream({
    pull(controller) {
      const { value, done } = parts.next();
      if (done) controller.close();
      else controller.enqueue(typeof value[0] === 'string' ? encoder.encode(value[0]) : value[0]);
    },
  });
}

export async function putStudioSnapshot(storage, key, state, saveId) {
  const encoder = new TextEncoder();
  let byteLength = 0;
  for (const [text, knownLength] of snapshotParts(state)) {
    byteLength += knownLength ?? encoder.encode(text).byteLength;
  }
  const { readable, writable } = new FixedLengthStream(byteLength);
  const controller = new AbortController();
  try {
    await Promise.all([
      streamStudioSnapshot(state).pipeTo(writable, { signal: controller.signal }),
      storage.put(key, readable, {
        httpMetadata: { contentType: 'application/json' },
        customMetadata: { layout, ...(saveId && { saveId }) },
      }),
      putStudioCatalog(storage, key, state),
    ]);
  } finally {
    controller.abort();
  }
}

async function* linesOf(body) {
  let parts = [];
  for await (const chunk of body) {
    let start = 0;
    for (let end = chunk.indexOf(10); end !== -1; end = chunk.indexOf(10, start)) {
      if (start < end) parts.push(chunk.subarray(start, end));
      yield parts;
      parts = [];
      start = end + 1;
    }
    if (start < chunk.length) parts.push(chunk.subarray(start));
  }
  if (parts.length) throw new Error('Incomplete Studio snapshot line');
}

function decode(parts, fatal = true) {
  const decoder = new TextDecoder('utf-8', { fatal });
  return parts.map((part, index) => decoder.decode(part, { stream: index < parts.length - 1 })).join('');
}

function byteRange(parts, start, end) {
  const range = [];
  for (const part of parts) {
    if (end <= 0) break;
    if (start < part.length) range.push(part.subarray(Math.max(start, 0), end));
    start -= part.length;
    end -= part.length;
  }
  return range;
}

function snapshotAsset(parts, comma, metadataOnly) {
  const size = parts.reduce((length, part) => length + part.length, 0);
  const start = comma ? 1 : 0;
  // Reuse base64 from existing R2 objects without decoding it to a string or
  // encoding it again. Older rows with other field layouts use the JSON path.
  if (size > 8192 && decode(byteRange(parts, size - 2, size)) === '"}') {
    const head = decode(byteRange(parts, start, 8192), false);
    const marker = ',"data":"';
    const index = head.indexOf(marker);
    if (index !== -1) {
      const prefix = head.slice(0, index);
      const offset = start + new TextEncoder().encode(prefix).length + marker.length;
      const data = byteRange(parts, offset, size - 2);
      if (data.length && data.every(part => !part.includes(34))) {
        const asset = JSON.parse(prefix + '}');
        if (metadataOnly) return { ...asset, data: decode(byteRange(data, 0, 32)) };
        Object.defineProperties(asset, {
          data: { enumerable: true, get: () => decode(data) },
          [encodedAsset]: { value: data },
          [imageDataHeader]: { value: decode(byteRange(data, 0, 32)) },
        });
        return asset;
      }
    }
  }
  const asset = JSON.parse(decode(parts).slice(start));
  return metadataOnly ? { ...asset, data: asset.data.slice(0, 32) } : asset;
}

export async function readStudioSnapshot(object, { metadataOnly = false, storage } = {}) {
  if (object.customMetadata?.layout === layeredLayout) {
    const manifest = await object.json();
    const base = await storage.get(manifest.baseKey);
    if (!base) throw new Error('Missing Studio base snapshot');
    let state = await readStudioSnapshot(base, { metadataOnly, storage });
    for (const key of manifest.deltaKeys) {
      const object = await storage.get(key);
      if (!object) throw new Error('Missing Studio delta');
      const { format, ...next } = applyStudioDelta(state, await object.json());
      state = { ...next, revision: state.revision };
    }
    return metadataOnly ? studioCatalog(state) : state;
  }
  if (object.customMetadata?.layout !== layout) {
    const state = await object.json();
    return metadataOnly ? studioCatalog(state) : state;
  }
  const lines = linesOf(object.body);
  const next = async () => {
    const { value, done } = await lines.next();
    return done ? undefined : decode(value);
  };
  const expect = (actual, expected) => {
    if (actual !== expected) throw new Error('Invalid Studio snapshot');
  };
  try {
    expect(await next(), '{');
    const { revision } = JSON.parse('{' + await next() + '}');
    if (!Number.isSafeInteger(revision)) throw new Error('Invalid Studio snapshot revision');
    const state = { revision };
    for (const key of collections) {
      expect(await next(), collectionStart(key));
      const rows = state[key] = [];
      for (;;) {
        const { value: parts, done } = await lines.next();
        expect(done, false);
        if (parts.length === 1 && parts[0].length === 1 && parts[0][0] === 93) break;
        if (rows.length) expect(parts[0]?.[0], 44);
        rows.push(key === 'assets' ? snapshotAsset(parts, rows.length > 0, metadataOnly) : JSON.parse(decode(parts).slice(rows.length ? 1 : 0)));
      }
    }
    expect(await next(), '}');
    expect(await next(), undefined);
    return state;
  } finally {
    await lines.return();
  }
}
