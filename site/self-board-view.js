import { inboxView, captureSettingsView } from './capture-board.js';
import { storedCaptureAttachment } from './capture-client.js';
import { weekPreview } from './planner-view.js';
import { escapeHtml as esc } from './html.js';
import { icon } from './icons.js';
import { boardContentHref, boardHref, boardSections, boardSettingsAddress, discoverAddress, href } from './pages.js';
import { boardContent, boardFolderPath, boardMoveFolders, boardRecords, boardSection, canAddSubfolder, contentTypes, discoverCategory, discoverDirectory, exerciseFields,
  isPublished, isWriting, matchContent, pinnedBoardFolders, reflectionColors, relationTypes, resourceKey } from './self-board-data.js';
import { contentTitle, isSelfBoard, objectFor, relatedObjects, studioStore } from './studio-data.js';
import { attachments, imageUrl, markdown, objectHref, objectLabels, timestamp } from './workshop-view.js';
import { entriesFor, itemsFor, libraryMatches, topicsFor } from './board-library-data.js';
import { collectionDetail, collectionsView, discoverTabs, explorationsView, explorationTypeSettings, topicDetail } from './board-library-view.js';

const state = () => studioStore.state;
const date = item => (item.date || item.createdAt || item.updatedAt || '').slice(0, 10);
const changed = item => (item.updatedAt || item.createdAt || item.date || '').slice(0, 10);
const titleOf = item => esc(contentTitle(item));
const preview = item => (item.summary || item.body || item.personalNotes || item.sourceInfo || item.sourceUrl || '')
  .replace(/\s+/g, ' ').trim().slice(0, 190);
const archiveViews = { inbox: 'Inbox', archived: '以往归档' };
const writingFilters = { drafts: ['未发布', 'unpublished'], published: ['已发布', 'published'] };
const orderKey = 'studio-reflection-order';
const randomOrder = new Map();
let selectedOrder;

function reflectionOrder() {
  if (selectedOrder) return selectedOrder;
  try { return localStorage.getItem(orderKey) === 'random' ? 'random' : 'color'; }
  catch { return 'color'; }
}

export function setReflectionOrder(order) {
  if (order === 'random') randomOrder.clear();
  selectedOrder = order;
  try { localStorage.setItem(orderKey, order); } catch {}
}
const reverseRelationNames = {
  cites: '被引用', inspired_by: '启发了对方', developed_into: '源自此记录', used_in_event: '活动使用了此资料',
  open_question: '由此引出', follow_up: '后续跟进自',
};

function relationName(value, outgoing = true) {
  return (!outgoing && Object.hasOwn(reverseRelationNames, value) && reverseRelationNames[value]) || (Object.hasOwn(relationTypes, value) ? relationTypes[value] : value === 'related' ? '相关' : value);
}

export function boardOptions(choices, selected = '') {
  return Object.entries(choices).map(([key, label]) =>
    '<option value="' + esc(key) + '"' + (key === selected ? ' selected' : '') + '>' + esc(label) + '</option>').join('');
}

function button(label, data, primary = false, glyph = '') {
  return '<button type="button" class="action-button' + (primary ? '' : ' secondary') + '" ' + data + '>' +
    (glyph ? icon(glyph, 16) : '') + esc(label) + '</button>';
}

export function boardIcon(label, glyph, { href, data = '', className = '' } = {}) {
  const attrs = ' class="sb-icon ' + className + '" aria-label="' + esc(label) + '" title="' + esc(label) + '" ' + data;
  return (href ? '<a href="' + esc(href) + '"' : '<button type="button"') + attrs +
    '>' + icon(glyph, 17) + (href ? '</a>' : '</button>');
}

function writingBadge(item) {
  const [label, glyph] = writingFilters[isPublished(item) ? 'published' : 'drafts'];
  return '<span class="sb-status sb-status-' + glyph + '" role="img" aria-label="' + label + '" title="' +
    label + '">' + icon(glyph, 16) + '</span>';
}

function statusFilters(view) {
  return '<div class="sb-status-filters" role="group" aria-label="按发布状态筛选">' +
    Object.entries(writingFilters).map(([key, [label, glyph]]) =>
      boardIcon(label, glyph, { className: 'sb-status-' + glyph, data: 'data-sb-writing-filter="' + key +
        '" aria-pressed="' + (view === key) + '"' })).join('') + '</div>';
}

function overviewNavigation() {
  return '<nav class="sb-modules" aria-label="Self-Board 模块">' +
    Object.entries(boardSections).map(([id, group]) =>
      '<a href="' + boardHref(id) + '"><span class="sb-nav-icon">' + icon(group.icon, 22) + '</span><span class="sb-module-caption">' +
        '<strong>' + group.label + '</strong><span>' + group.zh + '</span></span></a>').join('') +
    '</nav>';
}

function searchForm(query) {
  return '<form class="sb-global-search" data-sb-search data-sb-filter role="search">' +
    '<label class="sb-search">' + icon('search', 17) + '<input type="search" name="query" aria-label="全局搜索" ' +
    'placeholder="搜索文章、灵感、资料或活动…" value="' + esc(query) + '"></label>' +
    '<button type="submit" class="action-button secondary">搜索</button></form>';
}

function relatedTo(id) {
  return relatedObjects(state(), 'discover', id).direct;
}

function labelFor(type, item) {
  return type === 'discover' ? contentTypes[boardContent(item).type] : objectLabels[type];
}

function empty(title, description, action = '') {
  return '<div class="sb-empty"><strong>' + title + '</strong><p>' + description + '</p>' + action + '</div>';
}

function timeLabel(value) {
  return value ? '<time datetime="' + esc(value) + '">' + esc(value.replaceAll('-', '.')) + '</time>' : '';
}

function movePinnedIcon(item) {
  return pinnedBoardFolders(state(), item.folderId).length ? boardIcon('移动到置顶文件夹', 'folderMove', {
    data: 'data-sb-move-pinned="' + esc(item.id) + '"', className: 'sb-icon-plain',
  }) : '';
}

function moveFolderList(item) {
  const folders = state().boardFolders ?? [];
  const category = discoverCategory(item);
  const destinations = boardMoveFolders(state(), item).map(folder => {
    const path = boardFolderPath(folders, folder).map(row => row.title).join(' / ');
    return [folder.id, folder.category === category ? path : folder.category + ' / ' + path];
  });
  if (item.folderId) destinations.unshift(['', '分类根目录']);
  if (!destinations.length) return '';
  const label = '移动文件';
  return '<details class="sb-more sb-move-folders" data-sb-disclosure data-sb-move-file="' + esc(item.id) + '">' +
    '<summary class="sb-icon sb-icon-plain" aria-label="' + label + '" title="' + label + '">' + icon('folderMove', 17) + '</summary>' +
    '<div class="sb-move-destinations" role="group" aria-label="目标文件夹">' + destinations.map(([id, name]) =>
      '<button type="button" data-sb-move-destination="' + esc(id) + '">' + icon('folder', 15) + '<span>' + esc(name) +
      '</span></button>').join('') + '<p class="work-error" data-sb-move-error role="alert" hidden></p></div></details>';
}

function rowList(items, mode) {
  return '<ul class="sb-rows">' + items.map(item => {
    const section = boardSection(item);
    const writing = section === 'writing';
    const discover = section === 'discover';
    const module = boardSections[section].label;
    const meta = writing ? timeLabel(changed(item)) + writingBadge(item) :
      discover ? '' : timeLabel(changed(item)) + '<small>' + esc(module) + '</small>';
    const title = writing ? item.title?.trim() || '未命名文章' : contentTitle(item);
    const description = discover ? '' : writing ? (item.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 190) : preview(item);
    const move = mode === 'discover' ? moveFolderList(item) : '';
    return '<li' + (move ? ' class="sb-row-actions"' : '') + '><a class="sb-row" href="' + boardContentHref(item.id) + '">' +
      '<div class="sb-row-copy"><strong>' + (mode === 'discover' ? icon('file', 15) + ' ' : '') + esc(title) + '</strong>' +
      (description && description !== title ? '<p>' + esc(description) + '</p>' : '') +
      '</div>' + (meta ? '<div class="sb-row-meta">' + meta + '</div>' : '') + '</a>' + move + '</li>';
  }).join('') + '</ul>';
}

function reflectionCards(items) {
  const labels = new Map((state().reflectionLabels ?? []).map(label => [label.id, label]));
  const rank = Object.keys(reflectionColors);
  const color = item => labels.get(item.reflectionLabelId)?.color;
  const colorRank = item => color(item) ? rank.indexOf(color(item)) : rank.length;
  const order = reflectionOrder();
  for (const item of items) {
    if (!randomOrder.has(item.id)) randomOrder.set(item.id, Math.random());
  }
  const sorted = [...items].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
    (order === 'random' ? randomOrder.get(a.id) - randomOrder.get(b.id) : colorRank(a) - colorRank(b) || date(b).localeCompare(date(a))));
  return '<div class="sb-reflection-wall">' + sorted.map(item => {
    const snippet = preview(item);
    return '<article class="sb-reflection-card" data-sb-card="' + esc(item.id) + '"' +
      (color(item) ? ' data-sb-color="' + esc(color(item)) + '"' : '') + '><a class="sb-card-title" href="' +
      boardContentHref(item.id) + '"><strong>' + titleOf(item) + '</strong>' +
      (snippet && snippet !== contentTitle(item) ? '<span class="sb-card-preview">' + esc(snippet) + '</span>' : '') +
      '</a>' + boardIcon(item.pinned ? '取消置顶' : '置顶', 'pin', { className: 'sb-pin',
        data: 'data-sb-pin="' + esc(item.id) + '" aria-pressed="' + Boolean(item.pinned) + '"' }) + '</article>';
  }).join('') + '</div>';
}

function orderControls() {
  const order = reflectionOrder();
  return '<div class="segmented sb-sort" role="group" aria-label="卡片排列">' +
    Object.entries({ color: '按颜色', random: '随机' }).map(([key, label]) =>
      '<button type="button" data-sb-order="' + key + '" aria-pressed="' + (order === key) + '">' + label + '</button>').join('') + '</div>';
}

function boardSettings(route) {
  const labels = state().reflectionLabels ?? [];
  const trash = boardIcon('回收站', 'trash', { href: boardSettingsAddress(route.parent, 'trash'), className: 'sb-icon-plain' });
  return heading('Self-Board 设置', '', trash) +
    '<section class="sb-settings"><div class="sb-list-heading"><h3>Reflections 标签</h3>' +
    boardIcon('新建标签', 'add', { data: 'data-sb-label' }) + '</div>' +
    (labels.length ? '<ul class="sb-rows sb-settings-grid">' + labels.map(label => '<li class="sb-setting-label"><span class="sb-swatch" data-sb-color="' +
      esc(label.color) + '"></span><span>' + esc(label.name) + '</span><div class="sb-view-actions">' +
      boardIcon('编辑标签 ' + label.name, 'edit', { data: 'data-sb-label="' + esc(label.id) + '"', className: 'sb-icon-plain' }) +
      boardIcon('移除标签 ' + label.name, 'trash', { data: 'data-sb-remove-label="' + esc(label.id) + '"', className: 'sb-icon-plain' }) + '</div></li>').join('') +
      '</ul>' : '<p class="work-meta">添加标签后，可在灵感详情的编辑模式里为卡片选色。</p>') + '</section>' + explorationTypeSettings() + captureSettingsView();
}

function groupedRows(items, groupFor, mode) {
  const groups = new Map();
  for (const item of items) {
    const key = groupFor(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups].map(([group, rows]) => '<section class="sb-group"><h3>' + esc(group) + '<small>' +
    rows.length + '</small></h3>' + rowList(rows, mode) + '</section>').join('');
}

function relationObjects(filters) {
  const snapshot = state();
  return snapshot.relations.flatMap(edge => {
    const source = objectFor(snapshot, edge.sourceType, edge.sourceId);
    const target = objectFor(snapshot, edge.targetType, edge.targetId);
    if (!source || !target || source.deletedAt || target.deletedAt ||
        (filters.relation && filters.relation !== edge.relationType)) return [];
    const matches = (type, item) => matchContent(type === 'discover' ? boardContent(item) : {
      ...item, type, body: [item.theme, item.description, item.notes, item.url].filter(Boolean).join(' '), topics: item.tags ?? [],
    }, filters);
    return matches(edge.sourceType, source) || matches(edge.targetType, target) ? [{ edge, source, target }] : [];
  });
}

function endpoint(type, item) {
  return '<a href="' + objectHref(type, item) + '"><strong>' + esc(contentTitle(item)) +
    '</strong><small>' + esc(type === 'discover' ? objectLabels[type] + ' · ' + labelFor(type, item) : objectLabels[type] + ' · Workshop') + '</small></a>';
}

function relationActions(id) {
  const className = 'sb-icon-plain';
  return boardIcon('编辑关联', 'edit', { data: 'data-sb-relation="' + esc(id) + '"', className }) +
    boardIcon('移除关联', 'remove', { data: 'data-sb-unlink="' + esc(id) + '"', className });
}

function relationList(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row.edge.relationType;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return [...grouped].map(([type, entries]) => '<section class="sb-group"><h3>' + esc(relationName(type)) +
    '<small>' + entries.length + '</small></h3><ul class="sb-relations">' + entries.map(({ edge, source, target }) =>
      '<li>' + endpoint(edge.sourceType, source) + '<span class="sb-edge-arrow" aria-hidden="true">' + icon('arrow', 17) + '</span>' +
      endpoint(edge.targetType, target) + '<div class="work-actions">' +
      relationActions(edge.id) +
      '</div></li>').join('') + '</ul></section>').join('');
}

const crumb = '<span class="sb-crumb-divider" aria-hidden="true">/</span>';

function discoverTrail(category, folder, { current = false } = {}) {
  const path = [[category, discoverAddress(category)], ...(folder ?
    boardFolderPath(state().boardFolders ?? [], folder).map(row => [row.title, discoverAddress(category, row.id)]) : [])];
  return path.map(([title, address], index) => current && index === path.length - 1 ? esc(title) :
    '<a href="' + esc(address) + '">' + esc(title) + '</a>').join(crumb);
}

function renameFolderIcon(folder, label = '重命名文件夹') {
  return boardIcon(label, 'edit', {
    data: 'data-sb-make-folder="' + esc(folder.id) + '" data-sb-category="' + esc(folder.category) + '"',
    className: 'sb-icon-plain',
  });
}

function pinFolderIcon(folder) {
  return boardIcon((folder.pinned ? '取消置顶 ' : '置顶 ') + folder.title, 'pin', {
    data: 'data-sb-folder-pin="' + esc(folder.id) + '" aria-pressed="' + Boolean(folder.pinned) + '"',
    className: 'sb-icon-plain sb-folder-pin',
  });
}

function deleteFolderIcon(folder) {
  return boardIcon('删除文件夹 ' + folder.title, 'trash', {
    data: 'data-sb-delete-folder="' + esc(folder.id) + '"', className: 'sb-icon-plain',
  });
}

function discoverView(route, items) {
  const folders = state().boardFolders ?? [];
  const directory = discoverDirectory(items, folders);
  const current = directory.find(({ name }) => name === route.params.get('category'));
  const inCategory = current ? folders.filter(folder => folder.category === current.name) : [];
  const folder = inCategory.find(row => row.id === route.params.get('folder'));
  const children = inCategory.filter(row => (row.parentId || '') === (folder?.id || ''))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  const legacyViews = {
    knowledge: item => ['knowledge', 'note'].includes(item.type),
    resources: item => item.type === 'resource',
    exercises: item => item.type === 'exercise',
    inspirations: item => item.inspired || relatedTo(item.id).some(({ edge }) => edge.relationType === 'inspired_by'),
  };
  const rows = current ? items.filter(item => discoverCategory(item) === current.name && (item.folderId || '') === (folder?.id || '')) :
    Object.hasOwn(legacyViews, route.view) ? items.filter(legacyViews[route.view]) : items;
  const categoryData = current ? ' data-sb-category="' + esc(current.name) + '"' : '';
  const folderData = folder ? ' data-sb-folder="' + esc(folder.id) + '"' : '';
  const className = 'sb-icon-plain';
  const newFile = boardIcon('新建文件', 'fileAdd', { href: discoverAddress(current?.name, folder?.id, true), className });
  const canCreateFolder = current && (!folder || canAddSubfolder(folder));
  const rename = folder?.parentId ? renameFolderIcon(folder) : '';
  const folderAction = canCreateFolder ? boardIcon(folder ? '新建子文件夹' : '新建文件夹', 'folderAdd', {
    data: 'data-sb-make-folder' + categoryData + folderData, className,
  }) : rename;
  const actions = folderAction + boardIcon('导入资料', 'upload',
    { data: 'data-sb-import="resource"' + categoryData + folderData, className }) + newFile;
  const title = current ? discoverTrail(current.name, folder, { current: true }) : '';
  return '<nav class="sb-directory" aria-label="知识目录">' + directory.map(({ name, description, count }) =>
      '<a href="' + esc(discoverAddress(current?.name === name ? '' : name)) + '"' +
      (current?.name === name ? ' aria-current="page"' : '') +
      '><strong>' + esc(name) + '</strong><span>' + esc(description) + '</span><small>' + count + ' 条</small></a>').join('') +
    '</nav>' +
    '<div class="sb-list-heading sb-section-toolbar">' +
    (title ? '<div class="sb-discover-location"><h3>' + title + '</h3>' +
      (folder ? pinFolderIcon(folder) : '') + '</div>' : '') +
    '<div class="sb-view-actions">' + actions + '</div></div>' +
    (children.length ? '<ul class="sb-rows sb-folders">' + children.map(row => '<li><a class="sb-row" href="' +
      esc(discoverAddress(row.category, row.id)) + '"><span>' + icon('folder', 18) + ' ' + esc(row.title) + '</span>' +
      '<span class="sb-folder-arrow">' + icon('arrow', 14) + '</span></a>' +
      pinFolderIcon(row) + renameFolderIcon(row, '重命名 ' + row.title) + deleteFolderIcon(row) + '</li>').join('') + '</ul>' : '') +
    (rows.length ? rowList(rows, 'discover') : '');
}

function heading(title, description, actions = '') {
  return '<div class="sb-heading"><div><h2>' + esc(title) + '</h2><p>' + esc(description) +
    '</p></div><div class="sb-view-actions">' + actions + '</div></div>';
}

function boardTrash() {
  const records = state().content.filter(row => isSelfBoard(row) && row.deletedAt);
  const content = records.map(row => '<li><strong>' + titleOf(row) + '</strong>' +
    button('恢复记录', 'data-sb-recover="' + esc(row.id) + '"') + '</li>');
  const library = [['topic', state().explorationTopics], ['collection-item', state().collectionItems]]
    .flatMap(([type, rows]) => rows.filter(row => row.deletedAt).map(row =>
      '<li><strong>' + titleOf(row) + '</strong>' + button('恢复记录', 'data-library="recover" data-type="' +
        type + '" data-id="' + esc(row.id) + '"') + '</li>'));
  const rows = [...content, ...library];
  return rows.length ? '<ul class="sb-relations">' + rows.join('') + '</ul>' : '<p>回收站为空</p>';
}

export function searchResults(query) {
  if (!query.trim()) return empty('搜索 Self-Board', '输入文章、反思、资料、探索或收藏的关键词。');
  const items = boardRecords(state(), true).filter(row => matchContent(row, { query }));
  const library = [
    ['topic', topicsFor(state()).filter(row => libraryMatches(row, ['title', 'description'], query) ||
      entriesFor(state(), row.id).some(entry => libraryMatches(entry, ['title', 'body', 'url', 'captureSourceUrl', 'captureNote'], query)))],
    ['collection-item', itemsFor(state()).filter(row => libraryMatches(row, ['title', 'description', 'notes', 'url', 'captureSourceUrl'], query))],
  ];
  const total = items.length + library.reduce((count, [, rows]) => count + rows.length, 0);
  return total ? '<p class="sb-results-count">' + total + ' 条结果</p>' + groupedRows(items,
    row => boardSections[boardSection(row)].label) +
    library.filter(([, rows]) => rows.length).map(([type, rows]) => '<section class="sb-group"><h3>' + objectLabels[type] +
      '<small>' + rows.length + '</small></h3><ul class="sb-rows">' + rows.map(row => '<li><a class="sb-row" href="' +
      esc(objectHref(type, row)) + '">' + titleOf(row) + '</a></li>').join('') + '</ul></section>').join('') :
    empty('没有匹配的内容', '换个关键词，或尝试用标题、标签或正文中的词来找。');
}

export function boardResults(route, filter = {}) {
  if (route.section === 'search') return searchResults(filter.query ?? route.params.get('q') ?? '');
  const view = route.view;
  const active = Object.values(filter).some(value => value.trim());
  if (view === 'unlinked') {
    const rows = boardRecords(state()).filter(item => !relatedTo(item.id).length && matchContent(item, filter));
    return rows.length ? rowList(rows) : empty('没有符合条件的未关联内容', '可以从关系列表添加或查看关联。');
  }
  const rows = relationObjects(filter);
  if (!rows.length) return empty(active ? '没有匹配的关联' : '还没有内容关联',
    active ? '试试其他关键词或筛选条件。' : '把一段想法、写作素材或 Workshop 活动连起来。');
  return relationList(rows);
}

export function boardView(route) {
  const { section, params } = route;
  if (route.view === 'new') {
    const writing = section === 'writing';
    const label = writing ? '新建文章' : '新建文件';
    const category = writing ? null : params.get('category');
    const folder = category && (state().boardFolders ?? []).find(row => row.id === params.get('folder') && row.category === category);
    return '<section class="sb">' + (writing ? '' : discoverTabs()) + '<article class="work-reading sb-reader" data-sb-create-editor>' +
      '<nav class="work-breadcrumb sb-breadcrumb" aria-label="面包屑"><a href="' + boardHref() +
      '">Self-Board</a>' + crumb + '<a href="' + boardHref(section) + '">' + boardSections[section].label + '</a>' +
      (category ? crumb + discoverTrail(category, folder) : '') +
      crumb + '<span aria-current="page">' + label + '</span></nav><header class="sb-reader-heading"><h1>' +
      label + '</h1></header><div data-sb-editor hidden></div></article></section>';
  }
  const items = boardRecords(state());
  let content;
  if (!section) {
    const requested = params.get('view');
    const view = Object.hasOwn(archiveViews, requested) ? requested : 'recent';
    const rows = view === 'inbox' ? items.filter(row => row.status === 'inbox') :
      view === 'archived' ? boardRecords(state(), true).filter(row => row.status === 'archived') : items.slice(0, 5);
    content = (archiveViews[view] ? '<div class="sb-list-heading"><h3>' + archiveViews[view] + '</h3></div>' : '') +
      (view === 'recent' ? inboxView() + '<div class="sb-auto" data-week-preview>' + weekPreview() + '</div>' : '') +
      (rows.length ? rowList(rows) : '');
  } else if (section === 'writing') {
    const rows = items.filter(item => boardSection(item) === section &&
      (route.view === 'drafts' ? !isPublished(item) :
        route.view === 'published' ? isPublished(item) : route.view === 'collections' ? item.series : true));
    const create = boardIcon('新建文章', 'add', { href: href('self-board', 'writing', 'new') });
    content = '<div class="sb-list-heading sb-section-toolbar">' + statusFilters(route.view) + '<div class="sb-view-actions">' +
      boardIcon('导入文章', 'upload', { data: 'data-sb-import="article"' }) + create + '</div></div>' +
      (rows.length ? route.view === 'collections' ? groupedRows(rows, row => row.series, section) : rowList(rows, section) :
        empty('这里还没有文章', '可以从新建或导入开始。'));
  } else if (section === 'reflections') {
    const rows = items.filter(item => boardSection(item) === section &&
      (route.view === 'open-questions' ? item.question?.trim() && !item.questionResolved :
        route.view === 'revisited' ? item.revisitedAt || relatedTo(item.id).length :
          route.view === 'fragments' ? item.fragment : true));
    const create = boardIcon('新建记录', 'add', { data: 'data-sb-capture="thought"' });
    content = '<div class="sb-list-heading sb-section-toolbar"><div class="sb-view-actions">' +
      orderControls() + create + '</div></div>' +
      (rows.length ? reflectionCards(rows) : empty('这里还没有记录', '可以先记下一句话。'));
  } else if (section === 'discover') {
    content = discoverTabs(route.tab) + (route.entity ? topicDetail(route.record, libraryRelations('topic', route.record), params.get('edit') === '1') :
      route.tab === 'explorations' ? explorationsView() : discoverView(route, items.filter(item => boardSection(item) === section)));
  } else if (section === 'collections') {
    content = route.entity ? collectionDetail(route.record, libraryRelations('collection-item', route.record)) : collectionsView(route);
  } else if (section === 'connections') {
    content = heading('Network', '', boardIcon('新增关联', 'add', { data: 'data-sb-relation' })) +
      '<div class="sb-network-tools">' +
      '<form class="work-filters" data-sb-filter role="search"><input type="search" name="query" aria-label="搜索关联对象" placeholder="搜索关联对象…">' +
      (route.view !== 'unlinked' ? '<select name="relation" aria-label="关系类型">' +
        boardOptions({ '': '全部关系', ...relationTypes }) + '</select>' : '') + '</form></div>' +
      '<div data-sb-results aria-live="polite">' + boardResults(route) + '</div>';
  } else if (section === 'settings') {
    content = route.view === 'trash' ? boardTrash() : boardSettings(route);
  } else {
    content = heading('全局搜索', '跨文章、灵感、资料与相关活动查找。') +
      searchForm(params.get('q') || '') +
      '<div data-sb-results aria-live="polite">' + boardResults(route) + '</div>';
  }
  const navigation = !section && !params.get('view') ? overviewNavigation() : '';
  return '<section class="sb" data-sb>' + navigation + '<section class="sb-content">' + content + '</section></section>';
}

function boardRelations(item, ownerType = 'discover') {
  const rows = relatedObjects(state(), ownerType, item.id).direct;
  const refs = state().explorationEntries.filter(row => row.reference?.type === ownerType && row.reference.id === item.id);
  const usedBy = [...new Set(refs.map(row => row.topicId))].map(id => objectFor(state(), 'topic', id)).filter(row => row && !row.deletedAt);
  const backlinks = usedBy.length ? '<p class="work-meta">作为 Reference 被引用于：</p><ul class="work-relations">' +
    usedBy.map(topic => '<li><a href="' + esc(objectHref('topic', topic)) + '">' + titleOf(topic) + '</a></li>').join('') + '</ul>' : '';
  return '<div class="sb-related-body">' + boardIcon('新增关联', 'add', { data: 'data-sb-relation data-sb-source="' + esc(item.id) +
    '" data-sb-source-type="' + ownerType + '"' }) +
    (rows.length ? '<ul class="work-relations" aria-label="直接关联">' + rows.map(({ edge, type, item: target }) => {
      const outgoing = edge.sourceType === ownerType && edge.sourceId === item.id;
      return '<li><div><a href="' + objectHref(type, target) + '">' + titleOf(target) +
        '</a><small>' + esc([relationName(edge.relationType, outgoing), labelFor(type, target)].join(' · ')) + '</small></div>' +
        '<div class="work-actions">' + relationActions(edge.id) + '</div></li>';
    }).join('') + '</ul>' :
    '<p class="work-meta">还没有直接关联。</p>') + backlinks + '</div>';
}

function libraryRelations(type, item) {
  return '<details class="sb-related" open><summary>Related Content</summary>' + boardRelations(item, type) + '</details>';
}

function reviewPanel(item) {
  const history = item.revisions ?? [];
  if (!history.length) return '<section class="sb-review" data-sb-review-panel hidden><p>还没有可以对比的历史版本。</p></section>';
  const choices = Object.fromEntries([...history, item].map((revision, index) => [index,
    'v' + (index + 1) + (index === history.length ? ' · 当前版本' : '') +
    (timestamp(revision.createdAt) && index !== history.length ? ' · ' + timestamp(revision.createdAt) : '')]));
  const from = history.length - 1;
  const to = history.length;
  return '<section class="sb-review" data-sb-review-panel hidden><div class="sb-review-controls">' +
    '<label>从<select data-sb-review-from>' + boardOptions(choices, String(from)) + '</select></label>' +
    '<label>到<select data-sb-review-to>' + boardOptions(choices, String(to)) + '</select></label></div>' +
    '<div class="sb-review-legend" aria-label="颜色说明"><span class="sb-diff-added">＋ 新增</span>' +
    '<span class="sb-diff-removed">− 删除</span><span class="sb-diff-modified">± 修改</span></div>' +
    '<div data-sb-review-diff aria-live="polite"></div></section>';
}

export function boardDetail({ record }) {
  const item = boardContent(record);
  const section = boardSection(item);
  const writing = section === 'writing';
  const cover = imageUrl(item);
  const folder = section === 'discover' && (state().boardFolders ?? []).find(row => row.id === item.folderId);
  const source = resourceKey(item.sourceUrl || item.captureSourceUrl) && (item.sourceUrl || item.captureSourceUrl);
  const id = esc(item.id);
  const className = 'sb-icon-plain';
  const reflection = section === 'reflections';
  const extra = {
    trigger: '触发来源', question: item.questionResolved ? '问题（已回顾）' : '待探索问题', experiment: '下一次尝试',
    ...exerciseFields, excerpt: '原文摘录', personalNotes: '我的笔记', aiNotes: 'AI 整理',
  };
  return '<section class="sb sb-detail"><article class="work-reading sb-reader" data-sb-card="' + id + '">' +
    '<nav class="work-breadcrumb sb-breadcrumb" aria-label="面包屑"><a href="' + boardHref() + '">Self-Board</a><span aria-hidden="true">/</span>' +
    '<a href="' + boardHref(section) + '">' + boardSections[section].label + '</a>' +
    (section === 'discover' ? crumb + discoverTrail(discoverCategory(item), folder) : '') +
    crumb + '<span aria-current="page">' + titleOf(item) + '</span></nav>' +
    '<div data-sb-reading><header class="sb-reader-heading"><h1>' + titleOf(item) + '</h1>' +
    (item.summary ? '<p>' + esc(item.summary) + '</p>' : '') + '<div class="sb-reader-tools"><div class="sb-reader-meta">' +
    timeLabel(writing ? changed(item) : date(item)) + (writing ? writingBadge(item) : '') +
    '</div><div class="sb-view-actions">' + boardIcon('编辑', 'edit', { data: 'data-sb-edit="' + id + '"', className }) +
    (reflection ? boardIcon('写成文章', 'develop', { data: 'data-sb-develop="' + id + '"', className }) : '') +
    (isWriting(item.type) ? boardIcon('审阅', 'review', { data: 'data-sb-review aria-pressed="false"', className }) : '') +
    (section === 'discover' ? movePinnedIcon(item) : '') +
    boardIcon('移到回收站', 'trash', { data: 'data-sb-mark="delete"', className }) +
    (reflection || item.status === 'archived' ? '<details class="sb-more"><summary class="sb-icon sb-icon-plain" aria-label="更多操作" title="更多操作">' +
      icon('more', 17) + '</summary><div>' +
      (reflection ? button('标记为已回看', 'data-sb-mark="revisit"') : '') +
      (item.status === 'archived' ? button('移出旧归档', 'data-sb-mark="restore"') : '') + '</div></details>' : '') +
    '</div></div></header>' +
    '<div data-sb-article-copy>' + (cover ? '<img class="discover-cover" src="' + esc(cover) + '" alt="" referrerpolicy="no-referrer">' : '') +
    '<div class="sb-reading-body">' + markdown(item.body) + '</div></div>' + (isWriting(item.type) ? reviewPanel(item) : '') +
    (source || item.sourceInfo || item.originalPath || item.originalBlockRange || item.notionPageId ? '<section class="sb-detail-field"><h3>原始来源</h3>' +
      (source ? '<a href="' + esc(source) + '" rel="noreferrer">' + esc(item.sourceInfo || source) + '</a>' : '<p>' + esc(item.sourceInfo || '') + '</p>') +
      (item.originalPath ? '<p>' + esc(item.originalPath) + '</p>' : '') +
      (item.originalBlockRange ? '<p>' + esc(item.originalBlockRange) + '</p>' : '') +
      (item.notionPageId ? '<p>Notion · ' + esc(item.notionPageId) + '</p>' : '') + '</section>' : '') +
    Object.entries(extra).filter(([key]) => item[key]).map(([key, label]) =>
      '<section class="sb-detail-field"><h3>' + label + '</h3>' + markdown(item[key]) + '</section>').join('') +
    attachments(item.assetIds) + storedCaptureAttachment(item) +
    '</div><div data-sb-editor hidden></div>' +
    '<details class="sb-related" data-sb-related><summary>相关内容 <span>' + relatedTo(item.id).length + '</span></summary>' +
    boardRelations(item) + '</details></article></section>';
}
