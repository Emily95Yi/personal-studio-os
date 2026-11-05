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
    route.eventLabel ?? route.actionLabel ?? route.record?.title ?? route.page?.label ??
    { home: '奕Studio', calendar: 'Calendar', search: 'Search', missing: '页面未找到' }[route.type];
  return { title, ancestors };
}

function header(route, { title, ancestors }) {
  const [address, label] = route.parent ? [route.parent, route.parentLabel] : ancestors.at(-1);
  const home = route.type === 'home';
  const start = home ? '<span class="logo" aria-hidden="true">' + icon('logo', 20) + '</span>' :
    '<a class="header-icon back-link" href="' + address + '" aria-label="返回 ' + escapeHtml(label) +
    '" title="返回 ' + escapeHtml(label) + '">' + icon('back', 19) + '</a><h1>' + escapeHtml(title) + '</h1>';
  const calendar = route.type === 'overview' && route.workspaceId === 'self-board'
    ? '<a class="header-icon" href="' + href('calendar') + '" aria-label="打开 Calendar" title="Calendar">' + icon('calendar', 18) + '</a>' : '';
  const search = route.type === 'search' ? '' : '<a class="header-icon" href="' + href('search') +
    '" aria-label="搜索" title="搜索">' + icon('search', 18) + '</a>';
  return '<header class="studio-top"><div class="masthead">' + start + '<div class="header-actions">' + calendar + search +
    '</div></div>' + (!home && ancestors.length > 1 ? breadcrumbs(ancestors) : '') + '</header>';
}

function breadcrumbs(ancestors) {
  return '<nav class="breadcrumbs" aria-label="面包屑"><ol>' + ancestors.map(([address, label]) =>
    '<li><a href="' + address + '">' + escapeHtml(label) + '</a></li>').join('') + '</ol></nav>';
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
  const context = pageContext(route);
  document.title = context.title;
  app.dataset.space = route.type === 'public' ? 'public' : 'private';
  app.innerHTML = '<a class="skip" href="#main">跳到内容</a>' + header(route, context) +
    '<main id="main" class="page-main" tabindex="-1"' +
    (route.type === 'home' ? '' : ' aria-label="' + escapeHtml(context.title) + '"') + '>' + publicNav(route) +
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
