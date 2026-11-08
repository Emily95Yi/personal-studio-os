import { nativeTarget, readCloud, readProjections, readStudio, sql } from './capture-state.js';
import { ensureCaptureTopic } from '../site/capture-topic.js';
import { emptyStudio } from '../site/studio-data.js';
import { previewMigration } from '../site/studio-migration.js';

const leaseDuration = 120_000;
const validToken = token => typeof token === 'string' && /^[0-9a-f-]{36}$/.test(token);

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
    const result = await readStudio(env, owner, url.searchParams.get('revision'));
    const headers = { 'X-Studio-Revision': String(result.row?.revision ?? 0) };
    return result.unchanged
      ? new Response(null, { status: 204, headers: { ...headers, 'Cache-Control': 'private, no-store' } })
      : json(result.empty ? null : result.state, 200, headers);
  }
  if (request.method !== 'PUT') return json({ error: 'method' }, 405);
  const row = await readCloud(db, owner);
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
  ensureCaptureTopic(checked);
  const { results: projections } = await readProjections(db, owner).all();
  const key = 'studio/' + crypto.randomUUID() + '.json';
  const updates = [];
  const guard = ' AND EXISTS (SELECT 1 FROM studio_cloud WHERE owner = ? AND object_key = ?)';
  for (const projection of projections) {
    const records = checked[projection.native_collection];
    const index = records.findIndex(record => record.id === projection.id);
    if (index === -1) {
      updates.push(sql(db, "UPDATE capture_items SET version = version + 1, status = 'archived', updated_at = ? WHERE id = ?" + guard,
        new Date().toISOString(), projection.id, owner, key));
    } else {
      const [record] = records.splice(index, 1);
      const document = JSON.stringify(record);
      if (new TextEncoder().encode(document).length > 1024 * 1024 || /data:image\/[^,;]{1,100};base64,/i.test(document)) {
        return json({ error: 'invalid_studio' }, 400);
      }
      if (document !== projection.document) {
        updates.push(sql(db, 'UPDATE capture_items SET version = version + 1, document = ?, target = ?, updated_at = ? WHERE id = ?' + guard,
          document, nativeTarget(checked, projection.native_collection, record), record.updatedAt ?? new Date().toISOString(), projection.id, owner, key));
      }
    }
  }
  await storage.put(key, JSON.stringify(checked), { httpMetadata: { contentType: 'application/json' } });
  // The new R2 snapshot and updated D1 documents become visible at the same revision.
  const publish = sql(db, 'UPDATE studio_cloud SET revision = revision + 1, previous_key = object_key, object_key = ? ' +
    'WHERE owner = ? AND revision = ? AND lease_token = ? AND lease_until > ? RETURNING revision',
  key, owner, row.revision, token, Date.now());
  let result;
  try {
    [result] = await db.batch([publish, ...updates]);
  } catch (error) {
    // A failed or ambiguous commit must never remove a live snapshot.
    ctx.waitUntil(readCloud(db, owner).then(current => {
      if (current?.object_key !== key && current?.previous_key !== key) return storage.delete(key);
    }).catch(() => {}));
    throw error;
  }
  if (!result.results[0]) {
    ctx.waitUntil(storage.delete(key).catch(() => {}));
    return json({ error: 'conflict' }, 409);
  }
  if (row.previous_key) ctx.waitUntil(storage.delete(row.previous_key).catch(() => {}));
  return json(result.results[0]);
}
