import { icon } from './icons.js';
import { brands, href, publicHref, workspaces } from './pages.js';

function heading(label, title, description = '') {
  return '<header class="page-intro"><div class="eyebrow">' + label + '</div><h1>' + title + '</h1>' +
    (description ? '<p>' + description + '</p>' : '') + '</header>';
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

export function collectionView({ workspace, collection }) {
  return heading(workspace.label, collection.label) + emptyState(collection.empty, collection.description);
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
    '<a class="return-link" href="' + parent + '">返回 ' + parentLabel + ' ' + icon('arrow', 15) + '</a>';
}
