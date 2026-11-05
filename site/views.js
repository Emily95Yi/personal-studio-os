import { icon } from './icons.js';
import { brands, href, publicHref, workspaces, workshopStructure } from './pages.js';
import { plannerRepository, studioRepository, workshopRepository } from './repository.js';
import { addDays, calendarHref, dateKey, formatPeriod, parseDate, periodBounds } from './calendar.js';

export function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, char => entities[char]);
}

function heading(label, title, description = '') {
  return '<header class="page-intro"><div class="eyebrow">' + escapeHtml(label) + '</div><h1>' + escapeHtml(title) + '</h1>' +
    (description ? '<p>' + escapeHtml(description) + '</p>' : '') + '</header>';
}

function emptyState(title, description) {
  return '<section class="empty-state"><h2>' + escapeHtml(title) + '</h2><p>' + escapeHtml(description) + '</p></section>';
}

function entry(address, area) {
  return '<a class="workspace-entry ' + area.tone + '" href="' + address + '"><span class="entry-icon">' +
    icon(area.icon, 20) + '</span><span><strong>' + area.label + '</strong><small>' + area.description + '</small></span>' +
    icon('arrow', 18) + '</a>';
}

export function landing() {
  return '<header class="landing-title"><h1>Personal Studio OS</h1></header>' +
    '<section class="landing-section" aria-labelledby="private-label"><h2 id="private-label">Private Workspace</h2><div class="workspace-entries">' +
    Object.entries(workspaces).map(([id, area]) => entry(href(id), area)).join('') + '</div></section>' +
    '<section class="landing-section" aria-labelledby="public-label"><h2 id="public-label">Public Space</h2><div class="workspace-entries">' +
    Object.entries(brands).map(([id, area]) => entry(publicHref(id), area)).join('') + '</div></section>' +
    '<div class="landing-shortcut">' + previewLink(href('calendar'), '打开 Calendar') + '</div>';
}

function widgetTitle(id, collection, overview) {
  const title = '<h2>' + escapeHtml(collection.label) + '</h2>';
  return overview ? '<div class="section-heading">' + title +
    '<a class="return-link" href="' + href('self-board', id) + '">打开 ' + escapeHtml(collection.label) + ' ' + icon('arrow', 15) +
    '</a></div>' : '';
}

function contentWidget(id, collection, overview = true) {
  const entries = studioRepository.list({ domain: 'Self-Board' }).filter(item => item.views?.includes(id) ?? id === 'discover');
  const title = widgetTitle(id, collection, overview);
  const visual = {
    discover: '<div class="discover-motifs" aria-hidden="true"><i></i><i></i><i></i></div>',
    experience: '<div class="experience-motif" aria-hidden="true"></div>',
    'reflect-create': '<div class="editorial-motif" aria-hidden="true">Aa <span>—</span></div>',
  }[id];
  const cards = entries.map(item => {
    const src = id !== 'reflect-create' && mediaUrl(item.coverUrl);
    const text = '<small>' + escapeHtml([item.contentType || item.category, item.date].filter(Boolean).join(' · ')) + '</small><strong>' +
      escapeHtml(item.title) + '</strong>' + (id === 'reflect-create' && item.description ? '<p>' + escapeHtml(item.description) + '</p>' : '');
    return '<article>' + (src ? '<img src="' + src + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') +
      (id === 'discover' ? '<a href="' + href('self-board', 'discover', item.id) + '">' + text + '</a>' : text) + '</article>';
  }).join('');
  return '<section class="widget widget-' + id + '">' + title + (cards ? '<div class="widget-items">' + cards + '</div>' :
    visual + '<p><strong>' + collection.empty + '</strong></p><p>' + collection.description + '</p>') + '</section>';
}

function habitWidget(collection, overview = false) {
  const today = parseDate(dateKey());
  const [start, end] = periodBounds(today, 'week');
  const completed = plannerRepository.checkInsBetween(dateKey(start), dateKey(end));
  const checked = completed.includes(dateKey(today));
  return '<section class="widget widget-habits">' + widgetTitle('sop-habits', collection, overview) +
    '<div class="habit-status"><div><div class="eyebrow">今日习惯 · 演示</div><strong>' + (checked ? '已打卡' : '还未打卡') +
    '</strong></div><div><small>本周 ' + completed.length + ' / 7 天</small><progress max="7" value="' + completed.length +
    '" aria-label="本周打卡天数"></progress></div></div><div class="widget-actions">' +
    previewLink(href('self-board', 'sop-habits', 'focus'), '进入 Habit Focus') +
    previewLink(href('self-board', 'sop-habits', 'sop'), '打开 SOP 执行预览') + '</div></section>';
}

function todoWidget(collection, period = 'week', overview = false) {
  const today = parseDate(dateKey());
  const [start, end] = periodBounds(today, period);
  const tasks = plannerRepository.tasksBetween(dateKey(start), dateKey(end));
  const summary = tasks.length ? '<ul class="task-summary">' + tasks.slice(0, 4).map(task => '<li><a href="' +
    escapeHtml(calendarHref(parseDate(task.date), period)) + '">' + escapeHtml(task.title) +
    '</a><small>' + escapeHtml(task.date) + (task.done ? ' · 已完成' : '') + '</small></li>').join('') + '</ul>' :
    '<p>暂无演示待办。</p>';
  return '<section class="widget widget-todo">' + widgetTitle('to-do', collection, overview) +
    '<div class="section-heading"><small>' + formatPeriod(today, period) + '</small><div class="segmented" aria-label="待办摘要周期">' +
    [['week', '本周'], ['month', '本月']].map(([mode, label]) => '<button type="button" data-period="' +
      mode + '" aria-pressed="' + (period === mode) + '">' + label + '</button>').join('') + '</div></div>' +
    summary + previewLink(escapeHtml(calendarHref(today, period)), '打开 Calendar') + '</section>';
}

const sopSteps = ['确认要执行的流程', '按顺序完成当前步骤', '检查结果并结束流程'];

export function actionPreview({ action, sopStep = 0 }) {
  const today = dateKey();
  if (action === 'focus') {
    const recent = plannerRepository.checkInsBetween(dateKey(addDays(parseDate(today), -6)), today);
    const checked = recent.includes(today);
    return heading('SELF-BOARD / HABIT', 'Habit Focus', '打卡结构预览。操作只在当前页面会话中保留，刷新后清除。') +
      '<section class="empty-state"><h2>今日习惯</h2><p>演示每日一次的执行记录。完成后可以标记，误点可以撤销。</p>' +
      '<button type="button" class="action-button" data-check-in>' + (checked ? '撤销今日打卡' : '记录今日打卡') + '</button></section>' +
      '<section class="empty-state action-history"><h2>最近 7 天记录</h2>' +
      (recent.length ? '<ul>' + recent.map(date => '<li>' + date + ' · 已打卡</li>').join('') + '</ul>' : '<p>暂无打卡记录。</p>') + '</section>';
  }
  const steps = sopSteps.map((step, index) => '<li' + (index === sopStep ? ' aria-current="step"' : '') + '>' +
    (index < sopStep ? '<span class="visually-hidden">已完成：</span>' : '') + step + '</li>').join('');
  return heading('SELF-BOARD / SOP', 'SOP 执行', '按顺序体验一个可复用流程。进度只在当前页面会话中保留。') +
    '<section class="empty-state"><h2>流程结构预览</h2><ol class="sop-steps">' + steps + '</ol>' +
    '<p aria-live="polite">' + (sopStep === sopSteps.length ? '流程已完成。' : '当前步骤 ' + (sopStep + 1) + ' / ' + sopSteps.length) + '</p>' +
    '<div class="widget-actions">' + (sopStep ? '<button type="button" class="action-button secondary" data-sop-step="previous">上一步</button>' : '') +
    (sopStep === sopSteps.length ? '<button type="button" class="action-button" data-sop-step="reset">重新开始</button>' :
      '<button type="button" class="action-button" data-sop-step="next">' + (sopStep === sopSteps.length - 1 ? '完成流程' : '完成此步') + '</button>') +
    '</div></section>';
}

export function workspaceOverview({ workspace, workspaceId, period = 'week' }) {
  if (workspaceId === 'self-board') {
    const { collections } = workspace;
    return '<div class="board-header">' + heading('PRIVATE WORKSPACE', workspace.label, workspace.description) +
      previewLink(href('calendar'), '打开 Calendar') + '</div><div class="board-grid">' +
      ['discover', 'experience', 'reflect-create'].map(id => contentWidget(id, collections[id])).join('') +
      habitWidget(collections['sop-habits'], true) + todoWidget(collections['to-do'], period, true) + '</div>';
  }
  const entries = Object.entries(workspace.collections).map(([id, collection]) =>
    '<a href="' + href(workspaceId, id) + '"><strong>' + collection.label + '</strong><span>' + collection.zh + '</span>' +
    icon('arrow', 16) + '</a>').join('');
  return '<div class="workspace-hero ' + workspace.tone + '">' +
    heading('PRIVATE WORKSPACE', workspace.label, workspace.description) + '</div>' +
    '<nav class="module-links" aria-label="' + workspace.label + ' 集合">' + entries + '</nav>';
}

function previewLink(address, label) {
  return '<a class="return-link preview-link" href="' + address + '">' + label + ' ' + icon('arrow', 15) + '</a>';
}

function mediaUrl(value) {
  if (!value || /[\\\u0000-\u0020]/.test(value)) return null;
  return /^(https:\/\/|\/(?!\/)|\.\/)/i.test(value) ? escapeHtml(value) : null;
}

function cover(kind, url, label) {
  const src = mediaUrl(url);
  return '<div class="gallery-cover cover-' + kind + '">' +
    (src ? '<img src="' + src + '" alt="" loading="lazy" referrerpolicy="no-referrer">' :
      '<span aria-hidden="true" class="cover-mark">' + (kind === 'event' ? 'E' : 'P') + '</span><span class="cover-caption">' + label + '</span>') + '</div>';
}

function galleryCard({ address, title, detail, kind, url, placeholder }) {
  return '<a class="gallery-card" href="' + address + '">' + cover(kind, url, placeholder) +
    '<div class="gallery-copy"><strong>' + escapeHtml(title) + '</strong>' +
    (detail ? '<p>' + escapeHtml(detail) + '</p>' : '') + '</div></a>';
}

export function workshopGallery({ workspace }) {
  const projects = workshopRepository.listProjects();
  const cards = projects.length ? projects.map(project => galleryCard({
    address: href('workshop', 'projects', project.id), title: project.title, detail: project.description,
    kind: 'project', url: project.coverUrl, placeholder: '暂无封面',
  })).join('') : galleryCard({
    address: href('workshop', 'projects', workshopStructure.previewId), title: 'Project 结构预览',
    detail: '查看活动海报与项目资源的布局。', kind: 'project', placeholder: '结构占位',
  });
  return heading('PRIVATE WORKSPACE', workspace.label, workspace.description) +
    '<section class="gallery-section" aria-label="Projects Gallery"><div class="section-heading"><h2>Projects</h2>' +
    (!projects.length ? '<span>暂无项目 · 可浏览结构预览</span>' : '') + '</div><div class="gallery-grid">' + cards + '</div></section>';
}

export function collectionView({ workspace, workspaceId, collection, collectionId, period = 'week' }) {
  const intro = heading(workspace.label, collection.label);
  if (workspaceId === 'self-board') {
    if (collectionId === 'to-do') return intro + todoWidget(collection, period);
    if (collectionId === 'sop-habits') return intro + habitWidget(collection);
    return intro + contentWidget(collectionId, collection, false);
  }
  return intro + emptyState(collection.empty, collection.description);
}

export function projectOverview({ project, projectPath, projectLabel, preview }) {
  const events = preview ? [] : workshopRepository.listEvents(project.id);
  const cards = events.length ? events.map(event => galleryCard({
    address: href(...projectPath, 'events', event.id), title: event.theme || event.title, detail: event.date,
    kind: 'event', url: event.posterUrl, placeholder: '暂无海报',
  })).join('') : preview ? galleryCard({
    address: href(...projectPath, 'events', workshopStructure.previewId), title: 'Event 结构预览',
    detail: '查看流程、媒体、复盘与引用。', kind: 'event', placeholder: '海报占位',
  }) : '';
  return heading(preview ? 'WORKSHOP / PROJECT PREVIEW' : 'WORKSHOP / PROJECT', projectLabel,
    preview ? '一个可持续迭代的活动形式。此页面展示 Project 的内容布局。' : project.description) +
    '<section class="gallery-section" aria-label="Events Poster Gallery"><div class="section-heading"><h2>Events</h2>' +
    (!events.length ? '<span>暂无活动</span>' : '') + '</div>' +
    (cards ? '<div class="gallery-grid poster-grid">' + cards + '</div>' :
      emptyState(workshopStructure.sections.events.empty, workshopStructure.sections.events.description)) + '</section>' +
    '<section class="related-panel"><div class="section-heading"><h2>Related Resources</h2>' +
    previewLink(href(...projectPath, 'resources'), '查看资源模块') + '</div>' +
    resourceModules(project, true) + '</section>';
}

function originalLink(sourceId) {
  const original = sourceId && studioRepository.get(sourceId);
  if (!original || (!original.domains.includes('Self-Board') && original.primaryWorkspace !== 'Self-Board')) return '';
  return '<a class="return-link" href="' + href('self-board', 'discover', original.id) + '">' +
    escapeHtml(original.title) + ' ' + icon('arrow', 14) + '</a>';
}

function resourceModules(project, compact = false) {
  const modules = project?.resourceModules ?? workshopStructure.defaultResourceModules;
  const resources = project ? workshopRepository.listResources(project.id) : [];
  if (!modules.length) return emptyState('还没有配置资源模块', '此项目可以按需要定义自己的资源分组。');
  return '<div class="resource-modules' + (compact ? ' compact-modules' : '') + '">' + modules.map(module => {
    const items = resources.filter(resource => resource.moduleId === module.id);
    return '<section><h3>' + escapeHtml(module.label) + '</h3>' +
      (module.zh ? '<p class="section-note">' + escapeHtml(module.zh) + '</p>' : '') +
      (items.length ? '<ul>' + items.map(item => '<li>' +
        (originalLink(item.sourceContentId) || escapeHtml(item.title)) + '</li>').join('') + '</ul>' :
        (compact ? '' : '<p class="section-note">这个模块还没有资料。</p>')) + '</section>';
  }).join('') + '</div>';
}

export function projectSection({ project, section }) {
  return heading('WORKSHOP / PROJECT', section.label, section.description) + resourceModules(project);
}

export function eventDetail({ event, eventLabel, preview }) {
  const sections = workshopStructure.eventSections.map(section => {
    let body;
    if (section.fields) {
      body = '<dl class="event-fields">' + section.fields.map(field => '<div><dt>' + field.label +
        '</dt><dd>' + escapeHtml(event?.[field.key] ?? '未填写') + '</dd></div>').join('') + '</dl>';
    } else {
      const value = section.label === 'Flow' ? event?.flow : section.label === 'Reflection' ? event?.reflection : '';
      const media = section.label === 'Poster & Media' && mediaUrl(event?.posterUrl);
      const attachments = section.label === 'Poster & Media' ? (event?.media ?? []).filter(item => mediaUrl(item.url)) : [];
      body = media || attachments.length ? (media ? '<img class="detail-poster" src="' + media + '" alt="活动海报" referrerpolicy="no-referrer">' : '') +
        '<ul>' + attachments.map(item => '<li><a class="return-link" href="' + mediaUrl(item.url) + '">' +
          escapeHtml(item.label) + '</a></li>').join('') + '</ul>' : '<p class="prose">' + escapeHtml(value || section.empty) + '</p>';
    }
    return '<section class="empty-state"><h2>' + section.label + '</h2><p class="section-note">' +
      section.zh + '</p>' + body + '</section>';
  }).join('');
  const uses = event?.resourceUses ?? [];
  const related = uses.length ? '<ul>' + uses.map(use => {
    const resource = workshopRepository.listResources(event.projectId).find(item => item.id === use.resourceId);
    const title = use.snapshot?.title || resource?.title || '资源记录';
    return '<li>' + escapeHtml(title) + (use.versionId ? ' · ' + escapeHtml(use.versionId) : '') +
      (resource?.sourceContentId ? ' ' + originalLink(resource.sourceContentId) : '') + '</li>';
  }).join('') + '</ul>' : '<p>暂无当次引用。未来可记录实际采用的资源版本或快照。</p>';
  return heading(preview ? 'WORKSHOP / EVENT PREVIEW' : 'WORKSHOP / EVENT', eventLabel) +
    '<div class="detail-stack">' + sections + '<section class="empty-state"><h2>当次引用的资源</h2>' +
    related + '</section></div>';
}

export function discoverDetail({ record }) {
  return heading('SELF-BOARD / DISCOVER', record.title, record.category) +
    '<div class="empty-state prose">' + escapeHtml(record.description || '暂无说明。') + '</div>';
}

export function publicView({ brand, page, pageId }) {
  const isHome = pageId === 'home';
  return heading(isHome ? 'PUBLIC SPACE' : brand.label, isHome ? brand.label : page.label,
    isHome ? brand.description : '') + emptyState(page.empty, page.description);
}

export function searchView() {
  return heading('PERSONAL STUDIO OS', 'Search', '跨空间搜索内容。') +
    '<form class="search-form" role="search"><label for="studio-query">关键词</label>' +
    '<div class="search-field">' + icon('search', 18) + '<input id="studio-query" name="query" type="search" placeholder="输入标题或关键词"></div></form>' +
    '<section class="empty-state" aria-live="polite"><h2 class="search-status">还没有可搜索的内容</h2><p class="search-note">接入内容后，可以在这里搜索。</p>' +
    '<ul class="search-results" hidden></ul></section>';
}

export function missingView({ parent, parentLabel }) {
  return heading('PERSONAL STUDIO OS', '页面未找到', '这个地址当前没有可浏览的页面。') +
    '<a class="return-link" href="' + parent + '">返回 ' + escapeHtml(parentLabel) + ' ' + icon('arrow', 15) + '</a>';
}
