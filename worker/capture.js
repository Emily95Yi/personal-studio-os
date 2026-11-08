import { resourceKey } from '../site/self-board-data.js';
import { captureError, captureOptions, checkPortable, detachProjection, projectCapture, readStudio, sql, unpack, verifyCaptureState } from './capture-state.js';
import { cleanupUploads, downloadCapture, filesApi, fileType, requestKey, sha256, uuid } from './capture-files.js';

const types = ['url', 'text', 'image', 'pdf', 'file'];
const maxJSON = 192 * 1024;
const ownerOnly = () => { throw captureError('forbidden', 403); };
const stamp = () => new Date().toISOString();
const binaryImage = /data:image\/[^,;]{1,100};base64,/i;
const text = (value, limit) => {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > limit || binaryImage.test(value)) throw captureError('invalid_text');
  return value.trim();
};
const urlText = value => {
  const source = text(value, 4096);
  if (source && (!resourceKey(source) || /[\\\u0000-\u0020]/.test(source))) throw captureError('invalid_url');
  return source;
};

function normalize(value) {
  const url = new URL(resourceKey(value));
  for (const key of Array.from(url.searchParams.keys())) {
    if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  }
  return url.href;
}

function submittedMetadata(input) {
  const data = {};
  for (const key of ['pageTitle', 'siteName', 'description']) {
    const value = text(input?.[key], key === 'description' ? 2000 : 300);
    if (value) data[key] = value;
  }
  for (const key of ['favicon', 'cover']) {
    const value = urlText(input?.[key]);
    if (value) data[key] = value;
  }
  return data;
}

export async function authenticateCapture(request, env) {
  if (env.CAPTURE_MOBILE !== '1' || request.headers.has('Origin')) return null;
  const token = /^Bearer (sc_[a-f0-9]{64})$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return null;
  const now = Date.now();
  return sql(env.DB, 'UPDATE capture_devices SET used_at = ? WHERE digest = ? AND revoked_at IS NULL AND expires_at > ? ' +
    'RETURNING id, owner', now, await sha256(token), now).first();
}

async function devicesApi(request, db, owner, path, body, json) {
  if (path === '/devices' && request.method === 'GET') {
    const { results } = await sql(db, 'SELECT id, name, created_at, expires_at, used_at, revoked_at ' +
      'FROM capture_devices WHERE owner = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 100', owner).all();
    return json({ devices: results });
  }
  if (path === '/devices' && request.method === 'POST') {
    const name = text((await body(request, 1024))?.name, 80);
    if (!name) throw captureError('invalid_device');
    const now = Date.now();
    const expiresAt = now + 180 * 24 * 60 * 60 * 1000;
    const token = 'sc_' + Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
    const device = await sql(db, 'INSERT INTO capture_devices (id, owner, name, digest, created_at, expires_at) ' +
      'SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM capture_devices WHERE owner = ? AND revoked_at IS NULL AND expires_at > ?) < 20 ' +
      'RETURNING id', crypto.randomUUID(), owner, name, await sha256(token), now, expiresAt, owner, now).first();
    if (!device) throw captureError('device_limit', 409);
    return json({ id: device.id, token, expiresAt }, 201);
  }
  const id = path.split('/')[2];
  if (request.method === 'DELETE' && uuid.test(id) && path === '/devices/' + id) {
    await sql(db, 'UPDATE capture_devices SET revoked_at = ? WHERE owner = ? AND id = ? AND revoked_at IS NULL',
      Date.now(), owner, id).run();
    return json({ revoked: true });
  }
  throw captureError('not_found', 404);
}

function captureView(row) {
  const values = unpack(row);
  if (!resourceKey(values.sourceUrl)) values.sourceUrl = '';
  return {
    id: row.id, type: row.type, status: row.status, target: row.target, version: row.version,
    ...values, sourceDomain: values.sourceUrl ? new URL(values.sourceUrl).hostname : '',
    normalizedUrl: row.normalized_url, metadata: JSON.parse(row.metadata), capturedAt: row.captured_at, updatedAt: row.updated_at,
    device: row.device_name, nativeCollection: row.native_collection,
    ...(row.filename ? { attachment: { filename: row.filename, mime: row.mime, size: row.size } } : {}),
  };
}

const select = 'SELECT i.*, u.filename, u.mime, u.size, d.name AS device_name FROM capture_items i ' +
  'LEFT JOIN capture_uploads u ON u.id = i.attachment_id LEFT JOIN capture_devices d ON d.id = i.device_id';
const one = (db, owner, id) => sql(db, select + " WHERE i.owner = ? AND i.id = ? AND i.status != 'deleted'", owner, id).first();

async function items(db, owner, params) {
  const status = params.get('status') || 'inbox';
  const type = params.get('type') || '';
  if (!['inbox', 'organized', 'archived'].includes(status) || (type && !types.includes(type))) throw captureError('invalid_filter');
  const q = text(params.get('q'), 150).toLowerCase();
  const ascending = params.get('sort') === 'oldest';
  const limit = Math.min(50, Math.max(1, Number(params.get('limit')) || 25));
  const offset = Math.min(100000, Math.max(0, Number(params.get('offset')) || 0));
  if (!Number.isInteger(limit) || !Number.isInteger(offset)) throw captureError('invalid_filter');
  const filter = ' WHERE i.owner = ? AND i.status = ?' + (type ? ' AND i.type = ?' : '') +
    (q ? ' AND instr(lower(i.document || i.source_url || i.metadata), ?) > 0' : '');
  const args = [owner, status, ...(type ? [type] : []), ...(q ? [q] : [])];
  const [rows, count, inbox] = await db.batch([
    sql(db, select + filter + (ascending ? ' ORDER BY i.captured_at, i.id' : ' ORDER BY i.captured_at DESC, i.id DESC') +
      ' LIMIT ? OFFSET ?', ...args, limit, offset),
    sql(db, 'SELECT count(*) AS count FROM capture_items i' + filter, ...args),
    sql(db, "SELECT count(*) AS count FROM capture_items WHERE owner = ? AND status = 'inbox'", owner),
  ]);
  return { items: rows.results.map(captureView), total: count.results[0].count, inboxCount: inbox.results[0].count };
}

async function mutate(env, owner, rows, change) {
  const { DB: db } = env;
  const affectsStudio = Boolean(change.target) || rows.some(row => row.status === 'organized');
  const stateRead = affectsStudio ? await readStudio(env, owner) : null;
  if (affectsStudio && stateRead.row?.lease_until > Date.now()) throw captureError('studio_editing', 423);
  const now = stamp();
  const transaction = crypto.randomUUID();
  const expected = JSON.stringify(rows.map(row => ({ id: row.id, version: row.version })));
  const versionsMatch = 'NOT EXISTS (SELECT 1 FROM json_each(?) j WHERE NOT EXISTS (SELECT 1 FROM capture_items i ' +
    'WHERE i.owner = ? AND i.id = json_extract(j.value, \'$.id\') AND i.version = json_extract(j.value, \'$.version\')))';
  const guard = affectsStudio
    ? 'EXISTS (SELECT 1 FROM studio_cloud WHERE owner = ? AND lease_token = ? AND lease_until = 0)'
    : versionsMatch;
  const guardArgs = affectsStudio ? [owner, transaction] : [expected, owner];
  const updates = [];
  const state = stateRead?.state;
  const conflicts = rows.length > 1 && !affectsStudio;
  if (conflicts) throw captureError('invalid_batch');
  for (const row of rows) {
    const prior = unpack(row);
    const fields = { ...prior };
    for (const [key, limit] of [['title', 200], ['originalText', 40000], ['userNote', 12000]]) {
      if (Object.hasOwn(change, key)) fields[key] = text(change[key], limit);
    }
    if (!row.native_collection && change.status !== 'deleted' &&
        !fields.title) throw captureError('invalid_content');
    if (!fields.title) fields.title = fields.originalText?.slice(0, 80) || '未命名收藏';
    const status = change.target ? 'organized' : change.status ?? row.status;
    let target = row.target;
    let collection = row.native_collection;
    let document;
    if (change.target && (change.target !== row.target || row.status !== 'organized')) {
      detachProjection(state, row);
      const projection = projectCapture(state, row, change.target, fields);
      collection = projection.collection;
      document = projection.record;
      target = change.target;
    } else if (status === 'archived' && collection) {
      if (state) detachProjection(state, row);
      document = JSON.parse(row.document);
    } else if (status !== 'organized') {
      if (status !== 'deleted') checkPortable(row);
      if (collection && state) detachProjection(state, row);
      const { sourceUrl, ...unfiled } = fields;
      document = status === 'deleted' ? {} : unfiled;
      collection = null;
      target = null;
    } else {
      if (['title', 'originalText', 'userNote'].some(key => Object.hasOwn(change, key))) throw captureError('use_native_editor', 409);
      document = JSON.parse(row.document);
    }
    updates.push(sql(db, 'UPDATE capture_items SET status = ?, target = ?, native_collection = ?, document = ?, ' +
      'source_url = ?, normalized_url = ?, metadata = ?, version = version + 1, updated_at = ?, attachment_id = ? ' +
      'WHERE owner = ? AND id = ? AND version = ? AND ' + guard + ' RETURNING id',
    status, target, collection, JSON.stringify(document), status === 'deleted' ? '' : fields.sourceUrl,
    status === 'deleted' ? '' : row.normalized_url, status === 'deleted' ? '{}' : row.metadata,
    now, status === 'deleted' ? null : row.attachment_id, owner, row.id, row.version, ...guardArgs));
    if (status === 'deleted' && row.attachment_id) {
      updates.push(sql(db, "UPDATE capture_uploads SET status = 'deleting' WHERE id = ? AND " +
        'NOT EXISTS (SELECT 1 FROM capture_items WHERE attachment_id = ?)', row.attachment_id, row.attachment_id));
    }
  }
  if (affectsStudio) {
    verifyCaptureState(state);
    const revision = stateRead.row?.revision ?? 0;
    updates.unshift(sql(db, 'INSERT INTO studio_cloud(owner, revision, lease_token, lease_until) ' +
      'SELECT ?, 1, ?, 0 WHERE ' + versionsMatch + ' ON CONFLICT(owner) DO UPDATE SET ' +
      'revision = studio_cloud.revision + 1, lease_token = excluded.lease_token, lease_until = 0 ' +
      'WHERE studio_cloud.revision = ? AND studio_cloud.lease_until <= ? RETURNING revision',
    owner, transaction, expected, owner, revision, Date.now()));
  }
  const result = await db.batch(updates);
  if (!result[0].results.length) throw captureError('conflict', 409);
}

async function create(env, owner, actor, device, input) {
  const { DB: db } = env;
  if (!input || !types.includes(input.type) || typeof input.requestKey !== 'string' || !requestKey.test(input.requestKey)) {
    throw captureError('invalid_capture');
  }
  const key = actor + ':' + input.requestKey;
  const prior = await sql(db, 'SELECT * FROM capture_items WHERE owner = ? AND request_key = ?', owner, key).first();
  if (prior?.status === 'deleted') throw captureError('capture_deleted', 409);
  if (prior) return { id: prior.id, status: prior.status, duplicate: true };

  const type = input.type;
  const sourceUrl = urlText(input.sourceUrl);
  const normalized = sourceUrl ? normalize(sourceUrl) : '';
  const metadata = submittedMetadata(input.metadata);
  const originalText = text(input.originalText, 40000);
  const userNote = text(input.userNote, 12000);
  const target = input.target == null ? '' : text(input.target, 1000);
  const attachment = input.attachmentId;
  let file;
  if (['file', 'image', 'pdf'].includes(type)) {
    if (typeof attachment !== 'string' || !requestKey.test(attachment)) throw captureError('upload_required');
    file = await sql(db, "SELECT * FROM capture_uploads WHERE id = ? AND owner = ? AND actor = ? AND status = 'ready'",
      attachment, owner, actor).first();
    if (!file || fileType(file.mime) !== type) throw captureError('upload_required');
  } else if (attachment) {
    throw captureError('invalid_capture');
  }
  if ((type === 'url' && (!sourceUrl || originalText)) || (type === 'text' && !originalText)) throw captureError('invalid_content');

  const title = text(input.title, 200) || (metadata.pageTitle || file?.filename || originalText.split('\n')[0] ||
    new URL(sourceUrl).hostname).slice(0, 200);
  const now = stamp();
  const row = await sql(db, "INSERT INTO capture_items (id, owner, device_id, request_key, type, source_url, normalized_url, " +
    "metadata, captured_at, updated_at, status, document, attachment_id) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ? " +
    "WHERE (? IS NULL OR EXISTS (SELECT 1 FROM capture_uploads WHERE id = ? AND status = 'ready' AND created_at >= ?)) " +
    'ON CONFLICT DO NOTHING RETURNING *', crypto.randomUUID(), owner, device?.id ?? null, key, type, sourceUrl, normalized,
  JSON.stringify(metadata), now, now, JSON.stringify({ title, originalText, userNote }), file?.id ?? null,
  file?.id ?? null, file?.id ?? null, Date.now() - 86400000).first();
  if (!row) {
    const duplicate = await sql(db, "SELECT id, status FROM capture_items WHERE owner = ? AND (request_key = ? OR " +
      "(? = 'url' AND type = 'url' AND normalized_url = ? AND status != 'deleted')) ORDER BY request_key = ? DESC LIMIT 1",
    owner, key, type, normalized, key).first();
    if (!duplicate || duplicate.status === 'deleted') throw captureError('capture_conflict', 409);
    return { ...duplicate, duplicate: true };
  }
  if (target) {
    try {
      if (!env.STUDIO_CONTENT) throw captureError('studio_unavailable', 503);
      await mutate(env, owner, [row], { target });
      return { id: row.id, status: 'organized' };
    } catch (error) {
      const saved = await one(db, owner, row.id);
      if (saved?.status === 'organized') return { id: row.id, status: 'organized' };
      return { id: row.id, status: 'inbox', classificationError: error.captureCode ?? 'unavailable' };
    }
  }
  return { id: row.id, status: 'inbox' };
}

export async function captureApi(request, env, ctx, owner, url, { body, json }, device) {
  const path = url.pathname.slice((device ? '/api/capture/mobile' : '/api/capture').length);
  const method = request.method;
  const actor = device?.id ?? 'web';
  if (path === '/options' && method === 'GET') return json({ modules: captureOptions((await readStudio(env, owner)).state) });
  if (path.startsWith('/uploads')) return filesApi(request, env, owner, actor, path, body, json);
  if (path === '' && method === 'POST') {
    const result = await create(env, owner, actor, device, await body(request, maxJSON));
    return json(result, result.duplicate ? 200 : 201);
  }
  if (device) ownerOnly();
  if (path === '/devices' || path.startsWith('/devices/')) return devicesApi(request, env.DB, owner, path, body, json);
  if (path === '/items' && method === 'GET') return json(await items(env.DB, owner, url.searchParams));
  if (path === '/items/batch' && method === 'PATCH') {
    const input = await body(request, 4096);
    const ids = input?.ids;
    const target = text(input?.target, 1000);
    if (!Array.isArray(ids) || !ids.length || ids.length > 20 || new Set(ids).size !== ids.length ||
        !ids.every(id => typeof id === 'string' && uuid.test(id)) || !target || !env.STUDIO_CONTENT) throw captureError('invalid_batch');
    const rows = await Promise.all(ids.map(id => one(env.DB, owner, id)));
    if (rows.some(row => !row)) throw captureError('not_found', 404);
    await mutate(env, owner, rows, { target });
    return json({ updated: ids.length });
  }
  const match = /^\/items\/([0-9a-f-]{36})(\/attachment)?$/.exec(path);
  if (!match) throw captureError('not_found', 404);
  const [, id, attachment] = match;
  if (attachment && method === 'GET') return downloadCapture(env, owner, id, url.searchParams.has('preview'));
  if (attachment) throw captureError('method', 405);
  const row = await one(env.DB, owner, id);
  if (!row) throw captureError('not_found', 404);
  if (method === 'GET') return json(captureView(row));
  if (method === 'DELETE') {
    await mutate(env, owner, [row], { status: 'deleted' });
    ctx.waitUntil(cleanupUploads(env).catch(() => {}));
    return json({ deleted: true });
  }
  if (method === 'PATCH') {
    const change = await body(request, maxJSON);
    if (!change || change.version !== row.version) throw captureError('conflict', 409);
    if (Object.hasOwn(change, 'target')) change.target = text(change.target, 1000);
    if ((change.target && !env.STUDIO_CONTENT) || (change.status && !['inbox', 'archived'].includes(change.status))) {
      throw captureError('invalid_status');
    }
    await mutate(env, owner, [row], change);
    return json(captureView(await one(env.DB, owner, id)));
  }
  throw captureError('method', 405);
}
