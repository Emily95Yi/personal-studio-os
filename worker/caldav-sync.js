import { Temporal } from '@js-temporal/polyfill';
import { eventWindow, newCalDavClient, scheduleFromResource, studioUid } from './caldav.js';
import { parseIcs, windowFor } from './ics.js';
import { getSource } from './feed.js';
import { getPlanner, scheduleFields } from './planner.js';
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

const parse = value => value ? JSON.parse(value) : null;
const pack = value => value == null ? null : JSON.stringify(value);
const queued = ['queued', 'delete_queued'];
const errorCode = error => error?.code === 'apple_unauthorized' ? error.code : 'connection_error';
const uidOf = row => row.uid ?? studioUid(row.event_id);
const strongETag = etag => /^"[^"\r\n]+"$/.test(etag ?? '');
const sameFields = (a, b) => a && b && sameTimes(a, b) &&
  ['title', 'location', 'notes'].every(key => a[key] === b[key]);
const isStandalone = row => Boolean(row.uid);
const linkID = async (connection, uid) => {
  const id = await collectionKey(JSON.stringify([connection, uid]));
  return [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20, 32)].join('-');
};

function projectStatus(row) {
  return {
    id: row.event_id, uid: uidOf(row), standalone: isStandalone(row), state: row.state,
    reason: row.reason, operation: row.operation, version: row.updated_at,
    local: parse(row.local_json), remote: parse(row.remote_json), conflicts: parse(row.conflicts_json) ?? [],
  };
}

export function createCalDavService({ provider = newCalDavClient, download = fetchIcs } = {}) {
  async function decrypt(env, owner, row) {
    return JSON.parse(await openSource(env.CALDAV_ENCRYPTION_KEY, owner, row.sealed));
  }

  async function view(env, owner) {
    const row = await connect(env.DB, owner);
    if (!row || !allowedCalendar(env, row.name)) return { enabled: true, configured: false, events: [], statuses: [] };
    const { results } = await stmt(env.DB, 'SELECT * FROM caldav_events WHERE owner = ? AND connection_id = ? ORDER BY updated_at DESC LIMIT ?',
      owner, row.id, statusLimit).all();
    return {
      enabled: true, configured: Boolean(row.sealed), name: row.name, sourceId: 'A:' + row.id,
      fetchedAt: row.cache_at, stale: Boolean(row.cache_error), authorizationFailed: row.cache_error === 'apple_unauthorized',
      events: (parse(row.cache_json) ?? []).map(({ _link, ...event }) => ({
        ...event, ...(_link ? { linkId: _link.id, version: _link.etag } : {}),
      })),
      secondary: row.secondary_key ? {
        sourceId: 'B:' + row.secondary_key, name: row.secondary_name,
        fetchedAt: row.secondary_cache_at, stale: Boolean(row.secondary_cache_error),
        authorizationFailed: row.secondary_cache_error === 'apple_unauthorized',
        events: parse(row.secondary_cache_json) ?? [],
      } : null,
      statuses: results.map(projectStatus),
    };
  }

  async function setupCalendars(env, owner, credentials, current) {
    const discovered = await provider(credentials).discover();
    const calendars = discovered.filter(row => !env.CALDAV_TEST_READ_CALENDAR ||
      row.name === env.CALDAV_TEST_CALENDAR || row.name === env.CALDAV_TEST_READ_CALENDAR).map(row => ({
      ...row, id: crypto.randomUUID(), canWrite: row.writable !== false && allowedCalendar(env, row.name),
      primary: current?.collection === row.href, secondary: current?.secondary === row.href,
    }));
    if (!current && !calendars.some(row => row.canWrite)) return { error: 'no_writable_calendar', status: 422 };
    if (!current && env.CALDAV_TEST_CALENDAR && calendars.filter(row => row.canWrite).length !== 1) {
      return { error: 'no_writable_calendar', status: 422 };
    }
    const sealed = await sealSource(env.CALDAV_ENCRYPTION_KEY, owner, JSON.stringify({ credentials, calendars }));
    await stmt(env.DB, 'INSERT OR REPLACE INTO caldav_setup VALUES (?, ?, ?)', owner, sealed, Date.now() + 600_000).run();
    return { calendars: calendars.map(({ id, name, canWrite, primary, secondary }) => ({ id, name, canWrite, primary, secondary })) };
  }

  async function discover(env, owner, input) {
    const existing = await connect(env.DB, owner);
    try {
      if (existing?.sealed) {
        if (input?.reuse !== true) return { error: 'already_connected', status: 409 };
        const current = await decrypt(env, owner, existing);
        return await setupCalendars(env, owner, current.credentials, current);
      }
      const email = typeof input?.email === 'string' ? input.email.trim() : '';
      const password = typeof input?.password === 'string' ? input.password.trim() : '';
      if (email.length > 254 || !/^[^\s:@]+@[^\s:@]+$/.test(email) || !/^[A-Za-z0-9-]{16,64}$/.test(password)) {
        return { error: 'invalid_credentials', status: 400 };
      }
      return await setupCalendars(env, owner, { email, password });
    } catch (error) {
      // Report only fixed codes; Apple responses can contain private paths and identifiers.
      const code = ['apple_unauthorized', 'apple_unreachable'].includes(error?.code) ? error.code : 'apple_invalid_response';
      const stage = ['principal', 'home', 'calendars'].includes(error?.stage) ? error.stage : undefined;
      return { error: code, stage, status: 422 };
    }
  }

  async function select(env, owner, id, secondaryId) {
    const db = env.DB;
    const setup = await stmt(db, 'SELECT * FROM caldav_setup WHERE owner = ? AND expires_at > ?', owner, Date.now()).first();
    if (!setup) return { error: 'setup_expired', status: 409 };
    const { credentials, calendars } = await decrypt(env, owner, setup);
    const prior = await connect(db, owner);
    const active = prior?.sealed ? await decrypt(env, owner, prior) : null;
    const selected = active ? calendars.find(row => row.href === active.collection) : calendars.find(row => row.id === id);
    const secondary = secondaryId ? calendars.find(row => row.id === secondaryId) : null;
    if (!selected || !selected.canWrite || !allowedCalendar(env, selected.name) ||
        (active && (!selected.primary || (id && id !== selected.id))) ||
        (secondaryId && (!secondary || (env.CALDAV_TEST_READ_CALENDAR && secondary.name !== env.CALDAV_TEST_READ_CALENDAR))) || secondary?.href === selected.href) return { error: 'invalid_calendar', status: 400 };
    const fingerprint = await collectionKey(selected.href);
    if (prior && prior.collection_key !== fingerprint) return { error: 'different_calendar', status: 409 };
    const secondaryKey = secondary ? await collectionKey(secondary.href) : null;
    const sealed = await sealSource(env.CALDAV_ENCRYPTION_KEY, owner, JSON.stringify({
      credentials, collection: selected.href, secondary: secondary?.href,
    }));
    const keep = Boolean(prior?.secondary_key && prior.secondary_key === secondaryKey);
    const applied = prior
      ? await stmt(db, 'UPDATE caldav_connections SET sealed = ?, name = ?, refresh_after = 0, secondary_key = ?, secondary_name = ?, ' +
        'secondary_cache_json = ?, secondary_cache_at = ?, secondary_cache_error = ? WHERE owner = ? AND id = ? AND sealed = ? AND lease_until <= ?',
        sealed, selected.name, secondaryKey, secondary?.name ?? null, keep ? prior.secondary_cache_json : null,
        keep ? prior.secondary_cache_at : 0, keep ? prior.secondary_cache_error : 0, owner, prior.id, prior.sealed, Date.now()).run()
      : await stmt(db, 'INSERT OR IGNORE INTO caldav_connections (owner, id, name, collection_key, sealed, secondary_key, secondary_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
        owner, crypto.randomUUID(), selected.name, fingerprint, sealed, secondaryKey, secondary?.name ?? null).run();
    if (!applied.meta.changes) return { error: 'sync_in_progress', status: 409 };
    await stmt(db, 'DELETE FROM caldav_setup WHERE owner = ? AND sealed = ?', owner, setup.sealed).run();
    return view(env, owner);
  }

  async function disconnect(env, owner) {
    const db = env.DB;
    const result = await stmt(db, "UPDATE caldav_connections SET sealed = '', cache_json = NULL, cache_at = 0, cache_error = 0, " +
      'secondary_key = NULL, secondary_name = NULL, secondary_cache_json = NULL, secondary_cache_at = 0, secondary_cache_error = 0, ' +
      'refresh_after = 0 WHERE owner = ? AND lease_until <= ?',
      owner, Date.now()).run();
    if (!result.meta.changes) return { error: 'sync_in_progress', status: 409 };
    await stmt(db, 'DELETE FROM caldav_setup WHERE owner = ?', owner).run();
    return view(env, owner);
  }

  async function enqueue(env, owner, events) {
    const config = await connect(env.DB, owner);
    if (!config?.sealed || !allowedCalendar(env, config.name)) return;
    const entries = events.filter(event => event.syncMode === 'caldav');
    const { results } = await stmt(env.DB, 'SELECT event_id FROM caldav_events WHERE owner = ? AND connection_id = ?',
      owner, config.id).all();
    const existing = new Set(results.map(entry => entry.event_id));
    const writes = entries.filter(event => !existing.has(event.id)).map(event => stmt(env.DB,
      "INSERT OR IGNORE INTO caldav_events (owner, event_id, connection_id, state, updated_at, operation, local_json) " +
      "VALUES (?, ?, ?, 'queued', ?, 'create', ?)", owner, event.id, config.id, Date.now(), pack(scheduleFields(event))));
    if (writes.length) await env.DB.batch(writes);
  }

  async function set(db, row, state, {
    reason = null, href = row.href, etag = row.etag, conflicts = null,
    local = parse(row.local_json), remote = parse(row.remote_json), operation = row.operation,
  } = {}) {
    const result = await stmt(db, 'UPDATE caldav_events SET state = ?, reason = ?, href = ?, etag = ?, conflicts_json = ?, ' +
      'updated_at = ?, local_json = ?, remote_json = ?, operation = ? ' +
      'WHERE owner = ? AND event_id = ? AND connection_id = ? AND state = ? AND updated_at = ?',
      state, reason, href, etag, pack(conflicts), Math.max(Date.now(), row.updated_at + 1), pack(local), pack(remote), operation,
      row.owner, row.event_id, row.connection_id, row.state, row.updated_at).run();
    return Boolean(result.meta.changes);
  }

  const notFound = { error: 'not_found', status: 404 };
  const changed = { error: 'event_changed', status: 409 };
  const invalid = { error: 'invalid_event', status: 400 };
  const canWrite = (env, row) => row?.sealed && allowedCalendar(env, row.name);

  async function create(env, owner, id, input) {
    const config = await connect(env.DB, owner);
    if (!canWrite(env, config) || input?.source !== 'A') return notFound;
    const details = scheduleFields(input.details);
    if (!details) return invalid;
    const snapshot = await getPlanner(env.DB, owner);
    if (snapshot.snapshot?.events.some(event => event.id === id)) return changed;
    const inserted = await stmt(env.DB, "INSERT OR IGNORE INTO caldav_events (owner, event_id, connection_id, state, updated_at, uid, operation, local_json) " +
      "VALUES (?, ?, ?, 'queued', ?, ?, 'create', ?)", owner, id, config.id, Date.now(), studioUid(id), pack(details)).run();
    if (!inserted.meta.changes) {
      const row = await stmt(env.DB, 'SELECT * FROM caldav_events WHERE owner = ? AND event_id = ?', owner, id).first();
      if (row?.uid !== studioUid(id) || !sameFields(details, parse(row.local_json) ?? parse(row.remote_json))) return changed;
    }
    return view(env, owner);
  }

  async function command(env, owner, id, input) {
    const db = env.DB;
    const config = await connect(db, owner);
    if (!canWrite(env, config) || (input?.source && input.source !== 'A')) return notFound;
    const action = input?.action;
    const details = action === 'edit' ? scheduleFields(input.details) : null;
    if (action === 'edit' && !details) return invalid;
    const row = await stmt(db, 'SELECT * FROM caldav_events WHERE owner = ? AND event_id = ?', owner, id).first();
    if (!row) {
      // Only a server-discovered, editable resource in A may be adopted. Never accept a client href or UID.
      const entry = (parse(config.cache_json) ?? []).find(event => event._link?.id === id);
      const link = entry?._link;
      if (!link || !['edit', 'delete'].includes(action)) return notFound;
      if (input.version !== link.etag) return changed;
      const operation = action === 'edit' ? 'update' : 'delete';
      const result = await stmt(db, 'INSERT OR IGNORE INTO caldav_events ' +
        '(owner, event_id, connection_id, state, updated_at, uid, href, etag, operation, local_json, remote_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        owner, id, config.id, action === 'edit' ? 'queued' : 'delete_queued', Date.now(), entry.uid, link.href, link.etag,
        operation, pack(details), pack(scheduleFields(entry) ?? entry)).run();
      return result.meta.changes ? view(env, owner) : changed;
    }
    if (row.connection_id !== config.id) return notFound;
    if (input.version !== row.updated_at || queued.includes(row.state) || row.state === 'deleted') return changed;
    let operation = row.operation ?? (row.href ? 'update' : 'create');
    let next, reason, local = parse(row.local_json);
    if (action === 'edit' && row.state !== 'conflict') {
      operation = row.href ? 'update' : 'create';
      local = details;
      next = 'queued';
    } else if (action === 'stop' && row.state === 'pending' && operation === 'create') {
      next = 'pending';
      reason = 'cancelled';
    } else if (action === 'retry' && ['pending', 'error'].includes(row.state) && row.reason !== 'moved_to_b') {
      next = operation === 'delete' ? 'delete_queued' : 'queued';
    } else if (action === 'delete' && row.state !== 'conflict') {
      operation = 'delete';
      next = 'delete_queued';
    } else if (action === 'accept_remote' && row.state === 'conflict' && ['remote_changed', 'delete_changed', 'remote_deleted'].includes(row.reason)) {
      return await set(db, row, row.reason === 'remote_deleted' ? 'deleted' : 'added', { local: null, operation: null })
        ? view(env, owner) : changed;
    } else if (action === 'keep_local' && row.state === 'conflict' && row.href && strongETag(row.etag) &&
        ['remote_changed', 'delete_changed'].includes(row.reason) && (local || operation === 'delete')) {
      if (operation === 'create') operation = 'update';
      next = operation === 'delete' ? 'delete_queued' : 'queued';
    } else return changed;
    if (!await set(db, row, next, { reason, local, operation })) return changed;
    return view(env, owner);
  }

  async function conflictSources(env, owner, client, collection, secondaryCollection, event) {
    const window = eventWindow(event);
    const primary = await client.read(collection, window);
    const source = secondaryCollection ? null : await getSource(env.DB, owner);
    let secondary = secondaryCollection ? await client.read(secondaryCollection, window) : [];
    if (source) {
      const url = await openSource(env.ICAL_ENCRYPTION_KEY, owner, source.encrypted_url);
      secondary = parseIcs(await download(url), window);
    }
    if (secondary.some(row => row.uid === event.uid || row.marker === event.id)) return { moved: true, items: [] };
    const distinct = new Map();
    for (const row of [...primary, ...secondary]) {
      if (row.uid === event.uid || row.marker === event.id || !overlaps(event, row)) continue;
      distinct.set(row.id, { title: row.title, start: row.start, end: row.end, allDay: row.allDay });
    }
    return { moved: false, items: [...distinct.values()].slice(0, 12) };
  }

  async function conflict(db, row, found, deleting) {
    const remote = scheduleFromResource(found);
    const reason = !found ? 'remote_deleted' : !remote || !strongETag(found.etag) ? 'unsupported_remote' :
      deleting ? 'delete_changed' : 'remote_changed';
    await set(db, row, 'conflict', {
      reason, href: remote ? found.href : row.href, etag: remote ? found.etag : null,
      remote: remote ?? parse(row.remote_json),
    });
  }

  async function process(env, owner, client, collection, secondary, row, plannerEvent) {
    const db = env.DB;
    const operation = row.operation ?? (row.state === 'delete_queued' ? 'delete' : row.href ? 'update' : 'create');
    const details = parse(row.local_json) ?? scheduleFields(plannerEvent);
    const event = { ...details, id: row.event_id, uid: uidOf(row) };
    const deleting = operation === 'delete';
    try {
      const found = await client.locate(collection, event, row.href);
      if (found && (!found.owned || !strongETag(found.etag))) return await conflict(db, row, found, deleting);
      if (deleting) {
        if (!found) return await set(db, row, 'deleted', { local: null, remote: null, operation: null });
        if (row.etag !== found.etag) return await conflict(db, row, found, true);
        const result = await client.remove(collection, found);
        if (result !== 'deleted') return await conflict(db, row, await client.locate(collection, event, found.href), true);
        return await set(db, row, 'deleted', { local: null, remote: null, operation: null });
      }
      if (!details) return await set(db, row, 'error', { reason: 'missing_local' });
      const adopt = async resource => {
        const remote = scheduleFromResource(resource);
        if (!strongETag(resource?.etag) || !sameFields(details, remote)) return conflict(db, row, resource, false);
        return set(db, row, 'added', { href: resource.href, etag: resource.etag, remote, local: null, operation: null });
      };
      if (operation === 'update') {
        if (!found || row.etag !== found.etag) return await conflict(db, row, found, false);
        const result = await client.update(collection, found, event);
        if (result.changed) return await conflict(db, row, await client.locate(collection, event, found.href), false);
        return await adopt(result.resource);
      }
      if (found) return await adopt(found); // idempotent recovery after an interrupted creation
      const conflicts = await conflictSources(env, owner, client, collection, secondary, event);
      if (conflicts.moved) return await set(db, row, 'pending', { reason: 'moved_to_b' });
      if (conflicts.items.length) return await set(db, row, 'pending', { reason: 'conflict', conflicts: conflicts.items });
      return await adopt(await client.create(collection, event));
    } catch (error) {
      await set(db, row, 'error', { reason: errorCode(error) });
    }
  }

  function encodeCache(events) {
    const unique = [...new Map(events.map(event => [event.id, event])).values()];
    const json = JSON.stringify(unique);
    if (unique.length > 2000 || new TextEncoder().encode(json).byteLength > 750 * 1024) {
      throw new Error('CalDAV projection too large');
    }
    return json;
  }

  async function refresh(env, owner, row, client, collection, secondary) {
    const db = env.DB;
    const now = Date.now();
    const window = windowFor(now);
    await stmt(db, 'UPDATE caldav_connections SET refresh_after = ? WHERE owner = ? AND id = ?',
      now + retryDelay, owner, row.id).run();
    // Refresh each collection independently. A failed REPORT never replaces either cache.
    async function readSecondary() {
      if (!secondary) return;
      try {
        const cache = encodeCache(await client.read(secondary, window));
        await stmt(db, 'UPDATE caldav_connections SET secondary_cache_json = ?, secondary_cache_at = ?, secondary_cache_error = 0 WHERE owner = ? AND id = ?',
          cache, now, owner, row.id).run();
      } catch (error) {
        await stmt(db, 'UPDATE caldav_connections SET secondary_cache_error = ? WHERE owner = ? AND id = ?',
          errorCode(error), owner, row.id).run();
      }
    }

    async function readPrimary() {
      try {
        const resources = await client.scan(collection, window);
        const byUid = new Map();
        const rows = await stmt(db, "SELECT * FROM caldav_events WHERE owner = ? AND connection_id = ? AND state = 'added' ORDER BY verified_at ASC",
          owner, row.id).all();
        const linked = new Set(rows.results.map(uidOf));
        const cache = [];
        for (const resource of resources) {
          for (const event of resource.events) {
            const entries = byUid.get(event.uid) ?? new Set();
            entries.add(resource);
            byUid.set(event.uid, entries);
          }
        }
        for (const resource of resources) {
          for (const event of resource.events) {
            const editable = resource.owned && strongETag(resource.etag) && byUid.get(event.uid).size === 1;
            const _link = editable && !linked.has(event.uid) ?
              { id: await linkID(row.id, event.uid), etag: resource.etag, href: resource.href } : undefined;
            cache.push({ ...event, _link });
          }
        }
        const encoded = encodeCache(cache);
        let lookups = 0;
        let failed;
        for (const link of rows.results) {
          const uid = uidOf(link);
          const matches = byUid.get(uid);
          let found = matches?.size === 1 ? [...matches][0] : matches ? { owned: false } : null;
          if (!matches) {
            // A range snapshot cannot distinguish an out-of-range move from a deletion.
            if (lookups++ >= 2) continue;
            try { found = await client.locate(collection, { id: link.event_id, uid }, link.href); }
            catch (error) { failed = errorCode(error); continue; }
            finally {
              await stmt(db, 'UPDATE caldav_events SET verified_at = ? WHERE owner = ? AND event_id = ? AND connection_id = ?',
                now, owner, link.event_id, row.id).run();
            }
          }
          if (!found) await set(db, link, 'deleted', { reason: 'removed_remotely', operation: null });
          else if (!found.owned || !strongETag(found.etag)) await conflict(db, link, found, false);
          else if (found.href !== link.href || found.etag !== link.etag || !link.remote_json) {
            const remote = scheduleFromResource(found);
            if (!remote) await conflict(db, link, found, false);
            else await set(db, link, 'added', { href: found.href, etag: found.etag, remote, operation: null });
          }
        }
        await stmt(db, 'UPDATE caldav_connections SET cache_json = ?, cache_at = ?, cache_error = ? WHERE owner = ? AND id = ?',
          encoded, now, failed ?? 0, owner, row.id).run();
      } catch (error) {
        await stmt(db, 'UPDATE caldav_connections SET cache_error = ? WHERE owner = ? AND id = ?',
          errorCode(error), owner, row.id).run();
      }
    }
    await Promise.all([readPrimary(), readSecondary()]);
  }

  async function run(env, owner, { manual = false } = {}) {
    const db = env.DB;
    const row = await connect(db, owner);
    if (!row?.sealed || !allowedCalendar(env, row.name)) return;
    const now = Date.now();
    const queued = await stmt(db, "SELECT event_id FROM caldav_events WHERE owner = ? AND connection_id = ? AND state IN ('queued','delete_queued') LIMIT 1",
      owner, row.id).first();
    if (!queued && row.refresh_after > now && !manual) return;
    const lease = crypto.randomUUID();
    const result = await stmt(db, 'UPDATE caldav_connections SET lease = ?, lease_until = ? WHERE owner = ? AND id = ? AND lease_until <= ? AND sealed = ?',
      lease, now + readLease, owner, row.id, now, row.sealed).run();
    if (!result.meta.changes) return;
    try {
      const { credentials, collection, secondary } = await decrypt(env, owner, row);
      const client = provider(credentials);
      const planner = await getPlanner(db, owner);
      const events = new Map((planner.snapshot?.events ?? []).map(event => [event.id, event]));
      const { results } = await stmt(db, "SELECT * FROM caldav_events WHERE owner = ? AND connection_id = ? AND state IN ('queued','delete_queued') ORDER BY updated_at LIMIT 1",
        owner, row.id).all();
      for (const next of results) {
        const event = events.get(next.event_id);
        await process(env, owner, client, collection, secondary, next, event);
      }
      if (results.length || row.refresh_after <= now || manual) {
        await refresh(env, owner, row, client, collection, secondary);
      }
    } finally {
      await stmt(db, 'UPDATE caldav_connections SET lease = NULL, lease_until = 0 WHERE owner = ? AND lease = ?',
        owner, lease).run();
    }
  }

  async function drain(env) {
    const now = Date.now();
    await stmt(env.DB, 'DELETE FROM caldav_setup WHERE expires_at <= ?', now).run();
    const { results } = await stmt(env.DB, "SELECT c.owner FROM caldav_connections c WHERE c.sealed <> '' AND (c.refresh_after <= ? OR EXISTS (SELECT 1 FROM caldav_events e WHERE e.owner = c.owner AND e.connection_id = c.id AND e.state IN ('queued', 'delete_queued'))) ORDER BY c.refresh_after LIMIT 8", now).all();
    await Promise.allSettled(results.map(row => run(env, row.owner)));
  }

  return { view, discover, select, disconnect, enqueue, create, command, run, drain };
}
