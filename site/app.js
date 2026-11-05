import { href, publicHref, readRoute } from './pages.js';
import {
  actionPreview, collectionView, discoverDetail, escapeHtml, eventDetail, landing, missingView, projectOverview,
  projectSection, publicView, searchView, workshopGallery, workspaceOverview,
} from './views.js';
import { icon } from './icons.js';
import { plannerRepository, studioRepository } from './repository.js';
import { calendarHref, calendarSelection, dateKey, parseDate } from './calendar.js';
import { calendarView } from './planner-view.js';

const app = document.querySelector('#app');
let period = 'week';
let sopStep = 0;

function header(route) {
  return '<header class="studio-top"><div class="masthead"><a class="brand" href="' + href() + '"><span class="logo">' +
    icon('logo', 20) + '</span><span>Personal Studio OS</span></a><a class="search-link" href="' + href('search') + '"' +
    (route.type === 'search' ? ' aria-current="page"' : '') + '>' + icon('search', 18) + '<span>搜索</span></a></div></header>';
}

function breadcrumbs(route) {
  if (route.type === 'home') return '';
  const crumbs = [[href(), 'Home']];
  if (route.workspace) crumbs.push([href(route.workspaceId), route.workspace.label]);
  if (route.collection && !route.projectPath) crumbs.push([href(route.workspaceId, route.collectionId), route.collection.label]);
  if (route.projectPath) crumbs.push([href(...route.projectPath), route.projectLabel]);
  if (route.sectionPath && route.type !== 'event') crumbs.push([href(...route.sectionPath), route.section.label]);
  if (route.eventLabel) crumbs.push([null, route.eventLabel]);
  if (route.actionLabel) crumbs.push([null, route.actionLabel]);
  if (route.record) crumbs.push([null, route.record.title]);
  if (route.type === 'calendar') crumbs.push([null, 'Calendar']);
  if (route.brand) {
    crumbs.push([publicHref(route.brandId), route.brand.label]);
    if (route.pageId !== 'home') crumbs.push([null, route.page.label]);
  }
  if (route.type === 'search') crumbs.push([null, 'Search']);
  if (route.type === 'missing') crumbs.push([null, '页面未找到']);
  return '<nav class="breadcrumbs" aria-label="面包屑"><ol>' + crumbs.map(([address, label], index) => '<li>' +
    (index === crumbs.length - 1 ? '<span aria-current="page">' + escapeHtml(label) + '</span>' : '<a href="' + address + '">' + escapeHtml(label) + '</a>') +
    '</li>').join('') + '</ol></nav>';
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
  'discover-detail': discoverDetail,
  'action-preview': actionPreview,
  calendar: calendarView,
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
  const label = route.record?.title ?? route.actionLabel ?? route.eventLabel ?? route.section?.label ?? route.projectLabel ?? route.collection?.label ?? route.workspace?.label ??
    (route.pageId === 'home' ? route.brand.label : route.page?.label) ??
    (route.type === 'calendar' ? 'Calendar' : route.type === 'search' ? 'Search' : route.type === 'missing' ? '页面未找到' : '');
  document.title = label ? label + ' · Personal Studio OS' : 'Personal Studio OS';
  app.dataset.space = route.type === 'public' ? 'public' : 'private';
  app.innerHTML = '<a class="skip" href="#main">跳到内容</a>' + header(route) +
    '<main id="main" class="page-main" tabindex="-1">' + breadcrumbs(route) + publicNav(route) +
    views[route.type]({ ...route, period, sopStep }) + '</main>';
  if (focus) app.querySelector('main').focus({ preventScroll: true });
}

app.addEventListener('click', event => {
  if (event.target.closest('.skip')) {
    event.preventDefault();
    app.querySelector('main').focus();
    return;
  }
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.period) {
    period = button.dataset.period;
    render();
    app.querySelector('[data-period="' + period + '"]').focus();
  }
  if (button.hasAttribute('data-check-in')) {
    plannerRepository.toggleCheckIn(dateKey());
    render();
    app.querySelector('[data-check-in]').focus();
  }
  if (button.dataset.sopStep) {
    const direction = button.dataset.sopStep;
    sopStep = direction === 'reset' ? 0 : sopStep + (direction === 'next' ? 1 : -1);
    render();
    (app.querySelector('[data-sop-step="next"], [data-sop-step="reset"]') ?? app.querySelector('main')).focus();
  }
  if (button.hasAttribute('data-task-cancel')) app.querySelector('.task-dialog').close();
  if (button.dataset.taskNew || button.dataset.taskEdit) {
    const task = button.dataset.taskEdit ? plannerRepository.getTask(button.dataset.taskEdit) : null;
    if (button.dataset.taskEdit && !task) return;
    const dialog = app.querySelector('.task-dialog');
    const form = dialog.querySelector('form');
    dialog.querySelector('h2').textContent = task ? '编辑演示待办' : '新建演示待办';
    form.elements.id.value = task?.id ?? '';
    form.elements.title.value = task?.title ?? '';
    form.elements.date.value = task?.date ?? button.dataset.taskNew;
    form.elements.done.checked = task?.done ?? false;
    form.elements.title.setCustomValidity('');
    dialog.showModal();
    form.elements.title.focus();
  }
});

app.addEventListener('submit', event => {
  if (event.target.matches('.search-form')) {
    event.preventDefault();
    return;
  }
  if (!event.target.matches('[data-task-form]')) return;
  event.preventDefault();
  const form = event.target;
  const title = form.elements.title.value.trim();
  const date = parseDate(form.elements.date.value);
  if (!title) {
    form.elements.title.setCustomValidity('请输入待办标题。');
    form.elements.title.reportValidity();
    return;
  }
  if (!date) return;
  const saved = plannerRepository.saveTask({ id: form.elements.id.value || undefined, title, date: dateKey(date),
    done: form.elements.done.checked });
  if (!saved) return;
  form.closest('dialog').close();
  const { mode, date: selected } = calendarSelection(readRoute(location.hash).params);
  if (dateKey(selected) !== saved.date) location.hash = calendarHref(date, mode);
  else {
    render();
    app.querySelector('[data-task-edit="' + saved.id + '"]')?.focus();
  }
});

app.addEventListener('input', event => {
  if (event.target.name === 'title' && event.target.form?.matches('[data-task-form]')) event.target.setCustomValidity('');
  if (event.target.id !== 'studio-query') return;
  const query = event.target.value.trim();
  const matches = query ? studioRepository.list({ query }) : [];
  const results = app.querySelector('.search-results');
  const emptyTitle = app.querySelector('.search-status');
  const emptyDescription = app.querySelector('.search-note');
  const hasContent = matches.length > 0 || studioRepository.list().length > 0;
  emptyTitle.textContent = matches.length ? '搜索结果' : hasContent && query ? '没有匹配的内容' : '还没有可搜索的内容';
  emptyDescription.hidden = hasContent;
  results.hidden = matches.length === 0;
  results.replaceChildren(...matches.map(item => {
    const row = document.createElement('li');
    row.textContent = item.title;
    return row;
  }));
});

window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render({ focus: true });
});
render();
