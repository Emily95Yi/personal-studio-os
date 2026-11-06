import { addDays, dateKey, parseDate } from './calendar.js';
import { combineEvents, daySpan, eventStatusLabel, eventTimeLabel, eventTimes, shortcutUrl } from './calendar-events.js';
import { escapeHtml } from './html.js';
import { connection } from './private-api.js';
import { plannerRepository } from './repository.js';

export const canEdit = () => ['private', 'preview'].includes(connection.mode);
const labelTime = date => dateKey(addDays(parseDate(date), 1));
export function allCalendarEvents(filter = 'all') {
  const local = plannerRepository.calendarEvents();
  const { caldav, feed } = connection;
  const statuses = new Map(caldav.statuses.map(status => [status.id, status]));
  const managed = local.filter(event => event.syncMode === 'caldav').map(event => ({
    ...event, source: 'studio', caldav: statuses.get(event.id),
  }));
  for (const status of statuses.values()) {
    if (status.standalone && (status.local || status.remote)) {
      managed.push({ id: status.id, source: 'icloud', syncMode: 'caldav', caldav: status });
    }
  }
  const ownedUids = new Set([...statuses.values()].map(row => row.uid));
  for (const event of managed) ownedUids.add(event.caldav?.uid ?? event.id + '@yi-studio');
  const a = [
    ...managed.filter(event => event.caldav?.state !== 'deleted').map(event => {
      const sync = event.caldav;
      const fields = (sync?.state === 'conflict' ? sync.remote ?? sync.local : sync?.local ?? sync?.remote) ?? event;
      const merged = { ...event, ...fields, sourceGroup: 'A', sourceLabel: 'A · ' + (caldav.name ?? 'iCloud') };
      return { ...merged, ...daySpan(merged) };
    }),
    ...caldav.events.filter(event => !ownedUids.has(event.uid)).map(event => ({
      ...event, id: event.linkId ?? caldav.sourceId + ':' + event.id, sourceGroup: 'A',
      sourceLabel: 'A · ' + caldav.name, caldav: event.linkId ? { state: 'added', version: event.version } : null,
    })),
  ];
  const readOnly = caldav.secondary?.events ?? feed.events;
  const b = readOnly.map(event => ({
    ...event, id: (caldav.secondary?.sourceId ?? 'B:ics') + ':' + event.id, sourceGroup: 'B',
    sourceLabel: 'B · ' + (caldav.secondary?.name ?? 'iCloud 订阅'),
  }));
  if (filter === 'A') return a;
  if (filter === 'B') return b;
  const aKeys = new Set(a.map(event => JSON.stringify([event.caldav?.uid ?? event.uid ?? event.id + '@yi-studio', event.recurrence ?? ''])));
  const distinct = b.filter(event => !aKeys.has(JSON.stringify([event.uid, event.recurrence ?? ''])));
  return [...a, ...combineEvents(local.filter(event => event.syncMode !== 'caldav'), distinct)];
}
export const calendarTasks = (start, end) => {
  const deleted = new Set(connection.caldav.statuses.filter(row => row.state === 'deleted').map(row => row.id));
  return plannerRepository.tasksBetween(start, end).filter(task => {
    const event = plannerRepository.eventForTask(task.id);
    return !event || deleted.has(event.id);
  });
};
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
    (connection.caldav.enabled ? 'B · 公开 ICS 备用方式' : 'iCloud 订阅') + '</h2><p data-settings-status role="status">' +
    (connection.caldav.secondary ? '已启用私人日历 B。当前不使用公开订阅。' : configured ? '订阅已配置。可替换或断开。' : '可选：没有配置私人日历 B 时，可以使用公开订阅。') + '</p>' +
    '<form data-apple-settings autocomplete="off"><label>iCloud 公开日历链接' +
    '<input type="password" name="source" maxlength="512" required autocomplete="off" spellcheck="false"></label>' +
    '<div class="widget-actions"><button class="action-button" type="submit">保存订阅</button>' +
    (configured ? '<button class="action-button secondary" type="button" data-source-remove>断开订阅</button>' : '') +
    '</div></form></section>';
}

function caldavSettings() {
  const config = connection.caldav;
  if (!config.enabled) return '';
  const connected = config.configured;
  return '<section class="empty-state apple-settings caldav-settings"><h2>Apple 私人日历</h2>' +
    '<p data-caldav-message role="status">' + (connected ? 'A · 读写：' + escapeHtml(config.name) +
      '；B · 只读：' + escapeHtml(config.secondary?.name ?? '未选择') :
      '使用同一个 Apple 账号连接日历 A（读写）及日历 B（只读）。') + '</p>' +
    (connected ? '<div class="widget-actions"><button class="action-button" type="button" data-caldav-discover-existing>选择只读日历 B</button>' +
      '<button class="action-button secondary" type="button" data-caldav-disconnect>断开 Apple 连接</button></div>' :
      '<form data-caldav-discover autocomplete="off"><label>Apple 账号' +
      '<input name="email" type="email" required maxlength="254" autocomplete="off"></label>' +
      '<label>App 专用密码<input name="password" type="password" required maxlength="64" autocomplete="new-password"></label>' +
      '<div class="widget-actions"><button class="action-button" type="submit">查找日历</button></div></form>') +
    '<form data-caldav-select hidden><label>A · 读写<select required name="calendarId"></select></label>' +
    '<label>B · 只读（可选）<select name="secondaryId"></select></label>' +
    '<div class="widget-actions"><button class="action-button" type="submit">保存日历选择</button></div></form></section>';
}

const syncTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const lastSync = (at, stale, revoked) => (revoked ? '授权失效' : stale ? '读取失败' : at ? 'Synced' : 'Pending') +
  (at ? ' · 上次成功 ' + syncTime.format(at) : '') + (stale && at ? '（缓存）' : '');

export function feedStatus(date) {
  const { caldav, feed } = connection;
  if (connection.mode === 'preview') return '本机预览 · 刷新清除';
  if (connection.mode === 'loading') return '正在载入工作台…';
  if (connection.mode === 'unavailable') return '私有服务不可用';
  const parts = [];
  if (caldav.configured) parts.push('A · ' + lastSync(caldav.fetchedAt, caldav.stale, caldav.authorizationFailed));
  if (caldav.secondary) {
    const b = caldav.secondary;
    parts.push('B · ' + lastSync(b.fetchedAt, b.stale, b.authorizationFailed));
  } else if (feed.status !== 'unconfigured') {
    const outside = date && feed.windowStart && (date < feed.windowStart || date >= feed.windowEnd);
    parts.push('B · ICS · ' + (outside ? '超出显示范围' : lastSync(feed.fetchedAt, ['stale', 'error'].includes(feed.status))));
  }
  return parts.join('；') || '未连接 iCloud';
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
      <h2 id="review-title">Review</h2><input type="hidden" name="taskId"><input type="hidden" name="eventId"><input type="hidden" name="eventVersion"><input type="hidden" name="createId">
      <p>Link · <strong data-review-link></strong></p>
      <label data-caldav-edit-title hidden>日程标题<input name="eventTitle" maxlength="300" disabled></label>
      <fieldset data-review-time hidden><legend>Time · Asia/Tokyo</legend>
        <label class="check-label"><input type="checkbox" name="allDay">全天</label>
        <div class="apple-fields"><label>开始时间<input type="datetime-local" name="startTime"></label>
        <label>结束时间<input type="datetime-local" name="endTime"></label></div>
        <div class="apple-fields"><label>开始日期<input type="date" name="startDate"></label>
        <label>结束日期（含当天）<input type="date" name="endDate"></label></div>
        <label>地点<input name="place" maxlength="300"></label>
        <label>备注<textarea name="notes" maxlength="8000" rows="2"></textarea></label>
        <label>目标日历（可选）<input name="targetCalendar" maxlength="80"></label>
      </fieldset>
      <label>Action<select name="action">
        <option value="remind">Remind Only</option><option value="todo">Add To-Do</option>
        <option value="calendar">Add to Calendar</option>
      </select></label>
      <p data-review-summary></p><p data-form-error role="alert" hidden></p>
      <button class="text-action" type="button" data-caldav-rebase hidden>查看 Apple 最新版本并继续编辑</button>
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

export function openReview(app, task, event, date = task?.date ?? dateKey()) {
  const dialog = app.querySelector('[data-review-dialog]');
  const form = dialog.querySelector('form');
  form.reset();
  const direct = !task || Boolean(event);
  form.elements.taskId.value = task?.id ?? '';
  form.elements.eventId.value = event?.id ?? '';
  form.elements.createId.value = !task && !event ? crypto.randomUUID() : '';
  form.elements.eventVersion.value = JSON.stringify(event?.caldav?.version ?? null);
  form.elements.eventTitle.value = event?.title ?? '';
  form.elements.eventTitle.disabled = !direct;
  form.elements.eventTitle.required = direct;
  form.elements.place.maxLength = direct ? 300 : 200;
  form.elements.startTime.step = form.elements.endTime.step = direct ? '1' : '60';
  form.elements.notes.maxLength = direct ? 8000 : 700;
  form.querySelector('[data-caldav-edit-title]').hidden = !direct;
  form.querySelector('[data-caldav-rebase]').hidden = true;
  form.elements.action.disabled = direct;
  form.elements.action.closest('label').hidden = direct;
  form.querySelector('h2').textContent = event ? '编辑 A 日程' : direct ? '新建 A 日程' : 'Review';
  form.elements.action.value = direct ? 'calendar' : plannerRepository.getReview(task.id)?.action ?? 'calendar';
  form.elements.startTime.value = date + 'T09:00';
  form.elements.endTime.value = date + 'T10:00';
  form.elements.startDate.value = date;
  form.elements.endDate.value = date;
  if (event) {
    const localTime = value => new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value)).replace(' ', 'T');
    form.elements.allDay.checked = event.allDay;
    if (event.allDay) {
      form.elements.startDate.value = event.start;
      form.elements.endDate.value = dateKey(addDays(parseDate(event.end), -1));
      form.elements.startTime.value = event.start + 'T09:00';
      form.elements.endTime.value = form.elements.endDate.value + 'T10:00';
    } else {
      form.elements.startTime.value = localTime(event.start);
      form.elements.endTime.value = localTime(event.end);
      const { dayStart, dayEnd } = daySpan(event);
      form.elements.startDate.value = dayStart;
      form.elements.endDate.value = dateKey(addDays(parseDate(dayEnd), -1));
    }
    form.elements.place.value = event.location;
    form.elements.notes.value = event.notes ?? '';
  }
  form.querySelector('[data-review-link]').textContent = task?.title ?? 'A · ' + (connection.caldav.name ?? 'iCloud');
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
    ...times, location: fields.eventTitle.disabled ? fields.place.value.trim() : fields.place.value,
    notes: fields.eventTitle.disabled ? fields.notes.value.trim() : fields.notes.value,
    targetCalendar: fields.targetCalendar.value.trim(), title: fields.eventTitle.disabled ? undefined : fields.eventTitle.value,
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
  const automatic = event.sourceGroup === 'A';
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
  if (row && (studio || automatic)) row.querySelector('[data-event-status]').textContent = eventStatusLabel(event);
  dialog.dataset.eventId = event.id;
  dialog.querySelector('[data-event-body]').innerHTML =
    '<h2 id="apple-event-title">' + escapeHtml(event.title) + '</h2>' +
    '<p>' + escapeHtml(eventTimeLabel(event)) + (event.allDay ? '' : ' · 东京时间') + '</p>' +
    (event.location ? '<p>' + escapeHtml(event.location) + '</p>' : '') +
    (event.notes ? '<p class="prose">' + escapeHtml(event.notes) + '</p>' : '') +
    '<p>' + (studio || automatic ? eventStatusLabel(event) : '来自 ' + escapeHtml(event.sourceLabel || 'iCloud')) + '</p>' +
    (feedback ? '<p>' + feedback + '</p>' : '') +
    (automatic ? caldavEventActions(event) : '') +
    (launch || download || flag ? '<div class="widget-actions">' + launch + download + flag + '</div>' : '');
  if (!dialog.open) dialog.showModal();
}

function caldavEventActions(event) {
  const sync = event.caldav;
  const conflicting = sync?.state === 'conflict';
  const blocked = !connection.caldav.configured || !sync || conflicting || ['queued', 'delete_queued'].includes(sync.state);
  const compare = (label, fields) => fields ? '<p><strong>' + label + '</strong> · ' + escapeHtml(fields.title) +
    ' · ' + escapeHtml(eventTimeLabel(fields)) + (fields.location ? ' · ' + escapeHtml(fields.location) : '') +
    (fields.notes ? '<br>' + escapeHtml(fields.notes) : '') + '</p>' : '';
  const list = sync?.conflicts?.length ? '<ul>' + sync.conflicts.map(row =>
    '<li>' + escapeHtml(row.title) + ' · ' + escapeHtml(eventTimeLabel(row)) + '</li>').join('') + '</ul>' : '';
  const resolutions = ['remote_changed', 'remote_deleted', 'delete_changed'].includes(sync?.reason);
  const button = (label, action) => '<button type="button" class="action-button secondary" data-caldav-command="' + action + '">' + label + '</button>';
  return list + (conflicting ? compare('Studio 待同步版本', sync.local) +
    (sync.reason === 'remote_deleted' ? '<p>Apple 端已删除。Studio 修改仍保存在这里。</p>' :
      compare('Apple 版本', sync.remote)) : '') +
    (!sync ? '<p>此事件缺少可写版本，或属于重复事件或邀请。请在 Apple 日历中处理。</p>' : '') +
    '<p data-caldav-event-message role="status"></p><div class="widget-actions">' +
    '<button type="button" class="action-button" data-caldav-edit' + (blocked ? ' disabled' : '') + '>编辑</button>' +
    '<button type="button" class="text-action" data-caldav-command="delete"' + (blocked ? ' disabled' : '') + '>删除日程</button>' +
    (!blocked && ['pending', 'error'].includes(sync.state) && sync.reason !== 'moved_to_b' ? button('重试同步', 'retry') : '') +
    (connection.caldav.configured && conflicting && resolutions ? button('采用 Apple 版本', 'accept_remote') +
      (sync.reason === 'remote_deleted' ? '' : button(sync.operation === 'delete' ? '仍然删除' : '保留 Studio 修改', 'keep_local')) : '') +
    '</div>';
}

export function reviewLabel(task) {
  const review = plannerRepository.getReview(task.id);
  return review ? actionLabels[review.action] : '';
}
