import { plannerRepository } from './repository.js';

export const connection = { mode: 'loading', save: 'idle', feed: { status: 'unconfigured', events: [] } };
let revision = 0;
let changed = false;
let writing;
let feedRequest = 0;
let lastFeedAttempt = 0;
let settingSource = false;
const onChange = new EventTarget();

export function onPrivateChange(handler) { onChange.addEventListener('change', handler); }
function announce() { onChange.dispatchEvent(new Event('change')); }

async function request(path, { method = 'GET', value } = {}) {
  const body = value === undefined ? undefined : JSON.stringify(value);
  const response = await fetch('/api/' + path, {
    method, body, cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(15_000),
    keepalive: body !== undefined && new TextEncoder().encode(body).byteLength < 55_000,
    headers: { 'X-Studio-Request': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!response.ok) throw Object.assign(new Error('Private API unavailable'), { status: response.status });
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
  if (!manual && !force && Date.now() - lastFeedAttempt < 15_000) return;
  const attempt = ++feedRequest;
  lastFeedAttempt = Date.now();
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

plannerRepository.onChange(plannerChanged);
