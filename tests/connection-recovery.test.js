import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../site/capture-client.js';
import { emptyStudio, studioStore } from '../site/studio-data.js';

test('Capture retries transient reads, but never automatically repeats a possibly committed write', async t => {
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    if (attempts === 1) return new Response('Worker exceeded CPU time limit', { status: 503 });
    return Response.json({ modules: [] });
  });
  assert.deepEqual(await api('/options'), { modules: [] });
  assert.equal(attempts, 2);
  attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    throw new TypeError('Response lost after commit');
  });
  await assert.rejects(api('/items/test', { method: 'PATCH', value: { version: 0, target: 'reflection' } }),
    { code: 'unconfirmed', retryable: true });
  assert.equal(attempts, 1);
});

test('Capture identifies an expired Access session and does not retry authentication failures', async t => {
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    return new Response('', { status: 302, headers: { Location: 'https://studio.cloudflareaccess.com/login' } });
  });
  await assert.rejects(api('/options'), { code: 'session_expired', status: 401 });
  assert.equal(attempts, 1);
});

test('Capture stops a canceled read without retrying or replacing its reason', async t => {
  const controller = new AbortController();
  const reason = new DOMException('Canceled by user', 'AbortError');
  controller.abort(reason);
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => { attempts++; throw reason; });
  await assert.rejects(api('/options', { signal: controller.signal }), error => error === reason);
  assert.equal(attempts, 1);
});

test('Studio recovers after initial connection failure without a page reload and retains local migration detection', async t => {
  const sync = await import('../site/studio-cloud.js?reconnect=' + crypto.randomUUID());
  const local = emptyStudio();
  local.projects.push({ id: 'local', title: '本机未上传的内容' });
  t.mock.method(studioStore, 'load', async () => local);
  let failing = true;
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    return failing ? Response.json({ error: 'unavailable' }, { status: 503 }) :
      Response.json(null, { headers: { 'X-Studio-Revision': '0' } });
  });
  await sync.startStudioSync();
  assert.equal(sync.studioSync.mode, 'error');
  assert.equal(attempts, 2);
  failing = false;
  assert.equal(await sync.refreshStudioSync({ manual: true }), true);
  assert.equal(sync.studioSync.mode, 'cloud');
  assert.equal(sync.studioSync.migration, true);
  assert.equal(sync.studioSync.message, '');
  assert.equal(sync.studioSync.reconnecting, false);
});

test('Studio retries an interrupted snapshot body before updating the revision', async t => {
  const sync = await import('../site/studio-cloud.js?body-retry=' + crypto.randomUUID());
  t.mock.method(studioStore, 'load', async () => emptyStudio());
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    if (attempts === 1) return new Response(new ReadableStream({ start(controller) {
      controller.error(new Error('Body connection interrupted'));
    } }), { headers: { 'Content-Type': 'application/json', 'X-Studio-Revision': '9' } });
    return Response.json(emptyStudio(), { headers: { 'X-Studio-Revision': '9' } });
  });
  await sync.startStudioSync();
  assert.equal(attempts, 2);
  assert.equal(sync.studioSync.mode, 'cloud');
  assert.equal(studioStore.state.revision, 9);
});

test('Studio pauses automatic reconnect on expired login and can resume after explicit reconnect', async t => {
  const sync = await import('../site/studio-cloud.js?login=' + crypto.randomUUID());
  t.mock.method(studioStore, 'load', async () => emptyStudio());
  let loggedIn = false;
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    attempts++;
    return loggedIn ? Response.json(emptyStudio(), { headers: { 'X-Studio-Revision': '3' } }) :
      Response.json({ error: 'unauthorized' }, { status: 401 });
  });
  await sync.startStudioSync();
  assert.equal(sync.studioSync.authRequired, true);
  assert.equal(await sync.refreshStudioSync(), false);
  assert.equal(attempts, 1);
  loggedIn = true;
  assert.equal(await sync.refreshStudioSync({ manual: true }), true);
  assert.equal(sync.studioSync.authRequired, false);
  assert.equal(sync.studioSync.mode, 'cloud');
});
