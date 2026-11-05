import { calendarDays, calendarHref, calendarSelection, dateKey, formatDay, formatPeriod, movePeriod } from './calendar.js';
import { plannerRepository } from './repository.js';
import { escapeHtml } from './views.js';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const modes = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];

function dateLink(date, mode, label, attributes = '') {
  return '<a href="' + escapeHtml(calendarHref(date, mode)) + '"' + attributes + '>' + label + '</a>';
}

function calendarGrid(date, mode) {
  if (mode === 'day') return '';
  const days = calendarDays(date, mode);
  const start = dateKey(days[0]);
  const end = dateKey(days.at(-1));
  const tasks = plannerRepository.tasksBetween(start, end);
  const checkIns = plannerRepository.checkInsBetween(start, end);
  const cells = days.map(day => {
    const key = dateKey(day);
    const selected = key === dateKey(date);
    const today = key === dateKey();
    const taskCount = tasks.filter(task => task.date === key).length;
    const checked = checkIns.includes(key);
    const details = [taskCount ? taskCount + ' 项待办' : '', checked ? '习惯打卡' : ''].filter(Boolean);
    const label = '<span class="day-number">' + day.getDate() + '</span>' +
      (details.length ? '<span class="day-indicators">' + details.map(detail => '<small>' + detail + '</small>').join('') + '</span>' : '');
    const className = 'calendar-day' + (mode === 'month' && day.getMonth() !== date.getMonth() ? ' other-month' : '') +
      (today ? ' is-today' : '');
    return dateLink(day, mode, label, ' class="' + className + '" aria-label="' + formatDay(day) +
      (details.length ? '，' + details.join('，') : '') + '"' + (selected ? ' aria-current="date"' : ''));
  }).join('');
  return '<div class="calendar-grid ' + mode + '" aria-label="' + (mode === 'month' ? '月历' : '周历') + '">' +
    weekdays.map(day => '<span class="weekday">周' + day + '</span>').join('') + cells + '</div>';
}

function agenda(date) {
  const key = dateKey(date);
  const tasks = plannerRepository.tasksBetween(key, key);
  const checked = plannerRepository.checkInsBetween(key, key).length > 0;
  return '<section class="calendar-agenda"><div class="section-heading"><h2>' + formatDay(date) + ' · 当天事项</h2>' +
    '<button type="button" class="action-button" data-task-new="' + key + '">新建演示待办</button></div>' +
    (tasks.length ? '<ul class="agenda-list">' + tasks.map(task =>
      '<li><button type="button" data-task-edit="' + escapeHtml(task.id) + '"><strong>' + escapeHtml(task.title) +
      '</strong><span>' + (task.done ? '已完成' : '待处理') + ' · 编辑</span></button></li>').join('') + '</ul>' :
      '<p>当天暂无待办。</p>') +
    (checked ? '<p class="habit-record">习惯 · 已打卡（演示）</p>' : '') + '</section>';
}

export function calendarView({ params }) {
  const { mode, date } = calendarSelection(params);
  return '<p class="page-note">演示待办和打卡只在当前页面会话中保留，刷新后清除。</p>' +
    '<div class="calendar-toolbar"><div class="segmented" aria-label="日历视图">' +
    modes.map(([key, label]) => dateLink(date, key, label, mode === key ? ' aria-current="page"' : '')).join('') +
    '</div><div class="calendar-controls">' +
    dateLink(movePeriod(date, mode, -1), mode, '‹', ' aria-label="上一时段"') +
    dateLink(new Date(), mode, '今天') + dateLink(movePeriod(date, mode, 1), mode, '›', ' aria-label="下一时段"') +
    '</div></div><h2 class="calendar-period">' + formatPeriod(date, mode) + '</h2>' +
    calendarGrid(date, mode) + agenda(date) +
    '<dialog class="task-dialog" aria-labelledby="task-dialog-title"><form data-task-form>' +
    '<h2 id="task-dialog-title">演示待办</h2><p>改动会同步显示在本页的 To-Do 摘要，刷新后清除。</p>' +
    '<input type="hidden" name="id"><label>标题<input required maxlength="120" name="title"></label>' +
    '<label>日期<input required type="date" name="date"></label><label class="check-label"><input type="checkbox" name="done">已完成</label>' +
    '<div class="widget-actions"><button type="button" class="action-button secondary" data-task-cancel>取消</button>' +
    '<button type="submit" class="action-button">应用到演示</button></div></form></dialog>';
}
