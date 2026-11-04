import { brands, href, matchesCollection, publicHref, readRoute, tools, workspaces } from './pages.js';
import { collectionView, itemDetail, landing, missingView, publicDetail, publicViews, searchResults, toolViews, workspaceOverview } from './views.js';
import { icon } from './icons.js';
import { studioRepository as studio, publicRepository as published } from './repository.js';

const app = document.querySelector('#app');
const viewStates = new Map();
const defaultState = {
  kind: '', view: 'list', domain: '', status: '', visibility: '', format: '',
  activity: '', story: '', loop: '0:3', node: 'excerpt', selectedActivity: 'quiet', query: '',
};
let current;
let state;
let lastFocus;

function resolveRoute(route) {
  if (!route.itemId) return route;
  const record = route.type === 'public'
    ? published[route.pageId]?.().find(item => item.id === route.itemId)
    : studio.get(route.itemId);
  if (!record) return route;
  if (route.type === 'collection' &&
    (!record.domains.includes(route.workspace.label) || !matchesCollection(record, route.collection))) return route;
  if (route.type === 'tool' && route.toolId === 'inbox' && record.kind !== 'input') return route;
  if (route.type === 'tool' && ['creation', 'publication'].includes(route.toolId) && record.kind !== 'output') return route;
  return { ...route, record };
}

function menuLink(address, label, glyph) {
  return '<a href="' + address + '">' + icon(glyph, 15) + label + '</a>';
}

function topbar(route) {
  const areas = Object.entries(workspaces).map(([id, area]) => menuLink(href(id), area.label, area.icon)).join('') +
    Object.entries(brands).map(([id, area]) => menuLink(publicHref(id), area.label, area.icon)).join('');
  const shared = ['connections', 'creation', 'publication'].map(id => menuLink(href(id), tools[id].label, tools[id].icon)).join('');
  const actions = ['search', 'inbox'].map(id => '<a href="' + href(id) + '" aria-label="' + tools[id].zh + '" title="' + tools[id].zh + '">' +
    icon(tools[id].icon, 18) + '</a>').join('');
  return '<header class="studio-top"><div class="masthead"><a class="brand" href="' + href() + '"><span class="logo">' +
    icon('logo', 20) + '</span><span>Personal Studio <b>OS</b></span></a><div class="top-actions">' +
    (route.type === 'public' ? '' : actions) + '<details class="space-menu"><summary>' + icon('menu', 17) + '<span>导航</span></summary>' +
    '<div class="space-popover"><div class="eyebrow">空间</div>' + areas + '<div class="eyebrow">共享工具</div>' +
    shared + '</div></details></div></div></header>';
}

function breadcrumbs(route) {
  if (route.type === 'home') return '';
  const crumbs = [[href(), 'Home']];
  if (route.workspace) crumbs.push([href(route.workspaceId), route.workspace.label]);
  if (route.collection) crumbs.push([href(route.workspaceId, route.collection.id), route.collection.label]);
  if (route.tool) crumbs.push([href(route.toolId), route.tool.label]);
  if (route.brand) {
    crumbs.push([publicHref(route.brandId), route.brand.label]);
    if (route.pageId !== 'home') crumbs.push([publicHref(route.brandId, route.pageId), route.page.label]);
  }
  if (route.record) crumbs.push([null, route.record.title]);
  else if (route.itemId || route.type === 'missing') crumbs.push([null, '页面未找到']);
  return '<nav class="breadcrumbs" aria-label="面包屑"><ol>' + crumbs.map(([address, label], index) => '<li>' +
    (index === crumbs.length - 1 ? '<span aria-current="page">' + label + '</span>' : '<a href="' + address + '">' + label + '</a>') +
    '</li>').join('') + '</ol></nav>';
}

function shell(route, content) {
  const nav = route.type === 'public'
    ? '<div class="public-top"><a class="tokyo-brand" href="' + publicHref(route.brandId) +
      '"><span class="tokyo-mark">一</span><span>' + route.brand.label + '<small>ICHIGO ICHIE · TOKYO</small></span></a>' +
      '<nav aria-label="品牌页面">' + Object.entries(route.brand.pages).map(([id, page]) =>
        '<a href="' + publicHref(route.brandId, id) + '"' +
        (route.pageId === id ? route.itemId ? ' aria-current="location"' : ' aria-current="page"' : '') + '>' +
        page.label + '</a>').join('') + '</nav></div>' : '';
  return '<div class="' + (route.type === 'public' ? 'public-shell' : 'private-shell') + '">' + nav +
    '<main id="main" class="page-main' + (route.type === 'public' ? ' public-main' : '') + '" tabindex="-1">' +
    breadcrumbs(route) + content + '<footer class="studio-footer"><span>PERSONAL STUDIO OS</span><span>交互原型 · 只读示例</span></footer></main></div>';
}

function render(focus = false) {
  current = resolveRoute(readRoute(location.hash));
  const stateKey = [current.type, current.workspaceId, current.collection?.id, current.toolId, current.brandId, current.pageId].join('/');
  if (!viewStates.has(stateKey)) viewStates.set(stateKey, { ...defaultState });
  state = viewStates.get(stateKey);

  if (current.type === 'public' && current.pageId === 'registration') {
    const choice = current.params.get('activity');
    if (focus && published.activities().some(item => item.id === choice)) state.selectedActivity = choice;
  }

  let content;
  if (current.itemId) {
    content = !current.record ? missingView(current) : current.type === 'public' ? publicDetail(current) : itemDetail(current);
  } else if (current.type === 'home') content = landing();
  else if (current.type === 'overview') content = workspaceOverview(current);
  else if (current.type === 'collection') content = collectionView(state, current);
  else if (current.type === 'tool') content = toolViews[current.toolId](state, current);
  else if (current.type === 'public') content = publicViews[current.brandId]?.[current.pageId]?.(state, current) ?? missingView(current);
  else content = missingView(current);

  const label = current.record?.title ?? current.collection?.label ?? current.workspace?.label ?? current.tool?.label ??
    (current.pageId === 'home' ? current.brand.label : current.page?.label);
  document.title = label ? label + ' · Personal Studio OS' : 'Personal Studio OS';
  app.innerHTML = '<a class="skip" href="#main">跳到内容</a>' + topbar(current) + shell(current, content) +
    '<dialog aria-labelledby="dialog-title"></dialog>';
  app.querySelector('dialog').addEventListener('close', () => {
    if (lastFocus?.isConnected) lastFocus.focus();
  });
  if (current.toolId === 'search' && !current.itemId) app.querySelector('input[type=search]').value = state.query;
  if (focus) app.querySelector('main').focus({ preventScroll: true });
}

function showConfirmation(trigger) {
  const item = published.activities().find(entry => entry.id === state.selectedActivity);
  if (!item) return;
  lastFocus = trigger;
  const dialog = app.querySelector('dialog');
  dialog.innerHTML = '<div class="dialog-heading"><div class="eyebrow">报名预览</div><button data-close aria-label="关闭确认">' +
    icon('close', 20) + '</button></div><h2 id="dialog-title">报名确认预览</h2><p><strong>' +
    item.title + '</strong> · ' + item.time + '</p><p>这是示例确认页。没有提交报名或收集个人信息。</p>';
  dialog.showModal();
}

app.addEventListener('click', event => {
  const menu = app.querySelector('.space-menu');
  if (menu.open && !menu.contains(event.target)) menu.open = false;
  const el = event.target.closest('button,a');
  if (!el) return;
  if (el.classList.contains('skip')) {
    event.preventDefault();
    app.querySelector('main').focus();
  }
  if (el.closest('.space-popover')) menu.open = false;
  if (el.hasAttribute('data-close')) app.querySelector('dialog').close();
  if (el.hasAttribute('data-registration')) showConfirmation(el);
  if (el.dataset.node) location.hash = href('connections') + '?node=' + encodeURIComponent(el.dataset.node);
  const key = el.dataset.filter;
  if (key && Object.hasOwn(defaultState, key)) {
    state[key] = el.dataset.value;
    render();
    [...app.querySelectorAll('[data-filter]')].find(item => item.dataset.filter === key &&
      item.dataset.value === el.dataset.value)?.focus({ preventScroll: true });
  }
});

app.addEventListener('input', event => {
  if (event.target.type === 'search') {
    state.query = event.target.value;
    app.querySelector('#search-results').innerHTML = searchResults(state.query, current);
  }
});

app.addEventListener('change', event => {
  if (event.target.id === 'activity-select') {
    state.selectedActivity = event.target.value;
    render();
    app.querySelector('#activity-select').focus({ preventScroll: true });
  }
});

window.addEventListener('hashchange', () => {
  const previous = current;
  const next = readRoute(location.hash);
  if (!(previous.toolId === 'connections' && next.toolId === 'connections' && !previous.itemId && !next.itemId)) window.scrollTo(0, 0);
  render(true);
});
render(true);
