import { addDays, dateKey, parseDate } from './calendar.js';
import { combineEvents, eventStatus, eventTimeLabel, eventTimes, shortcutUrl } from './calendar-events.js';
import { escapeHtml } from './html.js';
import { connection } from './private-api.js';
import { plannerRepository } from './repository.js';

export const canEdit = () => ['private', 'preview'].includes(connection.mode);
const labelTime = date => dateKey(addDays(parseDate(date), 1));
export const allCalendarEvents = () => combineEvents(plannerRepository.calendarEvents(), connection.feed.events);
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
  return '<section class="empty-state apple-settings"><h2>iCloud 订阅</h2><p data-settings-status role="status">' +
    (configured ? '订阅已配置。可替换或断开。' : '还没有订阅。') + '</p>' +
    '<form data-apple-settings autocomplete="off"><label>iCloud 公开日历链接' +
    '<input type="password" name="source" maxlength="512" required autocomplete="off" spellcheck="false"></label>' +
    '<div class="widget-actions"><button class="action-button" type="submit">保存订阅</button>' +
    (configured ? '<button class="action-button secondary" type="button" data-source-remove>断开订阅</button>' : '') +
    '</div></form></section>';
}

export function feedStatus(date) {
  const feed = connection.feed;
  if (connection.mode === 'preview') return '本机预览 · 刷新清除';
  if (connection.mode === 'loading') return '正在载入工作台…';
  if (connection.mode === 'unavailable') return '私有服务不可用';
  if (feed.status === 'unconfigured') return '未连接 iCloud';
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
      <h2 id="review-title">Review</h2><input type="hidden" name="taskId">
      <p>Link · <strong data-review-link></strong></p>
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
  form.querySelector('[data-review-summary]').textContent = {
    calendar: '确认后生成待写入日程。',
    remind: '保留提醒意向。目前没有通知服务。',
    todo: '保留现有待办，不重复创建。',
  }[action.value];
}

export function openReview(app, task) {
  const dialog = app.querySelector('[data-review-dialog]');
  const form = dialog.querySelector('form');
  form.reset();
  form.elements.taskId.value = task.id;
  form.elements.action.value = plannerRepository.getReview(task.id)?.action ?? 'calendar';
  form.elements.startTime.value = task.date + 'T09:00';
  form.elements.endTime.value = task.date + 'T10:00';
  form.elements.startDate.value = task.date;
  form.elements.endDate.value = task.date;
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
    targetCalendar: fields.targetCalendar.value.trim(),
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
  const exportable = studio && event.status !== 'synced' && !event.mismatch && saved;
  const appleDevice = /iPhone|iPad|iPod|Mac/.test(navigator.userAgent);
  const link = exportable && appleDevice ? shortcutUrl(event, location.origin) : null;
  const launch = link ? '<a class="action-button" data-shortcut-launch href="' + escapeHtml(link) +
    '">' + (retry ? '再次加入 Apple 日历' : '加入 Apple 日历') + '</a>' : '';
  const download = exportable ? '<button type="button" class="action-button secondary" data-ics-download>下载 .ics</button>' : '';
  const flag = studio && event.status === 'export_launched' && !event.mismatch ?
    '<button type="button" class="text-action" data-event-error>标记需核对</button>' : '';
  const feedback = studio && !saved ? '请等工作台完成保存后再导出。' : event.mismatch ? 'iCloud 有同一来源 ID 的多个记录或日期不一致，请先在 Apple 日历核对。' :
    retry ? '若快捷指令未打开，请检查 YiStudioAddEvent 是否已安装，或下载 .ics。重试前请核对 Apple 日历。' :
    exportable && appleDevice && !link ? '快捷指令参数过长，请下载 .ics 手动导入。' :
    exportable ? '下载 .ics 后需要手动导入。' : '';
  const row = [...app.querySelectorAll('[data-apple-event]')].find(button => button.dataset.appleEvent === event.id);
  if (row && studio) row.querySelector('[data-event-status]').textContent = eventStatus[event.status];
  dialog.dataset.eventId = event.id;
  dialog.querySelector('[data-event-body]').innerHTML =
    '<h2 id="apple-event-title">' + escapeHtml(event.title) + '</h2>' +
    '<p>' + escapeHtml(eventTimeLabel(event)) + (event.allDay ? '' : ' · 东京时间') + '</p>' +
    (event.location ? '<p>' + escapeHtml(event.location) + '</p>' : '') +
    (studio && event.notes ? '<p class="prose">' + escapeHtml(event.notes) + '</p>' : '') +
    '<p>' + (studio ? eventStatus[event.status] : '来自 iCloud') + '</p>' +
    (feedback ? '<p>' + feedback + '</p>' : '') +
    (launch || download || flag ? '<div class="widget-actions">' + launch + download + flag + '</div>' : '');
  if (!dialog.open) dialog.showModal();
}

export function reviewLabel(task) {
  const review = plannerRepository.getReview(task.id);
  return review ? actionLabels[review.action] : '';
}
