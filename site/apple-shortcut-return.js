import { readShortcutResult, shortcutAttemptKey, shortcutChannel, shortcutReceiptKey } from './calendar-events.js';

const params = new URLSearchParams(location.search);
const status = params.get('status');
const response = readShortcutResult(params);
const messages = {
  success: '快捷指令已返回。请检查 Apple 日历，或刷新订阅核对写入。',
  cancel: '快捷指令已取消。请核对设备上的日历，再决定是否重试。',
  error: '快捷指令未完成。请检查安装及日历权限，再决定是否重试。',
};
const resultLabels = {
  added: '已添加到设备日历。可回到工作台刷新订阅，核对 iCloud 同步。',
  existing: '已存在。设备找到了同一个奕Studio 日程，已停止新增。',
};
if (response) {
  document.querySelector('#shortcut-result').textContent = resultLabels[response.result];
  // An Apple callback can replace the initiating tab instead of opening a new one.
  try {
    if (sessionStorage.getItem(shortcutAttemptKey) === response.eventId + ':' + response.attempt) {
      sessionStorage.setItem(shortcutReceiptKey, JSON.stringify(response));
    }
  } catch { /* Storage may be disabled. The callback page still shows the result. */ }
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(shortcutChannel);
    channel.postMessage(response);
    channel.close();
  }
} else if (Object.hasOwn(messages, status)) {
  document.querySelector('#shortcut-result').textContent = messages[status];
}
// The returned result or error is untrusted and may contain personal text.
history.replaceState(null, '', location.pathname);
