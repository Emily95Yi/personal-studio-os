import { calendarDays, calendarHref, calendarSelection, dateKey, formatDay, formatPeriod, movePeriod, todayDate } from './calendar.js';
import { plannerRepository, workshopRepository } from './repository.js';
import { href } from './pages.js';
import { escapeHtml } from './html.js';
import { taskSourceLink } from './auto-view.js';
import { allCalendarEvents, calendarTasks, canEdit, feedStatus, onDay, reviewLabel } from './apple-view.js';
import { eventStatus, eventStatusLabel, eventTimeLabel } from './calendar-events.js';
import { connection } from './private-api.js';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const modes = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];

function dateLink(date, mode, label, from, attributes = '') {
  return '<a data-calendar-nav href="' + escapeHtml(calendarHref(date, mode, from)) + '"' + attributes + '>' + label + '</a>';
}

function calendarGrid(date, mode, from) {
  if (mode === 'day') return '';
  const days = calendarDays(date, mode);
  const start = dateKey(days[0]);
  const end = dateKey(days.at(-1));
  const tasks = calendarTasks(start, end);
  const appointments = allCalendarEvents();
  const checkIns = plannerRepository.checkInsBetween(start, end);
  const events = workshopRepository.eventsBetween(start, end);
  const cells = days.map(day => {
    const key = dateKey(day);
    const selected = key === dateKey(date);
    const today = key === dateKey();
    const taskCount = tasks.filter(task => task.date === key).length;
    const checked = checkIns.includes(key);
    const eventCount = events.filter(event => event.date === key).length;
    const appointmentCount = appointments.filter(event => onDay(event, key)).length;
    const details = [appointmentCount ? appointmentCount + ' 项日程' : '', taskCount ? taskCount + ' 项待办' : '', checked ? '打卡' : '',
      eventCount ? eventCount + ' 场活动' : ''].filter(Boolean);
    const label = '<span class="day-number">' + day.getUTCDate() + '</span>' +
      (details.length ? '<span class="day-indicators">' + details.map(detail => '<small>' + detail + '</small>').join('') + '</span>' : '');
    const className = 'calendar-day' + (mode === 'month' && day.getUTCMonth() !== date.getUTCMonth() ? ' other-month' : '') +
      (today ? ' is-today' : '');
    return dateLink(day, mode, label, from, ' class="' + className + '" aria-label="' + formatDay(day) +
      (details.length ? '，' + details.join('，') : '') + '"' + (selected ? ' aria-current="date"' : ''));
  }).join('');
  return '<div class="calendar-grid ' + mode + '" aria-label="' + (mode === 'month' ? '月历' : '周历') + '">' +
    weekdays.map(day => '<span class="weekday">周' + day + '</span>').join('') + cells + '</div>';
}

function agenda(date) {
  const key = dateKey(date);
  const tasks = calendarTasks(key, key);
  const appointments = allCalendarEvents().filter(event => onDay(event, key))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
  const checked = plannerRepository.checkInsBetween(key, key).length > 0;
  const events = workshopRepository.eventsBetween(key, key);
  const appointmentRows = appointments.map(event => '<li><button type="button" data-apple-event="' + escapeHtml(event.id) +
    '"><strong>' + escapeHtml(event.title) + '</strong><span>' + escapeHtml(eventTimeLabel(event)) +
    ' · <span data-event-status>' + (event.source === 'icloud' ? 'iCloud' : eventStatusLabel(event)) +
    '</span></span></button></li>').join('');
  const taskRows = tasks.map(task =>
    '<li><button type="button" data-task-edit="' + escapeHtml(task.id) + '"><strong>' + escapeHtml(task.title) +
    '</strong><span>' + (task.done ? '已完成' : reviewLabel(task) ? eventStatus.confirmed + ' · ' + reviewLabel(task) : eventStatus.draft) +
    '</span></button>' + taskSourceLink(task) + '</li>').join('');
  return '<section class="calendar-agenda"><div class="section-heading"><h2>' + formatDay(date) + ' · 当天事项</h2>' +
    (canEdit() ? '<button type="button" class="action-button" data-task-new="' + key + '">新建待办</button>' : '') + '</div>' +
    (appointmentRows || taskRows ? '<ul class="agenda-list">' + appointmentRows + taskRows + '</ul>' :
      (!checked && !events.length ? '<p>暂无安排。</p>' : '')) +
    (checked ? '<p class="habit-record">习惯 · 已打卡</p>' : '') +
    (events.length ? '<ul class="event-agenda">' + events.map(event => '<li><a href="' +
      href('workshop', 'projects', event.projectId, 'events', event.id) + '">' + escapeHtml(event.theme || event.title) +
      '</a><small>Workshop</small></li>').join('') + '</ul>' : '') + '</section>';
}

export function calendarView({ params }) {
  const { mode, date } = calendarSelection(params);
  const from = params.get('from');
  const refresh = connection.mode === 'private' && connection.feed.status !== 'unconfigured';
  return '<div class="calendar-source"><span role="status">' + feedStatus(dateKey(date)) + '</span>' +
    (refresh ? '<button type="button" class="text-action" data-feed-refresh>刷新订阅</button>' : '') +
    '<a class="text-action" href="' + href('settings') + '">日历设置</a></div>' +
    '<div class="calendar-toolbar"><div class="segmented" aria-label="日历视图">' +
    modes.map(([key, label]) => dateLink(date, key, label, from, mode === key ? ' aria-current="page"' : '')).join('') +
    '</div><div class="calendar-controls">' +
    dateLink(movePeriod(date, mode, -1), mode, '‹', from, ' aria-label="上一时段"') +
    dateLink(todayDate(), mode, '今天', from) + dateLink(movePeriod(date, mode, 1), mode, '›', from, ' aria-label="下一时段"') +
    '</div></div><h2 class="calendar-period">' + formatPeriod(date, mode) + '</h2>' +
    calendarGrid(date, mode, from) + agenda(date);
}

export function taskDialog() {
  return '<dialog class="task-dialog" aria-labelledby="task-dialog-title"><form data-task-form>' +
    '<h2 id="task-dialog-title">待办</h2>' + (connection.mode === 'preview' ? '<p>本机预览 · 刷新清除</p>' : '') +
    '<input type="hidden" name="id"><input type="hidden" name="planId"><label>标题<input required maxlength="120" name="title"></label>' +
    '<label>日期<input required type="date" name="date"></label><label data-task-source hidden>关联原始资料<select name="sourceContentId"></select></label><label class="check-label"><input type="checkbox" name="done">已完成</label>' +
    '<p data-form-error role="alert" hidden></p><div class="widget-actions"><button type="button" class="action-button secondary" data-dialog-cancel>取消</button>' +
    '<button type="button" class="action-button secondary" data-task-review hidden>Review</button>' +
    '<button type="submit" class="action-button">保存</button></div></form></dialog>';
}

export function homeWeekWidget(date = todayDate()) {
  const days = calendarDays(date, 'week');
  const start = dateKey(days[0]);
  const end = dateKey(days.at(-1));
  const tasks = calendarTasks(start, end);
  const appointments = allCalendarEvents();
  const events = workshopRepository.eventsBetween(start, end);
  const checkIns = plannerRepository.checkInsBetween(start, end);
  const links = days.map((day, index) => {
    const key = dateKey(day);
    const count = tasks.filter(item => item.date === key).length + events.filter(item => item.date === key).length +
      appointments.filter(event => onDay(event, key)).length +
      Number(checkIns.includes(key));
    return '<a class="home-week-day" href="' + escapeHtml(calendarHref(day, 'day')) +
      '" aria-label="' + formatDay(day) + (count ? '，' + count + ' 项安排' : '') + '"' +
      (key === dateKey() ? ' aria-current="date"' : '') + '><small>周' + weekdays[index] + '</small><strong>' +
      (day.getUTCMonth() + 1) + '/' + day.getUTCDate() + '</strong><span aria-hidden="true">' +
      (count ? '• ' + count : '') + '</span></a>';
  }).join('');
  return '<section class="home-week" aria-label="周历"><div class="home-week-top"><div class="calendar-controls">' +
    '<button type="button" data-home-week="previous" aria-label="前一周">‹</button>' +
    '<button type="button" data-home-week="today">本周</button>' +
    '<button type="button" data-home-week="next" aria-label="后一周">›</button></div>' +
    '<span class="home-week-range">' + start + ' — ' + end + '</span>' +
    '<a class="header-icon" href="' + escapeHtml(calendarHref(date)) + '" aria-label="展开 Calendar">' +
    '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">' +
    '<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/></svg></a></div><div class="home-week-days">' + links + '</div></section>';
}
