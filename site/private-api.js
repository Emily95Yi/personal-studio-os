import { plannerRepository } from './repository.js';

export const connection = { mode: 'loading', save: 'idle', refreshing: false, feed: { status: 'unconfigured', events: [] }, caldav: { enabled: false, statuses: [], events: [] } };
let revision = 0;
let changed = false;
let writing;
let feedRequest = 0;
let lastFeedAttempt = 0;
let settingSource = false;
let caldavRequest = 0;
let caldavPoll;
const onChange = new EventTarget();

export function onPrivateChange(handler) { onChange.addEventListener('change', handler); }
function announce() { onChange.dispatchEvent(new Event('change')); }

async function request(path, { method = 'GET', value, durable = true, timeout = 15_000 } = {}) {
  const body = value === undefined ? undefined : JSON.stringify(value);
  const response = await fetch('/api/' + path, {
    method, body, cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(timeout),
    keepalive: durable && body !== undefined && new TextEncoder().encode(body).byteLength < 55_000,
    headers: { 'X-Studio-Request': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    throw Object.assign(new Error('Private API unavailable'), { status: response.status, code: failure.error, stage: failure.stage });
  }
  return response.json();
}

export async function loadPlanner({ reloading = false } = {}) {
  try {
    const data = await request('planner');
    revision = data.revision;
    plannerRepository.restore(data.snapshot);
    connection.mode = 'private';
    connection.save = 'idle';
    changed = false;
  } catch (error) {
    // The legacy local server has no API; only that loopback preview can edit in memory.
    const preview = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname) && error.status === 404;
    if (reloading) return false;
    connection.mode = preview ? 'preview' : 'unavailable';
  }
  announce();
  return connection.mode === 'private';
}

export function plannerChanged() {
  if (connection.mode !== 'private') return;
  changed = true;
  if (!['conflict', 'error'].includes(connection.save)) void saveChanges();
}

export function saveChanges() {
  if (writing) return writing;
  if (connection.mode !== 'private' || connection.save === 'conflict' || !changed) return;
  writing = (async () => {
    connection.save = 'saving';
    announce();
    try {
      while (changed) {
        changed = false;
        const data = await request('planner', { method: 'PUT', value: { revision, snapshot: plannerRepository.snapshot() } });
        revision = data.revision;
      }
      connection.save = 'idle';
    } catch (error) {
      changed = true;
      connection.save = error.status === 409 ? 'conflict' : 'error';
    } finally {
      writing = undefined;
      announce();
    }
  })();
  return writing;
}

export async function loadFeed({ manual = false, force = false } = {}) {
  if (connection.mode !== 'private' || settingSource) return;
  if (!manual && (connection.refreshing || (!force && Date.now() - lastFeedAttempt < 15_000))) return;
  const attempt = ++feedRequest;
  lastFeedAttempt = Date.now();
  const caldav = loadCalDav({ manual: manual && connection.caldav.configured });
  if (connection.caldav.secondary) return caldav;
  try {
    const feed = await request(manual ? 'calendar/refresh' : 'calendar/feed', { method: manual ? 'POST' : 'GET' });
    if (attempt !== feedRequest) return;
    connection.feed = feed;
  } catch (error) {
    if (attempt !== feedRequest) return;
    if (error.status === 401 || error.status === 403) {
      connection.feed = { status: 'error', events: [] };
    } else connection.feed = { ...connection.feed, status: connection.feed.events.length ? 'stale' : 'error' };
  }
  announce();
  if (manual) await caldav;
}

export async function refreshCalendar() {
  if (connection.refreshing) return;
  connection.refreshing = true;
  announce();
  try {
    await loadFeed({ manual: true });
  } finally {
    connection.refreshing = false;
    announce();
  }
}

export async function setSource(url) {
  settingSource = true;
  ++feedRequest;
  try {
    await request('calendar/settings', url ? { method: 'PUT', value: { url } } : { method: 'DELETE' });
    connection.feed = { status: url ? 'loading' : 'unconfigured', events: [] };
    announce();
  } finally {
    settingSource = false;
  }
  if (url) await loadFeed({ manual: true });
}

function updateCalDav(data) {
  const next = { statuses: [], events: [], ...data };
  if (JSON.stringify(connection.caldav) !== JSON.stringify(next)) {
    connection.caldav = next;
    announce();
  }
}

export async function loadCalDav({ manual = false } = {}) {
  if (connection.mode !== 'private' || (!manual && connection.refreshing && connection.caldav.configured)) return;
  const attempt = ++caldavRequest;
  try {
    if (!manual) {
      const data = await request('calendar/caldav');
      if (attempt === caldavRequest) updateCalDav(data);
      return;
    }
    for (let retry = 0; retry <= 10; retry++) {
      const { refreshPending, ...data } = await request('calendar/caldav/refresh', { method: 'POST', timeout: 30_000 });
      if (attempt !== caldavRequest) return;
      if (!refreshPending) {
        updateCalDav(data);
        return;
      }
      if (retry < 10) await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Calendar refresh is busy');
  } catch (error) {
    if (attempt !== caldavRequest || !connection.caldav.enabled) return;
    if ([401, 403].includes(error.status)) updateCalDav({ enabled: false, stale: true });
    else updateCalDav({ ...connection.caldav, stale: true });
  }
}

export function pollCalDav(remaining = 7) {
  clearTimeout(caldavPoll);
  if (!remaining) return;
  caldavPoll = setTimeout(async () => {
    if (location.hash.startsWith('#/public')) return;
    await loadCalDav();
    pollCalDav(remaining - 1);
  }, 1800);
}

export function discoverCalDav(email, password) {
  return request('calendar/caldav/discover', { method: 'POST', value: email ? { email, password } : { reuse: true }, durable: false });
}

async function mutateCalDav(path, options) {
  ++caldavRequest;
  const data = await request('calendar/caldav' + path, options);
  ++caldavRequest;
  updateCalDav(data);
  return data;
}

export async function selectCalDav(id, secondaryId) {
  await mutateCalDav('/select', { method: 'POST', value: { id, secondaryId } });
  pollCalDav();
}

export async function disconnectCalDav() {
  clearTimeout(caldavPoll);
  await mutateCalDav('', { method: 'DELETE' });
}

export async function caldavCommand(event, action, details) {
  await mutateCalDav('/event/' + encodeURIComponent(event.id), {
    method: 'POST', value: { action, source: 'A', version: event.caldav?.version, details },
  });
  pollCalDav();
}

export async function createCalDavEvent(id, details) {
  await mutateCalDav('/event/' + encodeURIComponent(id), { method: 'PUT', value: { source: 'A', details } });
  pollCalDav();
}

plannerRepository.onChange(plannerChanged);
