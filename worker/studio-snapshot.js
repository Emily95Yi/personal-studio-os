import { collections } from '../site/studio-data.js';

const layout = 'json-rows-v1';
const collectionStart = key => ',"' + key + '":[';

// Keep standard JSON on disk and over HTTP. Separate records with newlines
// so R2 reads can parse them without buffering the complete Studio.
function* snapshotParts(state) {
  yield ['{\n"revision":' + JSON.stringify(state.revision ?? 0) + '\n'];
  for (const key of collections) {
    yield [collectionStart(key) + '\n'];
    for (const [index, row] of (state[key] ?? []).entries()) {
      const separator = index ? ',' : '';
      if (key === 'assets') {
        const { data, ...metadata } = row;
        const prefix = JSON.stringify(metadata).replace(/[^\x00-\x7f]/g,
          character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
        yield [separator + prefix.slice(0, -1) + ',"data":"'];
        // Asset data is validated base64, so it is ASCII and needs no JSON escaping.
        yield [data, data.length];
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
      else controller.enqueue(encoder.encode(value[0]));
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
    ]);
  } finally {
    controller.abort();
  }
}

async function* linesOf(body) {
  let fragments = [];
  for await (const chunk of body.pipeThrough(new TextDecoderStream('utf-8', { fatal: true }))) {
    const lines = chunk.split('\n');
    fragments.push(lines[0]);
    if (lines.length === 1) continue;
    yield fragments.join('');
    yield* lines.slice(1, -1);
    fragments = [lines.at(-1)];
  }
  if (fragments.join('')) throw new Error('Incomplete Studio snapshot line');
}

export async function readStudioSnapshot(object) {
  if (object.customMetadata?.layout !== layout) return object.json();
  const lines = linesOf(object.body);
  const next = async () => (await lines.next()).value;
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
      for (let line = await next(); line !== ']'; line = await next()) {
        if (rows.length) expect(line?.[0], ',');
        rows.push(JSON.parse(rows.length ? line.slice(1) : line));
      }
    }
    expect(await next(), '}');
    expect(await next(), undefined);
    return state;
  } finally {
    await lines.return();
  }
}
