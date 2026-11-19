import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHandler } from '../worker/index.js';
import { ensureCaptureTopic } from '../site/capture-topic.js';
import { verifyCaptureState } from '../worker/capture-state.js';
import { beginStudioEdit, startStudioSync } from '../site/studio-cloud.js';
import { addAsset, createStudioStore, emptyStudio, imageDataHeader, saveEvent, saveProject, studioStore } from '../site/studio-data.js';
import { studioDelta } from '../site/studio-delta.js';
import { saveBoardContent } from '../site/self-board-data.js';
import { studioExport } from '../site/studio-migration.js';

globalThis.FixedLengthStream ??= class extends TransformStream {
  constructor(length) {
    let written = 0;
    super({
      transform(chunk, controller) {
        written += chunk.byteLength;
        assert.ok(written <= length);
        controller.enqueue(chunk);
      },
      flush() { assert.equal(written, length); },
    });
  }
};

function studioApi(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  for (const filename of ['0001_private_calendar.sql', '0004_studio_cloud.sql', '0005_mobile_capture.sql', '0006_capture_inbox_visibility.sql']) {
    db.exec(readFileSync(new URL('../migrations/' + filename, import.meta.url), 'utf8'));
  }
  const binding = {
    prepare: sql => ({ bind: (...args) => ({
      first: async () => db.prepare(sql).get(...args),
      run: async () => db.prepare(sql).run(...args),
      all: async () => ({ results: db.prepare(sql).all(...args) }),
    }) }),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.all());
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const objects = new Map();
  const metadata = new Map();
  const origin = 'https://studio.example';
  const handler = createHandler(request => request.headers.get('X-Test-Owner'));
  const jobs = [];
  const env = {
    STUDIO_ORIGIN: origin, ACCESS_TEAM: 'studio.cloudflareaccess.com', ACCESS_AUD: 'test', ICAL_ENCRYPTION_KEY: 'test',
    DB: binding,
    STUDIO_CONTENT: {
      put: async (key, value, options) => {
        if (typeof value === 'string' && Buffer.byteLength(value) > 64 * 1024 * 1024) {
          throw new Error('This snapshot must be streamed');
        }
        objects.set(key, typeof value === 'string' ? value : await new Response(value).text());
        metadata.set(key, options.customMetadata);
      },
      get: async key => objects.has(key) ? {
        body: new Blob([objects.get(key)]).stream(),
        customMetadata: metadata.get(key),
        json: async () => JSON.parse(objects.get(key)),
      } : null,
      head: async key => objects.has(key) ? { customMetadata: metadata.get(key) } : null,
      delete: async key => { objects.delete(key); metadata.delete(key); },
    },
  };
  const send = (path, { method = 'GET', owner = 'studio-user', value, headers } = {}) => handler(
    new Request(origin + path, {
      method, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Studio-Request': '1',
        ...(owner ? { 'X-Test-Owner': owner } : {}), ...headers },
      body: value === undefined ? undefined : JSON.stringify(value),
    }), env, { waitUntil: promise => jobs.push(promise) });
  const call = (path = '', options) => send('/api/studio' + path, options);
  const capture = (path = '', options) => send('/api/capture' + path, options);
  const lock = (token, method = 'POST') => call('/lease', { method, value: { token } });
  const save = (token, revision, transfer) => call('', {
    method: 'PUT', value: transfer, headers: { 'X-Studio-Lease': token, 'X-Studio-Revision': revision },
  });
  return { call, capture, lock, save, db, objects, jobs, env };
}

test('private Studio sync migrates existing IDs and gives one device at a time permission to edit', async t => {
  const { call, lock, save, db, objects, jobs } = studioApi(t);
  const desktop = crypto.randomUUID();
  const phone = crypto.randomUUID();
  const local = emptyStudio();
  const original = saveBoardContent(local, { type: 'article', title: 'Computer draft', body: 'Initial content' });

  assert.equal((await call('', { owner: '' })).status, 401);
  assert.equal(await (await call()).json(), null);
  assert.equal((await save(desktop, 0, studioExport(local))).status, 423);
  assert.equal((await lock(desktop)).status, 200);
  assert.equal((await lock(phone)).status, 423);
  assert.equal((await lock(phone, 'DELETE')).status, 200);
  assert.equal((await lock(phone)).status, 423);
  assert.equal((await save(desktop, 0, { format: 'bad format' })).status, 400);
  assert.equal((await save(desktop, 0, studioExport(local))).status, 200);
  const loaded = await call();
  assert.equal(loaded.headers.get('X-Studio-Revision'), '1');
  assert.equal((await loaded.json()).content[0].id, original.id);
  assert.equal((await call('?revision=1')).status, 204);
  assert.equal(await (await call('', { owner: 'other-user' })).json(), null);
  assert.equal((await lock(desktop, 'DELETE')).status, 200);
  assert.equal((await lock(phone)).status, 200);
  saveBoardContent(local, { id: original.id, body: 'Edited on phone' });
  assert.equal((await save(phone, 0, studioExport(local))).status, 409);
  assert.equal((await save(phone, 1, studioExport(local))).status, 200);
  assert.equal((await (await call()).json()).content[0].body, 'Edited on phone');

  db.exec('UPDATE studio_cloud SET lease_until = 0');
  assert.equal((await lock(phone, 'PUT')).status, 423);
  assert.equal((await lock(desktop)).status, 200);
  assert.equal((await save(phone, 2, studioExport(local))).status, 423);
  assert.equal((await save(desktop, 2, studioExport(local))).status, 200);
  await Promise.all(jobs);
  assert.equal(objects.size, 4); // Two retained snapshots, each with its small catalog.
});

test('poster reader returns only eligible poster fields and bytes, retains auth and supports unchanged revisions', async t => {
  const { call, lock, save } = studioApi(t);
  const state = emptyStudio();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=';
  const posterId = addAsset(state, { name: 'poster.png', mime: 'image/png', data: png });
  const privateBytes = Buffer.from('PRIVATE_ATTACHMENT'.repeat(10_000)).toString('base64');
  addAsset(state, { name: 'private.txt', mime: 'text/plain', data: privateBytes });
  saveEvent(state, { title: '公开海报', status: 'completed', coverAssetId: posterId,
    body: 'PRIVATE_FACILITATOR_NOTES', description: 'PRIVATE_DESCRIPTION' });
  saveEvent(state, { title: 'PRIVATE_DRAFT', status: 'draft', coverAssetId: posterId });
  const token = crypto.randomUUID();
  await lock(token);
  assert.equal((await save(token, 0, studioExport(state))).status, 200);
  assert.equal((await call('/posters', { owner: '' })).status, 401);
  const response = await call('/posters');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const body = await response.text();
  const result = JSON.parse(body);
  assert.equal(result.revision, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].title, '公开海报');
  assert.equal(result.events[0].poster, 'data:image/png;base64,' + png);
  assert.equal(result.events[0].ended, true);
  assert.doesNotMatch(body, /PRIVATE_|assets|coverAssetId|sessions/);
  assert.ok(!body.includes(privateBytes));
  assert.ok(body.length < 1000);
  assert.equal((await call('/posters?revision=1')).status, 204);
  assert.deepEqual((await (await call('/posters', { owner: 'other-user' })).json()).events, []);
  assert.equal((await call('/posters', { method: 'PUT', value: {} })).status, 405);
});

test('legacy Studio snapshots can grow past 64 MiB and reload after a delta', async t => {
  const { call, lock, save, db, objects } = studioApi(t);
  const token = crypto.randomUUID();
  const initial = emptyStudio();
  ensureCaptureTopic(initial);
  for (let i = 0; i < 4; i++) {
    addAsset(initial, { name: '原始附件 ' + i, mime: 'text/plain', data: 'A'.repeat(15 * 1024 * 1024) });
  }
  objects.set('legacy', JSON.stringify(initial));
  db.prepare('INSERT INTO studio_cloud (owner, revision, object_key) VALUES (?, ?, ?)').run('studio-user', 1, 'legacy');
  assert.deepEqual(await (await call()).json(), initial);

  const next = { ...initial, assets: [...initial.assets] };
  addAsset(next, { name: '新增附件', mime: 'text/plain', data: 'A'.repeat(5 * 1024 * 1024) });
  await lock(token);
  assert.equal((await save(token, 1, studioDelta(initial, next))).status, 200);
  const response = await call();
  assert.equal(response.headers.get('X-Studio-Revision'), '2');
  assert.deepEqual((await response.json()).assets, next.assets);
});

test('Event deltas save new posters when the full Studio exceeds the upload limit', async t => {
  const { call, lock, save } = studioApi(t);
  const token = crypto.randomUUID();
  const initial = emptyStudio();
  const png = Buffer.alloc(Math.round(3.1 * 1024 * 1024));
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  const poster = png.toString('base64');
  const addPoster = (state, name) => addAsset(state, { name: name + '.png', mime: 'image/png', data: poster });
  const project = saveProject(initial, { title: 'Workshop', coverAssetId: addPoster(initial, 'project') });
  for (let i = 1; i <= 4; i++) {
    saveEvent(initial, { projectId: project.id, title: 'Event ' + i, coverAssetId: addPoster(initial, 'event-' + i) });
  }

  await lock(token);
  assert.equal((await save(token, 0, studioExport(initial))).status, 200);
  const before = await (await call()).json();
  const after = structuredClone(before);
  const coverAssetId = addPoster(after, 'event-5');
  const event = saveEvent(after, { projectId: project.id, title: 'Event 5', coverAssetId });
  const delta = studioDelta(before, after);
  assert.ok(Buffer.byteLength(JSON.stringify(studioExport(after))) > 24 * 1024 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify(delta)) < 5 * 1024 * 1024);
  assert.deepEqual(delta.changes.assets.upsert.map(asset => asset.id), [coverAssetId]);
  assert.deepEqual(delta.changes.events.upsert.map(row => row.id), [event.id]);
  assert.equal((await save(token, 1, delta)).status, 200);
  assert.equal((await save(token, 1, delta)).status, 409);

  const loaded = await call();
  assert.equal(loaded.headers.get('X-Studio-Revision'), '2');
  const saved = await loaded.json();
  assert.deepEqual(saved.events, after.events);
  assert.deepEqual(saved.assets.map(asset => asset.id), after.assets.map(asset => asset.id));
  assert.ok(saved.assets.every(asset => asset.data === poster));

  const invalid = { ...saved, assets: saved.assets.filter(asset => asset.id !== coverAssetId) };
  assert.equal((await save(token, 2, studioDelta(saved, invalid))).status, 400);
  assert.equal((await call('?revision=2')).status, 204);
});

test('Studio deltas preserve and update Capture records stored outside the snapshot', async t => {
  const { call, lock, save, db, objects } = studioApi(t);
  const token = crypto.randomUUID();
  const record = saveBoardContent(emptyStudio(), { type: 'thought', title: 'Saved from phone', body: 'Captured text' });
  db.prepare("INSERT INTO studio_cloud (owner, revision) VALUES ('studio-user', 1)").run();
  db.prepare(`INSERT INTO capture_items (id, owner, type, status, native_collection, document, captured_at, updated_at)
    VALUES (?, 'studio-user', 'text', 'organized', 'content', ?, ?, ?)`)
    .run(record.id, JSON.stringify(record), record.createdAt, record.updatedAt);

  await lock(token);
  const before = await (await call()).json();
  const after = structuredClone(before);
  saveProject(after, { title: 'New workshop' });
  assert.equal((await save(token, 1, studioDelta(before, after))).status, 200);
  assert.equal(db.prepare('SELECT version FROM capture_items').get().version, 0);

  const edited = structuredClone(after);
  saveBoardContent(edited, { id: record.id, body: 'Edited on desktop' });
  assert.equal((await save(token, 2, studioDelta(after, edited))).status, 200);
  assert.equal((await (await call()).json()).content[0].body, 'Edited on desktop');
  const stored = db.prepare('SELECT document, version FROM capture_items').get();
  assert.equal(JSON.parse(stored.document).body, 'Edited on desktop');
  assert.equal(stored.version, 1);
  assert.ok([...objects.values()].every(snapshot => {
    const stored = JSON.parse(snapshot);
    return !(stored.content?.length || stored.changes?.content?.upsert?.length);
  }));
});

test('metadata delta saves never read or rewrite existing image bytes and retain every layer through cleanup', async t => {
  const { call, lock, save, db, objects, env, jobs } = studioApi(t);
  const token = crypto.randomUUID();
  const initial = emptyStudio();
  const png = Buffer.alloc(2 * 1024 * 1024);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  const bytes = png.toString('base64');
  const image = addAsset(initial, { name: 'original.png', mime: 'image/png', data: bytes });
  const event = saveEvent(initial, { title: '已有海报', status: 'planned', coverAssetId: image });
  await lock(token);
  assert.equal((await save(token, 0, studioExport(initial))).status, 200);
  const baseKey = db.prepare('SELECT object_key FROM studio_cloud').get().object_key;
  const get = env.STUDIO_CONTENT.get;
  env.STUDIO_CONTENT.get = async key => {
    assert.notEqual(key, baseKey, 'a metadata save must not read the original multi-megabyte snapshot');
    return get(key);
  };
  let previous = initial;
  for (const [index, status] of ['completed', 'recruiting', 'completed'].entries()) {
    const next = structuredClone(previous);
    saveEvent(next, { id: event.id, title: event.title, status });
    assert.equal((await save(token, index + 1, studioDelta(previous, next))).status, 200);
    previous = next;
    await Promise.all(jobs);
  }
  env.STUDIO_CONTENT.get = get;
  assert.ok(objects.has(baseKey));
  const layered = await (await call()).json();
  assert.equal(layered.events[0].status, 'completed');
  assert.equal(layered.assets[0].data, bytes);
  assert.ok([...objects.entries()].filter(([key]) => key !== baseKey).every(([, value]) => value.length < 10_000));
  // A normal full save compacts the layers. The next save can safely collect
  // the former base, while its replacement still retains the original image.
  assert.equal((await save(token, 4, studioExport(previous))).status, 200);
  const next = structuredClone(previous);
  saveEvent(next, { id: event.id, title: event.title, status: 'recruiting' });
  assert.equal((await save(token, 5, studioDelta(previous, next))).status, 200);
  await Promise.all(jobs);
  assert.equal(objects.has(baseKey), false);
  const reloaded = await (await call()).json();
  assert.equal(reloaded.events[0].status, 'recruiting');
  assert.equal(reloaded.assets[0].data, bytes);
});

test('Inbox classification uses the small catalog and preserves Reflections, sources and original attachments', async t => {
  const { call, capture, lock, save, objects, env } = studioApi(t);
  const state = emptyStudio();
  state.reflectionLabels.push({ id: 'inspiration', name: '灵感', color: 'mint' });
  const png = Buffer.alloc(1024 * 1024);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  const assetId = addAsset(state, { name: '保留原图.png', mime: 'image/png', data: png.toString('base64') });
  saveProject(state, { title: '已有图片的 Project', coverAssetId: assetId });
  const token = crypto.randomUUID();
  await lock(token);
  assert.equal((await save(token, 0, studioExport(state))).status, 200);
  await lock(token, 'DELETE');
  const catalogKey = [...objects.keys()].find(key => key.endsWith('.catalog.json'));
  assert.ok(Buffer.byteLength(objects.get(catalogKey)) < 5000);
  const get = env.STUDIO_CONTENT.get;
  const smallReads = t.mock.method(env.STUDIO_CONTENT, 'get', async key => {
    assert.ok(key.endsWith('.catalog.json'), 'classification must not read the full image snapshot');
    return get(key);
  });
  const { modules } = await (await capture('/options')).json();
  const target = modules[0].groups[0].options.find(row => row.label === '灵感').target;
  const created = await (await capture('', { method: 'POST', value: { type: 'text', requestKey: crypto.randomUUID(),
    title: '摘录', originalText: '第一段\n第二段', userNote: '我的思考', sourceUrl: 'https://example.org/source#原文' } })).json();
  const classified = await capture('/items/' + created.id, { method: 'PATCH', value: { version: 0, target } });
  assert.equal(classified.status, 200);
  const receipt = await classified.json();
  assert.equal(receipt.status, 'organized');
  assert.equal(receipt.nativeCollection, 'content');
  assert.equal(receipt.inInbox, true);
  assert.equal(receipt.originalText, '第一段\n第二段');
  assert.equal(receipt.userNote, '我的思考');
  assert.equal(receipt.sourceUrl, 'https://example.org/source#原文');
  assert.equal((await capture('/items/' + created.id, { method: 'PATCH', value: { version: 0, target } })).status, 409);
  const second = await (await capture('', { method: 'POST', value: { type: 'url', sourceUrl: 'https://example.org/link',
    requestKey: crypto.randomUUID() } })).json();
  const pending = modules[0].groups[0].options[0].target;
  assert.equal((await capture('/items/batch', { method: 'PATCH', value: { ids: [second.id], target: pending } })).status, 200);
  smallReads.mock.restore();
  const loaded = await (await call()).json();
  const thought = loaded.content.find(row => row.id === created.id);
  assert.equal(thought.type, 'thought');
  assert.equal(thought.reflectionLabelId, 'inspiration');
  assert.equal(thought.personalNotes, '我的思考');
  assert.equal(loaded.content.find(row => row.id === second.id).sourceUrl, 'https://example.org/link');
  assert.deepEqual(loaded.assets, state.assets);
  // Native editing must still save the full original image and the Capture projection.
  await lock(token);
  const edited = structuredClone(loaded);
  edited.content.find(row => row.id === created.id).body = '继续编辑灵感';
  assert.equal((await save(token, 3, studioDelta(loaded, edited))).status, 200);
  await lock(token, 'DELETE');
  assert.equal((await (await capture('/items/' + created.id)).json()).originalText, '继续编辑灵感');
  assert.deepEqual((await (await call()).json()).assets, state.assets);
});

test('older snapshots can classify without a catalog and normal reads backfill one without duplicating projections', async t => {
  const { call, capture, lock, save, objects, jobs } = studioApi(t);
  const state = emptyStudio();
  addAsset(state, { name: '旧附件', mime: 'text/plain', data: 'A'.repeat(128 * 1024) });
  const token = crypto.randomUUID();
  await lock(token);
  await save(token, 0, studioExport(state));
  await lock(token, 'DELETE');
  const key = [...objects.keys()].find(key => !key.endsWith('.catalog.json'));
  objects.delete(key + '.catalog.json');
  const created = await (await capture('', { method: 'POST', value: { type: 'text', originalText: '旧快照也能分类',
    requestKey: crypto.randomUUID(), target: JSON.stringify(['reflections', 'tag', '']) } })).json();
  assert.equal(created.status, 'organized');
  const loaded = await (await call()).json();
  await Promise.all(jobs);
  assert.equal(loaded.content.filter(row => row.id === created.id).length, 1);
  assert.ok(objects.has(key + '.catalog.json'));
  assert.equal(JSON.parse(objects.get(key + '.catalog.json')).content.length, 0);
  const { modules } = await (await capture('/options')).json();
  assert.equal(modules[0].label, 'Reflections');
  assert.equal((await (await call()).json()).content.filter(row => row.id === created.id).length, 1);
});

test('Capture validates references without decoding unchanged image bytes', () => {
  const state = emptyStudio();
  const asset = { id: 'trusted', name: 'image.png', mime: 'image/png' };
  Object.defineProperty(asset, imageDataHeader, { value: 'iVBORw0KGgoAAAANSUhEUgAA' });
  Object.defineProperty(asset, 'data', { enumerable: true, get() { throw new Error('Full image decoded'); } });
  state.assets.push(asset);
  saveProject(state, { title: '封面', coverAssetId: asset.id });
  assert.doesNotThrow(() => verifyCaptureState(state));
  state.assets = [];
  assert.throws(() => verifyCaptureState(state), { captureCode: 'native_conflict' });
});

test('Studio save retries a temporary service error and recovers a lost save receipt without duplicating an Event', async t => {
  const { call, lock, save } = studioApi(t);
  const initial = emptyStudio();
  const project = saveProject(initial, { title: 'Workshop' });
  const token = crypto.randomUUID();
  await lock(token);
  assert.equal((await save(token, 0, studioExport(initial))).status, 200);
  await lock(token, 'DELETE');

  const requests = [];
  let leaseRelease;
  t.mock.method(studioStore, 'load', async () => {});
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = url.slice('/api/studio'.length);
    const { method, headers, body } = options;
    const saving = !path && method === 'PUT';
    if (saving) {
      requests.push({ headers, body });
      if (requests.length === 1) return Response.json({ error: 'unavailable' }, { status: 503 });
    }
    const pending = call(path, { method, headers, value: body === undefined ? undefined : JSON.parse(body) });
    if (path === '/lease' && method === 'DELETE') leaseRelease = pending;
    const response = await pending;
    if (saving && requests.length === 3) {
      assert.equal(response.status, 200);
      throw new TypeError('Network connection closed after commit');
    }
    return response;
  });

  await startStudioSync();
  const release = await beginStudioEdit();
  try {
    for (const title of ['First Event', 'Second Event']) {
      await studioStore.change(state => saveEvent(state, { projectId: project.id, title }));
    }
    assert.equal(requests.length, 4);
    assert.deepEqual(requests[0], requests[1]);
    assert.deepEqual(requests[2], requests[3]);
    assert.notEqual(requests[0].headers['X-Studio-Save-Id'], requests[2].headers['X-Studio-Save-Id']);
    const stale = await call('', { method: 'PUT', headers: { ...requests[2].headers, 'X-Studio-Save-Id': crypto.randomUUID() },
      value: JSON.parse(requests[2].body) });
    assert.equal(stale.status, 409);
    const loaded = await call();
    assert.equal(loaded.headers.get('X-Studio-Revision'), '3');
    assert.deepEqual((await loaded.json()).events.map(event => event.title), ['First Event', 'Second Event']);
    await assert.rejects(studioStore.change(state => { state.projects = []; }), { code: 'invalid_studio' });
    assert.equal(requests.length, 5);
  } finally {
    release();
    await leaseRelease;
  }
});

test('expanded Workshop records survive a revision-checked cloud delta without rewriting the original Wiki', async t => {
  const { linkWiki, publicationProjection, saveCardSet, saveInteractiveTool, saveWorkshopTag } = await import('../site/workshop-library.js');
  const { call, lock, save } = studioApi(t);
  const token = crypto.randomUUID();
  const before = emptyStudio();
  const project = saveProject(before, { title: 'Series' });
  const event = saveEvent(before, { title: 'Event', projectId: project.id });
  const wiki = saveBoardContent(before, { title: 'Original Wiki', body: 'Original body', type: 'exercise' });
  const legacy = studioExport(before);
  for (const key of ['workshopTags', 'cardSets', 'interactiveTools']) delete legacy[key];
  assert.equal((await lock(token)).status, 200);
  assert.equal((await save(token, 0, legacy)).status, 200);
  const saved = await (await call()).json();
  const next = structuredClone(saved);
  const tag = saveWorkshopTag(next, 'Series');
  const cards = saveCardSet(next, 'OH');
  saveEvent(next, { id: event.id, projectId: project.id, title: event.title, tagIds: [tag.id],
    cardUses: [{ cardSetId: cards.id, role: 'supporting', usageNote: 'Keep private' }], formats: ['weaving'] });
  const pin = linkWiki(next, { ownerType: 'event', ownerId: event.id, resourceId: wiki.id, mode: 'pinned_version' });
  const tool = saveInteractiveTool(next, { title: 'Workshop tool', type: 'app', visibility: 'public',
    appLocation: 'https://example.test/private-tool', version: '1' });
  tool.workshopPublication = { preparedAt: new Date().toISOString(), preview: publicationProjection('tool', tool) };
  const delta = studioDelta(saved, next);
  assert.equal((await save(token, 0, delta)).status, 409);
  assert.equal((await save(token, 1, delta)).status, 200);
  const reloaded = await (await call()).json();
  assert.equal(reloaded.content[0].createdAt, wiki.createdAt);
  assert.equal(reloaded.content[0].body, wiki.body);
  assert.equal(reloaded.content[0].revisions[0].id, pin.versionId);
  assert.equal(reloaded.relations[0].versionId, pin.versionId);
  assert.equal(reloaded.events[0].cardUses[0].cardSetId, cards.id);
  assert.equal(reloaded.interactiveTools[0].id, tool.id);
  assert.equal((await call('', { owner: '' })).status, 401);
  assert.equal(await (await call('', { owner: 'another-owner' })).json(), null);
  assert.equal((await call('/public')).status, 404);
});

test('cloud writes proceed without IndexedDB and a late local read cannot replace the cloud state', async () => {
  let resolveOpen;
  const store = createStudioStore(() => new Promise(resolve => { resolveOpen = resolve; }));
  const local = store.load();
  store.receiveCloud(emptyStudio(), 7);
  store.useCloud(async (next, expected) => {
    assert.equal(expected, 7);
    assert.equal(next.events[0].title, 'Cloud event');
    return 8;
  });
  await store.change(state => saveEvent(state, { title: 'Cloud event' }));
  resolveOpen({ transaction: () => ({ objectStore: () => ({ get() {
    const request = { result: { ...emptyStudio(), revision: 1 } };
    queueMicrotask(() => request.onsuccess());
    return request;
  } }) }) });
  await local;
  assert.equal(store.state.revision, 8);
  assert.equal(store.state.events[0].title, 'Cloud event');
});

test('Event-first edits, independent orders and shared resource assignments persist through the private Worker', async t => {
  const { activeFlow, addEventResource, archiveEventFlow, copyEventFlow, duplicateEvent, eventResources,
    groupEvents, moveWorkshopItem, orderedEvents, saveEventDocument } = await import('../site/workshop-event-data.js');
  const { adoptVersion, currentVersion, saveSession } = await import('../site/studio-data.js');
  const { saveCardSet, saveWorkshopTag } = await import('../site/workshop-library.js');
  const { call, lock, save } = studioApi(t);
  const token = crypto.randomUUID();
  const old = emptyStudio();
  const a = saveProject(old, { title: 'A' });
  const b = saveProject(old, { title: 'B' });
  const card = saveCardSet(old, 'OH');
  const first = saveEvent(old, { title: 'Old event', projectId: a.id,
    cardUses: [{ cardSetId: card.id, role: 'supporting', usageNote: 'Keep this note' }] });
  const file = addAsset(old, { name: 'plan.txt', mime: 'text/plain', data: btoa('Keep this file') });
  const source = saveSession(old, { ownerType: 'project', ownerId: a.id, section: 'flow', title: 'Introduction', body: 'Adopted', assetIds: [file] });
  const adopted = adoptVersion(old, first.id, source.id);
  const review = saveEventDocument(old, first.id, { section: 'review', title: 'Recorded', body: 'Actual proceedings' });
  await lock(token);
  assert.equal((await save(token, 0, studioExport(old))).status, 200);

  const next = structuredClone(old);
  const draft = saveEvent(next, { title: 'Independent', tagIds: ['dialogue', 'writing'].map(name => saveWorkshopTag(next, name).id) });
  assert.equal(draft.status, 'draft');
  assert.equal(draft.projectId, '');
  const idea = saveEventDocument(next, draft.id, { section: 'overview', title: 'Idea', body: 'Free form' });
  const step = saveEventDocument(next, draft.id, { section: 'flow', title: 'First', body: 'Instructions', assetIds: [file] });
  const other = saveEventDocument(next, draft.id, { section: 'flow', title: 'Second', body: '', details: { workshopMinutes: 10 } }, step.id);
  assert.deepEqual(activeFlow(next, draft.id).map(row => row.id), [step.id, other.id]);
  const edited = saveEventDocument(next, draft.id, { id: step.id, section: 'flow', title: 'First', body: 'Updated', assetIds: [file] });
  assert.equal(edited.id, step.id);
  assert.equal(edited.versions.length, 2);
  const use = { kind: 'card', id: card.id, role: 'primary', note: 'Opening' };
  addEventResource(next, draft, use, step.id);
  addEventResource(next, draft, use, other.id);
  addEventResource(next, draft, { kind: 'asset', assetId: file }, step.id);
  addEventResource(next, draft, { kind: 'link', url: 'https://example.test', title: 'Link' });
  assert.equal(draft.cardUses.length, 1);
  assert.deepEqual(draft.cardUses[0].workshopFlowIds, [step.id, other.id]);

  moveWorkshopItem(next, { kind: 'event', id: draft.id, target: first.id });
  moveWorkshopItem(next, { kind: 'group-event', id: draft.id, projectId: b.id });
  moveWorkshopItem(next, { kind: 'group-event', id: first.id, target: draft.id, projectId: b.id, after: true });
  assert.deepEqual(groupEvents(next, b.id).map(row => row.id), [draft.id, first.id]);
  moveWorkshopItem(next, { kind: 'group-event', id: first.id, projectId: '' });
  moveWorkshopItem(next, { kind: 'project', id: b.id, target: a.id });
  moveWorkshopItem(next, { kind: 'flow', id: other.id, target: step.id, eventId: draft.id });
  assert.deepEqual(activeFlow(next, draft.id).map(row => row.id), [other.id, step.id]);

  const cloned = duplicateEvent(next, next.events.find(row => row.id === first.id), { title: 'Copy' },
    { flow: true, planning: true, resources: true });
  assert.equal(next.sessions.some(row => row.ownerId === cloned.id && row.section === 'review'), false);
  const reused = copyEventFlow(next, cloned, step);
  assert.equal(currentVersion(reused).body, 'Updated');
  archiveEventFlow(next, draft, step.id);
  assert.deepEqual(draft.cardUses[0].workshopFlowIds, [other.id]);

  assert.equal((await save(token, 1, studioDelta(old, next))).status, 200);
  assert.equal((await save(token, 1, studioDelta(old, next))).status, 409);
  const snapshot = await (await call()).json();
  assert.deepEqual(orderedEvents(snapshot).slice(0, 2).map(row => row.id), [draft.id, first.id]);
  assert.equal(snapshot.events.find(row => row.id === first.id).projectId, '');
  assert.equal(snapshot.events.find(row => row.id === first.id).cardUses[0].usageNote, 'Keep this note');
  assert.deepEqual(snapshot.sessions.find(row => row.id === adopted.id), adopted);
  assert.deepEqual(snapshot.sessions.find(row => row.id === review.id), review);
  assert.equal(currentVersion(snapshot.sessions.find(row => row.id === idea.id)).body, 'Free form');
  const saved = snapshot.events.find(row => row.id === draft.id);
  assert.equal(eventResources(snapshot, saved).find(entry => entry.kind === 'card').row.role, 'primary');
  assert.equal(snapshot.assets.length, 1);
});

test('Worker saves structured resources and Event usage while rejecting overwritten pins and invalid imports', async t => {
  const { call, lock, save } = studioApi(t);
  const { saveCardSet, saveWiki, linkWiki, searchEvents, workshopLinks } = await import('../site/workshop-library.js');
  const { addEventResource, editEventResource, eventResources } = await import('../site/workshop-event-data.js');
  const token = crypto.randomUUID();
  const initial = emptyStudio();
  const project = saveProject(initial, { title: 'Project' });
  const event = saveEvent(initial, { title: 'Test event', projectId: project.id });
  const deck = saveCardSet(initial, 'OH Cards');
  const legacy = saveWiki(initial, { title: 'Legacy', type: 'exercise', body: 'Original',
    discoverCategory: 'Tools & Methods', wikiStatus: 'active' });
  linkWiki(initial, { ownerType: 'project', ownerId: project.id, resourceId: legacy.id });
  await lock(token);
  assert.equal((await save(token, 0, studioExport(initial))).status, 200);
  assert.deepEqual(searchEvents(initial, { wiki: legacy.id }), []);

  const structured = structuredClone(initial);
  const profile = saveWiki(structured, { title: 'OH Cards', resourceKind: 'card_set', cardSetId: deck.id, wikiStatus: 'active' });
  assert.equal(profile.cardSetId, deck.id);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL8sAAAAASUVORK5CYII=';
  const front = addAsset(structured, { name: 'front.png', mime: 'image/png', data: png });
  const back = addAsset(structured, { name: 'back.png', mime: 'image/png', data: png });
  const card = saveWiki(structured, { title: 'Card', resourceKind: 'card', wikiStatus: 'active', cardSetId: deck.id,
    resourceData: { number: ' A-01 ', description: 'A circle', frontAssetId: front, backAssetId: back },
    resourceLinks: [legacy.id] });
  assert.equal(card.resourceData.number, 'A-01');
  assert.throws(() => saveWiki(structured, { title: 'Duplicate', resourceKind: 'card', wikiStatus: 'draft',
    cardSetId: deck.id, resourceData: { number: 'ａ-01' } }), /编号必须唯一/);
  const fixed = addEventResource(structured, structured.events[0], { kind: 'wiki', id: card.id, mode: 'pinned_version',
    usage: { status: 'selected', purpose: 'Opening', selection: 'Short prompt' } });
  assert.deepEqual(workshopLinks(structured, 'event', event, 'wiki').inherited.map(row => row.item.id), [legacy.id]);
  assert.deepEqual(searchEvents(structured, { wiki: card.id }).map(row => row.id), [event.id]);
  assert.equal((await save(token, 1, studioDelta(initial, structured))).status, 200);

  const edited = structuredClone(structured);
  const editedCard = saveWiki(edited, { id: card.id, resourceData: { number: 'A-02', description: 'Current only', backAssetId: back },
    resourceLinks: [] });
  editEventResource(edited, edited.events[0], eventResources(edited, edited.events[0]).find(entry => entry.id === fixed.id).key, {
    mode: 'pinned_version', versionId: fixed.versionId, flowIds: [],
    usage: { status: 'used', purpose: 'Opening', selection: 'Short prompt', adjustments: 'Split into pairs', feedback: 'Helpful' },
  });
  assert.equal(editedCard.revisions.length, 1);
  assert.equal((await save(token, 2, studioDelta(structured, edited))).status, 200);
  const current = await (await call()).json();
  const readCard = current.content.find(row => row.id === card.id);
  const adopted = readCard.revisions.find(row => row.id === fixed.versionId);
  assert.deepEqual(adopted.resourceData, card.resourceData);
  assert.deepEqual(adopted.resourceLinks, [legacy.id]);
  assert.equal(readCard.resourceData.description, 'Current only');
  assert.deepEqual(current.content.find(row => row.id === legacy.id), legacy);
  const edge = current.relations.find(row => row.id === fixed.id);
  assert.equal(edge.versionId, fixed.versionId);
  assert.equal(edge.usage.feedback, 'Helpful');
  assert.equal(Object.hasOwn(readCard, 'usage'), false);

  for (const corrupt of [
    snapshot => { snapshot.content.find(row => row.id === card.id).revisions[0].resourceData.description = 'Tampered'; },
    snapshot => { snapshot.assets.find(row => row.id === front).name = 'overwritten.png'; },
    snapshot => { snapshot.content.find(row => row.id === card.id).resourceLinks = ['missing']; },
    snapshot => { snapshot.content.find(row => row.id === card.id).resourceData.backAssetId = 'missing'; },
    snapshot => { snapshot.relations.find(row => row.id === fixed.id).usage.status = 'unknown'; },
    snapshot => { snapshot.relations.find(row => row.sourceType === 'project').usage = { status: 'used' }; },
    snapshot => { snapshot.content.push({ ...readCard, id: 'duplicate', revisions: [] }); },
  ]) {
    const invalid = structuredClone(current);
    corrupt(invalid);
    assert.equal((await save(token, 3, studioDelta(current, invalid))).status, 400);
  }
  assert.equal((await call()).headers.get('X-Studio-Revision'), '3');
});
