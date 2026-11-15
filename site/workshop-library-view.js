import { externalWorkshopTool, workshopTools } from './workshop-external-tools.js';
import { escapeHtml as esc, safeUrl } from './html.js';
import { icon } from './icons.js';
import { commonResourcesAddress, href, wikiAddress } from './pages.js';
import { boardContent, boardFolderPath, discoverCategory, exerciseFields, isWorkshopWikiCategory, resourcesCategory, workshopWikiCategories } from './self-board-data.js';
import { contentTitle, relatedObjects, studioStore } from './studio-data.js';
import { cardRoles, eventFormats, formatsFor, publicationProjection, searchEvents, tagsFor, toolTypes, toolVisibility,
  wikiRecords, wikiStatus, wikiStatuses, workshopLinks } from './workshop-library.js';
import { documentVersion, imageUrl, markdown, objectHref, relatedPanel, timestamp } from './workshop-view.js';
import { cardGallery, matchResourceTemplate, matchesResourceText, resourceImages, resourceTemplate, resourceTemplates } from './workshop-resource-data.js';

import { storedCaptureAttachment } from './capture-client.js';

const studio = () => studioStore.state;
const link = (url, label) => '<a class="return-link" href="' + esc(url) + '">' + esc(label) + '</a>';
const empty = text => '<p class="work-empty">' + esc(text) + '</p>';

export function workshopAction(label, data) {
  return '<button type="button" class="action-button secondary" ' + data + '>' + esc(label) + '</button>';
}

export function workshopTabs(tabs, selected, label) {
  return '<nav class="segmented work-tabs workshop-tabs" aria-label="' + esc(label) + '">' + tabs.map(([id, title, url]) =>
    '<a href="' + esc(url) + '"' + (selected === id ? ' aria-current="page"' : '') + '>' + esc(title) + '</a>').join('') + '</nav>';
}

const option = (value, label, selected) => '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
const picker = (key, label, options, params) => '<label>' + label + '<select name="' + key + '">' +
  option('', '全部', params.get(key) ?? '') + options.map(([value, name]) => option(value, name, params.get(key))).join('') + '</select></label>';
const searchField = params => '<label>搜索<input type="search" name="q" value="' + esc(params.get('q') || '') + '"></label>';
const dateFilter = (key, label, params) => '<label>' + label + '<input type="date" name="' + key + '" value="' + esc(params.get(key) || '') + '"></label>';
const form = (path, fields) => '<form class="workshop-filters" data-work-filter="' + esc(path) + '">' + fields +
  '<div class="work-actions"><button class="action-button" type="submit">筛选</button>' + link(path, '清除筛选') + '</div></form>';
const titled = rows => rows.map(row => [row.id, row.title]);

function updateDate(item) {
  const date = new Date(item.updatedAt || item.createdAt || '');
  return Number.isNaN(+date) ? '' : new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);
}

export function commonResourcesView({ params }) {
  const state = studio();
  const all = wikiRecords(state);
  const categories = [...workshopWikiCategories.map(([key]) => key), resourcesCategory];
  const category = categories.includes(params.get('category')) ? params.get('category') : '';
  const kind = params.get('kind');
  const deckId = params.get('deck');
  const missing = params.get('missing');
  const folder = state.boardFolders.find(row => row.id === params.get('folder') && row.category === category);
  const needle = (params.get('q') || '').trim().toLocaleLowerCase();
  const reference = params.get('reference');
  const [type, ...id] = (reference || '').split(':');
  const related = reference && relatedObjects(state, type, id.join(':'));
  const referenced = related && new Set([...related.direct, ...related.derived].filter(row => row.type === 'discover').map(row => row.item.id));
  const scope = { exercises: ['exercise'], knowledge: ['knowledge', 'note'] }[params.get('view')];
  const rows = all.filter(item => {
    const date = updateDate(item);
    return (!category || discoverCategory(item) === category) &&
      (!Array.isArray(scope) || scope.includes(item.type)) &&
      (!folder || item.folderId === folder.id || state.boardFolders.some(row => row.id === item.folderId && row.parentId === folder.id)) &&
      (!params.get('status') || wikiStatus(item) === params.get('status')) &&
      (!params.get('tag') || [...item.topics, ...(item.tags ?? [])].includes(params.get('tag'))) &&
      (!params.get('since') || date >= params.get('since')) && (!params.get('until') || date && date <= params.get('until')) &&
      (!referenced || referenced.has(item.id)) &&
      (!deckId || item.cardSetId === deckId) &&
      matchResourceTemplate(item, kind, missing) && matchesResourceText(item, needle);
  });
  const linkLocation = (key, id) => {
    const next = new URLSearchParams(params);
    next.set('category', key);
    if (id) next.set('folder', id);
    else next.delete('folder');
    next.delete('view');
    return commonResourcesAddress(next);
  };
  const folders = state.boardFolders.filter(row => isWorkshopWikiCategory(row.category) &&
    (!category || row.category === category) && (row.parentId || '') === (folder?.id || '')).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  const trail = folder ? '<nav class="work-breadcrumb" aria-label="文件夹路径">' + link(linkLocation(category), category) +
    boardFolderPath(state.boardFolders, folder).map(row => link(linkLocation(row.category, row.id), row.title)).join(' / ') + '</nav>' : '';
  const references = [
    ...state.projects.map(row => ['project:' + row.id, 'Project · ' + row.title]),
    ...state.events.map(row => ['event:' + row.id, 'Event · ' + row.title]),
    ...workshopTools(state).map(row => ['tool:' + row.id, 'Tool · ' + row.title]),
  ];
  const filters = form(commonResourcesAddress(),
    searchField(params) + picker('category', '分类', categories.map(key => [key, key]), params) +
    picker('kind', '资源模板', Object.entries(resourceTemplates).map(([key, template]) => [key, template.label]), params) +
    picker('deck', '卡组', titled(state.cardSets), params) +
    picker('missing', '单卡待补', [['image', '缺正面或背面图片'], ['description', '缺客观描述'], ['either', '缺图片或描述']], params) +
    picker('tag', '标签', [...new Set(all.flatMap(row => [...row.topics, ...(row.tags ?? [])]))].sort().map(tag => [tag, tag]), params) +
    picker('status', '状态', Object.entries(wikiStatuses), params) + picker('reference', '引用位置', references, params) +
    dateFilter('since', '更新日从', params) + dateFilter('until', '更新日到', params) +
    (folder ? '<input type="hidden" name="folder" value="' + esc(folder.id) + '">' : '') +
    (Array.isArray(scope) ? '<input type="hidden" name="view" value="' + esc(params.get('view')) + '">' : ''));
  return '<div class="section-heading work-heading workshop-actions">' +
    '<h2>Common Resources</h2><div class="work-actions">' +
    workshopAction('新建资源', 'data-work-wiki-edit') +
    (category ? workshopAction('新建文件夹', 'data-work-wiki-folder') : '') +
    (folder ? workshopAction('重命名文件夹', 'data-work-wiki-folder="rename"') +
      workshopAction(folder.pinned ? '取消置顶文件夹' : '置顶文件夹',
        'data-work-wiki-folder="pin" aria-pressed="' + Boolean(folder.pinned) + '"') : '') +
    '</div></div>' + filters + trail + (folders.length ? '<ul class="work-relations">' + folders.map(row =>
      '<li>' + link(linkLocation(row.category, row.id), row.title) + '</li>').join('') + '</ul>' : '') +
    (kind === 'card' || missing ? renderCardGallery(rows) : rows.length ? '<ul class="work-relations">' + rows.map(row =>
      '<li><div>' + link(wikiAddress(row.id), contentTitle(row)) + '<small>' +
      esc([resourceTemplate(row.resourceKind)?.label, discoverCategory(row), wikiStatuses[wikiStatus(row)], ...row.topics,
        timestamp(row.updatedAt)].filter(Boolean).join(' · ')) +
      '</small></div></li>').join('') + '</ul>' : empty('没有匹配的共通资源。'));
}

function resourceImage(assetId, label) {
  const src = assetId && imageUrl({ coverAssetId: assetId });
  return src ? '<img src="' + esc(src) + '" alt="' + esc(label) + '" loading="lazy">' : '';
}

function renderCardGallery(rows) {
  return rows.length ? '<div class="gallery-grid poster-grid resource-card-gallery">' + rows.map(row => {
    const data = row.resourceData;
    return '<a class="gallery-card" href="' + esc(wikiAddress(row.id)) + '"><div class="gallery-cover cover-event">' +
      (resourceImage(data.frontAssetId, '正面图片') || resourceImage(data.backAssetId, '背面图片') ||
        '<span class="work-meta">待补图片</span>') + '</div><div class="gallery-copy"><strong>' +
      esc(data.number + ' · ' + contentTitle(row)) + '</strong>' +
      (!data.description?.trim() ? '<p>待补描述</p>' : '') + '</div></a>';
  }).join('') + '</div>' : empty('没有匹配的单卡。');
}

function resourceLinks(ids) {
  const byId = new Map(wikiRecords(studio()).map(row => [row.id, row]));
  return ids.map(id => byId.get(id)).filter(Boolean).map(row => '<li>' + link(wikiAddress(row.id), contentTitle(row)) + '</li>').join('');
}

function templateDetails(item) {
  const template = resourceTemplate(item.resourceKind);
  const images = Object.entries(resourceImages).map(([key, label]) => {
    const image = resourceImage(item.resourceData?.[key], label);
    return image ? '<figure>' + image + '<figcaption>' + label + '</figcaption></figure>' : '';
  }).join('');
  const fields = Object.entries(template?.fields ?? {}).filter(([key]) => item.resourceData?.[key]).map(([key, label]) =>
    '<div><dt>' + label + '</dt><dd>' + esc(item.resourceData[key]) + '</dd></div>').join('');
  const links = item.resourceLinks?.length ? resourceLinks(item.resourceLinks) : '';
  return (template ? '<p class="work-meta">' + esc(template.label) + '</p>' : '') +
    (images ? '<div class="resource-images">' + images + '</div>' : '') +
    (fields ? '<dl class="resource-template-fields">' + fields + '</dl>' : '') +
    (links ? '<h3>关联资源</h3><ul class="work-relations">' + links + '</ul>' : '');
}

function wikiVersion(version, resourceId) {
  const cover = imageUrl(version);
  return (cover ? '<img class="discover-cover" src="' + esc(cover) + '" alt="" referrerpolicy="no-referrer">' : '') +
    templateDetails(version) + documentVersion(version) + (version.captureSourceUrl && /^https?:\/\//i.test(version.captureSourceUrl)
      ? '<p class="work-meta">' + esc(version.captureSourceUrl) + '</p>' : '') +
    Object.entries({ ...exerciseFields, personalNotes: '我的笔记', excerpt: '原文摘录', aiNotes: 'AI 整理' })
      .filter(([key]) => version[key]).map(([key, label]) => '<h3>' + label + '</h3>' + markdown(version[key])).join('') +
    storedCaptureAttachment({ id: resourceId, captureHasAttachment: version.captureHasAttachment });
}

export function wikiVersionView(item, versionId) {
  const version = item.revisions?.find(row => row.id === versionId);
  return '<article class="work-reading sb-reader"><header class="section-heading"><h1>' +
    esc(version?.title || contentTitle(item)) + '</h1>' + link(wikiAddress(item.id), '查看当前版本') + '</header>' +
    (version ? '<p class="work-meta">历史版本 · ' + esc(timestamp(version.createdAt)) + '</p>' + wikiVersion(version, item.id) :
      '<p role="alert">找不到所选历史版本。</p>') + '</article>';
}

export function wikiDetails(item) {
  const state = studio();
  const rows = relatedObjects(state, 'discover', item.id).direct;
  const references = rows.filter(row => ['event', 'project', 'tool'].includes(row.type));
  const backlinks = wikiRecords(state).filter(row => row.resourceLinks?.includes(item.id));
  const deck = state.cardSets.find(row => row.id === item.cardSetId);
  const profile = deck && wikiRecords(state).find(row => row.resourceKind === 'card_set' && row.cardSetId === deck.id);
  const galleryUrl = deck && commonResourcesAddress(new URLSearchParams({ kind: 'card', deck: deck.id }));
  const deckView = item.resourceKind === 'card_set' && deck
    ? '<section class="workshop-panel"><div class="section-heading"><h2>单卡画廊</h2>' +
      workshopAction('新增单卡', 'data-work-add-card="' + esc(deck.id) + '"') + '</div>' +
      renderCardGallery(cardGallery(state, deck.id)) + '</section>'
    : item.resourceKind === 'card' && deck ? '<p class="work-meta">所属卡组 · ' +
      link(profile ? wikiAddress(profile.id) : galleryUrl, profile?.title || deck.title) + '</p>' : '';
  return '<section class="workshop-panel">' + templateDetails(item) + deckView +
    (backlinks.length ? '<h3>被以下资源关联</h3><ul class="work-relations">' + backlinks.map(row =>
      '<li>' + link(wikiAddress(row.id), contentTitle(row)) + '</li>').join('') + '</ul>' : '') +
    '<h2>资源状态</h2><p class="work-meta">' +
    esc([wikiStatuses[wikiStatus(item)], ...(item.topics ?? [])].join(' · ')) + '</p>' +
    workshopAction(wikiStatus(item) === 'archived' ? '恢复为使用中' : '归档资源', 'data-work-wiki-status') + '</section>' +
    '<section class="workshop-panel"><h2>引用位置</h2>' +
    (references.length ? '<ul class="work-relations">' + references.map(({ type, item: owner, edge }) =>
      '<li><div>' + link(objectHref(type, owner), owner.title) + '<small>' + (edge.versionId ? '固定版本' : '实时引用') +
      '</small></div></li>').join('') + '</ul>' : empty('还没有 Project、Event 或工具引用。')) + '</section>' +
    '<section class="workshop-panel"><h2>版本历史</h2>' +
    ((item.revisions ?? []).length ? (item.revisions ?? []).slice().reverse().map(row =>
      '<details class="work-history"><summary>' +
      esc((row.title || contentTitle(item)) + (row.createdAt ? ' · ' + timestamp(row.createdAt) : '')) + '</summary>' +
      link(wikiAddress(item.id) + '?' + new URLSearchParams({ version: row.id }), '打开此版本') +
      wikiVersion(row, item.id) + '</details>').join('') : empty('还没有历史版本。')) + '</section>';
}

export function linkedWorkshopPanel(type, owner, kind) {
  const { direct, derived, inherited } = workshopLinks(studio(), type, owner, kind);
  const title = kind === 'tool' ? 'Linked Interactive Tools' : 'Linked Common Resources';
  const row = ({ item, edge, via }, editable = false) => {
    const resource = kind === 'tool' ? objectHref('tool', item) : wikiAddress(item.id);
    const pinned = edge?.versionId;
    const version = pinned && item.revisions?.find(row => row.id === pinned);
    const live = kind === 'wiki' && !via && !version ? boardContent(item) : null;
    const label = pinned ? '固定版本' : kind === 'tool' ? toolVisibility[item.visibility] : '实时引用';
    return '<li><div>' + link(resource + (version ? '?' + new URLSearchParams({ version: pinned }) : ''),
      version?.title || contentTitle(item)) + '<small>' + esc(label) +
      (kind === 'wiki' && wikiStatus(item) === 'archived' ? ' · 已归档' : '') + '</small>' +
      (version ? '<details class="work-history"><summary>查看采用版本</summary>' + wikiVersion(version, item.id) + '</details>' : '') +
      (live ? '<details class="work-history"><summary>查看最新内容</summary>' + wikiVersion(live, item.id) + '</details>' : '') +
      (via ? '<small>经由 ' + via.map(event => link(objectHref('event', event), event.title)).join('、') + '</small>' : '') +
      '</div>' + (editable ? '<div class="work-actions">' +
        (kind === 'wiki' && type === 'event' && !pinned ? workshopAction('固定版本', 'data-work-pin="' + esc(edge.id) + '"') : '') +
        workshopAction('移除引用', 'data-work-unlink="' + esc(edge.id) + '"') + '</div>' : '') + '</li>';
  };
  const group = (label, rows, editable = false) => '<section class="workshop-panel"><h3>' + label + '</h3>' +
    (rows.length ? '<ul class="work-relations">' + rows.map(item => row(item, editable)).join('') + '</ul>' : empty('暂无引用。')) + '</section>';
  const directRows = direct.filter(row => !row.edge.versionId);
  const fixed = direct.filter(row => row.edge.versionId);
  return '<section class="workshop-panel"><div class="section-heading"><h2>' + title + '</h2>' +
    workshopAction(kind === 'tool' ? '关联工具' : '引用共通资源', 'data-work-link="' + kind + '"') + '</div>' +
    group(type === 'event' ? 'Event 直接引用' : 'Project 明确引用', directRows, true) +
    (type === 'project' ? group('经由 Event 关联', derived) :
      (inherited.length ? '<details class="work-history"><summary>Project 引用（' + inherited.length + '）</summary>' +
        '<ul class="work-relations">' + inherited.map(item => row(item)).join('') + '</ul></details>' : '') + (kind === 'wiki' ? group('固定版本采用', fixed, true) : '')) + '</section>';
}

export function activitiesView({ params }) {
  const state = studio();
  const formats = params.getAll('format');
  const rows = searchEvents(state, { project: params.get('project'), tag: params.get('tag'), card: params.get('card'),
    role: params.get('role'), formats, wiki: params.get('wiki'), query: params.get('q') || '' });
  const tags = [...new Set([...state.workshopTags.map(row => row.title), ...state.events.flatMap(event => tagsFor(state, event))])].sort();
  return form(href('workshop', 'activities'),
    searchField(params) + picker('project', 'Project', titled(state.projects), params) +
    picker('tag', 'Event 标签', tags.map(tag => [tag, tag]), params) + picker('card', '卡组', titled(state.cardSets), params) +
    picker('role', '卡组角色', Object.entries(cardRoles), params) +
    picker('wiki', '共通资源', wikiRecords(state).map(row => [row.id, contentTitle(row)]), params) +
    '<fieldset class="work-choices"><legend>活动形式（满足全部）</legend>' + Object.entries(eventFormats).map(([id, label]) =>
      '<label class="work-check"><input type="checkbox" name="format" value="' + id + '"' +
      (formats.includes(id) ? ' checked' : '') + '>' + label + '</label>').join('') + '</fieldset>') +
    (rows.length ? '<ul class="work-relations">' + rows.map(event => '<li><div>' + link(objectHref('event', event), event.title) +
      '<small>' + esc([state.projects.find(row => row.id === event.projectId)?.title, event.date,
        ...tagsFor(state, event), ...formatsFor(event).map(key => eventFormats[key])].filter(Boolean).join(' · ')) +
      '</small></div></li>').join('') + '</ul>' : empty('没有匹配的 Event。'));
}

export function dictionariesView() {
  const state = studio();
  const group = (title, key, rows) => '<section class="workshop-panel"><div class="section-heading"><h2>' +
    title + '</h2>' + workshopAction('新增', 'data-work-dictionary="' + key + '"') + '</div>' +
    (rows.length ? '<ul class="work-relations">' + rows.map(row => '<li><span>' + esc(row.title) + '</span>' +
      workshopAction('重命名 ' + row.title, 'data-work-dictionary="' + key + '" data-id="' + esc(row.id) + '"') + '</li>').join('') +
      '</ul>' : empty('暂无登记。')) + '</section>';
  return group('Tag Dictionary', 'tag', state.workshopTags) + group('卡组', 'card', state.cardSets);
}

export function publicationPanel(kind, item) {
  const preview = item.workshopPublication?.preview;
  const fields = publicationProjection(kind, item);
  return '<section class="workshop-panel"><h2>Publish</h2><p>仅私有预览。公开入口尚未配置。</p>' +
    (preview ? '<dl class="event-fields">' + Object.keys(fields).map(key =>
      '<div><dt>' + ({ title: '标题', date: '日期', theme: '主题', description: '简介', type: '类型', version: '版本' })[key] +
      '</dt><dd>' + esc(preview[key]) + '</dd></div>').join('') + '</dl>' : empty('尚未确认发布预览。')) +
    '<div class="work-actions">' + workshopAction(preview ? '更新预览' : '准备发布预览', 'data-work-publish="' + kind + '"') +
    (preview ? workshopAction('撤回预览', 'data-work-unpublish="' + kind + '"') : '') + '</div></section>';
}

export function interactiveToolsView() {
  const rows = workshopTools(studio());
  return '<div class="section-heading work-heading workshop-actions"><h2>Interactive Tools</h2>' +
    workshopAction('登记工具', 'data-work-tool-edit') + '</div>' +
    '<nav class="workspace-entries tool-entries" aria-label="互动工具">' + rows.map(item => {
      const external = externalWorkshopTool(item.id);
      const address = external?.appLocation ?? objectHref('tool', item);
      const caption = external ? item.description : [toolTypes[item.type], toolVisibility[item.visibility], item.version].filter(Boolean).join(' · ');
      return '<a class="workspace-entry" href="' + esc(address) + '"><span class="entry-icon">' +
        icon(item.type === 'game' ? 'workshop' : 'auto') + '</span><span class="entry-label">' + esc(item.title) + '</span>' +
        (caption ? '<span class="work-meta">' + esc(caption) + '</span>' : '') + '</a>';
    }).join('') + '</nav>';
}

export function interactiveToolView({ tool }) {
  const url = safeUrl(tool.appLocation);
  const external = externalWorkshopTool(tool.id);
  const open = url ? link(url, '打开工具') : empty('尚未登记启动地址。');
  return '<article class="work-reading"><div class="section-heading work-heading"><h2>' + esc(tool.title) +
    '</h2>' + (external ? '' : workshopAction('编辑工具', 'data-work-tool-edit')) + '</div>' +
    '<p class="work-meta">' + esc([toolTypes[tool.type], external ? 'Render' : toolVisibility[tool.visibility],
      tool.audience, tool.version].filter(Boolean).join(' · ')) + '</p>' + markdown(tool.description || '') + open +
    (external ? '' : '<p class="work-meta">Private 仅工作台访问。Unlisted 是预期的凭链接分发，Public 是预期的公开目录；目前均受现有工作台权限保护。外部工具沿用其自身权限。</p>') +
    relatedPanel('tool', tool.id) + (external ? '' : publicationPanel('tool', tool)) + '</article>';
}
