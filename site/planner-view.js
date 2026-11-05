import { calendarDays, calendarHref, calendarSelection, dateKey, formatDay, formatPeriod, movePeriod } from './calendar.js';
import { plannerRepository, workshopRepository } from './repository.js';
import { href } from './pages.js';
import { escapeHtml } from './views.js';

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
  const tasks = plannerRepository.tasksBetween(start, end);
  const checkIns = plannerRepository.checkInsBetween(start, end);
  const events = workshopRepository.eventsBetween(start, end);
  const cells = days.map(day => {
    const key = dateKey(day);
    const selected = key === dateKey(date);
    const today = key === dateKey();
    const taskCount = tasks.filter(task => task.date === key).length;
    const checked = checkIns.includes(key);
    const eventCount = events.filter(event => event.date === key).length;
    const details = [taskCount ? taskCount + ' 项待办' : '', checked ? '打卡' : '',
      eventCount ? eventCount + ' 场活动' : ''].filter(Boolean);
    const label = '<span class="day-number">' + day.getDate() + '</span>' +
      (details.length ? '<span class="day-indicators">' + details.map(detail => '<small>' + detail + '</small>').join('') + '</span>' : '');
    const className = 'calendar-day' + (mode === 'month' && day.getMonth() !== date.getMonth() ? ' other-month' : '') +
      (today ? ' is-today' : '');
    return dateLink(day, mode, label, from, ' class="' + className + '" aria-label="' + formatDay(day) +
      (details.length ? '，' + details.join('，') : '') + '"' + (selected ? ' aria-current="date"' : ''));
  }).join('');
  return '<div class="calendar-grid ' + mode + '" aria-label="' + (mode === 'month' ? '月历' : '周历') + '">' +
    weekdays.map(day => '<span class="weekday">周' + day + '</span>').join('') + cells + '</div>';
}

function agenda(date) {
  const key = dateKey(date);
  const tasks = plannerRepository.tasksBetween(key, key);
  const checked = plannerRepository.checkInsBetween(key, key).length > 0;
  const events = workshopRepository.eventsBetween(key, key);
  return '<section class="calendar-agenda"><div class="section-heading"><h2>' + formatDay(date) + ' · 当天事项</h2>' +
    '<button type="button" class="action-button" data-task-new="' + key + '">新建演示待办</button></div>' +
    (tasks.length ? '<ul class="agenda-list">' + tasks.map(task =>
      '<li><button type="button" data-task-edit="' + escapeHtml(task.id) + '"><strong>' + escapeHtml(task.title) +
      '</strong><span>' + (task.done ? '已完成' : '待处理') + '</span></button></li>').join('') + '</ul>' :
      (!checked && !events.length ? '<p>暂无安排。</p>' : '')) +
    (checked ? '<p class="habit-record">习惯 · 已打卡（演示）</p>' : '') +
    (events.length ? '<ul class="event-agenda">' + events.map(event => '<li><a href="' +
      href('workshop', 'projects', event.projectId, 'events', event.id) + '">' + escapeHtml(event.theme || event.title) +
      '</a><small>Workshop</small></li>').join('') + '</ul>' : '') + '</section>';
}

export function calendarView({ params }) {
  const { mode, date } = calendarSelection(params);
  const from = params.get('from');
  return '<p class="page-note">演示模式 · 刷新清除</p>' +
    '<div class="calendar-toolbar"><div class="segmented" aria-label="日历视图">' +
    modes.map(([key, label]) => dateLink(date, key, label, from, mode === key ? ' aria-current="page"' : '')).join('') +
    '</div><div class="calendar-controls">' +
    dateLink(movePeriod(date, mode, -1), mode, '‹', from, ' aria-label="上一时段"') +
    dateLink(new Date(), mode, '今天', from) + dateLink(movePeriod(date, mode, 1), mode, '›', from, ' aria-label="下一时段"') +
    '</div></div><h2 class="calendar-period">' + formatPeriod(date, mode) + '</h2>' +
    calendarGrid(date, mode, from) + agenda(date);
}

export function taskDialog() {
  return '<dialog class="task-dialog" aria-labelledby="task-dialog-title"><form data-task-form>' +
    '<h2 id="task-dialog-title">演示待办</h2><p>仅本次会话 · 刷新清除</p>' +
    '<input type="hidden" name="id"><label>标题<input required maxlength="120" name="title"></label>' +
    '<label>日期<input required type="date" name="date"></label><label class="check-label"><input type="checkbox" name="done">已完成</label>' +
    '<div class="widget-actions"><button type="button" class="action-button secondary" data-task-cancel>取消</button>' +
    '<button type="submit" class="action-button">应用到演示</button></div></form></dialog>';
}
