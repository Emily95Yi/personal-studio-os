import { captureActions, captureView, mountCaptureBoard, updateCapturePlanAction } from './capture-board.js';
import { api as captureApi } from './capture-client.js';
import { boardContentHref, boardHref, boardSections, boardSettingsAddress, href, publicHref, readRoute } from './pages.js';
import {
  collectionView, landing, missingView, publicView, searchView, workspaceOverview,
} from './views.js';
import { icon } from './icons.js';
import { escapeHtml } from './html.js';
import { autoPlanView, originalSource, planDialog, planKindHelp, planPeriodLabel } from './auto-view.js';
import { plannerRepository, studioRepository } from './repository.js';
import { calendarHref, calendarSelection, dateKey, parseDate, todayDate } from './calendar.js';
import { calendarHeaderActions, calendarRefreshState, calendarView, taskDialog, weekPreview } from './planner-view.js';
import { allCalendarEvents, canEdit, eventDialog, reviewDialog, settingsView, showEvent, statusBanner } from './apple-view.js';
import { connection, loadCalDav, loadFeed, loadPlanner, onPrivateChange, saveChanges } from './private-api.js';
import { initAppleActions } from './apple-actions.js';
import { eventDetail, projectOverview, workshopGallery } from './workshop-view.js';
import { initWorkshopActions } from './workshop-actions.js';
import { initStudioImport, studioImportView } from './studio-import-view.js';
import { boardDetail, boardView } from './self-board-view.js';
import { initBoardActions, refreshHeaderSearch } from './self-board-actions.js';
import { boardContent, boardSection, boardTrashRecords } from './self-board-data.js';
import { initLibraryActions } from './board-library-actions.js';
import { contentTitle, isSelfBoard, studioStore } from './studio-data.js';
import { beginStudioEdit, closeStudioSync, migrateLocalStudio, onStudioNotice, refreshStudioSync,
  startStudioSync, studioNotice, studioSync } from './studio-cloud.js';

const app = document.querySelector('#app');
let studioStorageError = false;
let mountBoardEditor;
let mountLibrary;
let topicLease;
let refreshInbox;

function syncBanner() {
  return '<div data-studio-sync><p role="status" data-studio-notice' + (studioSync.message ? '' : ' hidden') + '>' +
    escapeHtml(studioSync.message) + '</p>' + (studioSync.migration
    ? '<p>此浏览器有尚未上传的 Studio 内容。上传后，可在其他设备用同一账号打开。</p>' +
      '<button type="button" class="action-button secondary" data-studio-migrate>上传此浏览器的 Studio 内容</button>' : '') + '</div>';
}

onStudioNotice(() => {
  const status = app.querySelector('[data-studio-notice]');
  if (status) {
    status.textContent = studioSync.message;
    status.hidden = !studioSync.message;
  }
});

async function prepareTopicEdit() {
  const address = location.hash;
  if (topicLease?.address === address) return;
  topicLease?.release();
  topicLease = undefined;
  const route = readRoute(address);
  if (route.entity !== 'topic' || route.params.get('edit') !== '1') return;
  try {
    const release = await beginStudioEdit();
    if (location.hash !== address || topicLease?.address === address) release();
    else topicLease = { address, release };
  } catch (error) {
    if (location.hash !== address) return;
    history.replaceState(null, '', address.split('?')[0]);
    studioNotice(error.message);
  }
}

function pageContext(route) {
  const ancestors = [[href(), '首页']];
  if (route.workspace) ancestors.push([href(route.workspaceId), route.workspace.label]);
  if (route.collection && !route.projectPath) {
    ancestors.push([href(route.workspaceId, route.collectionId), route.collection.label]);
  }
  if (route.projectPath) ancestors.push([href(...route.projectPath), route.projectLabel]);
  if (route.brand) ancestors.push([publicHref(route.brandId), route.brand.label]);

  if (['board', 'content-detail', 'capture'].includes(route.type)) {
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
  const backLabel = '返回 ' + label;
  const calendarYear = route.type === 'calendar'
    ? ' <span class="calendar-year" data-calendar-year>' + calendarSelection(route.params).date.getUTCFullYear() + '年</span>' : '';
  const start = '<a class="header-icon back-link" href="' + escapeHtml(address) + '" aria-label="' + escapeHtml(backLabel) +
    '" title="' + escapeHtml(backLabel) + '">' + icon('back', 19) + '</a>' +
    (boardTitle ? boardTitleMenu(section, boardTitle, article) : '<h1>' + escapeHtml(title) + calendarYear + '</h1>');
  if (inBoard && route.section === 'settings') {
    const editing = route.view === 'edit';
    const modeLabel = editing ? '完成编辑' : '编辑设置';
    if (route.view === 'trash') {
      const disabled = boardTrashRecords(studioStore.state).length ? '' : ' disabled';
      return '<header class="studio-top"><div class="masthead sb-masthead">' + start +
        '<div class="header-actions"><button type="button" class="header-icon sb-header-button" ' +
        'aria-label="清空回收站" title="清空回收站" data-sb-clear-trash' + disabled + '>' +
        icon('trash', 19) + '</button></div></div></header>';
    }
    const actions = '<div class="header-actions"><a class="header-icon" href="' +
      escapeHtml(boardSettingsAddress(route.parent, editing ? '' : 'edit')) + '" aria-label="' + modeLabel +
      '" title="' + modeLabel + '">' + icon(editing ? 'check' : 'edit', 19) + '</a>' +
      '<a class="header-icon" href="' + escapeHtml(boardSettingsAddress(route.parent, 'trash')) +
      '" aria-label="回收站" title="回收站">' + icon('trash', 19) + '</a></div>';
    return '<header class="studio-top"><div class="masthead sb-masthead">' + start + actions + '</div></header>';
  }
  if (route.type === 'capture') {
    return '<header class="studio-top"><div class="masthead sb-masthead">' + start +
      (route.captureId ? captureActions() : '') + '</div></header>';
  }
  const calendar = route.type === 'auto-plan' ? '<a class="header-icon" href="' +
    escapeHtml(calendarHref(todayDate(), 'week', 'auto')) +
    '" aria-label="打开 Calendar" title="Calendar">' + icon('calendar', 18) + '</a>' : '';
  const floatingSearch = inBoard || route.type === 'calendar';
  const search = floatingSearch ? headerSearch(route.type === 'calendar') : route.type === 'search' ? '' :
    '<a class="header-icon" href="' + href('search') + '" aria-label="搜索" title="搜索">' + icon('search', 18) + '</a>';
  return '<header class="studio-top"><div class="masthead' + (inBoard ? ' sb-masthead' : '') +
    (floatingSearch ? ' searchable-masthead' : '') + '">' + start +
    '<div class="header-actions">' + search + calendar + (route.type === 'calendar' ? calendarHeaderActions() : '') + (inBoard ?
      '<button type="button" class="header-icon sb-header-button" data-sb-capture aria-label="快速添加" title="快速添加">' + icon('add', 19) + '</button>' +
      '<a class="header-icon" href="' + boardHref('connections') + '" aria-label="Network" title="Network">' + icon('network', 18) + '</a>' +
      '<a class="header-icon" href="' + escapeHtml(boardSettingsAddress(location.hash || boardHref())) +
      '" aria-label="Self-Board 设置" title="Self-Board 设置">' + icon('settings', 19) + '</a>' : '') +
    '</div></div>' + (floatingSearch ? '<div class="sb-search-results" data-sb-search-results aria-live="polite" hidden></div>' : '') + '</header>';
}

function headerSearch(calendar) {
  const label = calendar ? '搜索日程' : '搜索 Self-Board';
  return '<form id="header-search" data-sb-floating-search="' + (calendar ? 'calendar' : 'self-board') +
    '" role="search" aria-label="' + label + '" hidden>' +
    '<input type="search" name="query" aria-label="' + label + '" placeholder="' + label + '…"></form>' +
    '<button type="button" class="header-icon sb-header-button" data-sb-header-search aria-expanded="false" ' +
    'aria-controls="header-search" aria-label="搜索" title="搜索">' + icon('search', 18) + '</button>';
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
  capture: captureView,
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
  if (route.entity === 'topic' && topicLease?.address !== location.hash) route.params.delete('edit');
  const context = pageContext(route);
  const canEditTasks = route.type === 'calendar' || route.collectionId === 'auto';
  const canEditPlans = route.collectionId === 'auto' || (route.type === 'capture' && Boolean(route.captureId));
  const isPlannerPage = canEditPlans || canEditTasks || isBoardOverview(route) || route.type === 'home';
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
    workshopBreadcrumb + storageWarning + (route.type === 'public' ? '' : syncBanner()) +
    views[route.type](route) + '</main>' +
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
  refreshInbox = mountCaptureBoard(app, route, refreshStudioSync);
  if (route.entity === 'topic' && route.params.has('entry')) {
    const id = route.params.get('entry');
    const entry = [...app.querySelectorAll('[data-entry]')].find(node => node.dataset.entry === id);
    entry?.scrollIntoView({ block: 'nearest' });
    entry?.focus({ preventScroll: true });
  }
  const source = canEditPlans && route.type === 'collection' && canEdit() && originalSource(route.params.get('source'));
  if (source) {
    history.replaceState(history.state, '', href('self-board', 'auto'));
    openPlanDialog(undefined, source);
  }
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
  if (button.hasAttribute('data-dialog-cancel')) button.closest('dialog').close();
  if (!canEdit()) return;
  if (button.dataset.taskNew || button.dataset.taskEdit || button.dataset.planSchedule) openTaskDialog(button);
  if (button.hasAttribute('data-plan-new') || button.dataset.planEdit) openPlanDialog(button.dataset.planEdit);
  if (button.dataset.inboxId) openPlanDialog(undefined, { inboxId: button.dataset.inboxId, title: button.dataset.inboxTitle });
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
  sourceField.replaceChildren(new Option('不指定', ''), ...sources.map(({ record, title }) => new Option(title, record.id)));
  sourceField.value = task?.sourceContentId ?? '';
  sourceField.disabled = !sources.length;
  form.querySelector('[data-task-source]').hidden = !sources.length;
  form.elements.done.checked = task?.done ?? false;
  form.elements.done.disabled = Boolean(task?.skipped);
  form.elements.title.setCustomValidity('');
  form.querySelector('[data-form-error]').hidden = true;
  const review = form.querySelector('[data-task-review]');
  const scheduled = task && plannerRepository.eventForTask(task.id);
  const deleted = scheduled && connection.caldav.statuses.some(row => row.id === scheduled.id && row.state === 'deleted');
  review.hidden = !task || task.skipped || deleted;
  const action = scheduled ? '查看日程' : '建立日程';
  review.setAttribute('aria-label', action);
  review.title = action;
  review.innerHTML = icon(scheduled ? 'calendar' : 'calendarAdd', 19);
  dialog.showModal();
  (plan ? form.elements.date : form.elements.title).focus();
}

function updatePlanFields(form) {
  const kind = form.elements.kind.value;
  const help = form.querySelector('[data-plan-kind-help]');
  help.textContent = planKindHelp(kind);
  help.hidden = !help.textContent;
  for (const [selector, show] of [['[data-rule]', kind !== 'one-off'], ['[data-frequency]', kind === 'recurring'],
    ['[data-quota]', kind === 'quota'], ['[data-quota-days]', kind === 'quota' && form.elements.period.value === 'day']]) {
    const field = form.querySelector(selector);
    field.hidden = !show;
    field.querySelector('input, select').disabled = !show;
  }
}

function openPlanDialog(id, source) {
  const plan = id ? plannerRepository.getPlan(id) : null;
  if (id && !plan) return;
  const dialog = app.querySelector('.plan-dialog');
  const form = dialog.querySelector('form');
  form.reset();
  dialog.querySelector('h2').textContent = plan ? '编辑计划' : '新建计划';
  form.elements.id.value = plan?.id ?? '';
  form.elements.title.value = plan?.title ?? source?.title.slice(0, 120) ?? '';
  form.elements.kind.value = plan?.kind ?? 'one-off';
  const legacyUnit = plan?.period && plan.period !== 'day' ? planPeriodLabel(plan.period) : '';
  form.elements.period.replaceChildren(new Option('日', 'day'),
    ...(legacyUnit ? [new Option(legacyUnit, plan.period)] : []));
  form.elements.period.value = legacyUnit ? plan.period : 'day';
  form.elements.periodDays.value = plan?.periodDays ?? 1;
  form.elements.interval.value = plan?.interval ?? 1;
  form.elements.target.value = plan?.target ?? 1;
  form.elements.reminder.value = plan?.reminder ?? '';
  form.dataset.sourceId = source?.record?.id ?? '';
  form.dataset.inboxId = source?.inboxId ?? '';
  form.elements.syncInbox.disabled = connection.mode !== 'private';
  form.querySelector('[data-plan-preview]').hidden = connection.mode !== 'preview';
  form.elements.title.setCustomValidity('');
  form.querySelector('[data-form-error]').hidden = true;
  updatePlanFields(form);
  dialog.showModal();
  form.elements.title.focus();
}

app.addEventListener('change', event => {
  const field = event.target;
  if (['kind', 'period'].includes(field.name) && field.form?.matches('[data-plan-form]')) updatePlanFields(field.form);
  if (!canEdit() || !field.dataset.taskCheck) return;
  const task = plannerRepository.getTask(field.dataset.taskCheck);
  if (!task) return;
  plannerRepository.saveTask({ ...task, done: field.checked, completedOn: dateKey() });
  refreshFocus('[data-task-check="' + task.id + '"]');
});

app.addEventListener('cancel', event => {
  if (event.target.matches('.plan-dialog[aria-busy="true"]')) event.preventDefault();
}, true);

app.addEventListener('submit', async event => {
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
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    const previous = plannerRepository.getPlan(form.elements.id.value);
    const inboxId = previous?.inboxId ?? (form.dataset.inboxId || undefined);
    const sourceIds = previous?.sourceIds ?? (form.dataset.sourceId ? [form.dataset.sourceId] : []);
    const plan = plannerRepository.savePlan({
      id: form.elements.id.value || undefined, title, kind: form.elements.kind.value,
      period: form.elements.period.value, interval: Number(form.elements.interval.value),
      periodDays: Number(form.elements.periodDays.value),
      target: Number(form.elements.target.value), reminder: form.elements.reminder.value.trim(),
      sourceIds, inboxId,
    });
    if (!plan) {
      error.textContent = '无法保存。请检查周期天数、间隔数或已有安排。';
      error.hidden = false;
      return;
    }
    // Retain the saved ID in the dialog so retrying Inbox sync cannot create a second plan.
    form.elements.id.value = plan.id;
    const address = href('self-board', 'auto', plan.id);
    const dialog = form.closest('dialog');
    if (form.elements.syncInbox.checked && !inboxId) {
      const cancel = form.querySelector('[data-dialog-cancel]');
      submit.disabled = cancel.disabled = true;
      dialog.setAttribute('aria-busy', 'true');
      error.hidden = true;
      try {
        await saveChanges();
        if (connection.save !== 'idle') throw new Error('计划尚未保存，未同步 Inbox。');
        await captureApi('', { method: 'POST', value: {
          requestKey: 'auto-plan-' + plan.id, type: 'text', title: plan.title,
          originalText: 'Auto 计划：' + plan.title, userNote: plan.reminder,
          sourceUrl: new URL(address, location.origin).href,
        } });
      } catch (failure) {
        error.textContent = '未能同步 Inbox。' + failure.message;
        error.hidden = false;
        return;
      } finally {
        submit.disabled = cancel.disabled = false;
        dialog.removeAttribute('aria-busy');
      }
      if (!dialog.open || !form.isConnected) return;
    }
    dialog.close();
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
  (app.querySelector('[data-task-edit="' + saved.id + '"]') ?? app.querySelector('main')).focus({ preventScroll: true });
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
      if (isCalendarSurface(current) || isBoardOverview(current)) void loadFeed();
      else if (current.collectionId === 'auto' || current.workspaceId === 'self-board') void loadCalDav();
    });
  } else if (isCalendarSurface(route) || isBoardOverview(route)) void loadFeed();
  else if (route.collectionId === 'auto') void loadCalDav();
}

onPrivateChange(() => {
  const route = readRoute(location.hash);
  const modeChanged = lastMode !== connection.mode;
  const caldavChanged = lastCalDav !== connection.caldav;
  const setupChanged = lastCalDav.enabled !== connection.caldav.enabled ||
    lastCalDav.configured !== connection.caldav.configured || Boolean(lastCalDav.secondary) !== Boolean(connection.caldav.secondary);
  const feedChanged = lastFeed !== connection.feed || caldavChanged;
  lastCalDav = connection.caldav;
  const saveChanged = lastSave !== connection.save;
  lastMode = connection.mode;
  lastFeed = connection.feed;
  lastSave = connection.save;
  if (route.type === 'public') return;
  if (modeChanged) updateCapturePlanAction(app);
  const status = app.querySelector('[data-private-status]');
  if (status) status.innerHTML = statusBanner();
  if ((modeChanged && route.workspaceId !== 'workshop' &&
      !['board', 'content-detail', 'capture'].includes(route.type)) ||
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
  if (feedChanged && isBoardOverview(route)) {
    const preview = app.querySelector('[data-week-preview]');
    const focused = preview?.contains(document.activeElement);
    if (preview) preview.innerHTML = weekPreview();
    if (focused) preview.querySelector('a').focus({ preventScroll: true });
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
  if (!app.querySelector('[data-sb-search-results] :focus')) refreshHeaderSearch(app);
  const active = document.activeElement;
  const focusedLink = active?.closest('main') ? active.getAttribute('href') : null;
  app.querySelector('main').innerHTML = '<div data-private-status>' + statusBanner() + '</div>' + syncBanner() + calendarView(route);
  const next = focusedLink ? [...app.querySelectorAll('main a')].find(link => link.getAttribute('href') === focusedLink) : null;
  if (!app.querySelector('dialog[open]')) next?.focus({ preventScroll: true });
});

function pollVisibleFeed() {
  if (document.visibilityState === 'visible' && (isCalendarSurface(readRoute(location.hash)) || isBoardOverview(readRoute(location.hash)))) void loadFeed();
}

initAppleActions(app, render);
initWorkshopActions(app, render);
mountBoardEditor = initBoardActions(app, render);
mountLibrary = initLibraryActions(app, render);
initStudioImport(app);
app.addEventListener('click', async event => {
  const button = event.target.closest('[data-studio-migrate]');
  if (!button) return;
  button.disabled = true;
  try {
    await migrateLocalStudio();
    render();
  } catch (error) {
    studioNotice(error.message);
    button.disabled = false;
  }
});
window.addEventListener('hashchange', async () => {
  await prepareTopicEdit();
  window.scrollTo(0, 0);
  render({ focus: true });
  enterPrivateSurface();
});
async function pollStudioContent() {
  if (document.visibilityState !== 'visible' || app.querySelector('dialog[open]')) return;
  const changed = await refreshStudioSync();
  if (readRoute(location.hash).type === 'capture') return;
  if (changed && !app.querySelector('dialog[open]')) render();
  else void refreshInbox?.();
}
window.addEventListener('focus', pollStudioContent);
window.addEventListener('pagehide', closeStudioSync);
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
document.addEventListener('visibilitychange', pollVisibleFeed);
setInterval(pollVisibleFeed, 30_000);
setInterval(pollStudioContent, 30_000);
try {
  await studioStore.load();
} catch {
  studioStorageError = true;
}
await startStudioSync();
await prepareTopicEdit();
render();
enterPrivateSurface();
