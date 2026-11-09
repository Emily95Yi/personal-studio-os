import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHandler } from '../worker/index.js';
import { addAsset, emptyStudio, saveEvent, saveProject } from '../site/studio-data.js';
import { studioDelta } from '../site/studio-delta.js';
import { saveBoardContent } from '../site/self-board-data.js';
import { studioExport } from '../site/studio-migration.js';

function studioApi(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  for (const filename of ['0004_studio_cloud.sql', '0005_mobile_capture.sql']) {
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
  const origin = 'https://studio.example';
  const handler = createHandler(request => request.headers.get('X-Test-Owner'));
  const jobs = [];
  const env = {
    STUDIO_ORIGIN: origin, ACCESS_TEAM: 'studio.cloudflareaccess.com', ACCESS_AUD: 'test', ICAL_ENCRYPTION_KEY: 'test',
    DB: binding,
    STUDIO_CONTENT: {
      put: async (key, value) => objects.set(key, value),
      get: async key => objects.has(key) ? { json: async () => JSON.parse(objects.get(key)) } : null,
      delete: async key => objects.delete(key),
    },
  };
  const call = (path = '', { method = 'GET', owner = 'studio-user', value, headers } = {}) => handler(
    new Request(origin + '/api/studio' + path, {
      method, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Studio-Request': '1',
        ...(owner ? { 'X-Test-Owner': owner } : {}), ...headers },
      body: value === undefined ? undefined : JSON.stringify(value),
    }), env, { waitUntil: promise => jobs.push(promise) });
  const lock = (token, method = 'POST') => call('/lease', { method, value: { token } });
  const save = (token, revision, transfer) => call('', {
    method: 'PUT', value: transfer, headers: { 'X-Studio-Lease': token, 'X-Studio-Revision': revision },
  });
  return { call, lock, save, db, objects, jobs };
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
  assert.equal(objects.size, 2);
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
  assert.ok([...objects.values()].every(snapshot => !JSON.parse(snapshot).content.length));
});
