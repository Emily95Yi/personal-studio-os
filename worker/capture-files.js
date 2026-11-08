import { imageTypes, validImage } from '../site/studio-data.js';
import { captureError, sql } from './capture-state.js';

const chunkBytes = 8 * 1024 * 1024;
const maxBytes = 256 * 1024 * 1024;
const ttl = 24 * 60 * 60 * 1000;
export const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const requestKey = /^[a-zA-Z0-9_-]{8,100}$/;

export async function sha256(input) {
  const digest = await crypto.subtle.digest('SHA-256', typeof input === 'string' ? new TextEncoder().encode(input) : input);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

function mimeOf(filename, mime) {
  const known = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif',
    gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', pdf: 'application/pdf' };
  const supplied = typeof mime === 'string' ? mime.split(';')[0].trim().toLowerCase() : '';
  if (!supplied || supplied === 'application/octet-stream') {
    return Object.hasOwn(known, filename.split('.').at(-1).toLowerCase())
      ? known[filename.split('.').at(-1).toLowerCase()] : 'application/octet-stream';
  }
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(supplied) || supplied.length > 127) throw captureError('invalid_mime');
  return supplied;
}

export const fileType = mime => mime === 'application/pdf' ? 'pdf' : mime.startsWith('image/') ? 'image' : 'file';
const uploadRow = (db, owner, actor, id) =>
  sql(db, 'SELECT * FROM capture_uploads WHERE id = ? AND owner = ? AND actor = ?', id, owner, actor).first();

async function openUpload(db, storage, owner, actor, input) {
  const { size, id } = input ?? {};
  const filename = typeof input?.filename === 'string' ? input.filename.replace(/[\\/\x00-\x1f\x7f]/g, '_').trim() : '';
  if (typeof id !== 'string' || !requestKey.test(id) || !filename || filename.length > 200 ||
      !Number.isSafeInteger(size) || size < 1) throw captureError('invalid_file');
  if (size > maxBytes) throw captureError('file_too_large', 413);
  const mime = mimeOf(filename, input.mime);
  const existing = await uploadRow(db, owner, actor, id);
  if (existing) {
    if (existing.size !== size || existing.mime !== mime || existing.filename !== filename) throw captureError('upload_conflict', 409);
    if (existing.status === 'ready' || existing.status === 'uploading') return { id, chunkBytes, type: fileType(mime), ready: existing.status === 'ready' };
    throw captureError('upload_busy', 409);
  }
  const objectKey = 'capture/private/' + crypto.randomUUID();
  const reserved = await sql(db, "INSERT INTO capture_uploads (id, owner, actor, object_key, filename, mime, size, created_at, status) " +
    "SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'opening' WHERE (SELECT count(*) FROM capture_uploads u WHERE u.owner = ? AND " +
    "u.status != 'deleting' AND NOT EXISTS (SELECT 1 FROM capture_items WHERE attachment_id = u.id)) < 10 " +
    'ON CONFLICT DO NOTHING RETURNING id',
  id, owner, actor, objectKey, filename, mime, size, Date.now(), owner).first();
  if (!reserved) throw captureError('upload_busy', 409);
  let upload;
  try {
    upload = await storage.createMultipartUpload(objectKey, { httpMetadata: { contentType: mime } });
    const published = await sql(db, "UPDATE capture_uploads SET multipart_id = ?, status = 'uploading' " +
      "WHERE id = ? AND status = 'opening' RETURNING id", upload.uploadId, id).first();
    if (!published) throw captureError('upload_busy', 409);
  } catch (error) {
    if (upload) await upload.abort().catch(() => {});
    await sql(db, "DELETE FROM capture_uploads WHERE id = ? AND status = 'opening'", id).run();
    throw error;
  }
  return { id, chunkBytes, type: fileType(mime), ready: false };
}

async function exactBytes(request, size) {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && Number(declared) !== size) throw captureError('invalid_part_size', 413);
  if (!request.body) throw captureError('invalid_part_size');
  const reader = request.body.getReader();
  const bytes = new Uint8Array(size);
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > size) {
        await reader.cancel();
        throw captureError('invalid_part_size', 413);
      }
      bytes.set(value, offset);
      offset += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  if (offset !== size) throw captureError('invalid_part_size');
  return bytes;
}

async function putPart(db, storage, row, part, bytes) {
  if (!['ready', 'uploading'].includes(row.status)) throw captureError('upload_busy', 409);
  if (part === 1 && row.mime === 'application/pdf' &&
      new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw captureError('invalid_pdf');
  if (part === 1 && imageTypes.includes(row.mime) && !validImage({
    mime: row.mime, data: btoa(String.fromCharCode(...bytes.subarray(0, 24))),
  })) throw captureError('invalid_image');
  const digest = await sha256(bytes);
  const saved = await sql(db, 'INSERT INTO capture_upload_parts (upload_id, part_number, digest, etag) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(upload_id, part_number) DO UPDATE SET digest = excluded.digest ' +
    'WHERE capture_upload_parts.digest = excluded.digest RETURNING etag', row.id, part, digest, '').first();
  if (!saved) throw captureError('part_changed', 409);
  if (saved.etag || row.status === 'ready') return { part };
  const upload = storage.resumeMultipartUpload(row.object_key, row.multipart_id);
  const { etag } = await upload.uploadPart(part, bytes);
  await sql(db, 'UPDATE capture_upload_parts SET etag = ? WHERE upload_id = ? AND part_number = ?', etag, row.id, part).run();
  return { part };
}

async function uploadResult(db, row, checksum) {
  const match = checksum && await sql(db, "SELECT 1 AS found FROM capture_uploads WHERE owner = ? AND id != ? " +
    "AND checksum = ? AND status = 'ready' LIMIT 1", row.owner, row.id, checksum).first();
  return { id: row.id, duplicateFile: Boolean(match) };
}

async function completeUpload(db, storage, row) {
  if (row.status === 'ready') return uploadResult(db, row, row.checksum);
  if (row.status !== 'uploading') throw captureError('upload_busy', 409);
  const { results } = await sql(db, 'SELECT part_number AS partNumber, etag, digest FROM capture_upload_parts ' +
    'WHERE upload_id = ? AND etag != ? ORDER BY part_number', row.id, '').all();
  if (results.length !== Math.ceil(row.size / chunkBytes)) throw captureError('upload_incomplete', 409);
  let object = await storage.head(row.object_key);
  if (!object) {
    try {
      object = await storage.resumeMultipartUpload(row.object_key, row.multipart_id).complete(results.map(({ partNumber, etag }) => ({ partNumber, etag })));
    } catch (error) {
      object = await storage.head(row.object_key);
      if (!object) throw error;
    }
  }
  if (object.size !== row.size) throw captureError('invalid_file_size', 409);
  const checksum = await sha256(results.map(part => part.digest).join(''));
  const saved = await sql(db, "UPDATE capture_uploads SET status = 'ready', etag = ?, checksum = ? " +
    "WHERE id = ? AND status IN ('uploading', 'ready') RETURNING id", object.etag, checksum, row.id).first();
  if (!saved) throw captureError('upload_busy', 409);
  return uploadResult(db, row, checksum);
}

async function removeUpload(db, storage, row) {
  if (row.multipart_id && !await storage.head(row.object_key)) {
    // A completed or already-aborted multipart ID may return a missing-upload error.
    await storage.resumeMultipartUpload(row.object_key, row.multipart_id).abort();
  }
  await storage.delete(row.object_key);
  await db.batch([
    sql(db, 'DELETE FROM capture_upload_parts WHERE upload_id = ?', row.id),
    sql(db, "DELETE FROM capture_uploads WHERE id = ? AND status = 'deleting'", row.id),
  ]);
}

async function claimCleanup(db, row, limit) {
  return sql(db, "UPDATE capture_uploads SET status = 'deleting' WHERE id = ? AND created_at <= ? " +
    'AND NOT EXISTS (SELECT 1 FROM capture_items WHERE attachment_id = ?) RETURNING *', row.id, limit, row.id).first();
}

export async function cleanupUploads(env) {
  if (!env.STUDIO_CONTENT) return;
  const cutoff = Date.now() - ttl;
  const { results } = await sql(env.DB, "SELECT * FROM capture_uploads WHERE (created_at <= ? OR status = 'deleting') " +
    'AND NOT EXISTS (SELECT 1 FROM capture_items WHERE attachment_id = capture_uploads.id) ORDER BY created_at LIMIT 10', cutoff).all();
  for (const row of results) {
    const claimed = await claimCleanup(env.DB, row, row.status === 'deleting' ? Date.now() : cutoff);
    if (claimed) await removeUpload(env.DB, env.STUDIO_CONTENT, claimed).catch(() => {});
  }
}

export async function filesApi(request, env, owner, actor, path, body, json) {
  const { DB: db, STUDIO_CONTENT: storage } = env;
  if (!storage) throw captureError('files_unavailable', 503);
  if (path === '/uploads/single' && request.method === 'POST') {
    const params = new URL(request.url).searchParams;
    const declared = request.headers.get('Content-Length');
    if (Number(declared) > chunkBytes) throw captureError('shortcut_file_too_large', 413);
    let bytes;
    if (declared !== null) {
      const size = Number(declared);
      if (!Number.isSafeInteger(size) || size <= 0) throw captureError('invalid_file');
      bytes = await exactBytes(request, size);
    } else {
      const reader = request.body?.getReader();
      if (!reader) throw captureError('invalid_file');
      const buffer = new Uint8Array(chunkBytes);
      let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (size + value.length > chunkBytes) {
            await reader.cancel();
            throw captureError('shortcut_file_too_large', 413);
          }
          buffer.set(value, size);
          size += value.length;
        }
      } finally {
        reader.releaseLock();
      }
      bytes = buffer.subarray(0, size);
    }
    const opened = await openUpload(db, storage, owner, actor, {
      id: params.get('id'), filename: params.get('filename'), size: bytes.length,
      mime: request.headers.get('Content-Type'),
    });
    const row = await uploadRow(db, owner, actor, opened.id);
    await putPart(db, storage, row, 1, bytes);
    const result = await completeUpload(db, storage, row);
    return json({ ...result, type: opened.type }, 201);
  }
  if (path === '/uploads' && request.method === 'POST') {
    return json(await openUpload(db, storage, owner, actor, await body(request, 2048)), 201);
  }
  const match = /^\/uploads\/([\w-]{8,100})(?:\/(\d{1,2}|complete))?$/.exec(path);
  if (!match) throw captureError('not_found', 404);
  const [, id, action] = match;
  const row = await uploadRow(db, owner, actor, id);
  if (!row || row.created_at < Date.now() - ttl) throw captureError('upload_not_found', 404);
  if (request.method === 'POST' && action === 'complete') return json(await completeUpload(db, storage, row));
  if (request.method === 'PUT' && Number(action) > 0) {
    const part = Number(action);
    const size = Math.min(chunkBytes, row.size - (part - 1) * chunkBytes);
    if (size <= 0) throw captureError('invalid_part');
    return json(await putPart(db, storage, row, part, await exactBytes(request, size)));
  }
  if (request.method === 'DELETE' && !action) {
    const claimed = await claimCleanup(db, row, Date.now());
    if (!claimed) throw captureError('upload_in_use', 409);
    await removeUpload(db, storage, claimed);
    return json({ cancelled: true });
  }
  throw captureError('method', 405);
}

export async function downloadCapture(env, owner, id, preview) {
  const row = await sql(env.DB, "SELECT u.* FROM capture_items i JOIN capture_uploads u ON u.id = i.attachment_id " +
    "WHERE i.owner = ? AND i.id = ? AND i.status != 'deleted' AND u.status = 'ready'", owner, id).first();
  if (!row || !env.STUDIO_CONTENT) throw captureError('not_found', 404);
  const object = await env.STUDIO_CONTENT.get(row.object_key);
  if (!object) throw captureError('not_found', 404);
  const inline = preview && imageTypes.includes(row.mime);
  return new Response(object.body, { headers: {
    'Content-Type': inline ? row.mime : 'application/octet-stream',
    'Content-Length': String(object.size),
    'Content-Disposition': (inline ? 'inline' : 'attachment') + "; filename*=UTF-8''" +
      encodeURIComponent(row.filename).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16)),
    'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  } });
}
