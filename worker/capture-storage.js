import { sql } from './capture-state.js';

const ttl = 5 * 60 * 1000;
const maxPages = 30;
const knownBytes = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

async function d1Usage(db) {
  const { meta } = await sql(db, 'SELECT 1').run();
  return knownBytes(meta?.size_after);
}

async function r2Usage(bucket) {
  if (!bucket) return null;
  let cursor;
  let bytes = 0;
  for (let page = 0; page < maxPages; page++) {
    const result = await bucket.list({ cursor, limit: 1000 });
    for (const object of result.objects) {
      if (knownBytes(object.size) === null) return null;
      bytes += object.size;
    }
    if (!result.truncated) return knownBytes(bytes);
    if (!result.cursor || result.cursor === cursor) return null;
    cursor = result.cursor;
  }
  return null;
}

export async function storageUsage(env, refresh) {
  const db = env.DB;
  const cache = await sql(db, 'SELECT payload, measured_at FROM capture_storage_cache WHERE id = 1').first();
  const now = Date.now();
  if (cache && now - cache.measured_at < (refresh ? 15000 : ttl)) return JSON.parse(cache.payload);
  const [d1, r2] = await Promise.all([
    d1Usage(db).catch(() => null), r2Usage(env.STUDIO_CONTENT).catch(() => null),
  ]);
  const result = { d1, r2, measuredAt: new Date().toISOString() };
  await sql(db, 'INSERT INTO capture_storage_cache (id, payload, measured_at) VALUES (1, ?, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, measured_at = excluded.measured_at ' +
    'WHERE excluded.measured_at >= capture_storage_cache.measured_at', JSON.stringify(result), now).run();
  return result;
}
