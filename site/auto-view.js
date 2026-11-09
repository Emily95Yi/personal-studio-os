import { calendarHref, dateKey, inQuotaPeriod, planReminderDates, todayDate } from './calendar.js';
import { escapeHtml } from './html.js';
import { icon } from './icons.js';
import { boardContentHref, boardSections, collectionItemAddress, explorationAddress, href, inboxAddress } from './pages.js';
import { plannerRepository, selfBoardIncludes, studioRepository } from './repository.js';
import { connection } from './private-api.js';
import { contentTitle, studioStore } from './studio-data.js';
import { entriesFor, explorationEntryTitle, itemsFor, topicsFor } from './board-library-data.js';
import { boardContent, boardSection } from './self-board-data.js';
import { canEdit, reviewLabel } from './apple-view.js';
import { reminderRows } from './reminder-view.js';

const kinds = { 'one-off': '单次', recurring: '重复规则', quota: '周期目标' };
const kindHelp = {
  'one-off': '在选择的日期提醒一次。',
  quota: '在每个周期的第一天提醒，按周期统计完成次数。',
};
const periods = { day: '日', week: '周', month: '月' };

function calendarLink(period, from) {
  return '<a class="header-icon" href="' + escapeHtml(calendarHref(todayDate(), period, from)) +
    '" aria-label="打开 Calendar" title="Calendar">' + icon('calendar', 17) + '</a>';
}

function sourceGroups() {
  const state = studioStore.state;
  const groups = new Map();
  const add = (group, record, url, title = contentTitle(record)) => {
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ record, title, url });
  };
  for (const record of studioRepository.list().filter(item => selfBoardIncludes(item))) {
    add(boardSections[boardSection(boardContent(record))].zh, record, boardContentHref(record.id));
  }
  for (const topic of topicsFor(state)) {
    add('个人探索', topic, explorationAddress(topic.id));
    for (const entry of entriesFor(state, topic.id)) {
      add('个人探索', entry, explorationAddress(topic.id) + '?' + new URLSearchParams({ entry: entry.id }),
        contentTitle(topic) + ' / ' + explorationEntryTitle(entry));
    }
  }
  for (const item of itemsFor(state)) add('生活收藏', item, collectionItemAddress(item.id));
  return groups;
}

export function originalSource(id) {
  if (!id) return null;
  for (const sources of sourceGroups().values()) {
    const source = sources.find(({ record }) => record.id === id);
    if (source) return source;
  }
  return null;
}

export function taskSourceLink(task) {
  const source = originalSource(task.sourceContentId);
  return source ? '<a class="task-source" href="' + escapeHtml(source.url) + '">' + escapeHtml(source.title) + '</a>' : '';
}

function planSummary(plan) {
  if (plan.kind === 'one-off') return kinds[plan.kind] + (plan.paused ? ' · 已暂停' : '');
  if (plan.paused) return kinds[plan.kind] + ' · 已暂停';
  const unit = plan.periodDays > 1 ? plan.periodDays + ' 日' : periods[plan.period];
  return plan.kind === 'quota' ? '周期目标 · 每' + unit + ' ' + plan.target + ' 次' :
    '重复规则 · 每 ' + plan.interval + ' ' + unit;
}

function quotaProgress(plan) {
  if (plan.kind !== 'quota') return '';
  const today = todayDate();
  const count = plannerRepository.completionsForPlan(plan.id).filter(item => inQuotaPeriod(item.date, plan, today)).length;
  return '<div class="quota-progress"><progress max="' + plan.target + '" value="' + Math.min(count, plan.target) +
    '" aria-label="本周期完成次数"></progress><small>' + count + ' / ' + plan.target + ' 次</small></div>';
}

function planCards(plans) {
  return plans.length ? '<div class="auto-plans">' + plans.map(plan =>
    '<a class="auto-plan-card" href="' + href('self-board', 'auto', plan.id) + '"><strong>' +
    escapeHtml(plan.title) + '</strong><small>' + planSummary(plan) + '</small>' + quotaProgress(plan) +
    '</a>').join('') + '</div>' : '<p class="subtle">暂无计划。</p>';
}

function taskRows(tasks, allowSkip = false) {
  if (!tasks.length) return '<p class="subtle">暂无安排。</p>';
  return '<ul class="auto-task-list">' + tasks.slice().sort((a, b) => a.date.localeCompare(b.date)).map(task =>
    '<li>' + (task.skipped ? '<span class="task-skipped">已跳过</span>' :
      '<input type="checkbox" data-task-check="' + task.id + '" aria-label="完成 ' + escapeHtml(task.title) + '"' +
      (task.done ? ' checked' : '') + '>') +
    '<button class="task-title" type="button" data-task-edit="' + task.id + '">' +
    '<strong>' + escapeHtml(task.title) + '</strong><small>' + escapeHtml([task.date.slice(5), reviewLabel(task)].filter(Boolean).join(' · ')) + '</small></button>' +
    (allowSkip && !task.done && !(task.skipped && plannerRepository.getPlan(task.planId)?.kind === 'one-off' &&
      tasks.some(item => !item.skipped && item.planId === task.planId)) ? '<button type="button" class="text-action" data-task-skip="' + task.id + '">' +
      (task.skipped ? '恢复' : '跳过') + '</button>' : '') + taskSourceLink(task) + '</li>').join('') + '</ul>';
}

export function autoView() {
  return '<div class="section-heading auto-toolbar"><span class="subtle">' +
    (connection.mode === 'preview' ? '本机预览 · 刷新清除' : connection.mode === 'private' ? '' :
      connection.mode === 'loading' ? '正在连接私有工作台…' : '私有服务不可用') +
    '</span><div class="planner-actions">' +
    (canEdit() ? '<button class="action-button" type="button" data-plan-new>新建计划</button>' : '') + calendarLink('week', 'auto') + '</div></div>' +
    '<section class="auto-section"><h2>计划</h2>' + planCards(plannerRepository.listPlans()) + '</section>' +
    '<section class="auto-section"><h2>单次安排</h2>' + taskRows(plannerRepository.standaloneTasks(), true) + '</section>';
}

function resourceLinks(plan) {
  const sources = plan.sourceIds.map(originalSource).filter(Boolean);
  if (plan.inboxId) sources.push({ title: 'Inbox 原文', url: inboxAddress(plan.inboxId) });
  const links = sources.map(({ title, url }) =>
    '<li><a class="return-link" href="' + escapeHtml(url) + '">' + escapeHtml(title) + '</a></li>');
  return links.length ? '<ul class="auto-resources">' + links.join('') + '</ul>' : '<p class="subtle">暂无关联资源。</p>';
}

export function autoPlanView({ plan }) {
  const tasks = plannerRepository.tasksForPlan(plan.id);
  const records = plannerRepository.completionsForPlan(plan.id);
  const canSchedule = !plan.paused && (plan.kind !== 'one-off' || !tasks.some(task => !task.skipped));
  const reminderDates = planReminderDates(plan, plan.kind === 'one-off' ? plan.startDate : dateKey(), undefined, 5);
  const completionActions = plan.kind === 'one-off' ? '' : '<div class="widget-actions">' +
    (!plan.paused ? '<button class="action-button secondary" type="button" data-plan-log="' + plan.id + '">记录一次</button>' : '') +
    (records.some(item => !item.taskId) ? '<button class="text-action" type="button" data-plan-undo="' + plan.id + '">撤销最近手动记录</button>' : '') +
    '</div>';
  return '<div class="section-heading auto-toolbar"><span class="subtle">' + planSummary(plan) +
    (connection.mode === 'preview' ? ' · 本机预览' : '') + '</span><div class="planner-actions"><button class="action-button secondary" type="button" data-plan-edit="' +
    plan.id + '">编辑计划</button><button class="action-button secondary" type="button" data-plan-pause="' + plan.id + '">' +
    (plan.paused ? '恢复计划' : '暂停计划') + '</button></div></div>' +
    '<section class="auto-section"><h2>提醒</h2>' +
    (reminderDates.length ? '<ul class="agenda-list">' + reminderRows(reminderDates.map(date => ({
      planId: plan.id, title: plan.title, date,
    })), true) + '</ul>' : '<p class="subtle">暂无提醒。</p>') + '</section>' +
    '<section class="auto-section"><div class="section-heading"><h2>待办</h2>' +
    (canSchedule ? '<button class="action-button" type="button" data-plan-schedule="' + plan.id + '">安排日期</button>' : '') +
    '</div>' + taskRows(tasks, true) + '</section>' +
    '<section class="auto-section"><h2>完成记录</h2>' + quotaProgress(plan) +
    (records.length ? '<ul class="auto-resources">' + records.slice().reverse().map(item => '<li>' +
      escapeHtml(item.date) + (item.taskId ? ' · 安排完成' : ' · 手动记录') + '</li>').join('') + '</ul>' :
      '<p class="subtle">暂无完成记录。</p>') + completionActions + '</section>' +
    '<section class="auto-section"><h2>关联资源</h2>' + resourceLinks(plan) + '</section>' +
    (plan.reminder ? '<p class="subtle">备注 · ' + escapeHtml(plan.reminder) + '</p>' : '');
}

export function planDialog() {
  const action = (label, glyph, attrs) => '<button class="header-icon capture-page-icon" aria-label="' + label +
    '" title="' + label + '" ' + attrs + '>' + icon(glyph, 18) + '</button>';
  const dayInput = (label, name, field) => '<label ' + field + ' hidden>' + label +
    '<span class="plan-unit-input"><input required type="number" min="1" step="1" name="' + name +
    '" value="1"><span data-plan-unit>日</span></span></label>';
  return '<dialog class="task-dialog plan-dialog" aria-labelledby="plan-dialog-title"><form data-plan-form>' +
    '<div class="plan-dialog-heading"><h2 id="plan-dialog-title">新建计划</h2><div class="header-actions">' +
    action('取消', 'remove', 'type="button" data-dialog-cancel') + action('保存计划', 'check', 'type="submit"') + '</div></div>' +
    '<p data-plan-preview hidden>本机预览 · 刷新清除</p><input type="hidden" name="id">' +
    '<label>名称<input required maxlength="120" name="title"></label><label>类型<select name="kind">' +
    Object.entries(kinds).map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join('') +
    '</select></label><p data-plan-kind-help hidden></p>' +
    '<label data-plan-start>首次提醒日期<input required type="date" name="startDate"></label>' +
    dayInput('间隔数', 'interval', 'data-frequency') + dayInput('周期长度', 'periodDays', 'data-quota-days') +
    '<label data-quota hidden>每周期目标次数<input required type="number" min="1" max="999" name="target" value="1"></label>' +
    '<label>备注<input name="reminder" maxlength="100"></label>' +
    '<label class="check-label" data-plan-sync><input type="checkbox" name="syncInbox">同步Inbox</label>' +
    '<p data-form-error role="alert" hidden></p></form></dialog>';
}

export const planKindHelp = kind => kindHelp[kind] ?? '';
export const planPeriodLabel = period => periods[period];
