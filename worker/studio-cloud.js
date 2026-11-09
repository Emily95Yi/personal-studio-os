import { nativeTarget, readCloud, readProjections, readStudio, sql } from './capture-state.js';
import { ensureCaptureTopic } from '../site/capture-topic.js';
import { emptyStudio } from '../site/studio-data.js';
import { clearBoardTrash } from '../site/self-board-data.js';
import { cleanupUploads } from './capture-files.js';
import { previewMigration, studioExport } from '../site/studio-migration.js';
import { applyStudioDelta, deltaFormat } from '../site/studio-delta.js';

const leaseDuration = 120_000;
const validToken = token => typeof token === 'string' && /^[0-9a-f-]{36}$/.test(token);

async function saveConflict(storage, row, baseRevision, saveId, json) {
  // The published snapshot proves that this save advanced the exact revision the client submitted.
  if (saveId && row?.object_key && String(row.revision - 1) === baseRevision) {
    const snapshot = await storage.head(row.object_key);
    if (snapshot?.customMetadata?.saveId === saveId) return json({ revision: row.revision });
  }
  return json({ error: 'conflict' }, 409);
}

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
  const saveId = request.headers.get('X-Studio-Save-Id');
  if (saveId !== null && !validToken(saveId)) return json({ error: 'invalid_studio' }, 400);
  if (revision !== String(row.revision)) return saveConflict(storage, row, revision, saveId, json);
  const clearTrash = url.searchParams.get('clear-trash') === '1';
  let transfer = clearTrash ? undefined : await body(request, 24 * 1024 * 1024);
  const delta = transfer?.format === deltaFormat;
  const current = clearTrash || delta ? await readStudio(env, owner) : null;
  if (current && current.row?.revision !== row.revision) return saveConflict(storage, current.row, revision, saveId, json);
  let checked;
  try {
    if (clearTrash) {
      clearBoardTrash(current.state);
      transfer = studioExport(current.state);
    } else if (delta) {
      transfer = applyStudioDelta(current.state, transfer);
    }
    checked = previewMigration(emptyStudio(), transfer).next;
  } catch {
    return json({ error: 'invalid_studio' }, 400);
  }
  ensureCaptureTopic(checked);
  const projections = current?.projections ?? (await readProjections(db, owner).all()).results;
  const key = 'studio/' + crypto.randomUUID() + '.json';
  const updates = [];
  const purged = [];
  const guard = ' AND EXISTS (SELECT 1 FROM studio_cloud WHERE owner = ? AND object_key = ?)';
  for (const projection of projections) {
    const records = checked[projection.native_collection];
    const index = records.findIndex(record => record.id === projection.id);
    if (index === -1) {
      if (clearTrash) purged.push(projection.id);
      else updates.push(sql(db, "UPDATE capture_items SET version = version + 1, status = 'archived', updated_at = ? WHERE id = ?" + guard,
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
  if (purged.length) {
    const selected = 'owner = ? AND id IN (SELECT value FROM json_each(?))' + guard;
    const args = [owner, JSON.stringify(purged), owner, key];
    updates.push(sql(db, "UPDATE capture_uploads SET status = 'deleting' WHERE id IN " +
      '(SELECT attachment_id FROM capture_items WHERE ' + selected + ')', ...args));
    updates.push(sql(db, "UPDATE capture_items SET status = 'deleted', version = version + 1, updated_at = ?, " +
      "target = NULL, native_collection = NULL, document = '{}', source_url = '', normalized_url = '', " +
      "metadata = '{}', attachment_id = NULL WHERE " + selected, new Date().toISOString(), ...args));
  }
  await storage.put(key, JSON.stringify(checked), {
    httpMetadata: { contentType: 'application/json' },
    ...(saveId && { customMetadata: { saveId } }),
  });
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
    const latest = saveId ? await readCloud(db, owner) : null;
    return saveConflict(storage, latest, revision, saveId, json);
  }
  if (row.previous_key) ctx.waitUntil(storage.delete(row.previous_key).catch(() => {}));
  if (purged.length) ctx.waitUntil(cleanupUploads(env).catch(() => {}));
  return json(result.results[0]);
}
