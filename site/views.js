import { icon } from './icons.js';
import { brands, defaultBrand, href, itemHref, matchesCollection, publicHref, tools, workspaces } from './pages.js';
import { studioRepository as studio, publicRepository as published } from './repository.js';

const link = (address, label, cls = 'text-link') => '<a class="' + cls + '" href="' + address + '">' + label + icon('arrow', 15) + '</a>';
const badge = (label, tone = '') => '<span class="badge ' + tone + '">' + label + '</span>';
const empty = '<div class="empty">没有符合条件的示例。请试试其他筛选。</div>';
const intro = (label, heading, description) => '<div class="page-intro"><div class="eyebrow">' + label + '</div><h1>' + heading + '</h1><p>' + description + '</p></div>';
const sectionTitle = (title, sub = '') => '<div class="section-title"><h2>' + title + '</h2>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>';
const options = (items, active, name) => '<div class="filters" aria-label="筛选">' + items.map(([value, label]) =>
  '<button type="button" data-filter="' + name + '" data-value="' + value + '" aria-pressed="' + (active === value) + '">' + label + '</button>').join('') + '</div>';

function row(item, route) {
  return '<a class="content-row" href="' + itemHref(item, route) + '"><span class="row-icon">' + icon(item.kind === 'input' ? 'inbox' : 'pen', 16) +
    '</span><span class="row-copy"><strong>' + item.title + '</strong><small>' + item.category + ' · ' + item.domains.join(' / ') +
    '</small></span><span class="row-end">' + badge(item.visibility, item.visibility === '已公开' ? 'mint' : '') + '<span class="date">' + item.date +
    '</span></span></a>';
}
const rows = (items, route) => items.length ? '<div class="rows">' + items.map(item => row(item, route)).join('') + '</div>' : empty;

function emptyState(title, description, address, action) {
  return '<section class="empty-state"><span class="empty-icon">' + icon('inbox', 23) + '</span><h2>' + title + '</h2><p>' +
    description + '</p>' + link(address, action, 'secondary') + '</section>';
}

const io = [['','全部'],['input','Input · 输入'],['output','Output · 输出']];

export function landing() {
  const entries = [
    ...Object.entries(workspaces).map(([id, entry]) => ({ ...entry, address: href(id), access: 'Private Workspace' })),
    ...Object.entries(brands).map(([id, entry]) => ({ ...entry, address: publicHref(id), access: 'Public Space' })),
  ];
  const spaces = entries.map(entry => '<a class="workspace-entry ' + entry.tone + '" href="' + entry.address + '">' +
    '<span class="entry-meta"><span>' + entry.number + ' / ' + entry.access + '</span>' + icon(entry.icon, 19) + '</span>' +
    '<span class="entry-title">' + entry.label + '</span><span class="entry-description">' + entry.description + '</span>' +
    '<span class="entry-arrow">' + icon('arrow', 19) + '</span></a>').join('');
  return '<section class="landing-hero"><div class="eyebrow">PERSONAL STUDIO / WORKSPACE INDEX</div><h1>Personal Studio OS</h1>' +
    '<p>在这里积累知识、推进项目，也为公开分享留一个入口。</p></section>' +
    '<section aria-label="工作空间" class="workspace-entries">' + spaces + '</section>' +
    '<section class="landing-tools"><div class="eyebrow">共享工具</div><nav aria-label="共享工具">' +
    Object.entries(tools).map(([id, tool]) => '<a href="' + href(id) + '">' + icon(tool.icon, 16) + tool.label + '</a>').join('') +
    '</nav></section>';
}

function recentLinks(items, route) {
  return '<div class="recent-links">' + items.map(item => '<a href="' + itemHref(item, route) + '"><span>' + item.category +
    '</span><strong>' + item.title + '</strong>' + icon('arrow', 15) + '</a>').join('') + '</div>';
}

export function workspaceOverview(route) {
  const { workspace, workspaceId } = route;
  const items = studio.list({domain: workspace.label}).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const entries = workspace.collections.map(collection => '<a href="' + href(workspaceId, collection.id) + '">' +
    '<strong>' + collection.label + '</strong><span>' + collection.description + '</span>' + icon('arrow', 17) + '</a>').join('');
  return '<header class="workspace-hero ' + workspace.tone + '"><div class="eyebrow">' + workspace.number + ' / PRIVATE WORKSPACE</div><h1>' +
    workspace.label + '</h1><p>' + workspace.overview + '</p><span class="workspace-emblem">' + icon(workspace.icon, 75) + '</span></header>' +
    '<section class="overview-section">' + sectionTitle('浏览模块') + '<nav class="module-links" aria-label="' +
    workspace.label + ' 模块">' + entries + '</nav></section><section class="overview-section">' + sectionTitle('最近内容') +
    (items.length ? recentLinks(items, route) : emptyState('这里还没有内容', '此空间的新内容会出现在这里。', href('inbox'), '浏览收集箱')) + '</section>';
}

export function collectionView(state, route) {
  const { workspace, workspaceId, collection } = route;
  const all = studio.list({domain: workspace.label}).filter(item => matchesCollection(item, collection));
  const heading = intro(workspace.label + ' / ' + collection.zh, collection.label, collection.description);
  if (!all.length) return heading + emptyState('这个集合还没有记录', '归入「' + collection.zh + '」的内容会出现在此页。可以先浏览本空间的其他模块。',
    href(workspaceId), '返回 ' + workspace.label);
  const items = all.filter(item => !state.kind || state.kind === item.kind);
  const modes = [['list','List'],['grid','Grid']];
  const results = state.view === 'grid'
    ? '<div class="item-grid">' + items.map(item => '<a href="' + itemHref(item, route) + '"><small>' +
      item.category + ' · ' + item.date + '</small><strong>' + item.title + '</strong><p>' + item.description + '</p>' +
      badge(item.visibility, item.visibility === '已公开' ? 'mint' : '') + '</a>').join('') + '</div>'
    : rows(items, route);
  return heading + '<section aria-label="集合内容"><div class="collection-toolbar">' + options(io, state.kind, 'kind') +
    options(modes, state.view, 'view') + '</div>' + (items.length ? results : empty) + '</section>';
}

export function itemDetail(route) {
  const { record } = route;
  const tags = [record.kind === 'input' ? 'Input' : 'Output', record.format, record.state, record.visibility].filter(Boolean);
  const address = href('connections') + '?node=' + encodeURIComponent(record.id);
  return '<article class="detail-page">' + intro(record.category + ' / ' + record.domains.join(' · '), record.title, record.description) +
    '<div class="detail-tags">' + tags.map(label => badge(label, label === '已公开' ? 'mint' : '')).join('') + '</div>' +
    '<section class="detail-related">' + sectionTitle('直接关联') + relatedLinks(record.id) +
    link(address, '在 Connections 中查看') + '</section></article>';
}

export function missingView(route) {
  const parent = route.type === 'collection' ? href(route.workspaceId, route.collection.id)
    : route.type === 'tool' ? href(route.toolId)
    : route.type === 'public' ? publicHref(route.brandId, route.pageId) : href();
  return intro('PERSONAL STUDIO OS', '找不到这个页面', '这个地址可能已变更，或此集合没有这条记录。') +
    emptyState('回到上一级继续浏览', '从导航可以打开当前可用的页面。', parent, parent === href() ? '返回首页' : '返回集合');
}

const connectionPath = [
  ['excerpt','阅读摘录','Self-Board'],['theme','活动主题','Workshop'],['plan','活动企划','私人输出'],
  ['poster','选择性发布','公开投影'],['practice','线下实践','Workshop'],['story','公开回顾','Public Space'],['reflection','经验回流','Self-Board / Workshop'],
];
function connections(state, route) {
  const item = studio.get(route.params.get('node') || state.node) ?? studio.get('excerpt');
  const matches = studio.list({kind:state.kind,domain:state.domain});
  const path = '<ol class="connection-path">' + connectionPath.map(([id,title,domain],i) => '<li><button data-node="' + id + '" aria-pressed="' +
    (item.id === id) + '"><span class="step-no">0' + (i+1) + '</span><strong>' + title + '</strong><small>' + domain + '</small></button></li>').join('') + '</ol>';
  return intro('共享工具 / CONNECTIONS','看见内容如何流动','沿着一条活动线索走一遍，也可以从任意记录查看它的来源和去向。') +
    '<section class="panel graph">' + sectionTitle('从阅读到下一次活动','可点击节点') + path +
    '<div class="graph-detail"><div><div class="eyebrow">' + (item.kind === 'input' ? 'INPUT' : 'OUTPUT') + ' · ' + item.domains.join(' / ') +
    '</div><h2>' + item.title + '</h2><p>' + item.description + '</p>' + link(itemHref(item, route), '查看完整内容') + '<br>' + badge(item.state) + ' ' + badge(item.visibility, item.visibility === '已公开' ? 'mint' : '') +
    '</div><div class="graph-links"><strong>直接关联</strong>' + relatedLinks(item.id) + '</div></div></section>' +
    '<section class="panel">' + sectionTitle('探索其他记录') + options(io,state.kind,'kind') +
    options([['','全部领域'],['Workshop','Workshop'],['Career','Career'],['Self-Board','Self-Board']],state.domain,'domain') + rows(matches, route) + '</section>';
}
export function relatedLinks(id) {
  const list = studio.related(id);
  return list.length ? list.map(({item,label,incoming}) => '<a class="relation" href="' + itemHref(item) + '"><span>' + (incoming ? '来源 · ' : '去向 · ') + label + '</span><strong>' + item.title + '</strong>' + icon('arrow',14) + '</a>').join('') : '<p>此示例暂无关联。</p>';
}
function creation(state, route) {
  const types = [['','全部'],['进行中','进行中'],['草稿','草稿'],['已完成','已完成']];
  return intro('共享工具 / CREATION','创作与输出','活动企划、个人文章和职业作品可以沿用同一个内容结构，关联不同领域的输入。') +
    '<section class="panel">' + sectionTitle('所有输出') + options(types,state.status,'status') +
    rows(studio.list({kind:'output'}).filter(x=>!state.status || x.state===state.status), route) + '</section>';
}
function publication(state, route) {
  const filters = [['','全部'],['私人','私人'],['待确认','待确认'],['已公开','已公开']];
  return intro('共享工具 / PUBLICATION STATUS','管理作品的可见性','创作阶段和可见性各自记录。已完成的作品仍可以保持私人。') +
    '<section class="panel">' + sectionTitle('可见性') + options(filters,state.visibility,'visibility') +
    '<div class="publication-list">' + studio.list({kind:'output'}).filter(x=>!state.visibility || x.visibility===state.visibility).map(x =>
      '<a href="' + itemHref(x, route) + '"><strong>' + x.title + '</strong><span>' + badge(x.state) + badge(x.visibility,x.visibility==='已公开'?'mint':'') + '</span></a>').join('') + '</div></section>' +
    '<div class="callout">公开空间只展示独立确认后的摘要和媒体。参加者个人信息、私人分享和照片留在内部。 ' + link(publicHref(defaultBrand),'查看公开空间') + '</div>';
}
function inbox(state, route) {
  const filters = [['','全部输入'],['结构化','结构化'],['碎片化','碎片化']];
  return intro('共享工具 / INBOX','先收集，再决定放哪里','结构化输入适合持续积累，碎片化输入适合随手留下。两者进入同一套关联体系。') +
    '<section class="panel">' + sectionTitle('收集箱','只读示例') + options(filters,state.format,'format') +
    rows(studio.list({kind:'input'}).filter(x=>!state.format || x.format===state.format), route) + '</section>';
}
export function searchResults(query, route) {
  return rows(studio.list({query}), route);
}
function search(state, route) {
  return intro('共享工具 / SEARCH','跨领域检索','搜索题名、分类、内容或领域。试试「低熵」「AB-900」或「Self-Board」。') +
    '<section class="panel"><label class="search-field">' + icon('search') + '<input type="search" aria-label="搜索工作台" placeholder="输入关键词"></label><div id="search-results">' + searchResults(state.query, route) + '</div></section>';
}

function art(tone, label = '') {
  return '<div class="art art-' + tone + '" aria-hidden="true"><span class="art-grid"></span><i></i><b></b><em></em><span class="art-label">' +
    label + '</span></div>';
}
function publicIntro(label, title, text) {
  return '<header class="public-intro"><div class="eyebrow">' + label + '</div><h1>' + title + '</h1><p>' + text + '</p></header>';
}
function activityCard(item, brand) {
  return '<article class="public-card">' + art(item.art, 'TOKYO FIELD NOTES') + '<div class="public-card-copy">' + badge(item.type) +
    '<h3>' + item.title + '</h3><p>' + item.subtitle + '</p><small>' + item.time + '</small>' +
    link(publicHref(brand, 'activities', item.id), '了解活动') + '</div></article>';
}
function storyCard(item, brand) {
  return '<article class="public-card">' + art(item.art, 'ICHIGO ICHIE / NOTES') + '<div class="public-card-copy"><div class="eyebrow">' +
    item.category + ' · ' + item.time + '</div><h3>' + item.title + '</h3><p>' + item.description +
    '</p>' + link(publicHref(brand, 'stories', item.id), '阅读示例') + '</div></article>';
}
function publicHome(_state, route) {
  const featured = published.activities()[0];
  return '<section class="public-hero"><div class="hero-copy"><div class="eyebrow">东京 · 线下交流与自我探索</div><h1>把平凡的一天，<br>留给一次相遇。</h1>' +
    '<p>用卡牌、书写与对话，在东京的日常里，为自己和彼此留出一点时间。</p>' +
    link(publicHref(route.brandId,'activities'),'探索活动','public-primary') + '</div>' + art('olive','01 / A MOMENT TO MEET') + '</section>' +
    '<section class="public-section brand-note"><div><div class="eyebrow">下一次相遇 / UPCOMING</div><h2>' + featured.title +
    '</h2><p>' + featured.subtitle + '</p></div>' + link(publicHref(route.brandId,'activities',featured.id),'了解活动') + '</section>' +
    '<section class="public-section brand-note"><div><div class="eyebrow">STORIES / 活动回声</div><h2>相遇之后，故事还在继续。</h2></div>' +
    link(publicHref(route.brandId,'stories'),'读活动回顾') + '</section>';
}
function activities(state, route) {
  const filtered = published.activities().filter(x=>!state.activity || x.type===state.activity);
  return publicIntro('ACTIVITIES / 活动','找一场想参加的活动。','一张桌子、一个主题，和一些愿意一起停下来的人。') +
    options([['','全部'],['开放预览','开放预览'],['往期活动','往期活动']],state.activity,'activity') +
    '<div class="public-grid">' + filtered.map(item => activityCard(item, route.brandId)).join('') + '</div>';
}
function registration(state) {
  const item = published.activities().find(x=>x.id===state.selectedActivity) ?? published.activities()[0];
  return publicIntro('REGISTRATION / 报名','留一个位置给自己。','这里展示从选择场次到确认信息的体验。') +
    '<section class="register"><div class="register-art">' + art(item.art,'ICHIGO ICHIE / TOKYO') + '</div><div class="register-copy">' +
    '<label class="field-label" for="activity-select">选择活动</label><select id="activity-select">' + published.activities().map(x=>'<option value="' +
    x.id + '"' + (x.id===item.id?' selected':'') + '>' + x.title + '</option>').join('') + '</select><h2>' + item.title + '</h2><p>' + item.subtitle + '</p>' +
    '<p class="subtle">' + item.time + ' / ' + item.place + '</p>' + badge('示例场次') +
    '<button class="public-primary" data-registration>查看报名确认 ' + icon('arrow',15) + '</button></div></section>';
}
function stories(state, route) {
  const filters = [['','全部'],['活动回声','活动回声'],['活动记录','活动记录'],['主题延伸','主题延伸']];
  return publicIntro('STORIES / 故事','一些相遇留下的回声。','活动回顾、主题文章和经过选择的作品。') + options(filters,state.story,'story') +
    '<div class="public-grid">' + published.stories().filter(x=>!state.story||x.category===state.story).map(item => storyCard(item, route.brandId)).join('') + '</div>';
}

const loops = [
  { title:'公开运营循环', caption:'从发现一篇文章，到参加一次活动', steps:[
    ['传播','文章、故事或社交平台引起兴趣，带人来到活动网站。'],
    ['宣传','活动页说明主题、体验方式和适合的人群。'],
    ['招募','选择场次并查看报名条件。这个 Demo 只演示页面。'],
    ['线下活动','在东京相遇、交流并进行线下体验。'],
    ['活动回顾','整理经过授权的活动回声，再通过内容触达新的参与者。'],
  ] },
  { title:'内部知识循环', caption:'把现场的经验留给下一次实践', steps:[
    ['活动实践','两条循环在同一次线下活动交汇。'],
    ['经验与反馈','私人记录主持观察与参与者反馈，分开管理授权和可见性。'],
    ['内部积累','将可复用经验连到 Workshop 方法与 Self-Board 的个人思考。'],
    ['更新企划','把学习转为下一次活动设计，再回到现场验证。'],
  ] },
];
function about(state) {
  const selected = state.loop.split(':').map(Number);
  const step = loops[selected[0]].steps[selected[1]];
  return publicIntro('ABOUT / 关于','一期一会 in Tokyo','珍惜此时此地的相遇。在东京，以线下交流探索日常生活里的问题。') +
    '<section class="loop-panel">' + sectionTitle('一次相遇，两条循环','点选任一步查看它如何连接下一步') +
    loops.map((loop,i)=>'<div class="loop-line"><div><strong>' + loop.title + '</strong><p>' + loop.caption + '</p></div><ol>' +
    loop.steps.map(([label],j)=>'<li><button data-filter="loop" data-value="' + i + ':' + j + '" aria-pressed="' + (state.loop===i+':'+j) + '">' +
    label + '</button></li>').join('') + '</ol></div>').join('') +
    '<div class="loop-detail"><strong>' + step[0] + '</strong><p>' + step[1] + '</p></div>' +
    '<p class="privacy-note">' + icon('lock',17) + ' 只有经过确认的摘要和授权素材可以进入公开回顾。</p></section>';
}

export function publicDetail(route) {
  const { record, pageId, brandId } = route;
  const action = pageId === 'activities'
    ? link(publicHref(brandId, 'registration') + '?activity=' + encodeURIComponent(record.id), '查看报名预览', 'public-primary')
    : link(publicHref(brandId, 'stories'), '返回 Stories');
  return '<article class="detail-page">' + publicIntro(record.type || record.category, record.title, record.subtitle || record.time) +
    art(record.art, 'ICHIGO ICHIE / TOKYO') + '<div class="public-detail-copy"><p>' + record.description + '</p>' +
    (record.place ? '<p class="subtle">' + record.time + ' · ' + record.place + '</p>' : '') + action + '</div></article>';
}

export const toolViews = { connections, creation, publication, inbox, search };
export const publicViews = { yiqiyihui: { home:publicHome, activities, registration, stories, about } };
