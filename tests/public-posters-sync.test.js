import assert from 'node:assert/strict';
import test from 'node:test';
import { publicPosterSync, refreshPublicPosters } from '../site/public-posters.js';
import { tokyoView } from '../site/tokyo-view.js';

test('public loading never says empty, failure can retry, and requests never download the private snapshot', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  let resolve;
  globalThis.fetch = (url, options) => {
    requests.push({ url, options });
    return new Promise(done => { resolve = done; });
  };
  const first = refreshPublicPosters();
  assert.equal(publicPosterSync.status, 'loading');
  assert.match(tokyoView(), /正在加载活动海报/);
  assert.doesNotMatch(tokyoView(), /暂无公开海报/);
  assert.equal(refreshPublicPosters(), first);
  resolve(new Response('{}', { status: 503 }));
  await first;
  assert.equal(publicPosterSync.status, 'error');
  assert.match(tokyoView(), /重新加载海报/);
  assert.doesNotMatch(tokyoView(), /暂无公开海报/);
  const retry = refreshPublicPosters();
  resolve(Response.json({ revision: 69, events: [{ id: 'poster', title: '公开海报', ended: true, posterOnly: true, poster: '/poster.png' }] }));
  await retry;
  assert.equal(publicPosterSync.status, 'ready');
  assert.match(tokyoView(), /公开海报/);
  const unchanged = refreshPublicPosters();
  resolve(new Response(null, { status: 204 }));
  assert.equal(await unchanged, false);
  assert.equal(publicPosterSync.events.length, 1);
  assert.ok(requests.every(row => row.url.startsWith('/api/studio/posters?revision=')));
  assert.equal(requests.at(-1).url, '/api/studio/posters?revision=69');
  assert.equal(requests[0].options.redirect, 'manual');
});
