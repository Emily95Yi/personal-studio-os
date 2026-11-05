import { eventIcs, shortcutAttemptKey, shortcutChannel, shortcutReceiptKey } from './calendar-events.js';
import { allCalendarEvents, canEdit, openReview, readReview, showEvent, updateReview } from './apple-view.js';
import { connection, loadFeed, loadPlanner, onPrivateChange, saveChanges, setSource } from './private-api.js';
import { plannerRepository } from './repository.js';

function currentEvent(app) {
  const id = app.querySelector('[data-event-dialog]')?.dataset.eventId;
  return allCalendarEvents().find(event => event.id === id);
}

function download(event) {
  const url = URL.createObjectURL(new Blob([eventIcs(event)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'YiStudio-event.ics';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function changeSource(app, url, render) {
  const section = app.querySelector('.apple-settings');
  const status = section.querySelector('[data-settings-status]');
  const buttons = [...section.querySelectorAll('button')];
  for (const button of buttons) button.disabled = true;
  status.textContent = url ? '正在保存订阅…' : '正在断开订阅…';
  try {
    await setSource(url);
    if (section.isConnected) render({ focus: true });
  } catch (error) {
    if (!section.isConnected) return;
    for (const button of buttons) button.disabled = false;
    status.textContent = error.status === 400 ? '请输入有效的 iCloud 公开日历链接。' : '设置未保存，请重试。';
  }
}

export function initAppleActions(app, render) {
  const attempts = new Map();
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(shortcutChannel);
    channel.addEventListener('message', ({ data }) => {
      const attempt = attempts.get(data?.eventId);
      if (!attempt || attempt !== data.attempt || !['added', 'existing'].includes(data.result)) return;
      attempts.delete(data.eventId);
      plannerRepository.markDeviceResult(data.eventId, data.result);
      const dialog = app.querySelector('[data-event-dialog][open]');
      const item = dialog && currentEvent(app);
      if (item?.id === data.eventId) showEvent(app, item);
      else if (location.hash.startsWith('#/calendar') && !app.querySelector('dialog[open]')) render();
    });
  }
  onPrivateChange(() => {
    if (connection.mode !== 'private') return;
    let receipt;
    try {
      const raw = sessionStorage.getItem(shortcutReceiptKey);
      if (!raw) return;
      sessionStorage.removeItem(shortcutReceiptKey);
      receipt = JSON.parse(raw);
      if (sessionStorage.getItem(shortcutAttemptKey) !== receipt.eventId + ':' + receipt.attempt) return;
      sessionStorage.removeItem(shortcutAttemptKey);
    } catch { return; }
    plannerRepository.markDeviceResult(receipt.eventId, receipt.result);
    render();
  });
  app.addEventListener('click', async event => {
    const launch = event.target.closest('[data-shortcut-launch]');
    if (launch) {
      const item = currentEvent(app);
      if (!item || item.status === 'synced' || item.mismatch) {
        event.preventDefault();
        if (item) showEvent(app, item);
        return;
      }
      event.preventDefault();
      const destination = launch.href;
      attempts.set(item.id, launch.dataset.shortcutLaunch);
      try { sessionStorage.setItem(shortcutAttemptKey, item.id + ':' + launch.dataset.shortcutLaunch); } catch {}
      plannerRepository.markEvent(item.id, 'export_launched');
      // Launch synchronously inside the original user gesture.
      try {
        window.location.assign(destination);
      } catch {
        plannerRepository.markEvent(item.id, 'sync_error');
      }
      const updated = currentEvent(app);
      if (updated) showEvent(app, updated);
      return;
    }
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.appleEvent) {
      const item = allCalendarEvents().find(row => row.id === button.dataset.appleEvent);
      if (item) showEvent(app, item);
    }
    if (button.hasAttribute('data-task-review') && canEdit()) {
      const form = button.form;
      const task = plannerRepository.getTask(form.elements.id.value);
      if (!task) return;
      form.closest('dialog').close();
      const item = allCalendarEvents().find(row => row.taskId === task.id);
      if (item) showEvent(app, item);
      else openReview(app, task);
    }
    if (button.hasAttribute('data-ics-download') || button.hasAttribute('data-event-error')) {
      const item = currentEvent(app);
      if (item?.source !== 'studio' || item.status === 'synced' || item.mismatch) return;
      if (button.hasAttribute('data-ics-download')) download(item);
      else {
        plannerRepository.markEvent(item.id, 'sync_error');
        showEvent(app, currentEvent(app));
      }
    }
    if (button.hasAttribute('data-feed-refresh')) {
      button.disabled = true;
      button.textContent = '正在刷新…';
      await loadFeed({ manual: true });
      if (button.isConnected) {
        button.textContent = '刷新订阅';
        button.disabled = false;
      }
    }
    if (button.hasAttribute('data-source-remove') && window.confirm('断开 iCloud 订阅并清除缓存？')) {
      await changeSource(app, '', render);
    }
    if (button.hasAttribute('data-planner-retry')) await saveChanges();
    if (button.hasAttribute('data-planner-reload') && window.confirm('舍弃此页尚未保存的修改？')) {
      if (await loadPlanner({ reloading: true })) render({ focus: true });
      else if (button.isConnected) button.textContent = '重新载入失败 · 重试';
    }
  });

  app.addEventListener('change', event => {
    if (event.target.form?.matches('[data-review-form]')) updateReview(event.target.form);
  });

  app.addEventListener('submit', event => {
    const form = event.target;
    if (form.matches('[data-apple-settings]')) {
      event.preventDefault();
      const field = form.elements.source;
      const url = field.value.trim();
      field.value = '';
      if (url) void changeSource(app, url, render);
      return;
    }
    if (!form.matches('[data-review-form]')) return;
    event.preventDefault();
    if (!canEdit()) return;
    const data = readReview(form);
    const saved = data && plannerRepository.confirmReview(form.elements.taskId.value, data.action, data.details);
    if (!saved) {
      const error = form.querySelector('[data-form-error]');
      error.textContent = data ? '此安排已变更或已确认。' : '请检查开始与结束时间。';
      error.hidden = false;
      return;
    }
    form.closest('dialog').close();
    render({ focus: true });
    if (saved.event) {
      const item = allCalendarEvents().find(row => row.id === saved.event.id);
      showEvent(app, item);
    }
  });
}
