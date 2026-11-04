import { icon } from './icons.js';
import { href } from './pages.js';
import { studioRepository as studio, publicRepository as published } from './repository.js';

const link = (space, page, label, cls = 'text-link') => '<a class="' + cls + '" href="' + href(space, page) + '">' + label + icon('arrow', 15) + '</a>';
const badge = (label, tone = '') => '<span class="badge ' + tone + '">' + label + '</span>';
const empty = '<div class="empty">没有符合条件的示例。请试试其他筛选。</div>';
const intro = (label, heading, description) => '<div class="page-intro"><div class="eyebrow">' + label + '</div><h1>' + heading + '</h1><p>' + description + '</p></div>';
const sectionTitle = (title, sub = '') => '<div class="section-title"><h2>' + title + '</h2>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>';
const options = (items, active, name) => '<div class="filters" aria-label="筛选">' + items.map(([value, label]) =>
  '<button type="button" data-filter="' + name + '" data-value="' + value + '" aria-pressed="' + (active === value) + '">' + label + '</button>').join('') + '</div>';

function row(item) {
  const isPublic = item.visibility === '已公开';
  return '<button type="button" class="content-row" data-item="' + item.id + '"><span class="row-icon">' + icon(item.kind === 'input' ? 'inbox' : 'pen', 16) +
    '</span><span class="row-copy"><strong>' + item.title + '</strong><small>' + item.category + ' · ' + item.domains.join(' / ') +
    '</small></span><span class="row-end">' + badge(item.visibility, isPublic ? 'mint' : '') + '<span class="date">' + item.date + '</span></span></button>';
}
const rows = items => items.length ? '<div class="rows">' + items.map(row).join('') + '</div>' : empty;

function panel(title, items, note = '') {
  return '<section class="panel">' + sectionTitle(title, note) + rows(items) + '</section>';
}

function domainCard(id, code, title, desc, symbol, tone) {
  return '<a class="domain-card ' + tone + '" href="' + href('private', id) + '"><span class="card-head"><span class="domain-icon">' +
    icon(symbol, 21) + '</span><span class="card-index">' + code + '</span></span><strong>' + title +
    '</strong><span class="domain-caption">' + desc + '</span><span class="card-arrow">' + icon('arrow', 17) + '</span></a>';
}

const stageLabels = ['Capture','Organize','Connect','Create','Publish','Reflect'];
const stageIds = ['excerpt','theme','plan','practice','poster','reflection'];
function rhythm() {
  return '<section class="rhythm"><div class="rhythm-copy"><div class="eyebrow">工作流 / STUDIO RHYTHM</div><h2>让想法继续生长。</h2><p>收集、关联与创作，然后选择如何分享。</p></div>' +
    '<div class="rhythm-steps">' + stageLabels.map((label,i) => '<a href="' + href('private','connections') + '" data-node="' + stageIds[i] + '"><span>' + String(i+1).padStart(2,'0') + '</span>' + label + '</a>').join('') + '</div></section>';
}

function privateHome() {
  return '<div class="home-welcome"><div>' + intro('个人工作台 / STUDIO HOME','回到正在做的事','把阅读、工作和创作里值得留下的东西，放进一个能互相连接的空间。') + '</div><a class="primary" href="' + href('private','inbox') + '">' + icon('inbox',17) + ' 打开收集箱</a></div>' +
    '<section>' + sectionTitle('积累领域','三个领域，共享一套关联') + '<div class="domain-grid">' +
    domainCard('workshop','01','Workshop','活动企划、卡牌、方法与复盘','workshop','sage') +
    domainCard('career','02','Career','工作经验、作品与资格学习','career','sand') +
    domainCard('self-board','03','Self-Board','阅读、观察、笔记与创作','self','lilac') +
    '</div></section><div class="home-grid"><section class="panel">' + sectionTitle('继续进行','项目与最近访问') +
    rows(['plan','ab900','excerpt'].map(id => studio.get(id))) + '</section><section class="panel">' + sectionTitle('最近收集','3 条待整理') +
    rows(['capture','cards','reflection'].map(id => studio.get(id))) + '</section></div>' + rhythm() +
    '<section class="panel recent-creation">' + sectionTitle('最近创作','创作状态与可见性独立') +
    rows(['story','case'].map(id => studio.get(id))) + link('private','creation','查看所有输出') + '</section>';
}

const io = [['','全部'],['input','Input · 输入'],['output','Output · 输出']];
function workshop(state) {
  const selected = studio.list({ domain:'Workshop', kind:state.kind });
  return intro('领域 01 / WORKSHOP','Workshop','让活动主题、带领方法与每一次现场实践，互相成为下一次创作的材料。') +
    '<div class="feature-banner sage"><div><div class="eyebrow">当前企划</div><h2>低熵生活</h2><p>在混乱里找到内在秩序。</p></div>' +
    '<button class="secondary" data-item="plan">查看项目关联 ' + icon('arrow',15) + '</button></div>' +
    '<section class="panel">' + sectionTitle('企划与积累','卡牌 Wiki · 理论与方法 · 带领与复盘') + options(io,state.kind,'kind') + rows(selected) + '</section>';
}
function career(state) {
  return intro('领域 02 / CAREER','Career','记录职业经验，积累技术与方法，并把它们组织成可说明的作品。') +
    '<div class="topic-grid"><article class="topic-card sand">' + icon('career',26) + '<h2>职业档案</h2><p>工作项目、技术知识、简历与 Portfolio。</p><button class="text-link" data-item="case">查看作品示例 ' + icon('arrow',15) + '</button></article>' +
    '<article class="topic-card"><span class="eyebrow">CERTIFICATION</span><h2>AB-900 学习档案</h2><p>整理认证主题、学习索引与刷题记录。</p><button class="text-link" data-item="ab900">查看学习示例 ' + icon('arrow',15) + '</button></article></div>' +
    '<section class="panel">' + sectionTitle('职业知识与作品') + options(io,state.kind,'kind') + rows(studio.list({domain:'Career',kind:state.kind})) + '</section>';
}
const categories = ['Reading','Watching','Notes','Thoughts','Inspirations','Journals','Creative Works'];
function selfBoard(state) {
  const items = studio.list({domain:'Self-Board',kind:state.kind}).filter(item => !state.category || item.category === state.category);
  return intro('领域 03 / SELF-BOARD','Self-Board','给阅读、观察与尚未成形的念头留一个地方。') +
    '<div class="shelf" aria-label="个人积累分类">' + categories.map((cat, i) =>
      '<button data-filter="category" data-value="' + cat + '" aria-pressed="' + (state.category === cat) + '"><span>0' + (i+1) + '</span>' + cat + '</button>').join('') +
    '</div><section class="panel">' + sectionTitle(state.category || '个人笔记与创作') + options(io,state.kind,'kind') + rows(items) + '</section>';
}

const connectionPath = [
  ['excerpt','阅读摘录','Self-Board'],['theme','活动主题','Workshop'],['plan','活动企划','私人输出'],
  ['poster','选择性发布','公开投影'],['practice','线下实践','Workshop'],['story','公开回顾','Public Space'],['reflection','经验回流','Self-Board / Workshop'],
];
function connections(state) {
  const item = studio.get(state.node) ?? studio.get('excerpt');
  const matches = studio.list({kind:state.kind,domain:state.domain});
  const path = '<ol class="connection-path">' + connectionPath.map(([id,title,domain],i) => '<li><button data-node="' + id + '" aria-pressed="' +
    (item.id === id) + '"><span class="step-no">0' + (i+1) + '</span><strong>' + title + '</strong><small>' + domain + '</small></button></li>').join('') + '</ol>';
  return intro('共享工具 / CONNECTIONS','看见内容如何流动','沿着一条活动线索走一遍，也可以从任意记录查看它的来源和去向。') +
    '<section class="panel graph">' + sectionTitle('从阅读到下一次活动','可点击节点') + path +
    '<div class="graph-detail"><div><div class="eyebrow">' + (item.kind === 'input' ? 'INPUT' : 'OUTPUT') + ' · ' + item.domains.join(' / ') +
    '</div><h2>' + item.title + '</h2><p>' + item.description + '</p>' + badge(item.state) + ' ' + badge(item.visibility, item.visibility === '已公开' ? 'mint' : '') +
    '</div><div class="graph-links"><strong>直接关联</strong>' + relatedLinks(item.id) + '</div></div></section>' +
    '<section class="panel">' + sectionTitle('探索其他记录') + options(io,state.kind,'kind') +
    options([['','全部领域'],['Workshop','Workshop'],['Career','Career'],['Self-Board','Self-Board']],state.domain,'domain') + rows(matches) + '</section>';
}
export function relatedLinks(id) {
  const list = studio.related(id);
  return list.length ? list.map(({item,label,incoming}) => '<a class="relation" href="' + href('private','connections') + '" data-node="' +
    item.id + '"><span>' + (incoming ? '来源 · ' : '去向 · ') + label + '</span><strong>' + item.title + '</strong>' + icon('arrow',14) + '</a>').join('') : '<p>此示例暂无关联。</p>';
}
function creation(state) {
  const types = [['','全部'],['进行中','进行中'],['草稿','草稿'],['已完成','已完成']];
  return intro('共享工具 / CREATION','创作与输出','活动企划、个人文章和职业作品可以沿用同一个内容结构，关联不同领域的输入。') +
    '<section class="panel">' + sectionTitle('所有输出') + options(types,state.status,'status') +
    rows(studio.list({kind:'output'}).filter(x=>!state.status || x.state===state.status)) + '</section>';
}
function publication(state) {
  const filters = [['','全部'],['私人','私人'],['待确认','待确认'],['已公开','已公开']];
  return intro('共享工具 / PUBLICATION STATUS','管理作品的可见性','创作阶段和可见性各自记录。已完成的作品仍可以保持私人。') +
    '<section class="panel">' + sectionTitle('可见性') + options(filters,state.visibility,'visibility') +
    '<div class="publication-list">' + studio.list({kind:'output'}).filter(x=>!state.visibility || x.visibility===state.visibility).map(x =>
      '<button data-item="' + x.id + '"><strong>' + x.title + '</strong><span>' + badge(x.state) + badge(x.visibility,x.visibility==='已公开'?'mint':'') + '</span></button>').join('') + '</div></section>' +
    '<div class="callout">公开空间只展示独立确认后的摘要和媒体。参加者个人信息、私人分享和照片留在内部。 ' + link('public','home','查看公开空间') + '</div>';
}
function inbox(state) {
  const filters = [['','全部输入'],['结构化','结构化'],['碎片化','碎片化']];
  return intro('共享工具 / INBOX','先收集，再决定放哪里','结构化输入适合持续积累，碎片化输入适合随手留下。两者进入同一套关联体系。') +
    '<section class="panel">' + sectionTitle('收集箱','只读示例') + options(filters,state.format,'format') +
    rows(studio.list({kind:'input'}).filter(x=>!state.format || x.format===state.format)) + '</section>';
}
export function searchResults(query) {
  return rows(studio.list({query}));
}
function search() {
  return intro('共享工具 / SEARCH','跨领域检索','搜索题名、分类、内容或领域。试试「低熵」「AB-900」或「Self-Board」。') +
    '<section class="panel"><label class="search-field">' + icon('search') + '<input type="search" aria-label="搜索工作台" placeholder="输入关键词"></label><div id="search-results">' + searchResults('') + '</div></section>';
}

function art(tone, label = '') {
  return '<div class="art art-' + tone + '" aria-hidden="true"><span class="art-grid"></span><i></i><b></b><em></em><span class="art-label">' +
    label + '</span></div>';
}
function publicIntro(label, title, text) {
  return '<header class="public-intro"><div class="eyebrow">' + label + '</div><h1>' + title + '</h1><p>' + text + '</p></header>';
}
function activityCard(item) {
  return '<article class="public-card">' + art(item.art, 'TOKYO FIELD NOTES') + '<div class="public-card-copy">' + badge(item.type) +
    '<h3>' + item.title + '</h3><p>' + item.subtitle + '</p><small>' + item.time + '</small><button class="text-link" data-public-item="activities:' +
    item.id + '">了解活动 ' + icon('arrow',15) + '</button></div></article>';
}
function storyCard(item) {
  return '<article class="public-card">' + art(item.art, 'ICHIGO ICHIE / NOTES') + '<div class="public-card-copy"><div class="eyebrow">' +
    item.category + ' · ' + item.time + '</div><h3>' + item.title + '</h3><p>' + item.description +
    '</p><button class="text-link" data-public-item="stories:' + item.id + '">阅读示例 ' + icon('arrow',15) + '</button></div></article>';
}
function publicHome() {
  return '<section class="public-hero"><div class="hero-copy"><div class="eyebrow">东京 · 线下交流与自我探索</div><h1>把平凡的一天，<br>留给一次相遇。</h1>' +
    '<p>用卡牌、书写与对话，在东京的日常里，为自己和彼此留出一点时间。</p>' +
    link('public','activities','探索活动','public-primary') + '</div>' + art('olive','01 / A MOMENT TO MEET') + '</section>' +
    '<section class="public-section">' + sectionTitle('下一次相遇','Upcoming') + '<div class="public-grid">' +
    published.activities().map(activityCard).join('') + '</div></section>' +
    '<section class="public-section brand-note"><div><div class="eyebrow">STORIES / 活动回声</div><h2>相遇之后，故事还在继续。</h2></div>' +
    link('public','stories','读活动回顾') + '</section>';
}
function activities(state) {
  const filtered = published.activities().filter(x=>!state.activity || x.type===state.activity);
  return publicIntro('ACTIVITIES / 活动','找一场想参加的活动。','一张桌子、一个主题，和一些愿意一起停下来的人。') +
    options([['','全部'],['开放预览','开放预览'],['往期活动','往期活动']],state.activity,'activity') +
    '<div class="public-grid">' + filtered.map(activityCard).join('') + '</div>';
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
function stories(state) {
  const filters = [['','全部'],['活动回声','活动回声'],['活动记录','活动记录'],['主题延伸','主题延伸']];
  return publicIntro('STORIES / 故事','一些相遇留下的回声。','活动回顾、主题文章和经过选择的作品。') + options(filters,state.story,'story') +
    '<div class="public-grid">' + published.stories().filter(x=>!state.story||x.category===state.story).map(storyCard).join('') + '</div>';
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

export const privateViews = { home:privateHome, workshop, career, 'self-board':selfBoard, connections, creation, publication, inbox, search };
export const publicViews = { tokyo: { home:publicHome, activities, registration, stories, about } };
