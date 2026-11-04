import { href, publicHref, readRoute } from './pages.js';
import { collectionView, landing, missingView, publicView, searchView, workspaceOverview } from './views.js';
import { icon } from './icons.js';
import { studioRepository } from './repository.js';

const app = document.querySelector('#app');

function header(route) {
  return '<header class="studio-top"><div class="masthead"><a class="brand" href="' + href() + '"><span class="logo">' +
    icon('logo', 20) + '</span><span>Personal Studio OS</span></a><a class="search-link" href="' + href('search') + '"' +
    (route.type === 'search' ? ' aria-current="page"' : '') + '>' + icon('search', 18) + '<span>搜索</span></a></div></header>';
}

function breadcrumbs(route) {
  if (route.type === 'home') return '';
  const crumbs = [[href(), 'Home']];
  if (route.workspace) crumbs.push([href(route.workspaceId), route.workspace.label]);
  if (route.collection) crumbs.push([null, route.collection.label]);
  if (route.brand) {
    crumbs.push([publicHref(route.brandId), route.brand.label]);
    if (route.pageId !== 'home') crumbs.push([null, route.page.label]);
  }
  if (route.type === 'search') crumbs.push([null, 'Search']);
  if (route.type === 'missing') crumbs.push([null, '页面未找到']);
  return '<nav class="breadcrumbs" aria-label="面包屑"><ol>' + crumbs.map(([address, label], index) => '<li>' +
    (index === crumbs.length - 1 ? '<span aria-current="page">' + label + '</span>' : '<a href="' + address + '">' + label + '</a>') +
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
  collection: collectionView,
  public: publicView,
  search: searchView,
  missing: missingView,
};

function render({ focus = false } = {}) {
  const route = readRoute(location.hash);
  const label = route.collection?.label ?? route.workspace?.label ??
    (route.pageId === 'home' ? route.brand.label : route.page?.label) ??
    (route.type === 'search' ? 'Search' : route.type === 'missing' ? '页面未找到' : '');
  document.title = label ? label + ' · Personal Studio OS' : 'Personal Studio OS';
  app.dataset.space = route.type === 'public' ? 'public' : 'private';
  app.innerHTML = '<a class="skip" href="#main">跳到内容</a>' + header(route) +
    '<main id="main" class="page-main" tabindex="-1">' + breadcrumbs(route) + publicNav(route) +
    views[route.type](route) + '</main>';
  if (focus) app.querySelector('main').focus({ preventScroll: true });
}

app.addEventListener('click', event => {
  if (!event.target.closest('.skip')) return;
  event.preventDefault();
  app.querySelector('main').focus();
});

app.addEventListener('submit', event => {
  if (event.target.matches('.search-form')) event.preventDefault();
});

app.addEventListener('input', event => {
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
