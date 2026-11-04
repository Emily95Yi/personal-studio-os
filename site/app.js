import { spaces, readRoute, href } from './pages.js';
import { privateViews, publicViews, searchResults, relatedLinks } from './views.js';
import { icon } from './icons.js';
import { studioRepository as studio, publicRepository as published } from './repository.js';

const app = document.querySelector('#app');
const state = {
  kind:'', category:'', domain:'', status:'', visibility:'', format:'',
  activity:'', story:'', loop:'0:3', node:'excerpt', selectedActivity:'quiet',
};
const filterKeys = Object.keys(state);
let current;
let activeBrand = spaces.public.defaultBrand;
let lastFocus;

function navLink(page, route, showIcon = false) {
  const selected = route.page.id === page.id;
  return '<a href="' + href(route.space,page.id,route.brand) + '"' + (selected ? ' aria-current="page"' : '') + '>' +
    (showIcon ? icon(page.icon,17) : '') + '<span>' + page.label + '</span></a>';
}
function topbar(route) {
  const selection = ['private','public'].map(key => {
    const active = route.space === key;
    const brand = spaces.public.brands[activeBrand];
    const address = key === 'private' ? href(key,spaces.private.defaultPage) : href(key,brand.defaultPage,activeBrand);
    return '<a href="' + address + '"' + (active?' aria-current="true"':'') + '>' + icon(key==='private'?'lock':'globe',15) + spaces[key].label + '</a>';
  }).join('');
  const actions = spaces.private.pages.filter(x=>x.shortcut).map(page =>
    '<a href="' + href('private',page.id) + '" aria-label="' + page.zh + '" title="' + page.zh + '">' + icon(page.icon,18) + '</a>').join('');
  return '<header class="studio-top"><a class="brand" href="' + href('private','home') + '"><span class="logo">' + icon('logo',21) +
    '</span><span>Personal Studio <b>OS</b></span></a><nav class="switcher" aria-label="切换空间">' + selection +
    '</nav><div class="top-actions">' + (route.space==='private' ? actions : '') + '<span class="demo-pill"><i></i> DEMO</span></div></header>';
}
function privateShell(route, content) {
  const pages = route.registry.pages.filter(x=>!x.shortcut);
  const groups = [...new Set(pages.map(page=>page.group))];
  const sidebar = groups.map(group=>'<div class="side-group"><div class="side-label">' + group + '</div>' +
    pages.filter(page=>page.group===group).map(page=>navLink(page,route,true)).join('') + '</div>').join('');
  return '<div class="private-shell"><aside class="sidebar"><div class="side-heading">PRIVATE WORKSPACE</div><nav aria-label="私人空间页面">' + sidebar +
    '</nav><div class="side-footer">' + icon('lock',14) + '<span>只读示例数据</span></div></aside><main id="main" class="private-main" tabindex="-1">' + content +
    '<footer class="private-footer">PERSONAL STUDIO OS <span>产品结构原型 · 只读示例</span></footer></main></div>';
}
function publicShell(route, content) {
  const brands = Object.entries(spaces.public.brands);
  const brandLinks = brands.length > 1 ? '<nav class="brand-list" aria-label="公开品牌">' + brands.map(([id,brand]) =>
    '<a href="' + href('public',brand.defaultPage,id) + '"' + (route.brand===id?' aria-current="true"':'') + '>' + brand.label + '</a>').join('') + '</nav>' : '';
  return '<div class="public-shell">' + brandLinks + '<div class="public-top"><a class="tokyo-brand" href="' + href('public',route.registry.defaultPage,route.brand) +
    '"><span class="tokyo-mark">一</span><span>' + route.registry.label + '<small>ICHIGO ICHIE · TOKYO</small></span></a>' +
    '<nav aria-label="品牌页面">' + route.registry.pages.map(page=>navLink(page,route)).join('') + '</nav></div>' +
    '<main id="main" class="public-main" tabindex="-1">' + content + '</main><footer class="public-footer"><strong>' + route.registry.label +
    '</strong><span>公开空间原型 · 活动与故事均为示例</span><a href="' + href('public','about',route.brand) + '">关于我们 ' + icon('up',13) + '</a></footer></div>';
}
function render(focus = false) {
  current = readRoute(location.hash);
  if (current.brand) activeBrand = current.brand;
  const views = current.space === 'private' ? privateViews : publicViews[current.brand];
  const view = views?.[current.page.id];
  document.title = current.page.label + ' · Personal Studio OS';
  app.dataset.space = current.space;
  app.innerHTML = '<a class="skip" href="#main">跳到内容</a>' + topbar(current) +
    (current.space==='private' ? privateShell : publicShell)(current,view ? view(state) : '<h1>页面建设中</h1>') +
    '<dialog aria-labelledby="dialog-title"></dialog>';
  app.querySelector('dialog').addEventListener('close', () => {
    if (lastFocus?.isConnected) lastFocus.focus();
  });
  if (focus) document.querySelector('main').focus({preventScroll:true});
}
function dialog(title, body, trigger) {
  lastFocus = trigger;
  const el = app.querySelector('dialog');
  el.innerHTML = '<div class="dialog-heading"><div class="eyebrow">示例详情 / DEMO</div><button data-close aria-label="关闭详情">' +
    icon('close',20) + '</button></div><h2 id="dialog-title">' + title + '</h2>' + body;
  el.showModal();
}
function showItem(id, trigger) {
  const item = studio.get(id);
  if (!item) return;
  dialog(item.title,'<p>' + item.description + '</p><p class="subtle">' + item.category + ' · ' + item.domains.join(' / ') + '</p><div class="detail-tags">' +
    [item.kind==='input'?'Input':'Output',item.format,item.state,item.visibility].filter(Boolean).map(x=>'<span class="badge">'+x+'</span>').join('') +
    '</div><h3>直接关联</h3>' + relatedLinks(id) + '<a class="text-link" href="' + href('private','connections') + '" data-node="' + id +
    '">在 Connections 中查看 ' + icon('arrow',15) + '</a>',trigger);
}
function showPublicItem(value, trigger) {
  const [group,id] = value.split(':');
  const item = published[group]?.().find(x=>x.id===id);
  if (!item) return;
  const more = group==='activities'
    ? '<p class="subtle">' + item.time + ' · ' + item.place + '</p><a class="public-primary" href="' + href('public','registration',current.brand) +
      '" data-registration-choice="' + item.id + '">查看报名预览 ' + icon('arrow',15) + '</a>' : '';
  dialog(item.title,'<p>' + item.description + '</p>' + more,trigger);
}
app.addEventListener('click',event=>{
  const el = event.target.closest('button,a');
  if (!el) return;
  if (el.classList.contains('skip')) {
    event.preventDefault();
    app.querySelector('main').focus();
  }
  if (el.hasAttribute('data-close')) app.querySelector('dialog').close();
  if (el.dataset.item) showItem(el.dataset.item,el);
  if (el.dataset.publicItem) showPublicItem(el.dataset.publicItem,el);
  if (el.dataset.registrationChoice) state.selectedActivity = el.dataset.registrationChoice;
  if (el.hasAttribute('data-registration')) {
    const item = published.activities().find(x=>x.id===state.selectedActivity);
    dialog('报名确认预览','<p><strong>' + item.title + '</strong> · ' + item.time + '</p><p>这是示例确认页。没有提交报名或收集个人信息。</p>',el);
  }
  if (el.dataset.node) {
    state.node = el.dataset.node;
    if (current.space==='private' && current.page.id==='connections') {
      event.preventDefault();
      render();
      [...app.querySelectorAll('.connection-path [data-node]')].find(x=>x.dataset.node===state.node)?.focus({preventScroll:true});
    }
  }
  const key = el.dataset.filter;
  if (key && filterKeys.includes(key)) {
    state[key] = key==='category' && state[key]===el.dataset.value ? '' : el.dataset.value;
    render();
    [...app.querySelectorAll('[data-filter]')].find(x=>x.dataset.filter===key && x.dataset.value===el.dataset.value)?.focus({preventScroll:true});
  }
});
app.addEventListener('input',event=>{
  if (event.target.type==='search') document.querySelector('#search-results').innerHTML = searchResults(event.target.value);
});
app.addEventListener('change',event=>{
  if (event.target.id==='activity-select') {
    state.selectedActivity = event.target.value;
    render();
    document.querySelector('#activity-select').focus({preventScroll:true});
  }
});
window.addEventListener('hashchange',()=>{
  state.kind = '';
  window.scrollTo(0,0);
  render(true);
});
render();
