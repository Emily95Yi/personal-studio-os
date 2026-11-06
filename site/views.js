import { icon } from './icons.js';
import { brands, href, publicHref, workspaces } from './pages.js';
import { selfBoardIncludes, studioRepository } from './repository.js';
import { autoView } from './auto-view.js';
import { escapeHtml } from './html.js';
import { imageUrl } from './workshop-view.js';

function emptyState(title, description) {
  return '<section class="empty-state"><h2>' + escapeHtml(title) + '</h2>' +
    (description ? '<p>' + escapeHtml(description) + '</p>' : '') + '</section>';
}

function entry(address, area) {
  return '<a class="workspace-entry" href="' + escapeHtml(address) + '"><span class="entry-icon">' +
    icon(area.icon, 26) + '</span><span class="entry-label">' + escapeHtml(area.entryLabel ?? area.label) + '</span></a>';
}

export function landing() {
  return '<nav class="workspace-entries" aria-label="工作台入口">' +
    Object.entries(workspaces).map(([id, area]) => entry(href(id), area)).join('') +
    Object.entries(brands).map(([id, area]) => entry(publicHref(id), area)).join('') + '</nav>';
}

export function workspaceOverview({ workspace, workspaceId }) {
  if (workspaceId === 'career') {
    const cards = Object.entries(workspace.collections).map(([id, collection]) =>
      entry(collection.entryHref ?? href(workspaceId, id), collection)).join('');
    return '<nav class="workspace-entries career-entries" aria-label="Career 模块">' + cards + '</nav>';
  }
  const entries = Object.entries(workspace.collections).map(([id, collection]) =>
    '<a href="' + href(workspaceId, id) + '"><strong>' + collection.label + '</strong><span>' + collection.zh + '</span>' +
    icon('arrow', 16) + '</a>').join('');
  return '<nav class="module-links" aria-label="' + workspace.label + ' 集合">' + entries + '</nav>';
}

function contentCard(id, item) {
  const src = id !== 'reflect-create' && imageUrl(item);
  return '<a class="content-card" href="' + href('self-board', id, item.id) + '">' +
    (src ? '<img src="' + escapeHtml(src) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') +
    '<small>' + escapeHtml([item.contentType || item.category, item.date].filter(Boolean).join(' · ')) + '</small><strong>' +
    escapeHtml(item.title) + '</strong>' +
    (id === 'reflect-create' && item.description ? '<p>' + escapeHtml(item.description) + '</p>' : '') + '</a>';
}

export function collectionView({ workspaceId, collection, collectionId }) {
  if (workspaceId === 'self-board') {
    if (collectionId === 'auto') return autoView();
    const entries = studioRepository.list({ domain: 'Self-Board' }).filter(item => selfBoardIncludes(item, collectionId));
    return entries.length ? '<div class="widget-items">' + entries.map(item => contentCard(collectionId, item)).join('') +
      '</div>' : emptyState(collection.empty);
  }
  return emptyState(collection.empty);
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
