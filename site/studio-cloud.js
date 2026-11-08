import { ensureCaptureTopic } from './capture-topic.js';
import { collections, emptyStudio, studioStore } from './studio-data.js';
import { studioExport } from './studio-migration.js';

export const studioSync = { mode: 'loading', migration: false, message: '' };
let revision = -1;
let currentLease;
let acquiring;
let releasing;
let refreshing;
let localTransfer;
const changes = new EventTarget();

export function onStudioNotice(handler) { changes.addEventListener('notice', handler); }
export function studioNotice(message) {
  studioSync.message = message;
  changes.dispatchEvent(new Event('notice'));
}

async function request(path = '', { method = 'GET', value, headers = {}, keepalive = false } = {}) {
  const response = await fetch('/api/studio' + path, {
    method, cache: 'no-store', credentials: 'same-origin', redirect: 'error', keepalive,
    signal: AbortSignal.timeout(30_000),
    headers: { 'X-Studio-Request': '1', ...(value === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: value === undefined ? undefined : JSON.stringify(value),
  }).catch(() => { throw new Error('暂时无法连接 Studio 云端，请稍后再试。'); });
  if (response.ok) return response;
  const failure = await response.json().catch(() => ({}));
  const messages = {
    editing_elsewhere: '另一台设备或标签页正在编辑。请结束那边的编辑后再试。',
    lease_expired: '编辑锁已过期。请先复制当前草稿，再重新打开编辑器。',
    conflict: '云端内容已有更新。请先保留草稿，再重新打开编辑器。',
    invalid_studio: '内容格式无效或超出同步容量，原数据仍保留。',
  };
  throw Object.assign(new Error(messages[failure.error] || '暂时无法连接 Studio 云端，请稍后再试。'),
    { status: response.status, code: failure.error });
}

async function fetchSnapshot() {
  const response = await request('?revision=' + revision);
  if (response.status === 204) return false;
  const next = Number(response.headers.get('X-Studio-Revision'));
  const snapshot = await response.json();
  if (!Number.isSafeInteger(next) || next < 0 || (next > 0 && !snapshot)) throw new Error('云端内容读取失败。');
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
  const transfer = studioExport(studioStore.state);
  if (collections.some(key => transfer[key].length)) localTransfer = transfer;
  try {
    await fetchSnapshot();
    studioSync.mode = 'cloud';
  } catch (error) {
    studioSync.mode = error.status === 404 ? 'local' : 'error';
    if (studioSync.mode === 'error') studioNotice('云端连接失败。刷新页面后可以重试。');
  }
  if (studioSync.mode !== 'local') studioStore.useCloud(saveCloud);
}

export function refreshStudioSync() {
  if (studioSync.mode !== 'cloud' || currentLease || acquiring) return Promise.resolve(false);
  refreshing ??= fetchSnapshot().catch(() => false).finally(() => { refreshing = undefined; });
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
      const response = await request('/lease', { method: 'POST', value: { token } });
      const lease = { token, holders: 0, expired: false, timer: undefined };
      const lockedRevision = (await response.json()).revision;
      currentLease = lease;
      if (lockedRevision !== revision) {
        endLease(lease);
        throw new Error('云端有更新。请刷新页面后再编辑。');
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

async function put(transfer, expected) {
  const token = currentLease?.token;
  const response = await request('', {
    method: 'PUT', value: transfer, headers: { 'X-Studio-Revision': String(expected), 'X-Studio-Lease': token },
  });
  revision = (await response.json()).revision;
  return revision;
}

async function saveCloud(next, expected) {
  const release = await beginStudioEdit();
  try {
    return await put(studioExport(next), expected);
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
