import { escapeHtml as esc } from './html.js';
import { icon } from './icons.js';
import { collectionsAddress, collectionItemAddress, discoverAddress, explorationAddress } from './pages.js';
import { categoryFor, categoryList, entriesFor, entryTypes, filterCollections, foldersFor, itemsFor, libraryMatches,
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
  return { category, folder, mode: route.params.get('mode') === 'list' ? 'list' : 'card' };
}

function statusLabel(row) {
  if (!row.status) return '';
  return categoryFor(state(), row.categoryId)?.statuses.includes(row.status) ? row.status : row.status + '（保留）';
}

function itemCard(row, mode) {
  const category = categoryFor(state(), row.categoryId)?.title;
  const subtitle = [category, resourceTypes[row.resourceType]].join(' · ');
  return '<a class="library-card" href="' + esc(collectionItemAddress(row.id)) + '">' +
    (mode === 'card' ? image(row, 'library-cover') : '') + '<div class="library-card-copy"><small>' + esc(subtitle) +
    '</small><strong>' + esc(row.title) + '</strong>' +
    (row.description ? '<p>' + esc(row.description) + '</p>' : '') + '<div class="library-meta">' +
    (row.status ? '<span class="library-status">' + esc(statusLabel(row)) + '</span>' : '') + tagList(row.tags) +
    '</div></div></a>';
}

export function collectionResults(route, filters = {}) {
  const location = collectionLocation(route);
  const rows = filterCollections(state(), { ...location, ...filters });
  if (!rows.length) return Object.values(filters).some(Boolean) ? empty('没有匹配的收藏', '试试其他关键词或筛选条件。') :
    empty('这里还没有收藏', '点 Quick Add，输入标题或粘贴链接就可以保存。');
  return '<p class="sb-results-count">' + rows.length + ' 条收藏</p><div class="' +
    (location.mode === 'list' ? 'library-list' : 'library-grid') + '">' + rows.map(row => itemCard(row, location.mode)).join('') + '</div>';
}

export function collectionsView(route) {
  const location = collectionLocation(route);
  const { category, folder, mode } = location;
  const categories = categoryList(state());
  const selected = category === 'all' ? null : categoryFor(state(), category);
  const items = itemsFor(state());
  const scoped = items.filter(row => category === 'all' || row.categoryId === category);
  const tags = unique(scoped.flatMap(row => row.tags));
  const statuses = unique([...(selected?.statuses ?? categories.flatMap(row => row.statuses)), ...scoped.map(row => row.status)]);
  const sideLink = (id, label) => link(collectionsAddress({ category: id, mode }),
    label + ' · ' + (id === 'all' ? items.length : items.filter(row => row.categoryId === id).length), category === id);
  const folders = foldersFor(state(), category);
  const manager = '<details class="library-manager" data-library-manager><summary>管理分类与状态</summary>' +
    '<p class="work-meta">隐藏只影响侧栏；删除分类时会迁移收藏。已有状态值会保留，直到你在收藏里改掉它。</p>' +
    '<ul class="library-folder-list">' + categories.map((row, i) => '<li><span>' + esc(row.title) +
      (row.hidden ? ' <small>（已隐藏）</small>' : '') + '</span><div class="sb-view-actions">' +
      libButton('上移', 'category-up', row.id, { disabled: i === 0 }) +
      libButton('下移', 'category-down', row.id, { disabled: i === categories.length - 1 }) +
      libButton('编辑', 'category', row.id) + libButton('删除', 'delete-category', row.id) + '</div></li>').join('') +
    '</ul>' + libButton('New Category', 'category', '', { glyph: 'add' }) + '</details>';
  const folderNav = selected && category ? '<div class="library-folders"><div class="sb-list-heading"><h3>文件夹</h3>' +
    libButton('New Folder', 'folder', '', { glyph: 'folderAdd' }) + '</div>' +
    (folders.length ? '<ul class="library-folder-list"><li>' +
      link(collectionsAddress({ category, mode }), '全部文件夹与收藏', !folder) + '</li>' +
      folders.map(row => '<li>' + link(collectionsAddress({ category, folder: row.id, mode }), row.title, row.id === folder) +
        '<div class="sb-view-actions"><button class="sb-icon sb-icon-plain" type="button" data-library="folder" data-id="' +
        esc(row.id) + '" aria-label="重命名 ' + esc(row.title) + '">' + icon('edit', 15) + '</button>' +
        '<button class="sb-icon sb-icon-plain" type="button" data-library="delete-folder" data-id="' +
        esc(row.id) + '" aria-label="删除文件夹 ' + esc(row.title) + '">' + icon('trash', 15) + '</button></div></li>').join('') + '</ul>' : '') +
    '</div>' : '';
  return '<div class="library-shell"><aside class="library-sidebar"><details data-library-sidebar><summary>分类导航</summary>' +
    '<nav aria-label="收藏分类">' + sideLink('all', 'All Collections') + sideLink('', 'Inbox') +
    '<div class="library-category-list">' + categories.filter(row => !row.hidden || row.id === category).map(row =>
      sideLink(row.id, row.title)).join('') + '</div>' +
    '</nav><div class="library-sidebar-actions">' + libButton('New Category', 'category', '', { glyph: 'add' }) +
    libButton('管理分类', 'categories', '', { glyph: 'settings' }) + '</div></details></aside>' +
    '<div class="library-main">' + heading(selected?.title ?? 'All Collections',
      category === '' ? '未分类的收藏，可以随时整理。' : '保存想读、想去、想体验的事物。',
      libButton('Quick Add', 'quick', '', { primary: true, glyph: 'add' })) +
    manager + folderNav + '<div class="library-controls"><form class="work-filters library-filters" data-library-filter="collections" role="search">' +
    searchInput('搜索收藏') + '<select name="status" aria-label="收藏状态">' +
    optionsHtml([['', '所有状态'], ['unset', '未设状态'], ...statuses.map(status => ['value:' + status, status])]) +
    '</select><select name="tag" aria-label="收藏标签">' +
    optionsHtml([['', '所有标签'], ...tags.map(tag => [tag, tag])]) + '</select></form>' +
    '<nav class="segmented library-view-toggle" aria-label="收藏视图">' +
    link(collectionsAddress({ category, folder }), 'Card', mode === 'card') +
    link(collectionsAddress({ category, folder, mode: 'list' }), 'List', mode === 'list') + '</nav></div>' +
    '<div data-library-results aria-live="polite">' + collectionResults(route) + '</div></div></div>';
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
