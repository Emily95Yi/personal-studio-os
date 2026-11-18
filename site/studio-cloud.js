import { ensureCaptureTopic } from './capture-topic.js';
import { collections, emptyStudio, studioStore } from './studio-data.js';
import { studioExport } from './studio-migration.js';
import { studioDelta } from './studio-delta.js';

export const studioSync = { mode: 'loading', migration: false, localError: false, reconnecting: false, authRequired: false, message: '' };
let revision = -1;
let currentLease;
let acquiring;
let releasing;
let refreshing;
let localTransfer;
let localReady;
let nextRetry = 0;
let failures = 0;
let connectionNotice = '';
const changes = new EventTarget();

export function onStudioNotice(handler) { changes.addEventListener('notice', handler); }
export function studioNotice(message) {
  studioSync.message = message;
  changes.dispatchEvent(new Event('notice'));
}

async function responseError(response) {
  if (response.status === 401 || response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
    return Object.assign(new Error('Studio 登录已过期。请在新窗口重新登录，再点击重新连接；当前草稿会保留。'),
      { status: 401, code: 'session_expired' });
  }
  const failure = await response.json().catch(() => ({}));
  const messages = {
    editing_elsewhere: '另一台设备或标签页正在编辑。请结束那边的编辑后再试。',
    lease_expired: '编辑锁已过期。请先复制当前草稿，再重新打开编辑器。',
    conflict: '云端内容已有更新。请先保留草稿，再重新打开编辑器。',
    invalid_studio: '内容格式无效或超出同步容量，原数据仍保留。',
  };
  const code = failure?.error;
  return Object.assign(new Error(messages[code] || (response.status >= 500
    ? 'Studio 云端暂时无法完成请求，请稍后重试。' : 'Studio 无法完成这次请求。')),
    { status: response.status, code });
}

async function request(path = '', { method = 'GET', value, headers = {}, keepalive = false, retry = false,
  read = response => response } = {}) {
  const body = value === undefined ? undefined : JSON.stringify(value);
  for (let attempt = 0; ; attempt++) {
    let error;
    let transient;
    try {
      const response = await fetch('/api/studio' + path, {
        method, cache: 'no-store', credentials: 'same-origin', redirect: 'manual', keepalive,
        signal: AbortSignal.timeout(30_000),
        headers: { 'X-Studio-Request': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        body,
      });
      if (response.ok) return await read(response);
      error = await responseError(response);
      transient = response.status >= 500;
    } catch (cause) {
      error = new Error(cause?.name === 'TimeoutError' ? 'Studio 云端响应超时，请稍后重试。' :
        '未能确认 Studio 云端的响应，请检查网络后重试。', { cause });
      transient = true;
    }
    if (!retry || !transient || attempt === 1) throw error;
    await new Promise(resolve => setTimeout(resolve, 800));
  }
}

async function fetchSnapshot({ inspectLocal = false } = {}) {
  const loaded = await request('?revision=' + revision, { retry: true, async read(response) {
    if (response.status === 204) return null;
    const next = Number(response.headers.get('X-Studio-Revision'));
    const snapshot = await response.json();
    if (!Number.isSafeInteger(next) || next < 0 || (next > 0 && !snapshot)) throw new Error('云端内容读取失败。');
    return { next, snapshot };
  } });
  if (!loaded) return false;
  const { next, snapshot } = loaded;
  if (next === 0 && inspectLocal) await localReady;
  revision = next;
  studioSync.migration = next === 0 && Boolean(localTransfer);
  if (!studioSync.migration) {
    const state = snapshot ?? emptyStudio();
    ensureCaptureTopic(state);
    studioStore.receiveCloud(state, next);
  }
  return true;
}

export async function startStudioSync() {
  localReady = studioStore.load().then(snapshot => {
    const transfer = studioExport(snapshot ?? studioStore.state);
    if (collections.some(key => transfer[key].length)) localTransfer = transfer;
  }).catch(() => { studioSync.localError = true; });
  try {
    await fetchSnapshot({ inspectLocal: true });
    studioSync.mode = 'cloud';
  } catch (error) {
    studioSync.mode = error.status === 404 ? 'local' : 'error';
    if (studioSync.mode === 'error') failedConnection(error);
  }
  if (studioSync.mode !== 'cloud') await localReady;
  if (studioSync.mode !== 'local') studioStore.useCloud(saveCloud);
}

function failedConnection(error) {
  studioSync.authRequired = error.status === 401;
  nextRetry = Date.now() + Math.min(60_000, 5000 * 2 ** Math.min(failures++, 4));
  connectionNotice = studioSync.authRequired ? error.message :
    'Studio 连接中断，正在自动重试。当前内容已保留，也可以点击重新连接。';
  studioNotice(connectionNotice);
}

export function refreshStudioSync({ manual = false } = {}) {
  if (!['cloud', 'error'].includes(studioSync.mode) || currentLease || acquiring) return Promise.resolve(false);
  if (!manual && (studioSync.authRequired || Date.now() < nextRetry)) return Promise.resolve(false);
  refreshing ??= (async () => {
    studioSync.reconnecting = true;
    studioNotice(studioSync.message);
    try {
      const changed = await fetchSnapshot({ inspectLocal: studioSync.mode === 'error' });
      studioSync.mode = 'cloud';
      studioSync.authRequired = false;
      failures = nextRetry = 0;
      if (studioSync.message === connectionNotice) studioNotice('');
      connectionNotice = '';
      return changed;
    } catch (error) {
      failedConnection(error);
      return false;
    } finally {
      studioSync.reconnecting = false;
      studioNotice(studioSync.message);
      refreshing = undefined;
    }
  })();
  return refreshing;
}

function endLease(lease) {
  if (currentLease !== lease) return;
  currentLease = undefined;
  clearInterval(lease.timer);
  releasing = request('/lease', { method: 'DELETE', value: { token: lease.token }, keepalive: true }).catch(() => {})
    .finally(() => { releasing = undefined; });
}

export async function beginStudioEdit({ migration = false } = {}) {
  if (studioSync.mode === 'local') return () => {};
  if (studioSync.mode !== 'cloud') throw new Error('云端尚未连接，暂时无法编辑。');
  if (studioSync.migration && !migration) throw new Error('请先上传此浏览器的已有 Studio 内容。');
  if (refreshing) await refreshing;
  if (releasing) await releasing;
  if (!currentLease) {
    acquiring ??= (async () => {
      const token = crypto.randomUUID();
      const { revision: lockedRevision } = await request('/lease', {
        method: 'POST', value: { token }, retry: true, read: response => response.json(),
      });
      const lease = { token, holders: 0, expired: false, timer: undefined };
      currentLease = lease;
      if (lockedRevision !== revision) {
        endLease(lease);
        throw Object.assign(new Error('云端有更新。请先查看最新内容。'), { code: 'conflict' });
      }
      lease.timer = setInterval(() => {
        void request('/lease', { method: 'PUT', value: { token } }).catch(error => {
          if (error.status !== 423 || currentLease !== lease) return;
          lease.expired = true;
          clearInterval(lease.timer);
          studioNotice(error.message);
        });
      }, 25_000);
      return lease;
    })().finally(() => { acquiring = undefined; });
    await acquiring;
  }
  const lease = currentLease;
  if (!lease || lease.expired) throw new Error('编辑锁已过期。请先保留草稿，再重新打开编辑器。');
  lease.holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lease.holders === 0) endLease(lease);
  };
}

export function watchStudioEditor(element, release) {
  const observer = new MutationObserver(() => {
    if (element.isConnected) return;
    observer.disconnect();
    release();
  });
  observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    release();
  };
}

async function put(transfer, expected, path = '') {
  const result = await request(path, {
    method: 'PUT', value: transfer, retry: true,
    headers: { 'X-Studio-Revision': String(expected), 'X-Studio-Lease': currentLease.token, 'X-Studio-Save-Id': crypto.randomUUID() },
    async read(response) {
      const result = await response.json();
      if (result?.revision !== expected + 1) throw new Error('Invalid Studio save receipt');
      return result;
    },
  });
  revision = result.revision;
  return revision;
}

async function saveCloud(next, expected, { clearTrash = false } = {}, previous) {
  const release = await beginStudioEdit();
  try {
    return clearTrash ? await put(undefined, expected, '?clear-trash=1') : await put(studioDelta(previous, next), expected);
  } finally {
    release();
  }
}

export async function migrateLocalStudio() {
  if (!studioSync.migration || !localTransfer) return;
  const release = await beginStudioEdit({ migration: true });
  try {
    const next = await put(localTransfer, 0);
    const { format, ...snapshot } = localTransfer;
    studioStore.receiveCloud(snapshot, next);
    studioSync.migration = false;
    studioNotice('此浏览器的内容已上传。');
  } finally {
    release();
  }
}

export function closeStudioSync() {
  if (currentLease) endLease(currentLease);
}
