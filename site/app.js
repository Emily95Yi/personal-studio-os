import { href, publicHref, readRoute } from './pages.js';
import {
  collectionView, contentDetail, eventDetail, landing, missingView, projectOverview,
  projectSection, publicView, searchView, workshopGallery, workspaceOverview,
} from './views.js';
import { icon } from './icons.js';
import { escapeHtml } from './html.js';
import { autoPlanView, autoWidget, originalSource, planDialog } from './auto-view.js';
import { plannerRepository, studioRepository } from './repository.js';
import { calendarHref, calendarSelection, dateKey, movePeriod, parseDate, todayDate } from './calendar.js';
import { calendarView, homeWeekWidget, taskDialog } from './planner-view.js';
import { allCalendarEvents, canEdit, eventDialog, reviewDialog, settingsView, showEvent, statusBanner } from './apple-view.js';
import { connection, loadFeed, loadPlanner, onPrivateChange } from './private-api.js';
import { initAppleActions } from './apple-actions.js';

const app = document.querySelector('#app');
let period = 'week';
let homeWeek = todayDate();

function pageContext(route) {
  const ancestors = [[href(), '首页']];
  if (route.workspace) ancestors.push([href(route.workspaceId), route.workspace.label]);
  if (route.collection && !route.projectPath) {
    ancestors.push([href(route.workspaceId, route.collectionId), route.collection.label]);
  }
  if (route.projectPath) ancestors.push([href(...route.projectPath), route.projectLabel]);
  if (route.sectionPath && route.type !== 'event') ancestors.push([href(...route.sectionPath), route.section.label]);
  if (route.brand) ancestors.push([publicHref(route.brandId), route.brand.label]);

  const isAncestorTitle = ['overview', 'workshop-gallery', 'collection', 'project', 'project-section'].includes(route.type) ||
    (route.type === 'public' && route.pageId === 'home');
  const title = isAncestorTitle ? ancestors.pop()[1] :
    route.eventLabel ?? route.record?.title ?? route.page?.label ??
    { home: '奕Studio', calendar: 'Calendar', settings: 'Settings', search: 'Search', missing: '页面未找到' }[route.type];
  return { title, ancestors };
}

function header(route, { title, ancestors }) {
  const [address, label] = route.parent ? [route.parent, route.parentLabel] : ancestors.at(-1);
  const home = route.type === 'home';
  const start = home ? '<h1 class="home-brand" aria-label="奕Studio"><span lang="zh-Hans" class="brand-yi">奕</span>' +
    '<span lang="en" class="brand-studio">Studio</span></h1>' :
    '<a class="header-icon back-link" href="' + address + '" aria-label="返回 ' + escapeHtml(label) +
    '" title="返回 ' + escapeHtml(label) + '">' + icon('back', 19) + '</a><h1>' + escapeHtml(title) + '</h1>';
  const calendar = route.type === 'auto-plan' ? '<a class="header-icon" href="' +
    escapeHtml(calendarHref(todayDate(), 'week', 'auto')) +
    '" aria-label="打开 Calendar" title="Calendar">' + icon('calendar', 18) + '</a>' : '';
  const search = route.type === 'search' ? '' : '<a class="header-icon" href="' + href('search') +
    '" aria-label="搜索" title="搜索">' + icon('search', 18) + '</a>';
  return '<header class="studio-top"><div class="masthead">' + start + '<div class="header-actions">' + calendar + search +
    '</div></div>' + (home ? '<div class="home-week-shell">' + homeWeekWidget(homeWeek) + '</div>' : '') + '</header>';
}

function publicNav(route) {
  if (route.type !== 'public') return '';
  return '<nav class="public-nav" aria-label="品牌页面">' + Object.entries(route.brand.pages).map(([id, page]) =>
    '<a href="' + publicHref(route.brandId, id) + '"' + (route.pageId === id ? ' aria-current="page"' : '') + '>' +
    page.label + '</a>').join('') + '</nav>';
}

const views = {
  home: landing,
  overview: workspaceOverview,
  'workshop-gallery': workshopGallery,
  'content-detail': contentDetail,
  'auto-plan': autoPlanView,
  calendar: calendarView,
  settings: settingsView,
  collection: collectionView,
  project: projectOverview,
  'project-section': projectSection,
  event: eventDetail,
  public: publicView,
  search: searchView,
  missing: missingView,
};

function render({ focus = false } = {}) {
  let route = readRoute(location.hash);
  if (route.redirect) {
    history.replaceState(null, '', route.redirect);
    route = readRoute(location.hash);
  }
  const context = pageContext(route);
  const canEditTasks = route.type === 'calendar' ||
    (route.workspaceId === 'self-board' && (route.type === 'overview' || route.collectionId === 'auto'));
  const canEditPlans = route.collectionId === 'auto';
  const isPlannerPage = canEditTasks || route.type === 'home';
  document.title = context.title;
  app.dataset.space = route.type === 'public' ? 'public' : 'private';
  app.innerHTML = '<a class="skip" href="#main">跳到内容</a>' + header(route, context) +
    '<main id="main" class="page-main" tabindex="-1"' +
    (route.type === 'home' ? '' : ' aria-label="' + escapeHtml(context.title) + '"') + '>' + publicNav(route) +
    (isPlannerPage ? '<div data-private-status>' + statusBanner() + '</div>' : '') +
    views[route.type]({ ...route, period }) + '</main>' +
    (canEditTasks ? taskDialog() + reviewDialog() + eventDialog() : '') + (canEditPlans ? planDialog() : '');
  if (focus) app.querySelector('main').focus({ preventScroll: true });
}

app.addEventListener('click', event => {
  if (event.target.closest('.skip')) {
    event.preventDefault();
    app.querySelector('main').focus();
    return;
  }
  const calendarLink = event.target.closest('[data-calendar-nav]');
  if (calendarLink && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    const address = calendarLink.getAttribute('href');
    history.replaceState(history.state, '', address);
    app.querySelector('main').innerHTML = '<div data-private-status>' + statusBanner() + '</div>' + calendarView(readRoute(location.hash));
    const next = [...app.querySelectorAll('[data-calendar-nav]')].find(link => link.getAttribute('href') === address &&
      (link.getAttribute('aria-current') || link.getAttribute('aria-label') === calendarLink.getAttribute('aria-label')));
    (next ?? app.querySelector('main')).focus({ preventScroll: true });
    return;
  }
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.homeWeek) {
    const direction = button.dataset.homeWeek;
    homeWeek = direction === 'today' ? todayDate() : movePeriod(homeWeek, 'week', direction === 'next' ? 1 : -1);
    app.querySelector('.home-week').outerHTML = homeWeekWidget(homeWeek);
    app.querySelector('[data-home-week="' + direction + '"]').focus({ preventScroll: true });
  }
  if (button.dataset.period) {
    period = button.dataset.period;
    button.closest('.widget-auto').outerHTML = autoWidget(period);
    app.querySelector('[data-period="' + period + '"]').focus({ preventScroll: true });
  }
  if (button.hasAttribute('data-dialog-cancel')) button.closest('dialog').close();
  if (!canEdit()) return;
  if (button.dataset.taskNew || button.dataset.taskEdit || button.dataset.planSchedule) openTaskDialog(button);
  if (button.hasAttribute('data-plan-new') || button.dataset.planEdit) openPlanDialog(button.dataset.planEdit);
  if (button.dataset.planPause) {
    plannerRepository.togglePause(button.dataset.planPause);
    refreshFocus('[data-plan-pause]');
  }
  if (button.dataset.planLog) {
    plannerRepository.recordCompletion(button.dataset.planLog, dateKey());
    refreshFocus('[data-plan-log]');
  }
  if (button.dataset.planUndo) {
    plannerRepository.undoCompletion(button.dataset.planUndo);
    refreshFocus('[data-plan-undo], [data-plan-log]');
  }
  if (button.dataset.taskSkip) {
    plannerRepository.toggleSkip(button.dataset.taskSkip);
    refreshFocus('[data-task-skip="' + button.dataset.taskSkip + '"]');
  }
});

function refreshFocus(selector) {
  render();
  (app.querySelector(selector) ?? app.querySelector('main')).focus({ preventScroll: true });
}

function openTaskDialog(button) {
  const task = button.dataset.taskEdit ? plannerRepository.getTask(button.dataset.taskEdit) : null;
  if (button.dataset.taskEdit && !task) return;
  const plan = button.dataset.planSchedule ? plannerRepository.getPlan(button.dataset.planSchedule) : null;
  const dialog = app.querySelector('.task-dialog');
  const form = dialog.querySelector('form');
  dialog.querySelector('h2').textContent = task ? '编辑安排' : plan ? '安排日期' : '新建待办';
  form.elements.id.value = task?.id ?? '';
  form.elements.planId.value = task?.planId ?? plan?.id ?? '';
  form.elements.title.value = task?.title ?? plan?.title ?? '';
  form.elements.date.value = task?.date ?? button.dataset.taskNew ?? dateKey();
  const sources = [...new Set([...(plannerRepository.getPlan(form.elements.planId.value)?.sourceIds ?? []),
    task?.sourceContentId].filter(Boolean))].map(originalSource).filter(Boolean);
  const sourceField = form.elements.sourceContentId;
  sourceField.replaceChildren(new Option('不指定', ''), ...sources.map(({ record }) => new Option(record.title, record.id)));
  sourceField.value = task?.sourceContentId ?? '';
  sourceField.disabled = !sources.length;
  form.querySelector('[data-task-source]').hidden = !sources.length;
  form.elements.done.checked = task?.done ?? false;
  form.elements.done.disabled = Boolean(task?.skipped);
  form.elements.title.setCustomValidity('');
  form.querySelector('[data-form-error]').hidden = true;
  const review = form.querySelector('[data-task-review]');
  const confirmed = task && plannerRepository.getReview(task.id);
  const scheduled = task && plannerRepository.eventForTask(task.id);
  review.hidden = !task || task.skipped;
  review.textContent = scheduled ? '查看日历安排' : confirmed ? '重新 Review' : 'Review';
  dialog.showModal();
  (plan ? form.elements.date : form.elements.title).focus();
}

function updatePlanFields(form) {
  const kind = form.elements.kind.value;
  for (const [selector, show] of [['[data-rule]', kind !== 'one-off'], ['[data-frequency]', kind === 'recurring'],
    ['[data-quota]', kind === 'quota']]) {
    const field = form.querySelector(selector);
    field.hidden = !show;
    field.querySelector('input, select').disabled = !show;
  }
}

function openPlanDialog(id) {
  const plan = id ? plannerRepository.getPlan(id) : null;
  if (id && !plan) return;
  const dialog = app.querySelector('.plan-dialog');
  const form = dialog.querySelector('form');
  form.reset();
  dialog.querySelector('h2').textContent = plan ? '编辑计划' : '新建计划';
  form.elements.id.value = plan?.id ?? '';
  form.elements.title.value = plan?.title ?? '';
  form.elements.kind.value = plan?.kind ?? 'one-off';
  form.elements.period.value = plan?.period ?? 'month';
  form.elements.interval.value = plan?.interval ?? 1;
  form.elements.target.value = plan?.target ?? 1;
  form.elements.reminder.value = plan?.reminder ?? '';
  form.querySelectorAll('[name="sourceId"]').forEach(field => { field.checked = plan?.sourceIds.includes(field.value) ?? false; });
  form.elements.title.setCustomValidity('');
  form.querySelector('[data-form-error]').hidden = true;
  updatePlanFields(form);
  dialog.showModal();
  form.elements.title.focus();
}

app.addEventListener('change', event => {
  const field = event.target;
  if (field.name === 'kind' && field.form?.matches('[data-plan-form]')) updatePlanFields(field.form);
  if (!canEdit() || !field.dataset.taskCheck) return;
  const task = plannerRepository.getTask(field.dataset.taskCheck);
  if (!task) return;
  plannerRepository.saveTask({ ...task, done: field.checked, completedOn: dateKey() });
  refreshFocus('[data-task-check="' + task.id + '"]');
});

app.addEventListener('submit', event => {
  if (event.target.matches('.search-form')) {
    event.preventDefault();
    return;
  }
  const form = event.target;
  const planForm = form.matches('[data-plan-form]');
  if (!planForm && !form.matches('[data-task-form]')) return;
  if (!canEdit()) { event.preventDefault(); return; }
  event.preventDefault();
  const title = form.elements.title.value.trim();
  if (!title) {
    form.elements.title.setCustomValidity('请输入名称。');
    form.elements.title.reportValidity();
    return;
  }
  const error = form.querySelector('[data-form-error]');
  if (planForm) {
    const plan = plannerRepository.savePlan({
      id: form.elements.id.value || undefined, title, kind: form.elements.kind.value,
      period: form.elements.period.value, interval: Number(form.elements.interval.value),
      target: Number(form.elements.target.value), reminder: form.elements.reminder.value.trim(),
      sourceIds: new FormData(form).getAll('sourceId'),
    });
    if (!plan) {
      error.textContent = '无法保存。请检查计划类型和已有安排。';
      error.hidden = false;
      return;
    }
    form.closest('dialog').close();
    const address = href('self-board', 'auto', plan.id);
    if (location.hash !== address) location.hash = address;
    else refreshFocus('[data-plan-edit]');
    return;
  }
  const date = parseDate(form.elements.date.value);
  if (!date) return;
  const saved = plannerRepository.saveTask({
    id: form.elements.id.value || undefined, planId: form.elements.planId.value || undefined,
    title, date: dateKey(date), done: form.elements.done.checked, completedOn: dateKey(),
    sourceContentId: form.elements.sourceContentId.disabled ? undefined : form.elements.sourceContentId.value,
  });
  if (!saved) {
    error.textContent = '无法保存。请检查计划是否已暂停，或是否已有单次安排。';
    error.hidden = false;
    return;
  }
  form.closest('dialog').close();
  const route = readRoute(location.hash);
  if (route.type === 'calendar') {
    const { mode, date: selected } = calendarSelection(route.params);
    if (dateKey(selected) !== saved.date) {
      history.replaceState(history.state, '', calendarHref(date, mode, route.params.get('from')));
    }
  }
  render();
  (app.querySelector('[data-task-edit="' + saved.id + '"]') ??
    app.querySelector('[data-period="' + period + '"]') ?? app.querySelector('main')).focus({ preventScroll: true });
});

app.addEventListener('input', event => {
  if (event.target.name === 'title' && event.target.form?.matches('[data-task-form], [data-plan-form]')) event.target.setCustomValidity('');
  if (event.target.id !== 'studio-query') return;
  const query = event.target.value.trim();
  const matches = query ? studioRepository.list({ query }) : [];
  const results = app.querySelector('.search-results');
  const emptyTitle = app.querySelector('.search-status');
  const hasContent = matches.length > 0 || studioRepository.list().length > 0;
  emptyTitle.textContent = matches.length ? '搜索结果' : hasContent && query ? '没有匹配的内容' : '还没有可搜索的内容';
  results.hidden = matches.length === 0;
  results.replaceChildren(...matches.map(item => {
    const row = document.createElement('li');
    row.textContent = item.title;
    return row;
  }));
});

let initialized = false;
let lastMode = connection.mode;
let lastFeed = connection.feed;
let lastSave = connection.save;

function isCalendarSurface(route) { return ['home', 'calendar', 'settings'].includes(route.type); }

function enterPrivateSurface() {
  const route = readRoute(location.hash);
  if (route.type === 'public') return;
  if (!initialized) {
    initialized = true;
    void loadPlanner().then(() => {
      if (isCalendarSurface(readRoute(location.hash))) void loadFeed();
    });
  } else if (isCalendarSurface(route)) void loadFeed();
}

onPrivateChange(() => {
  const route = readRoute(location.hash);
  const modeChanged = lastMode !== connection.mode;
  const feedChanged = lastFeed !== connection.feed;
  const saveChanged = lastSave !== connection.save;
  lastMode = connection.mode;
  lastFeed = connection.feed;
  lastSave = connection.save;
  if (route.type === 'public') return;
  const status = app.querySelector('[data-private-status]');
  if (status) status.innerHTML = statusBanner();
  if (modeChanged) {
    render();
    return;
  }
  const dialog = app.querySelector('[data-event-dialog][open]');
  if (dialog && (saveChanged || feedChanged)) {
    const event = allCalendarEvents().find(item => item.id === dialog.dataset.eventId);
    if (event) showEvent(app, event);
    else dialog.close();
  }
  if (!feedChanged || !isCalendarSurface(route) || route.type === 'settings') return;
  if (route.type === 'home') {
    app.querySelector('.home-week').outerHTML = homeWeekWidget(homeWeek);
  } else {
    const active = document.activeElement;
    const focusedRefresh = active?.hasAttribute('data-feed-refresh');
    const focusedLink = active?.closest('main') ? active.getAttribute('href') : null;
    app.querySelector('main').innerHTML = '<div data-private-status>' + statusBanner() + '</div>' + calendarView(route);
    const next = focusedRefresh ? app.querySelector('[data-feed-refresh]') :
      focusedLink ? [...app.querySelectorAll('main a')].find(link => link.getAttribute('href') === focusedLink) : null;
    if (!app.querySelector('dialog[open]')) next?.focus({ preventScroll: true });
  }
});

function pollVisibleFeed() {
  if (document.visibilityState === 'visible' && isCalendarSurface(readRoute(location.hash))) void loadFeed();
}

initAppleActions(app, render);
window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render({ focus: true });
  enterPrivateSurface();
});
document.addEventListener('visibilitychange', pollVisibleFeed);
setInterval(pollVisibleFeed, 30_000);
render();
enterPrivateSurface();
