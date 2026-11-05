import { Temporal } from '@js-temporal/polyfill';
import { eventWindow, newCalDavClient, studioUid } from './caldav.js';
import { parseIcs, windowFor } from './ics.js';
import { getSource } from './feed.js';
import { getPlanner } from './planner.js';
import { fetchIcs, openSource, sealSource } from './source.js';

const zone = 'Asia/Tokyo';
const statusLimit = 500;
const retryDelay = 5 * 60 * 1000;
export const caldavEnabled = env => env.CALDAV_ENABLED === 'true' &&
  /^[A-Za-z0-9+/]{43}=$/.test(env.CALDAV_ENCRYPTION_KEY ?? '');
const allowedCalendar = (env, name) => !env.CALDAV_TEST_CALENDAR || name === env.CALDAV_TEST_CALENDAR;
const readLease = 120_000;
const asDate = date => Temporal.PlainDate.from(date).toZonedDateTime(zone).epochMilliseconds;
const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);
const connect = (db, owner) => stmt(db, 'SELECT * FROM caldav_connections WHERE owner = ?', owner).first();
async function collectionKey(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function span(event) {
  return event.allDay ? [asDate(event.start), asDate(event.end)] : [Date.parse(event.start), Date.parse(event.end)];
}

export function overlaps(event, other) {
  if (other.busy === false) return false;
  const [start, end] = span(event);
  const [otherStart, otherEnd] = span(other);
  return start < otherEnd && otherStart < end;
}

function sameTimes(event, other) {
  const [start, end] = span(event);
  const [otherStart, otherEnd] = span(other);
  return event.allDay === other.allDay && start === otherStart && end === otherEnd;
}

function matchesRemote(event, resource) {
  if (!resource?.owned) return false;
  const rows = parseIcs(resource.ics, eventWindow(event));
  return rows.length === 1 && sameTimes(event, rows[0]);
}

function projectStatus(row) {
  return {
    id: row.event_id, state: row.state, reason: row.reason, version: row.updated_at,
    conflicts: row.conflicts_json ? JSON.parse(row.conflicts_json) : [],
  };
}

export function createCalDavService({ provider = newCalDavClient, download = fetchIcs } = {}) {
  async function decrypt(env, owner, row) {
    return JSON.parse(await openSource(env.CALDAV_ENCRYPTION_KEY, owner, row.sealed));
  }

  async function view(env, owner) {
    const row = await connect(env.DB, owner);
    if (!row || !allowedCalendar(env, row.name)) return { enabled: true, configured: false, events: [], statuses: [] };
    const { results } = await stmt(env.DB, 'SELECT * FROM caldav_events WHERE owner = ? AND connection_id = ? LIMIT ?',
      owner, row.id, statusLimit).all();
    return {
      enabled: true, configured: Boolean(row.sealed), name: row.name, fetchedAt: row.cache_at, stale: Boolean(row.cache_error),
      events: row.cache_json ? JSON.parse(row.cache_json) : [], statuses: results.map(projectStatus),
    };
  }

  async function discover(env, owner, input) {
    if ((await connect(env.DB, owner))?.sealed) return { error: 'already_connected', status: 409 };
    const email = input?.email?.trim?.();
    const password = input?.password?.trim?.();
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s:@]+@[^\s:@]+$/.test(email) ||
        typeof password !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(password)) {
      return { error: 'invalid_credentials', status: 400 };
    }
    try {
      const credentials = { email, password };
      const calendars = (await provider(credentials).discover()).filter(row => row.writable !== false && allowedCalendar(env, row.name))
        .map(row => ({ ...row, id: crypto.randomUUID() }));
      if (!calendars.length || (env.CALDAV_TEST_CALENDAR && calendars.length !== 1)) {
        return { error: 'no_writable_calendar', status: 422 };
      }
      const sealed = await sealSource(env.CALDAV_ENCRYPTION_KEY, owner, JSON.stringify({ credentials, calendars }));
      await stmt(env.DB, 'INSERT OR REPLACE INTO caldav_setup VALUES (?, ?, ?)', owner, sealed, Date.now() + 600_000).run();
      return { calendars: calendars.map(({ id, name }) => ({ id, name })) };
    } catch {
      return { error: 'apple_connection_failed', status: 422 };
    }
  }

  async function select(env, owner, id) {
    const db = env.DB;
    const setup = await stmt(db, 'SELECT * FROM caldav_setup WHERE owner = ? AND expires_at > ?', owner, Date.now()).first();
    if (!setup) return { error: 'setup_expired', status: 409 };
    const { credentials, calendars } = await decrypt(env, owner, setup);
    const selected = calendars.find(row => row.id === id);
    if (!selected || !allowedCalendar(env, selected.name)) return { error: 'invalid_calendar', status: 400 };
    const fingerprint = await collectionKey(selected.href);
    const prior = await connect(db, owner);
    if (prior?.sealed) return { error: 'already_connected', status: 409 };
    if (prior && prior.collection_key !== fingerprint) return { error: 'different_calendar', status: 409 };
    const sealed = await sealSource(env.CALDAV_ENCRYPTION_KEY, owner, JSON.stringify({ credentials, collection: selected.href }));
    const applied = prior
      ? await stmt(db, 'UPDATE caldav_connections SET sealed = ?, name = ?, refresh_after = 0 WHERE owner = ? AND id = ? AND sealed = ?',
        sealed, selected.name, owner, prior.id, '').run()
      : await stmt(db, 'INSERT OR IGNORE INTO caldav_connections (owner, id, name, collection_key, sealed) VALUES (?, ?, ?, ?, ?)',
        owner, crypto.randomUUID(), selected.name, fingerprint, sealed).run();
    if (!applied.meta.changes) return { error: 'already_connected', status: 409 };
    await stmt(db, 'DELETE FROM caldav_setup WHERE owner = ?', owner).run();
    return view(env, owner);
  }

  async function disconnect(env, owner) {
    const db = env.DB;
    const result = await stmt(db, "UPDATE caldav_connections SET sealed = '', cache_json = NULL, cache_at = 0, cache_error = 0, " +
      'refresh_after = 0 WHERE owner = ? AND lease_until <= ?',
      owner, Date.now()).run();
    if (!result.meta.changes) return { error: 'sync_in_progress', status: 409 };
    await stmt(db, 'DELETE FROM caldav_setup WHERE owner = ?', owner).run();
    return view(env, owner);
  }

  async function enqueue(env, owner, events) {
    const row = await connect(env.DB, owner);
    if (!row?.sealed || !allowedCalendar(env, row.name)) return;
    // Only an explicit, new server-managed review is automatically queued.
    const entries = events.filter(event => event.syncMode === 'caldav');
    const db = env.DB;
    const { results } = await stmt(db, 'SELECT event_id FROM caldav_events WHERE owner = ? AND connection_id = ?',
      owner, row.id).all();
    const existing = new Set(results.map(entry => entry.event_id));
    const additions = entries.filter(event => !existing.has(event.id));
    for (const event of additions) {
      await stmt(db, 'INSERT OR IGNORE INTO caldav_events (owner, event_id, connection_id, state, updated_at) VALUES (?, ?, ?, ?, ?)',
        owner, event.id, row.id, 'queued', Date.now()).run();
    }
  }

  async function set(db, row, state, { reason = null, href = row.href, etag = row.etag, conflicts = null } = {}) {
    const result = await stmt(db, 'UPDATE caldav_events SET state = ?, reason = ?, href = ?, etag = ?, conflicts_json = ?, updated_at = ? ' +
      'WHERE owner = ? AND event_id = ? AND connection_id = ? AND state = ? AND updated_at = ?',
      state, reason, href, etag, conflicts && JSON.stringify(conflicts), Math.max(Date.now(), row.updated_at + 1),
      row.owner, row.event_id, row.connection_id, row.state, row.updated_at).run();
    return Boolean(result.meta.changes);
  }

  async function command(env, owner, id, input) {
    const db = env.DB;
    const row = await stmt(db, 'SELECT * FROM caldav_events WHERE owner = ? AND event_id = ?', owner, id).first();
    const config = await connect(db, owner);
    if (!row || !config?.sealed || !allowedCalendar(env, config.name) || row.connection_id !== config.id) return { error: 'not_found', status: 404 };
    if (input?.version !== row.updated_at) return { error: 'event_changed', status: 409 };
    let next, reason;
    if (input?.action === 'stop' && ['pending', 'error'].includes(row.state)) {
      next = 'pending';
      reason = 'cancelled';
    } else if (input?.action === 'retry' && ['pending', 'error'].includes(row.state) &&
        !['remote_changed', 'delete_failed', 'delete_changed'].includes(row.reason)) next = 'queued';
    else if (input?.action === 'delete' && ['added', 'pending', 'error'].includes(row.state)) next = 'delete_queued';
    else return { error: 'event_changed', status: 409 };
    if (!await set(db, row, next, { reason })) return { error: 'event_changed', status: 409 };
    return view(env, owner);
  }

  async function conflictSources(env, owner, client, collection, event) {
    const window = eventWindow(event);
    const primary = await client.read(collection, window);
    const source = await getSource(env.DB, owner);
    let secondary = [];
    if (source) {
      const url = await openSource(env.ICAL_ENCRYPTION_KEY, owner, source.encrypted_url);
      secondary = parseIcs(await download(url), window);
      if (secondary.some(row => row.uid === studioUid(event.id) || row.marker === event.id)) {
        return { moved: true, items: [] };
      }
    }
    const distinct = new Map();
    for (const row of [...primary, ...secondary]) {
      if (row.uid === studioUid(event.id) || row.marker === event.id || !overlaps(event, row)) continue;
      distinct.set(row.id, { title: row.title, start: row.start, end: row.end, allDay: row.allDay });
    }
    return { moved: false, items: [...distinct.values()].slice(0, 12) };
  }

  async function process(env, owner, client, collection, row, event) {
    const db = env.DB;
    const removing = row.state === 'delete_queued';
    try {
      const found = await client.locate(collection, event, row.href);
      if (found && !found.owned) {
        await set(db, row, 'error', { reason: removing ? 'delete_changed' : 'remote_changed' });
        return;
      }
      if (removing) {
        if (found && row.etag && row.etag !== found.etag) {
          await set(db, row, 'error', { reason: 'delete_changed', href: found.href, etag: found.etag });
          return;
        }
        const result = found ? await client.remove(collection, found) : 'deleted';
        await set(db, row, result === 'deleted' ? 'deleted' : 'error', {
          reason: result === 'deleted' ? null : 'delete_changed',
        });
        return;
      }
      if (found) {
        const same = matchesRemote(event, found);
        await set(db, row, same ? 'added' : 'error', {
          reason: same ? null : 'remote_changed', href: found.href, etag: found.etag,
        });
        return;
      }
      const conflicts = await conflictSources(env, owner, client, collection, event);
      if (conflicts.moved) {
        await set(db, row, 'pending', { reason: 'remote_changed' });
        return;
      }
      if (conflicts.items.length) {
        await set(db, row, 'pending', { reason: 'conflict', conflicts: conflicts.items });
        return;
      }
      const created = await client.create(collection, event);
      const same = matchesRemote(event, created);
      await set(db, row, same ? 'added' : 'error', {
        reason: same ? null : created ? 'remote_changed' : 'verification_failed',
        href: created?.owned ? created.href : null, etag: created?.owned ? created.etag : null,
      });
    } catch {
      await set(db, row, 'error', { reason: removing ? 'delete_failed' : 'connection_error' });
    }
  }

  async function refresh(env, owner, row, client, collection, events) {
    const db = env.DB;
    const now = Date.now();
    const locked = await stmt(db, 'UPDATE caldav_connections SET refresh_after = ? WHERE owner = ? AND id = ?',
      now + retryDelay, owner, row.id).run();
    if (!locked.meta.changes) return;
    try {
      const projection = await client.read(collection, windowFor(now));
      if (projection.length > 2000) throw new Error('CalDAV event limit');
      const json = JSON.stringify(projection);
      if (new TextEncoder().encode(json).byteLength > 750 * 1024) throw new Error('CalDAV projection too large');
      await stmt(db, 'UPDATE caldav_connections SET cache_json = ?, cache_at = ?, cache_error = 0 WHERE owner = ? AND id = ?',
        json, now, owner, row.id).run();
      const known = new Set(projection.map(event => event.uid));
      const { results } = await stmt(db, 'SELECT * FROM caldav_events WHERE owner = ? AND connection_id = ? AND state = ? ORDER BY verified_at ASC',
        owner, row.id, 'added').all();
      const missing = results.filter(link => !known.has(studioUid(link.event_id)));
      // Limit direct lookups per refresh. A successful range snapshot alone never proves deletion.
      for (const link of missing.slice(0, 4)) {
        const event = events.get(link.event_id);
        if (!event) continue;
        try {
          const found = await client.locate(collection, event, link.href);
          if (!found) await set(db, link, 'pending', { reason: 'removed_remotely', href: null, etag: null });
          else if (found.owned && found.href !== link.href) {
            await set(db, link, 'added', { href: found.href, etag: found.etag });
          }
        } catch { /* A lookup failure is not evidence of deletion. */ }
        await stmt(db, 'UPDATE caldav_events SET verified_at = ? WHERE owner = ? AND event_id = ? AND connection_id = ?',
          now, owner, link.event_id, row.id).run();
      }
    } catch {
      await stmt(db, 'UPDATE caldav_connections SET cache_error = 1 WHERE owner = ? AND id = ?',
        owner, row.id).run();
    }
  }

  async function run(env, owner, { manual = false } = {}) {
    const db = env.DB;
    const row = await connect(db, owner);
    if (!row?.sealed || !allowedCalendar(env, row.name)) return;
    const now = Date.now();
    const queued = await stmt(db, "SELECT event_id FROM caldav_events WHERE owner = ? AND connection_id = ? AND state IN ('queued','delete_queued') LIMIT 1",
      owner, row.id).first();
    if (!queued && row.refresh_after > now && (!manual || now - row.cache_at < 30_000)) return;
    const lease = crypto.randomUUID();
    const result = await stmt(db, 'UPDATE caldav_connections SET lease = ?, lease_until = ? WHERE owner = ? AND id = ? AND lease_until <= ? AND sealed = ?',
      lease, now + readLease, owner, row.id, now, row.sealed).run();
    if (!result.meta.changes) return;
    try {
      const { credentials, collection } = await decrypt(env, owner, row);
      const client = provider(credentials);
      const planner = await getPlanner(db, owner);
      const events = new Map((planner.snapshot?.events ?? []).map(event => [event.id, event]));
      const { results } = await stmt(db, "SELECT * FROM caldav_events WHERE owner = ? AND connection_id = ? AND state IN ('queued','delete_queued') ORDER BY updated_at LIMIT 1",
        owner, row.id).all();
      for (const next of results) {
        const event = events.get(next.event_id);
        if (event?.syncMode === 'caldav') await process(env, owner, client, collection, next, event);
        else await set(db, next, 'error', { reason: 'missing_local' });
      }
      if (results.length || row.refresh_after <= now || (manual && now - row.cache_at >= 30_000)) {
        await refresh(env, owner, row, client, collection, events);
      }
    } finally {
      await stmt(db, 'UPDATE caldav_connections SET lease = NULL, lease_until = 0 WHERE owner = ? AND lease = ?',
        owner, lease).run();
    }
  }

  async function drain(env) {
    const now = Date.now();
    await stmt(env.DB, 'DELETE FROM caldav_setup WHERE expires_at <= ?', now).run();
    const { results } = await stmt(env.DB, "SELECT DISTINCT e.owner FROM caldav_events e JOIN caldav_connections c ON e.connection_id = c.id AND e.owner = c.owner WHERE c.sealed <> '' AND e.state IN ('queued', 'delete_queued') LIMIT 8").all();
    await Promise.allSettled(results.map(row => run(env, row.owner)));
  }

  return { view, discover, select, disconnect, enqueue, command, run, drain };
}
