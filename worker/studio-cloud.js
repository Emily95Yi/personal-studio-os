import { emptyStudio } from '../site/studio-data.js';
import { previewMigration } from '../site/studio-migration.js';

const leaseDuration = 120_000;
const validToken = token => typeof token === 'string' && /^[0-9a-f-]{36}$/.test(token);
const read = (db, owner) => db.prepare('SELECT * FROM studio_cloud WHERE owner = ?').bind(owner).first();

async function lease(request, db, owner, body, json) {
  const input = await body(request, 256);
  if (!validToken(input?.token)) return json({ error: 'invalid_lease' }, 400);
  const { token } = input;
  const now = Date.now();
  if (request.method === 'DELETE') {
    await db.prepare('UPDATE studio_cloud SET lease_token = NULL, lease_until = 0 WHERE owner = ? AND lease_token = ?')
      .bind(owner, token).run();
    return json({ released: true });
  }
  if (request.method === 'POST') {
    const row = await db.prepare('INSERT INTO studio_cloud (owner, lease_token, lease_until) VALUES (?, ?, ?) ' +
      'ON CONFLICT(owner) DO UPDATE SET lease_token = excluded.lease_token, lease_until = excluded.lease_until ' +
      'WHERE studio_cloud.lease_until <= ? OR studio_cloud.lease_token = excluded.lease_token RETURNING revision')
      .bind(owner, token, now + leaseDuration, now).first();
    return row ? json(row) : json({ error: 'editing_elsewhere' }, 423);
  }
  if (request.method === 'PUT') {
    const row = await db.prepare('UPDATE studio_cloud SET lease_until = ? WHERE owner = ? AND lease_token = ? ' +
      'AND lease_until > ? RETURNING revision').bind(now + leaseDuration, owner, token, now).first();
    return row ? json(row) : json({ error: 'lease_expired' }, 423);
  }
  return json({ error: 'method' }, 405);
}

export async function studioCloudApi(request, env, ctx, owner, url, { body, json }) {
  if (!env.STUDIO_CONTENT) return json({ error: 'not_found' }, 404);
  const { DB: db, STUDIO_CONTENT: storage } = env;
  if (url.pathname === '/api/studio/lease') return lease(request, db, owner, body, json);
  if (request.method === 'GET') {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = await read(db, owner);
      const revision = row?.revision ?? 0;
      const headers = { 'X-Studio-Revision': String(revision) };
      if (url.searchParams.get('revision') === String(revision)) {
        return new Response(null, { status: 204, headers: { ...headers, 'Cache-Control': 'private, no-store' } });
      }
      if (!row?.object_key) return json(null, 200, headers);
      const object = await storage.get(row.object_key);
      if (object) return new Response(object.body, {
        headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }
    return json({ error: 'unavailable' }, 503);
  }
  if (request.method !== 'PUT') return json({ error: 'method' }, 405);
  const row = await read(db, owner);
  const token = request.headers.get('X-Studio-Lease');
  if (!validToken(token) || row?.lease_token !== token || row.lease_until <= Date.now()) {
    return json({ error: 'lease_expired' }, 423);
  }
  const revision = request.headers.get('X-Studio-Revision');
  if (revision !== String(row.revision)) return json({ error: 'conflict' }, 409);
  const transfer = await body(request, 24 * 1024 * 1024);
  let checked;
  try {
    checked = previewMigration(emptyStudio(), transfer).next;
  } catch {
    return json({ error: 'invalid_studio' }, 400);
  }
  const key = 'studio/' + crypto.randomUUID() + '.json';
  await storage.put(key, JSON.stringify(checked), { httpMetadata: { contentType: 'application/json' } });
  // Publish only after the object is complete, and only while the same editor still owns the lease.
  const updated = await db.prepare('UPDATE studio_cloud SET revision = revision + 1, previous_key = object_key, object_key = ? ' +
    'WHERE owner = ? AND revision = ? AND lease_token = ? AND lease_until > ? RETURNING revision')
    .bind(key, owner, row.revision, token, Date.now()).first();
  if (!updated) {
    ctx.waitUntil(storage.delete(key).catch(() => {}));
    return json({ error: 'conflict' }, 409);
  }
  if (row.previous_key) ctx.waitUntil(storage.delete(row.previous_key).catch(() => {}));
  return json(updated);
}
