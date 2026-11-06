import { boardContentHref, boardHref, boardSections, href, publicHref, readRoute } from './pages.js';
import {
  collectionView, landing, missingView, publicView, searchView, workspaceOverview,
} from './views.js';
import { icon } from './icons.js';
import { escapeHtml } from './html.js';
import { autoPlanView, autoWidget, originalSource, planDialog } from './auto-view.js';
import { plannerRepository, studioRepository } from './repository.js';
import { calendarHref, calendarSelection, dateKey, parseDate, todayDate } from './calendar.js';
import { calendarHeaderActions, calendarRefreshState, calendarView, taskDialog } from './planner-view.js';
import { allCalendarEvents, canEdit, eventDialog, reviewDialog, settingsView, showEvent, statusBanner } from './apple-view.js';
import { connection, loadCalDav, loadFeed, loadPlanner, onPrivateChange } from './private-api.js';
import { initAppleActions } from './apple-actions.js';
import { eventDetail, projectOverview, workshopGallery } from './workshop-view.js';
import { initWorkshopActions } from './workshop-actions.js';
import { initStudioImport, studioImportView } from './studio-import-view.js';
import { boardDetail, boardView } from './self-board-view.js';
import { initBoardActions } from './self-board-actions.js';
import { boardContent, boardSection } from './self-board-data.js';
import { initLibraryActions } from './board-library-actions.js';
import { contentTitle, isSelfBoard, studioStore } from './studio-data.js';

const app = document.querySelector('#app');
let period = 'week';
let studioStorageError = false;
let mountBoardEditor;
let mountLibrary;

function pageContext(route) {
  const ancestors = [[href(), '首页']];
  if (route.workspace) ancestors.push([href(route.workspaceId), route.workspace.label]);
  if (route.collection && !route.projectPath) {
    ancestors.push([href(route.workspaceId, route.collectionId), route.collection.label]);
  }
  if (route.projectPath) ancestors.push([href(...route.projectPath), route.projectLabel]);
  if (route.brand) ancestors.push([publicHref(route.brandId), route.brand.label]);

  if (route.type === 'board' || route.type === 'content-detail') {
    if (route.type === 'board' && !route.section && !route.params.has('view')) ancestors.pop();
    const title = route.entity ? contentTitle(route.record) : boardSections[route.section]?.label;
    return { title: route.recordTitle ?? title ?? route.workspace.label, ancestors };
  }
  const isAncestorTitle = ['overview', 'workshop-gallery', 'collection', 'project'].includes(route.type) ||
    (route.type === 'public' && route.pageId === 'home');
  const title = isAncestorTitle ? ancestors.pop()[1] :
    route.eventLabel ?? route.record?.title ?? route.page?.label ??
    { home: '奕Studio', calendar: 'Calendar', settings: 'Settings', search: 'Search', 'workshop-import': '数据迁移', missing: '页面未找到' }[route.type];
  return { title, ancestors };
}

function header(route, { title, ancestors }) {
  if (route.type === 'home') {
    return '<header class="studio-top"><div class="masthead"><h1 class="home-brand">奕<span lang="en">Studio</span></h1>' +
      '<div class="header-actions"><a class="header-icon" href="' + href('calendar') +
      '" aria-label="打开 Calendar" title="Calendar">' + icon('calendar', 24) + '</a></div></div></header>';
  }
  const [address, label] = route.parent ? [route.parent, route.parentLabel] : ancestors.at(-1);
  const article = route.type === 'content-detail' || route.entity;
  const inBoard = route.workspaceId === 'self-board';
  const section = route.type === 'content-detail' ? boardSection(boardContent(route.record)) : route.section;
  const boardTitle = Object.hasOwn(boardSections, section) ? boardSections[section].label : '';
  const backLabel = route.section === 'settings' ? '返回上一页' : '返回 ' + label;
  const calendarYear = route.type === 'calendar'
    ? ' <span class="calendar-year" data-calendar-year>' + calendarSelection(route.params).date.getUTCFullYear() + '年</span>' : '';
  const start = '<a class="header-icon back-link" href="' + escapeHtml(address) + '" aria-label="' + escapeHtml(backLabel) +
    '" title="' + escapeHtml(backLabel) + '">' + icon('back', 19) + '</a>' +
    (boardTitle ? boardTitleMenu(section, boardTitle, article) : '<h1>' + escapeHtml(title) + calendarYear + '</h1>');
  const calendar = route.type === 'auto-plan' ? '<a class="header-icon" href="' +
    escapeHtml(calendarHref(todayDate(), 'week', 'auto')) +
    '" aria-label="打开 Calendar" title="Calendar">' + icon('calendar', 18) + '</a>' : '';
  const search = inBoard ? boardHeaderSearch() : route.type === 'search' ? '' :
    '<a class="header-icon" href="' + href('search') + '" aria-label="搜索" title="搜索">' + icon('search', 18) + '</a>';
  return '<header class="studio-top"><div class="masthead' + (inBoard ? ' sb-masthead' : '') + '">' + start +
    '<div class="header-actions">' + calendar + search + (route.type === 'calendar' ? calendarHeaderActions() : '') + (inBoard ?
      '<button type="button" class="header-icon sb-header-button" data-sb-capture aria-label="快速添加" title="快速添加">' + icon('add', 19) + '</button>' +
      '<a class="header-icon" href="' + boardHref('connections') + '" aria-label="Network" title="Network">' + icon('network', 18) + '</a>' +
      (route.section === 'settings' ? '' : '<a class="header-icon" href="' + boardHref('settings') + '?' +
        escapeHtml(new URLSearchParams({ from: location.hash || boardHref() }).toString()) +
        '" aria-label="Self-Board 设置" title="Self-Board 设置">' + icon('settings', 19) + '</a>') : '') +
    '</div></div></header>';
}

function boardHeaderSearch() {
  return '<details class="sb-header-search" data-sb-disclosure data-sb-header-search>' +
    '<summary class="header-icon" aria-label="搜索" title="搜索">' + icon('search', 18) + '</summary>' +
    '<div class="sb-search-panel"><form data-sb-floating-search role="search" aria-label="Self-Board 搜索">' +
    '<label class="sb-search">' + icon('search', 17) +
    '<input type="search" name="query" aria-label="全局搜索" placeholder="搜索文章、灵感、资料或活动…"></label></form>' +
    '<div class="sb-search-results" data-sb-search-results aria-live="polite"></div></div></details>';
}

function boardTitleMenu(section, title, article) {
  const tag = article ? 'span' : 'h1';
  return '<details class="sb-title-switcher" data-sb-disclosure data-sb-title-switcher><summary><' + tag + '>' + title +
    '</' + tag + '></summary><nav class="sb-title-links" aria-label="切换 Self-Board 栏目">' +
    Object.entries(boardSections).filter(([id]) => id !== section).map(([id, group]) =>
      '<a href="' + boardHref(id) + '">' + group.label + '</a>').join('') + '</nav></details>';
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
  board: boardView,
  'content-detail': boardDetail,
  'auto-plan': autoPlanView,
  calendar: calendarView,
  settings: settingsView,
  collection: collectionView,
  project: projectOverview,
  'workshop-import': studioImportView,
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
    (route.workspaceId === 'self-board' && ((route.type === 'board' && !route.section) || route.collectionId === 'auto'));
  const canEditPlans = route.collectionId === 'auto';
  const isPlannerPage = canEditTasks || route.type === 'home';
  document.title = context.title;
  app.dataset.page = route.type;
  app.dataset.space = route.type === 'public' ? 'public' : 'private';
  const workshop = route.workspaceId === 'workshop';
  const workshopBreadcrumb = workshop && (route.projectPath || route.type === 'workshop-import')
    ? '<nav class="work-breadcrumb" aria-label="面包屑">' + context.ancestors.map(([address, label]) =>
      '<a href="' + address + '">' + escapeHtml(label) + '</a>').join('<span aria-hidden="true">/</span>') + '</nav>' : '';
  const storageWarning = studioStorageError && (workshop || route.workspaceId === 'self-board')
    ? '<p class="work-error" role="alert">无法读取此浏览器的 Studio 数据。</p>' : '';
  app.innerHTML = '<a class="skip" href="#main">跳到内容</a>' + header(route, context) +
    '<main id="main" class="page-main" tabindex="-1"' +
    (route.type === 'home' ? '' : ' aria-label="' + escapeHtml(context.title) + '"') + '>' + publicNav(route) +
    (isPlannerPage ? '<div data-private-status>' + statusBanner() + '</div>' : '') +
    workshopBreadcrumb + storageWarning + views[route.type]({ ...route, period }) + '</main>' +
    (canEditTasks ? taskDialog() + reviewDialog() + eventDialog() : '') + (canEditPlans ? planDialog() : '');
  if (focus || route.documentId) {
    const target = app.querySelector('[data-work-selected] > summary');
    if (target) {
      target.scrollIntoView({ block: 'nearest' });
      target.focus({ preventScroll: true });
    } else if (focus) app.querySelector('main').focus({ preventScroll: true });
  }
  mountBoardEditor?.(route);
  mountLibrary?.(route);
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
    const route = readRoute(location.hash);
    app.querySelector('[data-calendar-year]').textContent = calendarSelection(route.params).date.getUTCFullYear() + '年';
    app.querySelector('main').innerHTML = '<div data-private-status>' + statusBanner() + '</div>' + calendarView(route);
    const next = [...app.querySelectorAll('[data-calendar-nav]')].find(link => link.getAttribute('href') === address &&
      (link.getAttribute('aria-current') || link.getAttribute('aria-label') === calendarLink.getAttribute('aria-label')));
    (next ?? app.querySelector('main')).focus({ preventScroll: true });
    return;
  }
  const button = event.target.closest('button');
  if (!button) return;
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
  sourceField.replaceChildren(new Option('不指定', ''), ...sources.map(({ record }) => new Option(contentTitle(record), record.id)));
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
  const deleted = scheduled && connection.caldav.statuses.some(row => row.id === scheduled.id && row.state === 'deleted');
  review.hidden = !task || task.skipped || deleted;
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
    if (isSelfBoard(item)) {
      const link = document.createElement('a');
      link.href = boardContentHref(item.id);
      link.textContent = contentTitle(item);
      row.append(link);
    } else row.textContent = item.title;
    return row;
  }));
});

let initialized = false;
let lastMode = connection.mode;
let lastFeed = connection.feed;
let lastCalDav = connection.caldav;
let lastSave = connection.save;

function isBoardOverview(route) { return route.type === 'board' && !route.section; }

function isCalendarSurface(route) { return route.type === 'calendar' || route.type === 'settings'; }

function enterPrivateSurface() {
  const route = readRoute(location.hash);
  if (route.type === 'public') return;
  if (!initialized) {
    initialized = true;
    void loadPlanner().then(() => {
      const current = readRoute(location.hash);
      if (isCalendarSurface(current)) void loadFeed();
      else if (current.collectionId === 'auto' || current.workspaceId === 'self-board') void loadCalDav();
    });
  } else if (isCalendarSurface(route)) void loadFeed();
  else if (route.collectionId === 'auto') void loadCalDav();
}

onPrivateChange(() => {
  const route = readRoute(location.hash);
  const modeChanged = lastMode !== connection.mode;
  const caldavChanged = lastCalDav !== connection.caldav;
  const setupChanged = lastCalDav.enabled !== connection.caldav.enabled ||
    lastCalDav.configured !== connection.caldav.configured;
  const feedChanged = lastFeed !== connection.feed || caldavChanged;
  lastCalDav = connection.caldav;
  const saveChanged = lastSave !== connection.save;
  lastMode = connection.mode;
  lastFeed = connection.feed;
  lastSave = connection.save;
  if (route.type === 'public') return;
  const status = app.querySelector('[data-private-status]');
  if (status) status.innerHTML = statusBanner();
  if ((modeChanged && route.workspaceId !== 'workshop' &&
      !['board', 'content-detail'].includes(route.type)) ||
      (route.type === 'settings' && setupChanged)) {
    render();
    return;
  }
  if (modeChanged && isBoardOverview(route) && !app.querySelector('dialog[open]')) {
    render();
    return;
  }
  const dialog = app.querySelector('[data-event-dialog][open]');
  if (dialog && (saveChanged || feedChanged)) {
    const event = allCalendarEvents().find(item => item.id === dialog.dataset.eventId);
    if (event) showEvent(app, event);
    else dialog.close();
  }
  if (route.type !== 'calendar') return;
  const refresh = app.querySelector('[data-feed-refresh]');
  if (refresh) {
    const { state, label, disabled } = calendarRefreshState();
    refresh.dataset.refreshState = state;
    refresh.setAttribute('aria-disabled', disabled);
    refresh.setAttribute('aria-label', label);
    refresh.title = label;
  }
  if (!feedChanged) return;
  const active = document.activeElement;
  const focusedLink = active?.closest('main') ? active.getAttribute('href') : null;
  app.querySelector('main').innerHTML = '<div data-private-status>' + statusBanner() + '</div>' + calendarView(route);
  const next = focusedLink ? [...app.querySelectorAll('main a')].find(link => link.getAttribute('href') === focusedLink) : null;
  if (!app.querySelector('dialog[open]')) next?.focus({ preventScroll: true });
});

function pollVisibleFeed() {
  if (document.visibilityState === 'visible' && isCalendarSurface(readRoute(location.hash))) void loadFeed();
}

initAppleActions(app, render);
initWorkshopActions(app, render);
mountBoardEditor = initBoardActions(app, render);
mountLibrary = initLibraryActions(app, render);
initStudioImport(app);
window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render({ focus: true });
  enterPrivateSurface();
});
document.addEventListener('visibilitychange', pollVisibleFeed);
setInterval(pollVisibleFeed, 30_000);
try {
  await studioStore.load();
} catch {
  studioStorageError = true;
}
render();
enterPrivateSurface();
