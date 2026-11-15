import { collections } from '../site/studio-data.js';

const layout = 'json-rows-v1';
const collectionStart = key => ',"' + key + '":[';

// Keep standard JSON on disk and over HTTP. Separate records with newlines
// so R2 reads can parse them without buffering the complete Studio.
function* rowsOf(state) {
  yield '{';
  yield '"revision":' + JSON.stringify(state.revision ?? 0);
  for (const key of collections) {
    yield collectionStart(key);
    for (const [index, row] of (state[key] ?? []).entries()) {
      yield (index ? ',' : '') + JSON.stringify(row);
    }
    yield ']';
  }
  yield '}';
}

export function streamStudioSnapshot(state) {
  const encoder = new TextEncoder();
  const rows = rowsOf(state);
  return new ReadableStream({
    pull(controller) {
      const { value, done } = rows.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value + '\n'));
    },
  });
}

export async function putStudioSnapshot(storage, key, state, saveId) {
  const encoder = new TextEncoder();
  let byteLength = 0;
  for (const row of rowsOf(state)) byteLength += encoder.encode(row).byteLength + 1;
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
