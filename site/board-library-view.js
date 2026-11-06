import { escapeHtml as esc } from './html.js';
import { icon } from './icons.js';
import { collectionsAddress, collectionItemAddress, discoverAddress, explorationAddress } from './pages.js';
import { categoryFor, categoryList, entriesFor, entryTypes, filterCollections, foldersFor, libraryMatches,
  resourceTypes, topicsFor } from './board-library-data.js';
import { contentTitle, objectFor, studioStore } from './studio-data.js';
import { resourceKey } from './self-board-data.js';
import { imageUrl, markdown, objectHref, objectLabels } from './workshop-view.js';

const state = () => studioStore.state;
export const libButton = (label, action, id = '', { primary = false, glyph, disabled = false } = {}) =>
  '<button type="button" class="action-button' + (primary ? '' : ' secondary') + '" data-library="' + action + '" data-id="' +
  esc(id) + '"' + (disabled ? ' disabled' : '') + '>' + (glyph ? icon(glyph, 15) : '') + esc(label) + '</button>';
export const optionsHtml = (choices, selected = '') => choices.map(([value, label]) =>
  '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>').join('');
const unique = values => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const tagList = tags => tags?.length ? '<ul class="library-tags" aria-label="标签">' +
  tags.map(tag => '<li>' + esc(tag) + '</li>').join('') + '</ul>' : '';
const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', dateStyle: 'short' });
const time = (value, label) => value ? '<time class="work-meta" datetime="' + esc(value) + '">' + label + ' ' +
  esc(Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : value.slice(0, 10)) + '</time>' : '';
const image = (row, css) => {
  const url = imageUrl(row);
  return url ? '<img class="' + css + '" src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '';
};
const heading = (title, intro, actions = '', level = 2) => '<div class="sb-heading library-heading"><div><h' + level + '>' +
  esc(title) + '</h' + level + '>' +
  (intro ? '<p>' + esc(intro) + '</p>' : '') + '</div><div class="sb-view-actions">' + actions + '</div></div>';
const empty = (title, intro) => '<div class="sb-empty"><strong>' + esc(title) + '</strong><p>' + esc(intro) + '</p></div>';
const searchInput = (label, name = 'query') => '<input name="' + name + '" type="search" aria-label="' + esc(label) +
  '" placeholder="' + esc(label) + '…">';
const link = (address, label, selected = false) => '<a href="' + esc(address) + '"' +
  (selected ? ' aria-current="page"' : '') + '>' + esc(label) + '</a>';

export function discoverTabs(tab) {
  return '<nav class="segmented sb-module-tabs library-discover-tabs" aria-label="Discover 板块">' +
    link(discoverAddress(), 'Workshop Wiki', tab !== 'explorations') +
    link(explorationAddress(), 'Personal Explorations', tab === 'explorations') + '</nav>';
}

export function explorationResults({ query = '', tag = '' } = {}) {
  const topics = topicsFor(state());
  const rows = topics.filter(row => (!tag || row.tags.includes(tag)) && libraryMatches(row, ['title', 'description'], query));
  if (!rows.length) return topics.length ? empty('没有匹配的探索主题', '试试其他关键词或标签。') :
    empty('从一个想探索的问题开始', '新建主题后，可以陆续加入问题、笔记、心得和参考资料。');
  return '<p class="sb-results-count">' + rows.length + ' 个主题 · 最近更新优先</p><div class="library-grid">' + rows.map(row =>
    '<a class="library-card" href="' + esc(explorationAddress(row.id)) + '">' + image(row, 'library-cover') +
    '<div class="library-card-copy"><strong>' + (row.icon ? '<span aria-hidden="true">' + esc(row.icon) + '</span> ' : '') +
    esc(row.title) + '</strong>' + (row.description ? '<p>' + esc(row.description) + '</p>' : '') + tagList(row.tags) +
    '<div class="library-meta">' + entriesFor(state(), row.id).length + ' 条记录 · ' + time(row.updatedAt, '更新于') +
    '</div></div></a>').join('') + '</div>';
}

export function explorationsView() {
  const tags = unique(topicsFor(state()).flatMap(row => row.tags));
  return heading('Personal Explorations', '围绕一个主题，收拢问题、笔记、理解和参考资料。',
    libButton('New Topic', 'topic', '', { primary: true, glyph: 'add' })) +
    '<form class="work-filters library-filters" data-library-filter="topics" role="search">' + searchInput('搜索主题') +
    '<select name="tag" aria-label="主题标签">' + optionsHtml([['', '所有标签'], ...tags.map(tag => [tag, tag])]) +
    '</select></form><div data-library-results aria-live="polite">' + explorationResults() + '</div>';
}

function external(url, label = url) {
  const safe = resourceKey(url);
  return safe ? '<a href="' + esc(url) + '" target="_blank" rel="noreferrer">' + esc(label) + ' ↗</a>' : '';
}

function entryReference(row) {
  if (!row.reference) return '';
  const { type, id } = row.reference;
  const item = objectFor(state(), type, id);
  return item && !item.deletedAt ? '<a href="' + esc(objectHref(type, item)) + '">' + esc(contentTitle(item)) +
    ' · ' + esc(objectLabels[type]) + ' ↗</a>' : '<span class="work-meta">引用对象目前不可用</span>';
}

function readerHeader(record) {
  return '<div class="library-meta">' + time(record.createdAt, '创建于') + time(record.updatedAt, '更新于') + '</div>' +
    tagList(record.tags) + image(record, 'library-reader-cover');
}

export function topicDetail(topic, relations) {
  const entries = entriesFor(state(), topic.id);
  return '<article class="work-reading library-reader">' + heading((topic.icon ? topic.icon + ' ' : '') + topic.title, '',
    libButton('编辑主题', 'topic', topic.id, { glyph: 'edit' }) + libButton('移到回收站', 'delete-topic', topic.id), 1) +
    readerHeader(topic) + (topic.description ? markdown(topic.description) : '') +
    '<section class="library-section"><div class="sb-list-heading"><h3>Entries</h3>' +
    libButton('New Entry', 'entry', '', { primary: true, glyph: 'add' }) + '</div>' +
    (entries.length ? '<ol class="library-entries">' + entries.map((row, i) => '<li data-entry="' + esc(row.id) +
      '"><div class="library-entry-heading"><div><span class="library-type">' + entryTypes[row.type] +
      '</span><h4>' + esc(row.title) + '</h4></div><div class="sb-view-actions">' +
      libButton('上移', 'entry-up', row.id, { disabled: i === 0 }) +
      libButton('下移', 'entry-down', row.id, { disabled: i === entries.length - 1 }) +
      libButton('编辑', 'entry', row.id) + libButton('删除', 'delete-entry', row.id) + '</div></div>' +
      (row.body ? markdown(row.body) : '') +
      (row.url || row.reference ? '<div class="library-links">' + external(row.url) + entryReference(row) + '</div>' : '') +
      '</li>').join('') + '</ol>' : empty('还没有条目', '从 Question、Note、Insight 或 Reference 中选一种即可。')) +
    '</section>' + relations + '</article>';
}

export function collectionLocation(route) {
  const input = route.params.get('category');
  const category = input === 'inbox' ? '' : input && categoryFor(state(), input) ? input : 'all';
  const folder = foldersFor(state(), category).find(row => row.id === route.params.get('folder'))?.id ?? '';
  return { category, folder };
}

function statusLabel(row) {
  if (!row.status) return '';
  return categoryFor(state(), row.categoryId)?.statuses.includes(row.status) ? row.status : row.status + '（保留）';
}

function iconButton(label, action, id, glyph, disabled = false) {
  return '<button type="button" class="sb-icon sb-icon-plain library-icon" data-library="' + action + '" data-id="' +
    esc(id) + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"' + (disabled ? ' disabled' : '') +
    '>' + icon(glyph, 16) + '</button>';
}

function collectionRows(location) {
  const rows = filterCollections(state(), location);
  if (!rows.length) return empty('这里还没有收藏', '点页眉的加号，记录文字或粘贴链接。');
  return '<ul class="sb-rows library-list">' + rows.map(row => {
    const category = categoryFor(state(), row.categoryId)?.title;
    const status = statusLabel(row);
    return '<li><a class="sb-row" href="' + esc(collectionItemAddress(row.id)) + '"><div class="sb-row-copy">' +
      '<strong>' + esc(row.title) + '</strong><small>' + esc([category, resourceTypes[row.resourceType]].join(' · ')) + '</small>' +
      (row.description ? '<p>' + esc(row.description) + '</p>' : '') +
      '</div><div class="library-meta">' + (status ? '<span class="library-status">' + esc(status) + '</span>' : '') +
      tagList(row.tags) + '</div></a></li>';
  }).join('') + '</ul>';
}

export function collectionsView(route) {
  const location = collectionLocation(route);
  const { category, folder } = location;
  const categories = categoryList(state());
  const selected = category === 'all' ? null : categoryFor(state(), category);
  const folders = foldersFor(state(), category);
  const manager = '<details class="library-manager" data-library-manager><summary>管理分类</summary>' +
    '<ul class="library-folder-list">' + categories.map((row, i) => '<li><span>' + esc(row.title) +
      (row.hidden ? ' <small>（已隐藏）</small>' : '') + '</span><div class="sb-view-actions">' +
      iconButton('上移 ' + row.title, 'category-up', row.id, 'up', i === 0) +
      iconButton('下移 ' + row.title, 'category-down', row.id, 'down', i === categories.length - 1) +
      iconButton('重命名 ' + row.title, 'category', row.id, 'edit') +
      iconButton((row.hidden ? '显示 ' : '隐藏 ') + row.title, 'category-visibility', row.id, row.hidden ? 'eye' : 'eyeOff') +
      iconButton('删除 ' + row.title, 'delete-category', row.id, 'trash') + '</div></li>').join('') +
    '</ul>' + libButton('新建分类', 'category', '', { glyph: 'add' }) + '</details>';
  const folderNav = selected && category ? '<div class="library-folders"><div class="sb-list-heading"><h3>文件夹</h3>' +
    libButton('New Folder', 'folder', '', { glyph: 'folderAdd' }) + '</div>' +
    (folders.length ? '<ul class="library-folder-list"><li>' +
      link(collectionsAddress({ category }), '全部文件夹与收藏', !folder) + '</li>' +
      folders.map(row => '<li>' + link(collectionsAddress({ category, folder: row.id }), row.title, row.id === folder) +
        '<div class="sb-view-actions">' + iconButton('重命名 ' + row.title, 'folder', row.id, 'edit') +
        iconButton('删除文件夹 ' + row.title, 'delete-folder', row.id, 'trash') + '</div></li>').join('') + '</ul>' : '') +
    '</div>' : '';
  return '<div class="library-category-bar"><details class="library-sidebar" data-library-sidebar data-sb-disclosure>' +
    '<summary>' + icon('folder', 16) + '<span>' + esc(selected?.title ?? '分类导航') + '</span>' + icon('down', 13) + '</summary>' +
    '<div class="library-category-menu"><nav aria-label="收藏分类">' + categories.filter(row => !row.hidden || row.id === category)
      .map(row => link(collectionsAddress({ category: row.id }), row.title, category === row.id)).join('') + '</nav>' +
    '<div class="library-sidebar-actions">' + libButton('新建分类', 'category', '', { glyph: 'add' }) +
    libButton('管理分类', 'categories', '', { glyph: 'settings' }) + '</div></div></details>' +
    (selected ? '<a class="sb-icon sb-icon-plain library-icon" href="' + collectionsAddress() +
      '" aria-label="清除分类筛选" title="清除分类筛选">' + icon('remove', 16) + '</a>' : '') + '</div>' +
    manager + folderNav + collectionRows(location);
}

export function collectionDetail(row, relations) {
  const category = categoryFor(state(), row.categoryId);
  const folder = foldersFor(state(), row.categoryId).find(item => item.id === row.folderId);
  return '<article class="work-reading library-reader">' + heading(row.title,
    [category?.title, folder?.title, resourceTypes[row.resourceType], statusLabel(row)].filter(Boolean).join(' · '),
    libButton('编辑收藏', 'item', row.id, { glyph: 'edit' }) + libButton('移到回收站', 'delete-item', row.id), 1) +
    readerHeader(row) + (row.description ? markdown(row.description) : '') +
    (row.url ? '<p class="library-links">' + external(row.url, '打开原始链接') + '</p>' : '') +
    (row.notes ? '<section class="library-section"><h3>备注</h3>' + markdown(row.notes) + '</section>' : '') + relations + '</article>';
}
