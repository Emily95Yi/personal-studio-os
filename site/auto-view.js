import { calendarHref, dateKey, periodBounds, todayDate } from './calendar.js';
import { escapeHtml } from './html.js';
import { icon } from './icons.js';
import { href } from './pages.js';
import { plannerRepository, selfBoardIncludes, studioRepository } from './repository.js';
import { connection } from './private-api.js';
import { canEdit, reviewLabel } from './apple-view.js';

const kinds = { 'one-off': 'One-off', recurring: 'Recurring', quota: 'Quota' };
const periods = { day: '日', week: '周', month: '月' };

function calendarLink(period, from) {
  return '<a class="header-icon" href="' + escapeHtml(calendarHref(todayDate(), period, from)) +
    '" aria-label="打开 Calendar" title="Calendar">' + icon('calendar', 17) + '</a>';
}

export function originalSource(id) {
  const record = studioRepository.get(id);
  if (!record || !['discover', 'experience'].some(view => selfBoardIncludes(record, view))) return null;
  const view = selfBoardIncludes(record, 'discover') ? 'discover' : 'experience';
  return { record, url: href('self-board', view, record.id) };
}

export function taskSourceLink(task) {
  const source = originalSource(task.sourceContentId);
  return source ? '<a class="task-source" href="' + source.url + '">' + escapeHtml(source.record.title) + '</a>' : '';
}

function planSummary(plan) {
  if (plan.kind === 'one-off') return plan.paused ? 'One-off · 已暂停' : 'One-off';
  if (plan.paused) return kinds[plan.kind] + ' · 已暂停';
  const unit = periods[plan.period];
  return plan.kind === 'quota' ? '每' + unit + ' ' + plan.target + ' 次' :
    '每 ' + plan.interval + ' ' + unit;
}

function quotaProgress(plan) {
  if (plan.kind !== 'quota') return '';
  const [start, end] = periodBounds(todayDate(), plan.period).map(dateKey);
  const count = plannerRepository.completionsForPlan(plan.id).filter(item => item.date >= start && item.date <= end).length;
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

export function autoWidget(period = 'week') {
  const [start, end] = periodBounds(todayDate(), period).map(dateKey);
  const plans = plannerRepository.listPlans();
  const dated = plannerRepository.tasksBetween(start, end);
  return '<section class="widget widget-auto"><div class="section-heading"><h2><a href="' + href('self-board', 'auto') +
    '">Auto</a></h2><div class="planner-actions"><div class="segmented" aria-label="Auto 摘要周期">' +
    [['week', '本周'], ['month', '本月']].map(([mode, label]) => '<button type="button" data-period="' +
      mode + '" aria-pressed="' + (period === mode) + '">' + label + '</button>').join('') + '</div>' +
    calendarLink('week', 'self-board') + '</div></div>' +
    taskRows(dated.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4)) +
    (plans.length ? '<div class="auto-recent"><h3>最近计划</h3>' + planCards(plans.slice(0, 3)) + '</div>' : '') +
    '</section>';
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
  const links = plan.sourceIds.map(originalSource).filter(Boolean).map(({ record, url }) =>
    '<li><a class="return-link" href="' + url + '">' + escapeHtml(record.title) + '</a></li>');
  return links.length ? '<ul class="auto-resources">' + links.join('') + '</ul>' : '<p class="subtle">暂无关联资源。</p>';
}

export function autoPlanView({ plan }) {
  const tasks = plannerRepository.tasksForPlan(plan.id);
  const records = plannerRepository.completionsForPlan(plan.id);
  const canSchedule = !plan.paused && (plan.kind !== 'one-off' || !tasks.some(task => !task.skipped));
  const completionActions = plan.kind === 'one-off' ? '' : '<div class="widget-actions">' +
    (!plan.paused ? '<button class="action-button secondary" type="button" data-plan-log="' + plan.id + '">记录一次</button>' : '') +
    (records.some(item => !item.taskId) ? '<button class="text-action" type="button" data-plan-undo="' + plan.id + '">撤销最近手动记录</button>' : '') +
    '</div>';
  return '<div class="section-heading auto-toolbar"><span class="subtle">' + planSummary(plan) +
    (connection.mode === 'preview' ? ' · 本机预览' : '') + '</span><div class="planner-actions"><button class="action-button secondary" type="button" data-plan-edit="' +
    plan.id + '">编辑计划</button><button class="action-button secondary" type="button" data-plan-pause="' + plan.id + '">' +
    (plan.paused ? '恢复计划' : '暂停计划') + '</button></div></div>' +
    '<section class="auto-section"><div class="section-heading"><h2>安排</h2>' +
    (canSchedule ? '<button class="action-button" type="button" data-plan-schedule="' + plan.id + '">安排日期</button>' : '') +
    '</div>' + taskRows(tasks, true) + '</section>' +
    '<section class="auto-section"><h2>完成记录</h2>' + quotaProgress(plan) +
    (records.length ? '<ul class="auto-resources">' + records.slice().reverse().map(item => '<li>' +
      escapeHtml(item.date) + (item.taskId ? ' · 安排完成' : ' · 手动记录') + '</li>').join('') + '</ul>' :
      '<p class="subtle">暂无完成记录。</p>') + completionActions + '</section>' +
    '<section class="auto-section"><h2>关联资源</h2>' + resourceLinks(plan) + '</section>' +
    (plan.reminder ? '<p class="subtle">提醒偏好 · ' + escapeHtml(plan.reminder) + '</p>' : '');
}

export function planDialog() {
  const sources = studioRepository.list({ domain: 'Self-Board' }).filter(item =>
    selfBoardIncludes(item, 'discover') || selfBoardIncludes(item, 'experience'));
  return '<dialog class="task-dialog plan-dialog" aria-labelledby="plan-dialog-title"><form data-plan-form>' +
    '<h2 id="plan-dialog-title">新建计划</h2>' + (connection.mode === 'preview' ? '<p>本机预览 · 刷新清除</p>' : '') + '<input type="hidden" name="id">' +
    '<label>名称<input required maxlength="120" name="title"></label><label>类型<select name="kind">' +
    Object.entries(kinds).map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join('') +
    '</select></label><label data-rule hidden>周期<select name="period">' +
    Object.entries(periods).map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join('') +
    '</select></label><label data-frequency hidden>间隔周期数<input required type="number" min="1" max="999" name="interval" value="1"></label>' +
    '<label data-quota hidden>每周期目标次数<input required type="number" min="1" max="999" name="target" value="1"></label>' +
    '<label>提醒偏好（可选）<input name="reminder" maxlength="100" placeholder="仅记录偏好"></label>' +
    (sources.length ? '<fieldset><legend>关联原始资料</legend>' + sources.map(item => '<label class="check-label">' +
      '<input type="checkbox" name="sourceId" value="' + escapeHtml(item.id) + '">' + escapeHtml(item.title) + '</label>').join('') +
      '</fieldset>' : '<p>暂无可关联资料。</p>') +
    '<p data-form-error role="alert" hidden></p><div class="widget-actions"><button type="button" class="action-button secondary" data-dialog-cancel>取消</button>' +
    '<button type="submit" class="action-button">保存计划</button></div></form></dialog>';
}
