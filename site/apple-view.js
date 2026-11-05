import { addDays, dateKey, parseDate } from './calendar.js';
import { combineEvents, eventStatusLabel, eventTimeLabel, eventTimes, shortcutUrl } from './calendar-events.js';
import { escapeHtml } from './html.js';
import { connection } from './private-api.js';
import { plannerRepository } from './repository.js';

export const canEdit = () => ['private', 'preview'].includes(connection.mode);
const labelTime = date => dateKey(addDays(parseDate(date), 1));
export function allCalendarEvents() {
  const local = plannerRepository.calendarEvents();
  const serverEvents = local.filter(event => event.syncMode === 'caldav');
  const serverIds = new Set(serverEvents.map(event => event.id));
  const statuses = new Map(connection.caldav.statuses.map(status => [status.id, status]));
  const writable = connection.caldav.events;
  const readOnly = connection.feed.events;
  const managed = serverEvents.filter(event => statuses.get(event.id)?.state !== 'deleted').map(event => {
    const caldav = statuses.get(event.id);
    const remote = (caldav?.state === 'added' || caldav?.reason === 'delete_changed') && writable.find(row => row.uid === event.id + '@yi-studio' && row.marker === event.id);
    return { ...event, ...(remote ? {
      start: remote.start, end: remote.end, allDay: remote.allDay, location: remote.location, title: remote.title,
    } : {}), caldav };
  });
  const imported = [...writable.map(event => ({ ...event, id: 'writable:' + event.id, sourceLabel: '奕Studio iCloud' })),
    ...readOnly.map(event => ({ ...event, id: 'read-only:' + event.id, sourceLabel: '日常 iCloud' }))];
  const visible = imported.filter(event =>
    !(event.marker && serverIds.has(event.marker) && event.uid === event.marker + '@yi-studio'));
  return combineEvents([...local.filter(event => event.syncMode !== 'caldav'), ...managed], visible);
}
export const calendarTasks = (start, end) => plannerRepository.tasksBetween(start, end).filter(task => !plannerRepository.eventForTask(task.id));
export const onDay = (event, day) => event.dayStart <= day && event.dayEnd > day;
const actionLabels = { remind: 'Remind Only', todo: 'Add To-Do', calendar: 'Add to Calendar' };

export function settingsView() {
  if (connection.mode !== 'private') {
    const note = connection.mode === 'loading' ? '正在检查私有工作台权限。' :
      '请先通过 Cloudflare Access 打开已配置的私有工作台，再保存订阅地址。';
    return '<section class="empty-state"><h2>Apple 日历</h2><p>' + note + '</p></section>';
  }
  const configured = connection.feed.status !== 'unconfigured';
  return caldavSettings() + '<section class="empty-state apple-settings"><h2>' +
    (connection.caldav.enabled ? '日常日历 · 只读' : 'iCloud 订阅') + '</h2><p data-settings-status role="status">' +
    (configured ? '订阅已配置。可替换或断开。' : '还没有订阅。') + '</p>' +
    '<form data-apple-settings autocomplete="off"><label>iCloud 公开日历链接' +
    '<input type="password" name="source" maxlength="512" required autocomplete="off" spellcheck="false"></label>' +
    '<div class="widget-actions"><button class="action-button" type="submit">保存订阅</button>' +
    (configured ? '<button class="action-button secondary" type="button" data-source-remove>断开订阅</button>' : '') +
    '</div></form></section>';
}

function caldavSettings() {
  if (!connection.caldav.enabled) return '';
  const connected = connection.caldav.configured;
  return '<section class="empty-state apple-settings caldav-settings"><h2>奕Studio 日历 · 读写</h2>' +
    '<p data-caldav-message role="status">' + (connected ? '已连接 ' + escapeHtml(connection.caldav.name) :
      '先连接专用测试日历，再试自动新增和删除。') + '</p>' +
    (connected ? '<div class="widget-actions"><button class="action-button secondary" type="button" data-caldav-disconnect>断开写入连接</button></div>' :
      '<form data-caldav-discover autocomplete="off"><label>Apple 账号' +
      '<input name="email" type="email" required maxlength="254" autocomplete="off"></label>' +
      '<label>App 专用密码<input name="password" type="password" required maxlength="64" autocomplete="new-password"></label>' +
      '<div class="widget-actions"><button class="action-button" type="submit">查找可写日历</button></div></form>' +
      '<form data-caldav-select hidden><label>写入目标<select required name="calendarId"></select></label>' +
      '<div class="widget-actions"><button class="action-button" type="submit">连接测试日历</button></div></form>') + '</section>';
}

export function feedStatus(date) {
  const feed = connection.feed;
  if (connection.mode === 'preview') return '本机预览 · 刷新清除';
  if (connection.mode === 'loading') return '正在载入工作台…';
  if (connection.mode === 'unavailable') return '私有服务不可用';
  if (feed.status === 'unconfigured') {
    if (!connection.caldav.configured) return '未连接 iCloud';
    return connection.caldav.stale ? 'iCloud 暂不可读 · 已保留缓存' : 'iCloud · ' + escapeHtml(connection.caldav.name);
  }
  if (feed.status === 'loading') return '正在读取订阅…';
  if (feed.status === 'error') return 'iCloud 暂不可读';
  if (date && (date < feed.windowStart || date >= feed.windowEnd)) return '该日期超出订阅显示范围';
  if (!feed.fetchedAt) return '等待 iCloud 数据';
  const stamp = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(feed.fetchedAt);
  return (feed.status === 'stale' ? '显示上次缓存 · ' : 'iCloud · ') + stamp;
}

export function statusBanner() {
  const status = connection.save;
  if (!['saving', 'error', 'conflict'].includes(status)) return '';
  if (status === 'saving') return '<p class="private-notice" role="status">正在保存…</p>';
  return '<p class="private-notice" role="alert">' +
    (status === 'conflict' ? '另一处已更新工作台。当前修改仍在此页。' : '保存失败。当前修改仍在此页。') +
    ' <button type="button" class="text-action" ' + (status === 'conflict' ? 'data-planner-reload>舍弃本页修改并重新载入' :
      'data-planner-retry>重试保存') + '</button></p>';
}

export function reviewDialog() {
  return `<dialog class="task-dialog apple-dialog" data-review-dialog aria-labelledby="review-title">
    <form data-review-form>
      <h2 id="review-title">Review</h2><input type="hidden" name="taskId"><input type="hidden" name="eventId"><input type="hidden" name="eventVersion">
      <p>Link · <strong data-review-link></strong></p>
      <label data-caldav-edit-title hidden>日程标题<input name="eventTitle" maxlength="120" disabled></label>
      <fieldset data-review-time hidden><legend>Time · Asia/Tokyo</legend>
        <label class="check-label"><input type="checkbox" name="allDay">全天</label>
        <div class="apple-fields"><label>开始时间<input type="datetime-local" name="startTime"></label>
        <label>结束时间<input type="datetime-local" name="endTime"></label></div>
        <div class="apple-fields"><label>开始日期<input type="date" name="startDate"></label>
        <label>结束日期（含当天）<input type="date" name="endDate"></label></div>
        <label>地点<input name="place" maxlength="200"></label>
        <label>备注<textarea name="notes" maxlength="700" rows="2"></textarea></label>
        <label>目标日历（可选）<input name="targetCalendar" maxlength="80"></label>
      </fieldset>
      <label>Action<select name="action">
        <option value="remind">Remind Only</option><option value="todo">Add To-Do</option>
        <option value="calendar">Add to Calendar</option>
      </select></label>
      <p data-review-summary></p><p data-form-error role="alert" hidden></p>
      <div class="widget-actions"><button class="action-button secondary" type="button" data-dialog-cancel>取消</button>
        <button class="action-button" type="submit">确认安排</button></div>
    </form></dialog>`;
}

export function updateReview(form) {
  const { action, allDay, startTime, endTime, startDate, endDate } = form.elements;
  const calendar = action.value === 'calendar';
  form.querySelector('[data-review-time]').hidden = !calendar;
  for (const field of [startTime, endTime, startDate, endDate]) {
    const dateOnly = field.type === 'date';
    field.closest('label').hidden = dateOnly !== allDay.checked;
    field.required = calendar && !field.closest('label').hidden;
    field.disabled = !field.required;
  }
  form.elements.targetCalendar.closest('label').hidden = connection.caldav.configured;
  form.querySelector('button[type=submit]').textContent = calendar && connection.caldav.configured ? '保存并同步' : '确认安排';
  form.querySelector('[data-review-summary]').textContent = {
    calendar: connection.caldav.configured ? '保存后检查时间冲突并同步到 ' + connection.caldav.name + '。' : '确认后生成待写入日程。',
    remind: '保留提醒意向。目前没有通知服务。',
    todo: '保留现有待办，不重复创建。',
  }[action.value];
}

export function openReview(app, task, event) {
  const dialog = app.querySelector('[data-review-dialog]');
  const form = dialog.querySelector('form');
  form.reset();
  form.elements.taskId.value = task.id;
  form.elements.eventId.value = event?.id ?? '';
  form.elements.eventVersion.value = event?.caldav?.version ?? '';
  form.elements.eventTitle.value = event?.title ?? '';
  form.elements.eventTitle.disabled = !event;
  form.elements.eventTitle.required = Boolean(event);
  form.querySelector('[data-caldav-edit-title]').hidden = !event;
  form.elements.action.disabled = Boolean(event);
  form.elements.action.value = event ? 'calendar' : plannerRepository.getReview(task.id)?.action ?? 'calendar';
  form.elements.startTime.value = task.date + 'T09:00';
  form.elements.endTime.value = task.date + 'T10:00';
  form.elements.startDate.value = task.date;
  form.elements.endDate.value = task.date;
  if (event) {
    const localTime = value => new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value)).replace(' ', 'T');
    form.elements.allDay.checked = event.allDay;
    if (event.allDay) {
      form.elements.startDate.value = event.start;
      form.elements.endDate.value = dateKey(addDays(parseDate(event.end), -1));
    } else {
      form.elements.startTime.value = localTime(event.start);
      form.elements.endTime.value = localTime(event.end);
    }
    form.elements.place.value = event.location;
    form.elements.notes.value = event.notes;
  }
  form.querySelector('[data-review-link]').textContent = task.title;
  form.querySelector('[data-form-error]').hidden = true;
  updateReview(form);
  dialog.showModal();
}

export function readReview(form) {
  const fields = form.elements;
  const action = fields.action.value;
  if (action !== 'calendar') return { action };
  const allDay = fields.allDay.checked;
  const endDay = parseDate(fields.endDate.value) ? labelTime(fields.endDate.value) : '';
  const times = allDay ? eventTimes(true, fields.startDate.value, endDay) :
    eventTimes(false, fields.startTime.value, fields.endTime.value);
  return times ? { action, details: {
    ...times, location: fields.place.value.trim(), notes: fields.notes.value.trim(),
    targetCalendar: fields.targetCalendar.value.trim(), title: fields.eventId.value ? fields.eventTitle.value.trim() : undefined,
  } } : null;
}

export function eventDialog() {
  return '<dialog class="task-dialog apple-dialog" data-event-dialog aria-labelledby="apple-event-title">' +
    '<div data-event-body></div><div class="widget-actions"><button class="action-button secondary" type="button" data-dialog-cancel>关闭</button></div></dialog>';
}

export function showEvent(app, event) {
  const dialog = app.querySelector('[data-event-dialog]');
  const studio = event.source === 'studio';
  const retry = event.status === 'export_launched' || event.status === 'sync_error';
  const saved = connection.mode === 'preview' || connection.save === 'idle';
  const automatic = studio && event.syncMode === 'caldav';
  const exportable = studio && !automatic && event.status !== 'synced' && !event.mismatch && !event.deviceResult && saved;
  const appleDevice = /iPhone|iPad|iPod|Mac/.test(navigator.userAgent);
  const attempt = crypto.randomUUID();
  const link = exportable && appleDevice ? shortcutUrl(event, location.origin, attempt) : null;
  const launch = link ? '<a class="action-button" data-shortcut-launch="' + attempt + '" href="' + escapeHtml(link) +
    '">' + (retry ? '再次加入 Apple 日历' : '加入 Apple 日历') + '</a>' : '';
  const download = exportable ? '<button type="button" class="action-button secondary" data-ics-download>下载 .ics</button>' : '';
  const flag = studio && !automatic && event.status === 'export_launched' && !event.mismatch && !event.deviceResult ?
    '<button type="button" class="text-action" data-event-error>标记需核对</button>' : '';
  const feedback = automatic ? '' : studio && !saved ? '请等工作台完成保存后再导出。' : event.mismatch ? 'iCloud 有同一来源 ID 的多个记录或日期不一致，请先在 Apple 日历核对。' :
    event.deviceResult && event.status !== 'synced' ? '刷新订阅后可核对 iCloud 同步。若需改期，请在 Apple 日历打开原日程。' :
    retry ? '若快捷指令未打开，请检查 YiStudioAddEvent 是否已安装，或下载 .ics。重试前请核对 Apple 日历。' :
    exportable && appleDevice && !link ? '快捷指令参数过长，请下载 .ics 手动导入。' :
    exportable ? '下载 .ics 后需要手动导入。' : '';
  const row = [...app.querySelectorAll('[data-apple-event]')].find(button => button.dataset.appleEvent === event.id);
  if (row && studio) row.querySelector('[data-event-status]').textContent = eventStatusLabel(event);
  dialog.dataset.eventId = event.id;
  dialog.querySelector('[data-event-body]').innerHTML =
    '<h2 id="apple-event-title">' + escapeHtml(event.title) + '</h2>' +
    '<p>' + escapeHtml(eventTimeLabel(event)) + (event.allDay ? '' : ' · 东京时间') + '</p>' +
    (event.location ? '<p>' + escapeHtml(event.location) + '</p>' : '') +
    (studio && event.notes ? '<p class="prose">' + escapeHtml(event.notes) + '</p>' : '') +
    '<p>' + (studio ? eventStatusLabel(event) : '来自 ' + escapeHtml(event.sourceLabel || 'iCloud')) + '</p>' +
    (feedback ? '<p>' + feedback + '</p>' : '') +
    (automatic ? caldavEventActions(event) : '') +
    (launch || download || flag ? '<div class="widget-actions">' + launch + download + flag + '</div>' : '');
  if (!dialog.open) dialog.showModal();
}

function caldavEventActions(event) {
  const sync = event.caldav;
  if (!sync || !connection.caldav.configured) return '';
  const pending = ['pending', 'error'].includes(sync.state);
  const conflict = sync.reason === 'conflict';
  const retry = pending && !['remote_changed', 'delete_failed', 'delete_changed'].includes(sync.reason);
  const removable = pending || sync.state === 'added';
  const list = sync.conflicts?.length ? '<ul>' + sync.conflicts.map(row =>
    '<li>' + escapeHtml(row.title) + ' · ' + escapeHtml(eventTimeLabel(row)) + '</li>').join('') + '</ul>' : '';
  return list + '<p data-caldav-event-message role="status"></p><div class="widget-actions">' +
    (retry ? '<button type="button" class="action-button" data-caldav-edit>修改后重试</button>' : '') +
    (retry && !conflict ? '<button type="button" class="action-button secondary" data-caldav-command="retry">重新添加</button>' : '') +
    (conflict ? '<button type="button" class="action-button secondary" data-caldav-command="stop">中止添加</button>' : '') +
    (removable ? '<button type="button" class="text-action" data-caldav-command="delete">删除日程</button>' : '') +
    '</div>';
}

export function reviewLabel(task) {
  const review = plannerRepository.getReview(task.id);
  return review ? actionLabels[review.action] : '';
}
