import { fetchIcs, openSource, sealSource } from './source.js';
import { parseIcs, windowFor } from './ics.js';

const MAX_CACHE_AGE = 15 * 60 * 1000;
const COOLDOWN = 30 * 1000;
const ERROR_BACKOFF = 2 * 60 * 1000;

export function getSource(db, owner) {
  return db.prepare('SELECT * FROM calendar_sources WHERE owner = ?').bind(owner).first();
}

export async function saveSource(env, owner, url) {
  const sealed = await sealSource(env.ICAL_ENCRYPTION_KEY, owner, url);
  await env.DB.prepare(
    'INSERT OR REPLACE INTO calendar_sources (owner, version, encrypted_url) VALUES (?, ?, ?)'
  ).bind(owner, crypto.randomUUID(), sealed).run();
}

export async function removeSource(db, owner) {
  await db.prepare('DELETE FROM calendar_sources WHERE owner = ?').bind(owner).run();
}

export function feedView(row, now = Date.now()) {
  if (!row) return { status: 'unconfigured', events: [] };
  const status = row.refresh_error ? (row.fetched_at ? 'stale' : 'error') :
    !row.fetched_at ? 'loading' : now - row.fetched_at >= MAX_CACHE_AGE ? 'stale' : 'ready';
  return {
    status, fetchedAt: row.fetched_at, windowStart: row.window_start, windowEnd: row.window_end,
    events: row.events_json ? JSON.parse(row.events_json) : [],
  };
}

export async function refreshSource(env, owner, row, now = Date.now()) {
  const db = env.DB;
  // Use a DB lease so manual refreshes and background readers share one upstream request.
  const lock = await db.prepare(
    'UPDATE calendar_sources SET refresh_after = ? WHERE owner = ? AND version = ? AND refresh_after <= ?'
  ).bind(now + COOLDOWN, owner, row.version, now).run();
  if (!lock.meta.changes) return;
  try {
    const url = await openSource(env.ICAL_ENCRYPTION_KEY, owner, row.encrypted_url);
    const window = windowFor(now);
    const events = parseIcs(await fetchIcs(url), window);
    const snapshot = JSON.stringify(events);
    if (new TextEncoder().encode(snapshot).byteLength > 750 * 1024) throw new Error('Projection too large');
    await db.prepare(`UPDATE calendar_sources
      SET events_json = ?, window_start = ?, window_end = ?, fetched_at = ?, refresh_error = 0
      WHERE owner = ? AND version = ?`
    ).bind(snapshot, window.start, window.end, now, owner, row.version).run();
  } catch {
    await db.prepare(
      'UPDATE calendar_sources SET refresh_error = 1, refresh_after = ? WHERE owner = ? AND version = ?'
    ).bind(now + ERROR_BACKOFF, owner, row.version).run();
  }
}

export function refreshDue(row, now) {
  return row && row.refresh_after <= now && (!row.fetched_at || now - row.fetched_at >= MAX_CACHE_AGE);
}
