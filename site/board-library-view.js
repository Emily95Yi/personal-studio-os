import { storedCaptureAttachment } from './capture-client.js';
import { escapeHtml as esc } from './html.js';
import { icon } from './icons.js';
import { autoSourceAddress, collectionsAddress, collectionItemAddress, discoverAddress, explorationAddress } from './pages.js';
import { categoryFor, categoryList, collectionCategoryLabel, entriesFor, explorationEntryTitle, explorationTypes, filterCollections, foldersFor,
  inbox, resourceTypes, topicsFor } from './board-library-data.js';
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
const dateText = value => Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : value.slice(0, 10);
const time = (value, label) => value ? '<time class="work-meta" datetime="' + esc(value) + '">' + label + ' ' +
  esc(dateText(value)) + '</time>' : '';
const image = (row, css) => {
  const url = imageUrl(row);
  return url ? '<img class="' + css + '" src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '';
};
const heading = (title, intro, actions = '', level = 2) => '<div class="sb-heading library-heading"><div><h' + level + '>' +
  esc(title) + '</h' + level + '>' +
  (intro ? '<p>' + esc(intro) + '</p>' : '') + '</div><div class="sb-view-actions">' + actions + '</div></div>';
const empty = (title, intro) => '<div class="sb-empty"><strong>' + esc(title) + '</strong><p>' + esc(intro) + '</p></div>';
const link = (address, label, selected = false) => '<a href="' + esc(address) + '"' +
  (selected ? ' aria-current="page"' : '') + '>' + esc(label) + '</a>';

export function discoverTabs(tab) {
  return '<nav class="segmented sb-module-tabs library-discover-tabs" aria-label="Discover 板块">' +
    link(discoverAddress(), 'Workshop Wiki', tab !== 'explorations') +
    link(explorationAddress(), 'Personal Explorations', tab === 'explorations') + '</nav>';
}

export function explorationResults(tag = '') {
  const topics = topicsFor(state());
  const rows = topics.filter(row => !tag || row.tags.includes(tag));
  const newTopic = '<button type="button" class="library-card library-card-add" data-library="topic" data-id="" ' +
    'aria-label="新建主题" title="新建主题">' + icon('add', 25) + '</button>';
  return (!rows.length && tag ? '<p class="work-meta">没有匹配的探索主题</p>' : '') +
    '<div class="library-grid">' + rows.map(row =>
    '<a class="library-card" href="' + esc(explorationAddress(row.id)) + '">' + image(row, 'library-cover') +
    '<div class="library-card-copy"><strong>' + (row.icon ? '<span aria-hidden="true">' + esc(row.icon) + '</span> ' : '') +
    esc(row.title) + '</strong>' + (row.description ? '<p>' + esc(row.description) + '</p>' : '') + tagList(row.tags) +
    '<div class="library-meta">' + entriesFor(state(), row.id).length + ' 条记录 · ' + time(row.updatedAt, '更新于') +
    '</div></div></a>').join('') + newTopic + '</div>';
}

export function explorationsView() {
  const tags = unique(topicsFor(state()).flatMap(row => row.tags));
  return (tags.length ? '<div class="sb-list-heading library-topic-tools"><div class="work-filters">' +
    '<select data-library-topic-tag aria-label="主题标签">' +
    optionsHtml([['', '所有标签'], ...tags.map(tag => [tag, tag])]) + '</select></div></div>' : '') +
    '<div data-library-results aria-live="polite">' + explorationResults() + '</div>';
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

export function topicDetail(topic, relations, editing = false) {
  const entries = entriesFor(state(), topic.id);
  const types = new Map(explorationTypes(state()).map(row => [row.id, row]));
  const address = explorationAddress(topic.id);
  const modeLabel = editing ? '完成编辑' : '编辑主题';
  const mode = '<a class="sb-icon sb-icon-plain library-icon" href="' + esc(address + (editing ? '' : '?edit=1')) +
    '" aria-label="' + modeLabel + '" title="' + modeLabel + '">' + icon(editing ? 'published' : 'edit', 16) + '</a>';
  const actions = iconButton('新建条目', 'entry', '', 'add') + mode +
    (editing ? iconButton('编辑主题资料', 'topic', topic.id, 'file') : '') +
    iconButton('移到回收站', 'delete-topic', topic.id, 'trash');
  const created = topic.createdAt ? '<time class="work-meta" datetime="' + esc(topic.createdAt) + '">' +
    esc(dateText(topic.createdAt).replaceAll('-', '.')) + '</time>' : '';
  return '<article class="work-reading library-reader library-topic-reader">' +
    heading((topic.icon ? topic.icon + ' ' : '') + topic.title, '', actions, 1) +
    (created ? '<div class="library-meta">' + created + '</div>' : '') +
    tagList(topic.tags) + image(topic, 'library-reader-cover') + (topic.description ? markdown(topic.description) : '') +
    (entries.length ? '<section class="library-section" aria-label="探索条目"><ol class="library-entries">' + entries.map((row, i) => {
      const type = types.get(row.type);
      const controls = editing ? '<div class="sb-view-actions">' +
        iconButton('上移', 'entry-up', row.id, 'up', i === 0) +
        iconButton('下移', 'entry-down', row.id, 'down', i === entries.length - 1) +
        iconButton('编辑', 'entry', row.id, 'edit') + iconButton('删除', 'delete-entry', row.id, 'trash') + '</div>' : '';
      return '<li tabindex="-1" data-entry="' + esc(row.id) + '"' + (type ? ' data-sb-color="' + esc(type.color) + '"' : '') + '>' +
        '<div class="library-entry-heading"><h3>' + esc(explorationEntryTitle(row)) +
        (type ? '<span class="visually-hidden"> · ' + esc(type.title) + '</span>' : '') + '</h3>' + controls + '</div>' +
        (row.body ? markdown(row.body) : '') +
        (row.captureNote ? '<div class="library-section"><strong>我的备注</strong>' + markdown(row.captureNote) + '</div>' : '') +
        (row.url || row.captureSourceUrl || row.reference ? '<div class="library-links">' +
          external(row.url || row.captureSourceUrl) + entryReference(row) + '</div>' : '') + storedCaptureAttachment(row) +
        '</li>';
    }).join('') + '</ol></section>' : '') + relations + '</article>';
}

export function explorationTypeSettings() {
  return '<section class="sb-settings"><div class="sb-list-heading"><h3>Personal Explorations 类型</h3>' +
    iconButton('新建条目类型', 'entry-type', '', 'add') + '</div><ul class="sb-rows sb-settings-grid">' +
    explorationTypes(state()).map(row => '<li class="sb-setting-label"><span class="sb-swatch" data-sb-color="' +
      esc(row.color) + '" aria-hidden="true"></span><span>' + esc(row.title) + '</span><div class="sb-view-actions">' +
      iconButton('编辑条目类型 ' + row.title, 'entry-type', row.id, 'edit') + '</div></li>').join('') +
    '</ul></section>';
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

function collectionAutoIcon(row) {
  return '<a class="sb-icon sb-icon-plain library-icon" href="' + esc(autoSourceAddress(row.id)) +
    '" aria-label="为此收藏设定 Auto" title="为此收藏设定 Auto">' + icon('auto', 16) + '</a>';
}

function collectionRows(location) {
  const rows = filterCollections(state(), location);
  if (!rows.length) return empty('这里还没有收藏', '点页眉的加号，记录文字或粘贴链接。');
  return '<ul class="sb-rows library-list">' + rows.map(row => {
    const category = categoryFor(state(), row.categoryId)?.title;
    const status = statusLabel(row);
    return '<li class="sb-row-actions"><a class="sb-row" href="' + esc(collectionItemAddress(row.id)) + '"><div class="sb-row-copy">' +
      '<strong>' + esc(row.title) + '</strong><small>' + esc([category, resourceTypes[row.resourceType]].join(' · ')) + '</small>' +
      (row.description ? '<p>' + esc(row.description) + '</p>' : '') +
      '</div><div class="library-meta">' + (status ? '<span class="library-status">' + esc(status) + '</span>' : '') +
      tagList(row.tags) + '</div></a>' + collectionAutoIcon(row) + '</li>';
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
    '</ul>' + iconButton('新建分类', 'category', '', 'add') + '</details>';
  const folderNav = selected && category ? '<div class="library-folders"><div class="sb-list-heading"><h3>文件夹</h3>' +
    libButton('New Folder', 'folder', '', { glyph: 'folderAdd' }) + '</div>' +
    (folders.length ? '<ul class="library-folder-list"><li>' +
      link(collectionsAddress({ category }), '全部文件夹与收藏', !folder) + '</li>' +
      folders.map(row => '<li>' + link(collectionsAddress({ category, folder: row.id }), row.title, row.id === folder) +
        '<div class="sb-view-actions">' + iconButton('重命名 ' + row.title, 'folder', row.id, 'edit') +
        iconButton('删除文件夹 ' + row.title, 'delete-folder', row.id, 'trash') + '</div></li>').join('') + '</ul>' : '') +
    '</div>' : '';
  return '<div class="library-category-bar"><details class="library-sidebar" data-library-sidebar data-sb-disclosure>' +
    '<summary class="sb-icon sb-icon-plain library-icon" aria-label="分类导航" title="' +
    esc(selected ? '分类导航 · ' + collectionCategoryLabel(selected) : '分类导航') + '">' + icon('folder', 17) + '</summary>' +
    '<div class="library-category-menu"><nav aria-label="收藏分类">' + [inbox, ...categories].filter(row => !row.hidden || row.id === category)
      .map(row => link(collectionsAddress({ category: row.id }), collectionCategoryLabel(row), category === row.id)).join('') + '</nav>' +
    '<div class="library-sidebar-actions">' + iconButton('新建分类', 'category', '', 'add') +
    iconButton('管理分类', 'categories', '', 'settings') + '</div></div></details>' +
    (selected ? '<a class="sb-icon sb-icon-plain library-icon" href="' + collectionsAddress() +
      '" aria-label="清除分类筛选" title="清除分类筛选">' + icon('remove', 16) + '</a>' : '') + '</div>' +
    manager + folderNav + collectionRows(location);
}

export function collectionDetail(row, relations) {
  const category = categoryFor(state(), row.categoryId);
  const folder = foldersFor(state(), row.categoryId).find(item => item.id === row.folderId);
  return '<article class="work-reading library-reader">' + heading(row.title,
    [category?.title, folder?.title, resourceTypes[row.resourceType], statusLabel(row)].filter(Boolean).join(' · '),
    collectionAutoIcon(row) + libButton('编辑收藏', 'item', row.id, { glyph: 'edit' }) + libButton('移到回收站', 'delete-item', row.id), 1) +
    readerHeader(row) + (row.description ? markdown(row.description) : '') +
    (row.url || row.captureSourceUrl ? '<p class="library-links">' + external(row.url || row.captureSourceUrl, '打开原始链接') + '</p>' : '') +
    storedCaptureAttachment(row) +
    (row.notes ? '<section class="library-section"><h3>备注</h3>' + markdown(row.notes) + '</section>' : '') + relations + '</article>';
}
