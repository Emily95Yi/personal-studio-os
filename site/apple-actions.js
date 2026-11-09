import { eventIcs, eventDateTimeLabel, shortcutAttemptKey, shortcutChannel, shortcutReceiptKey } from './calendar-events.js';
import { allCalendarEvents, canEdit, openReview, readReview, showEvent, updateReview } from './apple-view.js';
import { caldavCommand, connection, createCalDavEvent, disconnectCalDav, discoverCalDav, loadCalDav, loadPlanner, onPrivateChange, pollCalDav,
  refreshCalendar, saveChanges, selectCalDav, setSource } from './private-api.js';
import { plannerRepository } from './repository.js';
import { href } from './pages.js';
import { dateKey } from './calendar.js';

function showReminder(app, reminder) {
  const dialog = app.querySelector('[data-reminder-dialog]');
  dialog.dataset.planId = reminder.planId;
  dialog.dataset.date = reminder.date;
  dialog.querySelector('[data-reminder-title]').textContent = reminder.title;
  const notes = dialog.querySelector('[data-reminder-notes]');
  notes.textContent = reminder.notes ?? '';
  notes.hidden = !reminder.notes;
  dialog.querySelector('[data-reminder-plan]').href = href('self-board', 'auto', reminder.planId);
  const defer = dialog.querySelector('[data-reminder-defer-form]');
  defer.reset();
  defer.hidden = true;
  defer.querySelector('[data-form-error]').hidden = true;
  dialog.querySelector('[data-reminder-defer]').setAttribute('aria-expanded', 'false');
  for (const action of dialog.querySelectorAll('[data-reminder-calendar], [data-reminder-defer], [data-reminder-delete]')) {
    action.hidden = !canEdit();
  }
  dialog.showModal();
}

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
  const section = app.querySelector('[data-ics-settings]');
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
  no_writable_calendar: '未找到可写的 YiStudio 日历。请核对日历名称和权限。',
  apple_connection_failed: 'Apple 连接失败。请核对 App 专用密码及账号。',
  apple_unauthorized: 'Apple 拒绝了授权。请确认账号是该 iCloud 日历的 Apple 账号，并使用新生成的 App 专用密码。',
  apple_unreachable: '暂时无法连接 Apple 日历服务器。请稍后重试。',
  apple_invalid_response: 'Apple 已响应，但未能读取日历设置。',
  calendar_setup_unavailable: 'Studio 未能暂存这次日历选择。请稍后重试。',
  setup_expired: '日历选择已过期，请重新查找。',
  already_connected: '已连接一个写入日历。',
  event_changed: 'Apple 或另一处 Studio 已更新日程。你的输入仍保留在此表单。',
  invalid_calendar: '请选择不同的日历，并确认 YiStudio 有写入权限。',
  invalid_event: '请检查标题、开始及结束时间。',
  sync_in_progress: '正在处理同步，请稍后断开。',
  different_calendar: '请重新连接原来的写入日历，以保留现有日程对应关系。',
};

function showCalDavError(element, error) {
  if (!element?.isConnected) return;
  const stage = { principal: '账号入口', home: '日历账户', calendars: '日历列表' }[error.stage];
  element.textContent = (caldavErrors[error.code] ?? '操作未完成，请重试。') +
    (error.code === 'apple_invalid_response' && stage ? '（' + stage + '）' : '');
}

function fillCalendars(section, calendars) {
  const form = section.querySelector('[data-caldav-select]');
  const { calendarId, secondaryId } = form.elements;
  const active = calendars.find(row => row.primary);
  calendarId.replaceChildren(new Option('请选择可写日历', ''));
  for (const row of calendars.filter(row => active ? row.primary : row.canWrite)) {
    calendarId.add(new Option(row.name, row.id, row.primary, row.primary));
  }
  calendarId.disabled = Boolean(active);
  function updateSecondary() {
    const selected = secondaryId.value;
    secondaryId.replaceChildren(new Option('暂不使用私人 iCloud 日历', ''));
    for (const row of calendars.filter(row => row.id !== calendarId.value)) {
      secondaryId.add(new Option(row.name, row.id));
    }
    secondaryId.value = [...secondaryId.options].some(option => option.value === selected) ? selected : '';
  }
  calendarId.onchange = updateSecondary;
  updateSecondary();
  const currentB = calendars.find(row => row.secondary);
  if (currentB) secondaryId.value = currentB.id;
  form.hidden = false;
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
    if (button.hasAttribute('data-caldav-discover-existing')) {
      const section = button.closest('.caldav-settings');
      const status = section.querySelector('[data-caldav-message]');
      button.disabled = true;
      try {
        const data = await discoverCalDav();
        if (section.isConnected) fillCalendars(section, data.calendars);
      } catch (error) {
        showCalDavError(status, error);
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (button.hasAttribute('data-caldav-edit')) {
      const item = currentEvent(app);
      if (!item?.caldav) return;
      button.closest('dialog').close();
      openReview(app, { event: item });
      return;
    }
    if (button.hasAttribute('data-caldav-rebase')) {
      const form = button.form;
      await loadCalDav();
      if (!form.isConnected) return;
      const latest = allCalendarEvents().find(row => row.id === form.elements.eventId.value);
      const message = form.querySelector('[data-form-error]');
      if (!latest?.caldav || ['queued', 'delete_queued', 'conflict'].includes(latest.caldav.state)) {
        message.textContent = '此日程已移除、正在同步或仍有冲突。当前输入没有被清除。';
        return;
      }
      const details = [latest.title, eventDateTimeLabel(latest), latest.location, latest.notes].filter(Boolean).join('\n');
      if (!window.confirm('当前版本：\n' + details + '\n\n保留表单内容，改用此版本作为下次保存的基准？')) return;
      form.elements.eventVersion.value = JSON.stringify(latest.caldav.version);
      button.hidden = true;
      message.hidden = true;
      return;
    }
    if (button.dataset.caldavCommand) {
      const item = currentEvent(app);
      if (!item?.caldav) return;
      const action = button.dataset.caldavCommand;
      if (action === 'accept_remote' && item.caldav.local && !window.confirm('采用 Apple 版本并舍弃这次 Studio 修改？')) return;
      if (action === 'keep_local' && !window.confirm('按详情中的 Studio 操作更新 Apple？如果 Apple 再次修改，将重新提示冲突。')) return;
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
    if (button.dataset.autoReminder) {
      const reminder = plannerRepository.getReminder(button.dataset.autoReminder, button.dataset.reminderDate);
      if (reminder) showReminder(app, reminder);
      return;
    }
    if (button.hasAttribute('data-reminder-calendar') && canEdit()) {
      const dialog = button.closest('dialog');
      const reminder = plannerRepository.getReminder(dialog.dataset.planId, dialog.dataset.date);
      if (!reminder) return;
      dialog.close();
      openReview(app, { date: dateKey(), template: reminder });
      return;
    }
    if (button.hasAttribute('data-reminder-defer') && canEdit()) {
      const form = button.closest('dialog').querySelector('[data-reminder-defer-form]');
      form.hidden = !form.hidden;
      button.setAttribute('aria-expanded', String(!form.hidden));
      if (!form.hidden) form.elements.days.focus();
      return;
    }
    if (button.hasAttribute('data-reminder-delete') && canEdit()) {
      const dialog = button.closest('dialog');
      if (plannerRepository.dismissReminder(dialog.dataset.planId, dialog.dataset.date)) {
        dialog.close();
        render({ focus: true });
      }
      return;
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
      if (button.getAttribute('aria-disabled') !== 'true') await refreshCalendar();
      return;
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
    if (form.matches('[data-reminder-defer-form]')) {
      event.preventDefault();
      if (!canEdit()) return;
      const dialog = form.closest('dialog');
      if (plannerRepository.deferReminder(dialog.dataset.planId, dialog.dataset.date, Number(form.elements.days.value))) {
        dialog.close();
        render({ focus: true });
      } else form.querySelector('[data-form-error]').hidden = false;
      return;
    }
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
          fillCalendars(section, data.calendars);
          status.textContent = '请选择读写日历 YiStudio，以及可选的只读 iCloud 日历。';
        } else {
          status.textContent = '正在连接…';
          await selectCalDav(form.elements.calendarId.value, form.elements.secondaryId.value);
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
    const createId = form.elements.createId.value;
    if (editId || createId) {
      const error = form.querySelector('[data-form-error]');
      if (!data?.details?.title?.trim()) {
        error.textContent = '请输入标题并检查起止时间。';
        error.hidden = false;
        return;
      }
      const submit = form.querySelector('button[type=submit]');
      if (submit.disabled) return;
      const dialog = form.closest('dialog');
      const controls = [submit, ...dialog.querySelectorAll('button[data-entry-type], [data-review-form] [data-dialog-cancel]')];
      for (const control of controls) control.disabled = true;
      dialog.setAttribute('aria-busy', 'true');
      try {
        if (editId) {
          const version = JSON.parse(form.elements.eventVersion.value);
          await caldavCommand({ id: editId, caldav: { version } }, 'edit', data.details);
        } else await createCalDavEvent(createId, data.details);
        if (form.isConnected) {
          dialog.close();
          render({ focus: true });
          const updated = allCalendarEvents().find(row => row.id === (editId || createId));
          if (updated) showEvent(app, updated);
        }
      } catch (failure) {
        error.hidden = false;
        showCalDavError(error, failure);
        form.querySelector('[data-caldav-rebase]').hidden = !editId || failure.status !== 409;
        if (failure.status === 409) void loadCalDav();
      } finally {
        for (const control of controls) control.disabled = false;
        dialog.removeAttribute('aria-busy');
      }
      return;
    }
    const details = data?.details && {
      ...data.details, ...(connection.caldav.configured ? { syncMode: 'caldav' } : {}),
    };
    const convertTaskId = form.elements.convertTaskId.value;
    const saved = plannerRepository.saveCalendarEvent(details, { convertTaskId });
    if (!saved) {
      const error = form.querySelector('[data-form-error]');
      error.textContent = '请检查标题和起止时间。';
      error.hidden = false;
      return;
    }
    form.closest('dialog').close();
    render({ focus: true });
    const item = allCalendarEvents().find(row => row.id === saved.id);
    if (item) showEvent(app, item);
    if (saved.syncMode === 'caldav') {
      await saveChanges();
      if (connection.save === 'idle') pollCalDav();
    }
  });
}
