const status = new URLSearchParams(location.search).get('status');
const messages = {
  success: '快捷指令已返回。请检查 Apple 日历，或刷新订阅核对写入。',
  cancel: '快捷指令已取消。请核对设备上的日历，再决定是否重试。',
  error: '快捷指令未完成。请检查安装及日历权限，再决定是否重试。',
};
if (Object.hasOwn(messages, status)) document.querySelector('#shortcut-result').textContent = messages[status];
// The returned result or error is untrusted and may contain personal text.
history.replaceState(null, '', location.pathname);
