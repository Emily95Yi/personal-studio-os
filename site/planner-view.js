import { calendarDays, calendarHref, calendarSelection, dateKey, formatDay, movePeriod, todayDate } from './calendar.js';
import { plannerRepository, workshopRepository } from './repository.js';
import { href } from './pages.js';
import { escapeHtml } from './html.js';
import { taskSourceLink } from './auto-view.js';
import { allCalendarEvents, agendaEventStatus, calendarSourceLabels, canEdit, onDay, reviewLabel } from './apple-view.js';
import { icon } from './icons.js';
import { eventDateTimeLabel, eventStatus, eventTimeLabel } from './calendar-events.js';
import { connection } from './private-api.js';
import { reminderRows } from './reminder-view.js';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const modes = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];

function dateLink(date, mode, label, from, attributes = '') {
  return '<a data-calendar-nav href="' + escapeHtml(calendarHref(date, mode, from)) + '"' + attributes + '>' + label + '</a>';
}

function calendarGrid(date, mode, from, preview = false) {
  if (mode === 'day') return '';
  const days = calendarDays(date, mode);
  const start = dateKey(days[0]);
  const end = dateKey(days.at(-1));
  const appointments = allCalendarEvents();
  const checkIns = plannerRepository.checkInsBetween(start, end);
  const events = workshopRepository.eventsBetween(start, end);
  const cells = days.map(day => {
    const key = dateKey(day);
    const selected = !preview && key === dateKey(date);
    const today = key === dateKey();
    const checked = checkIns.includes(key);
    const eventCount = events.filter(event => event.date === key).length;
    const appointmentCount = appointments.filter(event => onDay(event, key)).length;
    const details = [appointmentCount ? appointmentCount + ' 项日程' : '', checked ? '打卡' : '',
      eventCount ? eventCount + ' 场活动' : ''].filter(Boolean);
    const label = '<span class="day-number">' + day.getUTCDate() + '</span>' +
      (details.length ? '<span class="day-indicators">' + details.map(detail => '<small>' + detail + '</small>').join('') + '</span>' : '');
    const className = 'calendar-day' + (mode === 'month' && day.getUTCMonth() !== date.getUTCMonth() ? ' other-month' : '') +
      (today ? ' is-today' : '');
    if (preview) return '<div class="' + className + '">' + label + '</div>';
    return dateLink(day, mode, label, from, ' class="' + className + '" aria-label="' + formatDay(day) +
      (details.length ? '，' + details.join('，') : '') + '"' + (selected ? ' aria-current="date"' : ''));
  }).join('');
  return '<div class="calendar-grid ' + mode + '" aria-label="' + (mode === 'month' ? '月历' : '周历') + '">' +
    weekdays.map(day => '<span class="weekday">周' + day + '</span>').join('') + cells + '</div>';
}

export function weekPreview() {
  const date = todayDate();
  return '<section class="widget widget-week" aria-labelledby="week-preview-title"><div class="section-heading">' +
    '<h2 id="week-preview-title">' + (date.getUTCMonth() + 1) + '月</h2>' +
    '<a class="header-icon" href="' + escapeHtml(calendarHref(date, 'week', 'self-board')) +
    '" aria-label="打开日历" title="打开日历">' + icon('calendar', 19) + '</a></div>' +
    calendarGrid(date, 'week', 'self-board', true) + '</section>';
}

export function calendarSearchResults(query, events = allCalendarEvents()) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return '';
  const matches = events.flatMap(event => {
    const date = eventDateTimeLabel(event);
    const searchText = [event.title, event.location, event.notes, date, event.sourceLabel].join(' ').toLowerCase();
    return terms.every(term => searchText.includes(term)) ? [{ event, date }] : [];
  }).sort((a, b) => a.event.start.localeCompare(b.event.start));
  if (!matches.length) return '<p class="sb-results-count">没有匹配的日程。</p>';
  return '<p class="sb-results-count">' + matches.length + ' 项日程</p><ul class="agenda-list">' +
    matches.map(({ event, date }) => '<li class="agenda-appointment"' +
      (event.sourceGroup ? ' data-calendar-source="' + escapeHtml(event.sourceGroup) + '"' : '') +
      '><button type="button" data-apple-event="' + escapeHtml(event.id) + '"><strong>' + escapeHtml(event.title) +
      '</strong><span>' + escapeHtml([date, event.location, event.sourceLabel].filter(Boolean).join(' · ')) +
      '</span></button></li>').join('') + '</ul>';
}

function agenda(date) {
  const key = dateKey(date);
  const appointments = allCalendarEvents().filter(event => onDay(event, key))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
  const checked = plannerRepository.checkInsBetween(key, key).length > 0;
  const events = workshopRepository.eventsBetween(key, key);
  const appointmentRows = appointments.map(event => {
    const source = event.sourceGroup;
    const label = calendarSourceLabels[source];
    const status = agendaEventStatus(event);
    return '<li class="agenda-appointment"' + (label ? ' data-calendar-source="' + source + '"' : '') +
      '><button type="button" data-apple-event="' + escapeHtml(event.id) + '"><strong>' +
      (label ? '<span class="visually-hidden">' + label + ' · </span>' : '') + escapeHtml(event.title) +
      '</strong><span>' + escapeHtml(eventTimeLabel(event)) +
      '<span data-event-status' + (status ? '' : ' hidden') + '> · ' + escapeHtml(status) + '</span></span></button></li>';
  }).join('');
  return '<section class="calendar-agenda"><div class="section-heading"><h2>' +
    (date.getUTCMonth() + 1) + '.' + date.getUTCDate() + '</h2><div class="calendar-agenda-actions">' +
    (canEdit() ?
      '<button type="button" class="header-icon calendar-icon" data-caldav-new="' + key +
      '" aria-label="新建 YiStudio 日程" title="新建 YiStudio 日程">' + icon('calendarAdd', 19) + '</button>' : '') + '</div></div>' +
    '<section class="agenda-group" aria-label="日程"><h3>日程</h3>' +
    (appointmentRows ? '<ul class="agenda-list">' + appointmentRows + '</ul>' : '<p>暂无日程。</p>') + '</section>' +
    (checked ? '<p class="habit-record">习惯 · 已打卡</p>' : '') +
    (events.length ? '<ul class="event-agenda">' + events.map(event => '<li><a href="' +
      href('workshop', 'projects', event.projectId, 'events', event.id) + '">' + escapeHtml(event.theme || event.title) +
      '</a><small>Workshop</small></li>').join('') + '</ul>' : '') + '</section>';
}

function taskList() {
  const tasks = plannerRepository.listTasks();
  const rows = tasks.map(task =>
    '<li><button type="button" data-task-edit="' + escapeHtml(task.id) + '"><strong>' + escapeHtml(task.title) +
    '</strong><span>' + (task.done ? '已完成' : reviewLabel(task) ? eventStatus.confirmed + ' · ' + reviewLabel(task) : '未完成') +
    '</span></button>' + taskSourceLink(task) + '</li>').join('');
  return '<section class="agenda-group calendar-tasks" aria-label="待办"><div class="section-heading"><h3>待办</h3>' +
    (canEdit() ? '<button type="button" class="header-icon calendar-icon" data-task-new aria-label="新建待办" title="新建待办">' +
      icon('taskAdd', 19) + '</button>' : '') + '</div>' +
    (rows ? '<ul class="agenda-list">' + rows + '</ul>' : '<p class="subtle">暂无待办。</p>') + '</section>';
}

export function calendarRefreshState() {
  const { mode, refreshing, caldav, feed } = connection;
  const hasSource = caldav.configured || feed.status !== 'unconfigured';
  if (refreshing) return { state: 'pending', label: '正在刷新日历', disabled: true };
  if (mode !== 'private') return { state: 'idle', label: '刷新日历', disabled: true };

  const secondary = caldav.secondary;
  const secondaryFailed = secondary ? secondary.stale : ['stale', 'error'].includes(feed.status);
  if (caldav.stale || secondaryFailed) return { state: 'error', label: '刷新日历：读取失败', disabled: !hasSource };
  if (!hasSource) return { state: 'idle', label: '刷新日历', disabled: true };
  const bothReady = caldav.configured && caldav.fetchedAt &&
    (secondary ? secondary.fetchedAt : feed.status === 'ready' && feed.fetchedAt);
  return bothReady ? { state: 'success', label: '刷新日历：YiStudio 和 iCloud 读取成功', disabled: false } :
    { state: 'idle', label: '刷新日历', disabled: false };
}

export function calendarHeaderActions() {
  const { state, label, disabled } = calendarRefreshState();
  return '<button type="button" class="header-icon calendar-icon" data-feed-refresh data-refresh-state="' + state +
    '" aria-disabled="' + disabled + '" aria-label="' + label + '" title="' + label + '">' + icon('refresh', 19) + '</button>' +
    '<a class="header-icon calendar-icon" href="' + href('self-board', 'auto') +
    '" aria-label="Auto 设定" title="Auto 设定">' + icon('auto', 19) + '</a>' +
    '<a class="header-icon calendar-icon" href="' + href('settings') +
    '" aria-label="日历设置" title="日历设置">' + icon('settings', 19) + '</a>';
}

export function calendarView({ params }) {
  const { mode, date } = calendarSelection(params);
  const from = params.get('from');
  const legend = Object.entries(calendarSourceLabels).map(([source, label]) =>
    '<li data-calendar-source="' + source + '">' + label + '</li>').join('');
  const reminders = plannerRepository.dueReminders();
  return '<div class="calendar-toolbar"><div class="segmented" aria-label="日历视图">' +
    modes.map(([key, label]) => dateLink(date, key, label, from, mode === key ? ' aria-current="page"' : '')).join('') +
    '</div><div class="calendar-controls">' +
    dateLink(movePeriod(date, mode, -1), mode, '‹', from, ' aria-label="上一时段"') +
    dateLink(todayDate(), mode, '今天', from) + dateLink(movePeriod(date, mode, 1), mode, '›', from, ' aria-label="下一时段"') +
    '</div></div><div class="calendar-period"><h2>' + (date.getUTCMonth() + 1) + '月</h2>' +
    '<ul class="calendar-legend" aria-label="日历颜色">' + legend + '</ul></div>' +
    calendarGrid(date, mode, from) + agenda(date) + taskList() +
    '<section class="agenda-group calendar-reminders" aria-label="提醒"><h3>提醒</h3>' +
    (reminders.length ? '<ul class="agenda-list">' + reminderRows(reminders) + '</ul>' :
      '<p class="subtle">暂无到期提醒。</p>') + '</section>';
}

export function taskDialog() {
  return '<dialog class="task-dialog" aria-labelledby="task-dialog-title"><form data-task-form>' +
    '<div class="plan-dialog-heading"><h2 id="task-dialog-title">待办</h2><div class="header-actions">' +
    '<button type="button" class="header-icon calendar-icon" data-task-delete hidden aria-label="删除待办" title="删除待办">' +
    icon('trash', 19) + '</button></div></div>' + (connection.mode === 'preview' ? '<p>本机预览 · 刷新清除</p>' : '') +
    '<input type="hidden" name="id"><input type="hidden" name="planId"><label>标题<input required maxlength="120" name="title"></label>' +
    '<label data-task-source hidden>关联原始资料<select name="sourceContentId"></select></label><label class="check-label"><input type="checkbox" name="done">已完成</label>' +
    '<p data-form-error role="alert" hidden></p><div class="widget-actions"><button type="button" class="action-button secondary" data-dialog-cancel>取消</button>' +
    '<button type="submit" class="action-button">保存</button></div></form></dialog>';
}
