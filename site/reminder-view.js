import { escapeHtml as esc } from './html.js';
import { icon } from './icons.js';
import { canEdit } from './apple-view.js';

export function reminderRows(reminders) {
  return reminders.map(reminder =>
    '<li class="agenda-entry"><button type="button" data-auto-reminder="' + esc(reminder.planId) +
    '" data-reminder-date="' + esc(reminder.date) + '"><strong>' + esc(reminder.title) +
    '</strong></button>' + (canEdit() ?
      '<button type="button" class="header-icon calendar-icon agenda-calendar-arrow" data-reminder-calendar="' + esc(reminder.planId) +
      '" data-reminder-date="' + esc(reminder.date) + '" aria-label="添加日程到 YiStudio 日历" title="添加日程到 YiStudio 日历">' +
      icon('arrow', 17) + '</button>' : '') + '</li>').join('');
}

export function reminderDialog() {
  return '<dialog class="task-dialog reminder-dialog" data-reminder-dialog aria-labelledby="reminder-title">' +
    '<div class="plan-dialog-heading"><h2 id="reminder-title">提醒</h2><div class="header-actions">' +
    '<button type="button" class="header-icon calendar-icon" data-reminder-calendar aria-label="添加日程到 YiStudio 日历" title="添加日程到 YiStudio 日历">' +
    icon('calendarAdd', 19) + '</button>' +
    '<button type="button" class="header-icon calendar-icon" data-reminder-defer aria-label="延后提醒" title="延后提醒" aria-expanded="false">' +
    icon('clock', 19) + '</button>' +
    '<button type="button" class="header-icon calendar-icon" data-reminder-delete aria-label="删除当次提醒" title="删除当次提醒">' +
    icon('trash', 19) + '</button>' +
    '<button type="button" class="header-icon calendar-icon" data-dialog-cancel aria-label="关闭" title="关闭">' +
    icon('remove', 19) + '</button></div></div><strong data-reminder-title></strong>' +
    '<p data-reminder-notes hidden></p><form class="reminder-defer-form" data-reminder-defer-form hidden>' +
    '<label>延后天数<span class="plan-unit-input"><input name="days" type="number" min="1" step="1" value="1" required><span>日</span></span></label>' +
    '<button type="submit" class="header-icon calendar-icon" aria-label="确认延后" title="确认延后">' +
    icon('check', 19) + '</button><p data-form-error role="alert" hidden>请输入有效的延后天数。</p></form>' +
    '<a class="return-link" data-reminder-plan>查看 Auto 计划</a></dialog>';
}
