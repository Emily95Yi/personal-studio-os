import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHandler } from '../worker/index.js';
import { emptyStudio } from '../site/studio-data.js';
import { saveBoardContent } from '../site/self-board-data.js';
import { studioExport } from '../site/studio-migration.js';

test('private Studio sync migrates existing IDs and gives one device at a time permission to edit', async () => {
  const db = new DatabaseSync(':memory:');
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
