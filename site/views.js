import { icon } from './icons.js';
import { brands, href, publicHref, workspaces } from './pages.js';
import { selfBoardIncludes, studioRepository } from './repository.js';
import { autoWidget, autoView } from './auto-view.js';
import { escapeHtml } from './html.js';
import { attachments, imageUrl, markdown, provenance, relatedPanel, smallAction, timestamp } from './workshop-view.js';
import { isDiscover } from './studio-data.js';

function emptyState(title, description) {
  return '<section class="empty-state"><h2>' + escapeHtml(title) + '</h2>' +
    (description ? '<p>' + escapeHtml(description) + '</p>' : '') + '</section>';
}

function entry(address, area) {
  return '<a class="workspace-entry" href="' + address + '"><span class="entry-icon">' +
    icon(area.icon, 26) + '</span><span class="entry-label">' + escapeHtml(area.entryLabel ?? area.label) + '</span></a>';
}

export function landing() {
  return '<nav class="workspace-entries" aria-label="工作台入口">' +
    Object.entries(workspaces).map(([id, area]) => entry(href(id), area)).join('') +
    Object.entries(brands).map(([id, area]) => entry(publicHref(id), area)).join('') + '</nav>';
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
  const cards = (overview ? entries.slice(0, limit) : entries).map(item => contentCard(id, item)).join('');
  const more = overview && (id === 'discover' || entries.length > limit) ? '<a class="return-link" href="' + href('self-board', id) +
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

function contentCard(id, item) {
  const src = id !== 'reflect-create' && imageUrl(item);
  return '<a class="content-card" href="' + href('self-board', id, item.id) + '">' +
    (src ? '<img src="' + escapeHtml(src) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') +
    '<small>' + escapeHtml([item.contentType || item.category, item.date].filter(Boolean).join(' · ')) + '</small><strong>' +
    escapeHtml(item.title) + '</strong>' +
    (id === 'reflect-create' && item.description ? '<p>' + escapeHtml(item.description) + '</p>' : '') + '</a>';
}

export function discoverCards({ query = '', type = '', tag = '' } = {}) {
  const items = studioRepository.discover({ query }).filter(item =>
    (!type || type === (item.contentType || item.category)) && (!tag || item.tags?.includes(tag)));
  if (!items.length) return '<p class="work-empty">' + (query || type || tag ? '没有匹配的资料' : '暂无记录') + '</p>';
  return '<div class="widget-items discover-grid">' + items.map(item => contentCard('discover', item)).join('') + '</div>';
}

function discoverView() {
  const items = studioRepository.discover();
  const options = (values, label) => '<option value="">' + label + '</option>' +
    [...new Set(values.filter(Boolean))].sort().map(value => '<option>' + escapeHtml(value) + '</option>').join('');
  return '<div class="section-heading work-heading"><form class="work-filters" data-discover-filter role="search">' +
    '<input name="query" type="search" aria-label="搜索资料" placeholder="搜索资料">' +
    '<select name="type" aria-label="内容类型">' + options(items.map(item => item.contentType || item.category), '所有类型') +
    '</select><select name="tag" aria-label="标签">' + options(items.flatMap(item => item.tags ?? []), '所有标签') +
    '</select></form><button type="button" class="action-button" data-work-record="discover">新建资料</button></div>' +
    '<section class="widget widget-discover" data-discover-results aria-live="polite">' + discoverCards() + '</section>';
}

export function collectionView({ workspaceId, collection, collectionId }) {
  if (workspaceId === 'self-board') {
    if (collectionId === 'auto') return autoView();
    if (collectionId === 'discover') return discoverView();
    return contentWidget(collectionId, collection, false);
  }
  return emptyState(collection.empty);
}

export function contentDetail({ collectionId, record }) {
  if (collectionId !== 'discover' || !isDiscover(record)) {
    return (record.category ? '<p class="page-note">' + escapeHtml(record.category) + '</p>' : '') +
      '<div class="empty-state prose">' + escapeHtml(record.description || '暂无说明。') + '</div>';
  }
  const cover = imageUrl(record);
  const metadata = [record.contentType || record.category, ...(record.tags ?? []),
    record.createdAt && '创建 ' + timestamp(record.createdAt), record.updatedAt && '更新 ' + timestamp(record.updatedAt)].filter(Boolean);
  return '<div class="work-reading"><div class="section-heading work-heading"><small class="work-meta">' +
    escapeHtml(metadata.join(' · ')) + '</small>' +
    smallAction('edit', '编辑资料', 'data-work-record="discover" data-record-edit') + '</div>' +
    (cover ? '<img class="discover-cover" src="' + escapeHtml(cover) + '" alt="" referrerpolicy="no-referrer">' : '') +
    markdown(record.body ?? record.description ?? '') + attachments(record.assetIds) + provenance(record) +
    relatedPanel('discover', record.id) + '</div>';
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
