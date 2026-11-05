import { icon } from './icons.js';
import { brands, href, publicHref, workspaces, workshopStructure } from './pages.js';
import { selfBoardIncludes, studioRepository, workshopRepository } from './repository.js';
import { autoWidget, autoView } from './auto-view.js';
import { escapeHtml } from './html.js';

function emptyState(title, description) {
  return '<section class="empty-state"><h2>' + escapeHtml(title) + '</h2>' +
    (description ? '<p>' + escapeHtml(description) + '</p>' : '') + '</section>';
}

function entry(address, area) {
  return '<a class="workspace-entry ' + area.tone + '" href="' + address + '"><span class="entry-icon">' +
    icon(area.icon, 20) + '</span><span><strong>' + area.label + '</strong></span>' +
    icon('arrow', 18) + '</a>';
}

export function landing() {
  return '<section class="landing-section" aria-labelledby="private-label"><h2 id="private-label">Private Workspace</h2><div class="workspace-entries">' +
    Object.entries(workspaces).map(([id, area]) => entry(href(id), area)).join('') + '</div></section>' +
    '<section class="landing-section" aria-labelledby="public-label"><h2 id="public-label">Public Space</h2><div class="workspace-entries">' +
    Object.entries(brands).map(([id, area]) => entry(publicHref(id), area)).join('') + '</div></section>';
}

function contentWidget(id, collection, overview = true) {
  const entries = studioRepository.list({ domain: 'Self-Board' }).filter(item => selfBoardIncludes(item, id));
  const title = overview ? '<h2>' + escapeHtml(collection.label) + '</h2>' : '';
  const style = 'widget widget-' + id;
  if (!entries.length) {
    if (!overview) return emptyState('暂无记录');
    const visual = {
      discover: '<div class="discover-motifs" aria-hidden="true"><i></i><i></i><i></i></div>',
      experience: '<div class="experience-motif" aria-hidden="true"></div>',
      'reflect-create': '<div class="editorial-motif" aria-hidden="true">Aa <span>—</span></div>',
    }[id];
    return '<a class="' + style + ' widget-link" href="' + href('self-board', id) + '">' +
      title + visual + '<p>暂无记录</p></a>';
  }
  const limit = 3;
  const cards = (overview ? entries.slice(0, limit) : entries).map(item => {
    const src = id !== 'reflect-create' && mediaUrl(item.coverUrl);
    return '<a class="content-card" href="' + href('self-board', id, item.id) + '">' +
      (src ? '<img src="' + src + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') +
      '<small>' + escapeHtml([item.contentType || item.category, item.date].filter(Boolean).join(' · ')) + '</small><strong>' +
      escapeHtml(item.title) + '</strong>' +
      (id === 'reflect-create' && item.description ? '<p>' + escapeHtml(item.description) + '</p>' : '') + '</a>';
  }).join('');
  const more = overview && entries.length > limit ? '<a class="return-link" href="' + href('self-board', id) +
    '" aria-label="全部 ' + escapeHtml(collection.label) + '">全部</a>' : '';
  return '<section class="' + style + '">' + (overview ? '<div class="section-heading">' + title + more + '</div>' : '') +
    '<div class="widget-items">' + cards + '</div></section>';
}

export function workspaceOverview({ workspace, workspaceId, period = 'week' }) {
  if (workspaceId === 'self-board') {
    const { collections } = workspace;
    return '<div class="board-grid">' +
      ['discover', 'experience', 'reflect-create'].map(id => contentWidget(id, collections[id])).join('') +
      autoWidget(period) + '</div>';
  }
  const entries = Object.entries(workspace.collections).map(([id, collection]) =>
    '<a href="' + href(workspaceId, id) + '"><strong>' + collection.label + '</strong><span>' + collection.zh + '</span>' +
    icon('arrow', 16) + '</a>').join('');
  return '<nav class="module-links" aria-label="' + workspace.label + ' 集合">' + entries + '</nav>';
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

export function workshopGallery() {
  const projects = workshopRepository.listProjects();
  const cards = projects.length ? projects.map(project => galleryCard({
    address: href('workshop', 'projects', project.id), title: project.title, detail: project.description,
    kind: 'project', url: project.coverUrl, placeholder: '暂无封面',
  })).join('') : galleryCard({
    address: href('workshop', 'projects', workshopStructure.previewId), title: 'Project 结构预览',
    kind: 'project', placeholder: '结构占位',
  });
  return '<section class="gallery-section" aria-label="Projects Gallery"><div class="section-heading"><h2>Projects</h2>' +
    (!projects.length ? '<span>暂无项目</span>' : '') + '</div><div class="gallery-grid">' + cards + '</div></section>';
}

export function collectionView({ workspaceId, collection, collectionId }) {
  if (workspaceId === 'self-board') {
    if (collectionId === 'auto') return autoView();
    return contentWidget(collectionId, collection, false);
  }
  return emptyState(collection.empty);
}

export function projectOverview({ project, projectPath, preview }) {
  const events = preview ? [] : workshopRepository.listEvents(project.id);
  const cards = events.length ? events.map(event => galleryCard({
    address: href(...projectPath, 'events', event.id), title: event.theme || event.title, detail: event.date,
    kind: 'event', url: event.posterUrl, placeholder: '暂无海报',
  })).join('') : preview ? galleryCard({
    address: href(...projectPath, 'events', workshopStructure.previewId), title: 'Event 结构预览',
    kind: 'event', placeholder: '海报占位',
  }) : '';
  return (project?.description ? '<p class="page-note">' + escapeHtml(project.description) + '</p>' : '') +
    '<section class="gallery-section" aria-label="Events Poster Gallery"><div class="section-heading"><h2>Events</h2>' +
    (!events.length ? '<span>暂无活动</span>' : '') + '</div>' +
    (cards ? '<div class="gallery-grid poster-grid">' + cards + '</div>' :
      emptyState(workshopStructure.sections.events.empty, workshopStructure.sections.events.description)) + '</section>' +
    '<section class="related-panel"><div class="section-heading"><h2>Related Resources</h2></div>' +
    resourceModules(project, true) + '</section>';
}

function originalLink(sourceId) {
  const original = sourceId && studioRepository.get(sourceId);
  if (!original || !selfBoardIncludes(original)) return '';
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

export function projectSection({ project }) {
  return resourceModules(project);
}

export function eventDetail({ event }) {
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
  }).join('') + '</ul>' : '<p>暂无引用。</p>';
  return '<div class="detail-stack">' + sections + '<section class="empty-state"><h2>当次引用的资源</h2>' +
    related + '</section></div>';
}

export function contentDetail({ record }) {
  return (record.category ? '<p class="page-note">' + escapeHtml(record.category) + '</p>' : '') + '<div class="empty-state prose">' + escapeHtml(record.description || '暂无说明。') + '</div>';
}

export function publicView({ page }) {
  return emptyState(page.empty);
}

export function searchView() {
  return '<form class="search-form" role="search"><label for="studio-query">关键词</label>' +
    '<div class="search-field">' + icon('search', 18) + '<input id="studio-query" name="query" type="search" placeholder="输入标题或关键词"></div></form>' +
    '<section class="empty-state" aria-live="polite"><h2 class="search-status">还没有可搜索的内容</h2>' +
    '<ul class="search-results" hidden></ul></section>';
}

export function missingView() {
  return '<p>这个地址当前没有可浏览的页面。</p>';
}
