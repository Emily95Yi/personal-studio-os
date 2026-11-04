import { icon } from './icons.js';
import { brands, href, publicHref, workspaces, workshopStructure } from './pages.js';
import { workshopRepository } from './repository.js';

export function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, char => entities[char]);
}

function heading(label, title, description = '') {
  return '<header class="page-intro"><div class="eyebrow">' + escapeHtml(label) + '</div><h1>' + escapeHtml(title) + '</h1>' +
    (description ? '<p>' + escapeHtml(description) + '</p>' : '') + '</header>';
}

function emptyState(title, description) {
  return '<section class="empty-state"><h2>' + title + '</h2><p>' + description + '</p></section>';
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
    Object.entries(brands).map(([id, area]) => entry(publicHref(id), area)).join('') + '</div></section>';
}

export function workspaceOverview({ workspace, workspaceId }) {
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

function recordList(records, path) {
  return '<ul class="record-list">' + records.map(record => '<li><a href="' + href(...path, record.id) + '">' +
    escapeHtml(record.title) + ' ' + icon('arrow', 16) + '</a></li>').join('') + '</ul>';
}

export function collectionView({ workspace, workspaceId, collection, collectionId }) {
  const intro = heading(workspace.label, collection.label);
  if (workspaceId === 'workshop' && collectionId === 'projects') {
    const projects = workshopRepository.listProjects();
    if (projects.length) return intro + recordList(projects, ['workshop', 'projects']);
    return intro + emptyState(collection.empty, collection.description) +
      previewLink(href('workshop', 'projects', workshopStructure.previewId), '打开 Project 结构预览');
  }
  if (collection.sections) {
    return intro + '<div class="detail-stack">' + collection.sections.map(section =>
      '<section class="empty-state"><h2>' + section.label + '</h2><h3>' + section.empty + '</h3><p>' +
      section.description + '</p></section>').join('') + '</div>';
  }
  return intro + emptyState(collection.empty, collection.description);
}

export function projectOverview({ project, projectPath, projectLabel, preview }) {
  const entries = Object.entries(workshopStructure.sections).map(([id, section]) =>
    '<a href="' + href(...projectPath, id) + '"><strong>' + section.label + '</strong><span>' + section.zh + '</span>' +
    icon('arrow', 16) + '</a>').join('');
  return heading(preview ? 'WORKSHOP / PROJECT PREVIEW' : 'WORKSHOP / PROJECT', projectLabel,
    preview ? '这里预览一个长期活动形式的页面结构，暂无真实项目记录。' : project.description) +
    '<nav class="module-links" aria-label="Project 板块">' + entries + '</nav>';
}

function resourcesView({ project, projectPath, section }) {
  const modules = project?.resourceModules ?? workshopStructure.defaultResourceModules;
  const resources = project ? workshopRepository.listResources(projectPath.at(-1)) : [];
  const intro = heading('WORKSHOP / PROJECT', section.label, section.description);
  if (!modules.length) return intro + emptyState('还没有配置资源模块', '此项目可以按需要定义自己的资源分组。');
  return intro + '<div class="detail-stack">' + modules.map(module => {
    const items = resources.filter(resource => resource.moduleId === module.id);
    return '<section class="empty-state"><h2>' + escapeHtml(module.label) + '</h2>' +
      (module.zh ? '<p>' + escapeHtml(module.zh) + '</p>' : '') +
      (items.length ? '<ul>' + items.map(item => '<li>' + escapeHtml(item.title) + '</li>').join('') + '</ul>' :
        '<p class="section-note">这个模块还没有资料。</p>') + '</section>';
  }).join('') + '</div>';
}

export function projectSection(route) {
  if (route.sectionId === 'resources') return resourcesView(route);
  const { preview, projectPath, section, sectionPath } = route;
  const events = preview ? [] : workshopRepository.listEvents(projectPath.at(-1));
  return heading('WORKSHOP / PROJECT', section.label) +
    (events.length ? recordList(events, sectionPath) : emptyState(section.empty, section.description)) +
    (preview ? previewLink(href(...sectionPath, workshopStructure.previewId), '打开 Event 结构预览') : '');
}

export function eventDetail({ event, eventLabel, preview }) {
  const sections = workshopStructure.eventSections.map(section => {
    const body = section.fields
      ? '<dl class="event-fields">' + section.fields.map(field => '<div><dt>' + field.label +
        '</dt><dd>' + escapeHtml(event?.[field.key] ?? '未填写') + '</dd></div>').join('') + '</dl>'
      : '<p>' + section.empty + '</p>';
    return '<section class="empty-state"><h2>' + section.label + '</h2><p class="section-note">' +
      section.zh + '</p>' + body + '</section>';
  }).join('');
  return heading(preview ? 'WORKSHOP / EVENT PREVIEW' : 'WORKSHOP / EVENT', eventLabel,
    preview ? '这里预览单次活动的独立页面和记录板块。' : '') +
    '<div class="detail-stack">' + sections + '</div>';
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
