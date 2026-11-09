import { escapeHtml as esc } from './html.js';
import { icon } from './icons.js';

export function reminderRows(reminders, showDate = false) {
  return reminders.map(reminder =>
    '<li><button type="button" data-auto-reminder="' + esc(reminder.planId) +
    '" data-reminder-date="' + esc(reminder.date) + '"><strong>' + esc(reminder.title) +
    '</strong><span>' + (showDate ? esc(reminder.date) : 'Auto') + '</span></button></li>').join('');
}

export function reminderDialog() {
  return '<dialog class="task-dialog reminder-dialog" data-reminder-dialog aria-labelledby="reminder-title">' +
    '<div class="plan-dialog-heading"><h2 id="reminder-title">提醒</h2><div class="header-actions">' +
    '<button type="button" class="header-icon calendar-icon" data-reminder-calendar hidden></button>' +
    '<button type="button" class="header-icon calendar-icon" data-dialog-cancel aria-label="关闭" title="关闭">' +
    icon('remove', 19) + '</button></div></div><strong data-reminder-title></strong><p data-reminder-date-label></p>' +
    '<p data-reminder-notes hidden></p><p data-reminder-status hidden></p><a class="return-link" data-reminder-plan>查看 Auto 计划</a></dialog>';
}
