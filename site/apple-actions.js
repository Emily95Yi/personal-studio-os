import { eventIcs, shortcutAttemptKey, shortcutChannel, shortcutReceiptKey } from './calendar-events.js';
import { allCalendarEvents, canEdit, openReview, readReview, showEvent, updateReview } from './apple-view.js';
import { caldavCommand, connection, disconnectCalDav, discoverCalDav, loadCalDav, loadFeed, loadPlanner, onPrivateChange, pollCalDav,
  saveChanges, selectCalDav, setSource } from './private-api.js';
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

const caldavErrors = {
  invalid_credentials: '请输入 Apple 账号和 App 专用密码。',
  no_writable_calendar: '未找到可用的写入日历。',
  apple_connection_failed: 'Apple 连接失败。请核对 App 专用密码及账号。',
  setup_expired: '日历选择已过期，请重新查找。',
  already_connected: '已连接一个写入日历。',
  event_changed: '日程状态已更新，请重新查看。',
  sync_in_progress: '正在处理同步，请稍后断开。',
  different_calendar: '请重新连接原来的写入日历，以保留现有日程对应关系。',
};

function showCalDavError(element, error) {
  if (element?.isConnected) element.textContent = caldavErrors[error.code] ?? '操作未完成，请重试。';
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
    if (button.hasAttribute('data-caldav-disconnect')) {
      if (!window.confirm('断开奕Studio到 Apple 的写入连接？已存在的日程会保留。')) return;
      const status = button.closest('section').querySelector('[data-caldav-message]');
      button.disabled = true;
      try { await disconnectCalDav(); }
      catch (error) {
        showCalDavError(status, error);
        button.disabled = false;
      }
      return;
    }
    if (button.hasAttribute('data-caldav-edit')) {
      const item = currentEvent(app);
      const task = item && plannerRepository.getTask(item.taskId);
      if (!task) return;
      button.closest('dialog').close();
      openReview(app, task, item);
      return;
    }
    if (button.dataset.caldavCommand) {
      const item = currentEvent(app);
      if (!item?.caldav) return;
      const action = button.dataset.caldavCommand;
      if (action === 'delete' && !window.confirm('删除这条奕Studio日程，并删除它在 iCloud 中的对应事件？')) return;
      const status = button.closest('dialog').querySelector('[data-caldav-event-message]');
      status.textContent = '正在提交…';
      button.disabled = true;
      try {
        await caldavCommand(item, action);
        const latest = currentEvent(app);
        if (latest) showEvent(app, latest);
        else render({ focus: true });
      } catch (error) {
        showCalDavError(status, error);
        button.disabled = false;
        if (error.status === 409) void loadCalDav();
      }
      return;
    }
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
      else if (!plannerRepository.eventForTask(task.id)) openReview(app, task);
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

  app.addEventListener('submit', async event => {
    const form = event.target;
    if (form.matches('[data-caldav-discover], [data-caldav-select]')) {
      event.preventDefault();
      const section = form.closest('.caldav-settings');
      const status = section.querySelector('[data-caldav-message]');
      const submit = form.querySelector('button[type=submit]');
      submit.disabled = true;
      try {
        if (form.matches('[data-caldav-discover]')) {
          const { email, password } = form.elements;
          const value = password.value;
          password.value = '';
          status.textContent = '正在查找 Apple 日历…';
          const data = await discoverCalDav(email.value, value);
          if (!form.isConnected) return;
          const target = section.querySelector('[data-caldav-select]');
          target.elements.calendarId.replaceChildren(new Option('请选择专用测试日历', ''));
          for (const calendar of data.calendars) target.elements.calendarId.add(new Option(calendar.name, calendar.id));
          target.hidden = false;
          status.textContent = '请选择奕Studio可以写入的测试日历。';
        } else {
          status.textContent = '正在连接…';
          await selectCalDav(form.elements.calendarId.value);
          if (form.isConnected) render({ focus: true });
        }
      } catch (error) {
        showCalDavError(status, error);
      } finally {
        if (submit.isConnected) submit.disabled = false;
      }
      return;
    }
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
    const editId = form.elements.eventId.value;
    if (editId && data?.details && !data.details.title) {
      const error = form.querySelector('[data-form-error]');
      error.textContent = '请输入日程标题。';
      error.hidden = false;
      return;
    }
    if (editId && data?.details) {
      const item = allCalendarEvents().find(row => row.id === editId);
      const version = Number(form.elements.eventVersion.value);
      const error = form.querySelector('[data-form-error]');
      if (!item?.caldav || version !== item.caldav.version || !['pending', 'error'].includes(item.caldav.state)) {
        error.textContent = '日程状态已改变，请重新打开。';
        error.hidden = false;
        return;
      }
      const submit = form.querySelector('button[type=submit]');
      submit.disabled = true;
      plannerRepository.updateCalendarDraft(editId, data.details);
      await saveChanges();
      try {
        if (connection.save !== 'idle') throw new Error('Planner save failed');
        await caldavCommand(item, 'retry');
        if (form.isConnected) {
          form.closest('dialog').close();
          render({ focus: true });
          const updated = allCalendarEvents().find(row => row.id === editId);
          if (updated) showEvent(app, updated);
        }
      } catch (failure) {
        error.hidden = false;
        showCalDavError(error, failure);
        submit.disabled = false;
      }
      return;
    }
    const details = data?.details && {
      ...data.details, ...(connection.caldav.configured ? { syncMode: 'caldav' } : {}),
    };
    const saved = !editId && data && plannerRepository.confirmReview(form.elements.taskId.value, data.action, details);
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
      if (saved.event.syncMode === 'caldav') {
        await saveChanges();
        if (connection.save === 'idle') pollCalDav();
      }
    }
  });
}
