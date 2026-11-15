import { escapeHtml as esc, safeUrl } from './html.js';
import { icon } from './icons.js';
import { currentVersion, eventSections, imageTypes, objectFor, reusableFor, sessionsFor, studioStore } from './studio-data.js';
import { documentVersion, eventFields, imageUrl, markdown, objectHref, smallAction, timestamp } from './workshop-view.js';
import { publicationPanel } from './workshop-library-view.js';
import { cardRoles, eventFormats, formatsFor, tagsFor, workshopLinks } from './workshop-library.js';
import { activeFlow, areaFor, eventAreas, eventAttachmentReferences, eventResources } from './workshop-event-data.js';
import { usageFields as eventUsageLabels, usageStatuses, usageTextLimit } from './workshop-resource-data.js';

export const areaLabels = { overview: 'Overview', flow: 'Flow', resources: 'Resources', review: 'Records & Review' };
export const initialSections = { overview: 'overview', flow: 'flow', resources: 'artifact', review: 'review' };
export const eventStatuses = { draft: '草稿', planned: '计划中', completed: '已完成', cancelled: '已取消' };
export const eventStatus = event => Object.hasOwn(eventStatuses, event.status) ? eventStatuses[event.status] : event.status || '';

export const option = (value, label, selected = false) =>
  '<option value="' + esc(value) + '"' + (selected ? ' selected' : '') + '>' + esc(label) + '</option>';
export const field = (name, label, value = '', attrs = '') =>
  '<label>' + label + '<input name="' + name + '" value="' + esc(value ?? '') + '" ' + attrs + '></label>';
export const textArea = (name, label, value = '', attrs = '', rows = 5) =>
  '<label>' + label + '<textarea name="' + name + '" rows="' + rows + '" ' + attrs + '>' + esc(value ?? '') + '</textarea></label>';
export const check = (name, label, checked, value = '1') => '<label class="work-check"><input type="checkbox" name="' +
  name + '" value="' + esc(value) + '"' + (checked ? ' checked' : '') + '>' + esc(label) + '</label>';
export const select = (name, label, rows, value = '', attrs = '') => '<label>' + label +
  '<select name="' + name + '" ' + attrs + '>' + rows.map(([key, label]) => option(key, label, key === value)).join('') + '</select></label>';
const fileControl = (name, label, attrs = '') => '<label class="event-file-control" title="' + label + '">' + icon('paperclip') +
  '<span>' + label + '</span><input type="file" name="' + name + '" aria-label="' + label + '" ' + attrs + '></label>';
const editButton = (label, area, key) => smallAction('edit', label, 'data-event-target="' + area +
  '" data-event-edit="' + esc(key) + '"');
const addButton = (area, after) => smallAction('add', after ? '在此环节后添加' : '添加 ' + areaLabels[area],
  'data-event-target="' + area + '"' + (after ? ' data-event-after="' + esc(after) + '"' : ''));

export function orderControls(kind, item, list, index, { projectId = '' } = {}) {
  const attrs = ' data-order-kind="' + kind + '" data-id="' + esc(item.id) + '" data-group="' + esc(projectId) + '"';
  const button = (name, label, target, after) => smallAction(name, label + ' ' + (item.title ?? currentVersion(item)?.title),
    'data-order-move="' + esc(target?.id ?? '') + '"' + attrs + (after ? ' data-order-after' : '') + (target ? '' : ' disabled'));
  return '<div class="event-order-tools">' + button('up', '向前移动', list[index - 1], false) +
    '<span class="event-grip" title="拖动排序" aria-hidden="true" draggable="true" data-order-drag' +
    attrs + '>' + icon('grip') + '</span>' +
    button('down', '向后移动', list[index + 1], true) + '</div>';
}

function tagFields(state, event = {}) {
  return '<div class="event-tag-fields">' + field('newTags', '标签', '', 'placeholder="输入新标签，用逗号分隔"') +
    (state.workshopTags.length ? '<details' + (event.tagIds?.length ? ' open' : '') + '><summary>选择已有标签</summary>' +
      '<div class="event-checks">' + state.workshopTags.map(tag => check('tagId', tag.title, event.tagIds?.includes(tag.id), tag.id))
        .join('') + '</div></details>' : '') +
    (event.tags?.length ? '<p class="work-meta">' + esc(event.tags.map(tag => '#' + tag).join(' ')) + '</p>' : '') + '</div>';
}

export function saveStatus() {
  return '<p class="event-save-status" data-event-save-status role="status"></p>' +
    '<button type="button" class="text-button" data-event-rebase hidden>查看最新预览并保留草稿</button>';
}

export function creationForm(state, { projectId = '', source } = {}) {
  return '<form class="event-inline-form event-create" data-event-create="' + esc(projectId) + '"' +
    (source ? ' data-event-copy="' + esc(source.id) + '"' : ' hidden') + '>' +
    field('title', '标题', source ? source.title.slice(0, 196) + '（副本）' : '', 'required maxlength="200"') + tagFields(state, source) +
    (source ? '<fieldset class="event-checks"><legend>复制内容</legend>' +
      check('copyFlow', 'Flow', true) + check('copyResources', '资源关联', true) + check('copyPlanning', '策划内容', true) +
      '</fieldset>' : '') + '<div class="event-form-actions"><button type="submit" class="action-button">' +
    (source ? '创建副本' : '创建 Event') + '</button>' + smallAction('remove', '取消创建', 'data-event-new-close') + '</div>' + saveStatus() + '</form>';
}

export function metadataFields(state, event) {
  const statuses = { ...eventStatuses };
  if (event.status && !Object.hasOwn(statuses, event.status)) statuses[event.status] = event.status;
  return field('title', '标题', event.title, 'required maxlength="200"') + tagFields(state, event) + '<div class="event-field-pair">' +
    select('projectId', 'Project', [['', '未分组'], ...state.projects.map(project => [project.id, project.title])], event.projectId || '') +
    select('status', '状态', [['', '未设置'], ...Object.entries(statuses)], event.status || '') + '</div>' +
    '<div class="event-field-pair">' + Object.entries(eventFields).map(([key, label]) =>
      field(key, label, event[key], key === 'date' && (!event.date || /^\d{4}-\d{2}-\d{2}$/.test(event.date)) ? 'type="date"' : '')).join('') +
    '</div><details><summary>海报与活动形式</summary><div class="event-field-pair">' +
    field('posterUrl', '海报链接', event.posterUrl, 'placeholder="https://"') +
    fileControl('cover', '上传海报', 'accept="' + imageTypes.join(',') + '"') + '</div>' +
    (event.coverAssetId || event.coverUrl ? check('clearCover', '移除原封面', false) : '') +
    '<div class="event-checks">' + Object.entries(eventFormats).map(([id, title]) => check('format', title, formatsFor(event).includes(id), id))
      .join('') + '</div></details>';
}

function documentFiles(state, ids = []) {
  return ids.length ? '<div class="event-checks">' + ids.map(id => check('retainAsset',
    state.assets.find(row => row.id === id)?.name || id, true, id)).join('') + '</div>' : '';
}

export function documentFields(state, event, area, session, afterId) {
  const version = currentVersion(session) ?? {};
  const flow = area === 'flow';
  const locations = activeFlow(state, event.id).map(row => [row.id, currentVersion(row).title]);
  const existing = eventResources(state, event);
  return '<div class="event-field-pair">' + field('title', flow ? '环节名称' : '标题（可选）', version.title,
    (flow ? 'required ' : '') + 'maxlength="200"') + (flow ? field('minutes', '时长（分钟）', version.workshopMinutes,
    'type="number" min="0" step="1"') : '') + '</div>' +
    (flow && !session && locations.length ? select('after', '插入位置', [['', '末尾'], ...locations.map(([id, title]) => [id, title + ' 之后'])], afterId) : '') +
    (area === 'review' && !session ? select('section', '类型', eventAreas.review.map(key => [key, eventSections[key]]), 'review') : '') +
    textArea('body', flow ? '内容 / 指引' : '正文', version.body, 'placeholder="输入或粘贴内容"') +
    (flow ? '<details' + (version.workshopPrompts || version.workshopNotes ? ' open' : '') + '><summary>主持提示与备注</summary>' +
      textArea('prompts', '主持提示', version.workshopPrompts, '', 2) + textArea('notes', '备注', version.workshopNotes, '', 2) + '</details>' +
      '<details' + (existing.some(entry => entry.row.workshopFlowIds?.includes(session?.id)) ? ' open' : '') +
      '><summary>关联资源</summary>' + (existing.length ? '<div class="event-checks">' +
      existing.map(entry => check('flowResource', entry.title, entry.row.workshopFlowIds?.includes(session?.id), entry.key)).join('') +
      '</div>' : '') + '<div data-event-resource-picker></div></details>' : '') +
    documentFiles(state, version.assetIds) + fileControl('attachments', '添加图片或文件', 'multiple') + '<p class="work-meta" data-event-files hidden></p>' +
    (session && (version.sourceInfo || version.sourceUrl) ? '<details><summary>来源</summary>' +
      field('sourceInfo', '来源说明', version.sourceInfo) + field('sourceUrl', '来源链接', version.sourceUrl) + '</details>' : '');
}

function usageFields({ role = '', note = '', quantity = '', card = false } = {}) {
  return '<div class="event-field-pair">' +
    (card ? select('role', '卡组角色', Object.entries(cardRoles), role || 'primary') : field('role', '角色（可选）', role)) +
    field('quantity', '数量（可选）', quantity) + '</div>' + field('note', '用法 / 备注（可选）', note);
}

function eventUsageFields(usage = {}) {
  return '<fieldset class="event-usage-fields"><legend>本场用法</legend>' +
    select('usage-status', '使用状态', Object.entries(usageStatuses), usage.status || 'candidate') +
    Object.entries(eventUsageLabels).map(([key, label]) => textArea('usage-' + key, label, usage[key],
      'maxlength="' + usageTextLimit + '"', 2)).join('') + '</fieldset>';
}

export function resourceFields(state, event, entry) {
  const { row } = entry;
  const isWiki = entry.kind === 'edge' && workshopLinks(state, 'event', event, 'wiki').direct.some(link => link.edge.id === entry.id);
  return '<p class="event-resource-name">' + esc(entry.title) + '</p>' +
    usageFields({ role: row.role ?? row.workshopRole, note: row.usageNote ?? row.workshopUsage, quantity: row.workshopQuantity,
      card: entry.kind === 'card' }) +
    (isWiki ? wikiOptions(entry.item, row.versionId) : '') +
    eventUsageFields(row.usage) +
    '<fieldset class="event-checks"><legend>关联环节</legend>' +
    activeFlow(state, event.id).map(session => check('flowId', currentVersion(session).title, row.workshopFlowIds?.includes(session.id), session.id))
      .join('') + '</fieldset>';
}

export function wikiOptions(item, versionId) {
  return select('mode', '引用方式', [['live', '实时'], ['pinned_version', '固定版本']], versionId ? 'pinned_version' : 'live') +
    select('versionId', 'Wiki 版本', [['', '当前版本'], ...(item?.revisions ?? []).slice().reverse().map(version =>
      [version.id, (version.title || item.title || 'Wiki') + (version.createdAt ? ' · ' + timestamp(version.createdAt) : '')])], versionId,
      'data-event-wiki-version' + (versionId ? '' : ' disabled'));
}

export function resourcePicker(flow) {
  const kinds = [['', flow ? '添加关联…' : '资源类型'], ['card', '卡组'], ['wiki', 'Common Resources Wiki'],
    ['related', '其他 Studio 资源'], ['asset', '图片或文件'], ['material', '实体物料'], ['link', '外部链接'], ['new-card', '登记新卡组']];
  return select('kind', flow ? '添加资源' : '资源类型', kinds, '', 'data-event-resource-kind') + '<div data-event-resource-fields></div>';
}

export function resourceInputFields(kind) {
  if (!kind) return '';
  const fields = {
    card: '<div data-event-resource-search></div>',
    wiki: '<div data-event-resource-search></div><div data-event-wiki-options></div>',
    related: '<div data-event-resource-search></div>',
    asset: fileControl('resourceFile', '选择文件') + select('existingAsset', '或引用本场已有文件', [['', '选择文件']], ''),
    material: field('resourceTitle', '物料名称', '', 'maxlength="200"'),
    link: field('resourceUrl', '链接', '', 'placeholder="https://"') + field('resourceTitle', '名称（可选）', '', 'maxlength="200"'),
    'new-card': field('resourceTitle', '卡组名称', '', 'maxlength="80"'),
  };
  return fields[kind] + usageFields({ card: ['card', 'new-card'].includes(kind) }) + eventUsageFields();
}

export function flowAssignment(state, event) {
  return select('flowId', '关联环节', [['', 'Event 通用'], ...activeFlow(state, event.id)
    .map(session => [session.id, currentVersion(session).title])]);
}

function resourceTitle(entry) {
  const { row } = entry;
  let url;
  if (entry.kind === 'edge') url = objectHref(entry.type, entry.item) + (row.versionId ? '?' + new URLSearchParams({ version: row.versionId }) : '');
  if (entry.kind === 'link') url = safeUrl(row.url);
  if (entry.kind === 'asset') return '<button class="text-button" type="button" data-work-download="' + esc(row.assetId) + '">' + esc(entry.title) + '</button>';
  const version = row.versionId && entry.item?.revisions?.find(item => item.id === row.versionId);
  return url ? '<a href="' + esc(url) + '" rel="noreferrer">' + esc(version?.title || entry.title) + '</a>' : '<span>' + esc(entry.title) + '</span>';
}

function resourceRow(entry, state, preview = false, inherited = false) {
  const { row } = entry;
  const role = entry.kind === 'card' ? cardRoles[row.role] : row.role || row.workshopRole ||
    (['used_in_event', 'related'].includes(row.relationType) ? '' : row.relationType);
  const usage = inherited ? undefined : row.usage;
  const labels = [role, row.versionId ? '固定版本' : '', usageStatuses[usage?.status],
    row.workshopQuantity ? '数量 ' + row.workshopQuantity : '',
    ...(preview ? [] : (row.workshopFlowIds ?? []).map(id => currentVersion(state.sessions.find(session => session.id === id))?.title))]
    .filter(Boolean);
  const note = row.usageNote ?? row.workshopUsage;
  const usageDetails = Object.entries(eventUsageLabels).filter(([key]) => usage?.[key]).map(([key, label]) =>
    '<div><dt>' + label + '</dt><dd>' + esc(usage[key]) + '</dd></div>').join('');
  const controls = preview ? '' : '<div class="work-actions">' + editButton('编辑资源用法', 'resources', entry.key) +
    smallAction('trash', '移除资源', 'data-event-remove-resource="' + esc(entry.key) + '"') + '</div>';
  return '<li' + (!preview ? ' data-event-saved="' + esc(entry.key) + '" tabindex="-1"' : '') + '><div>' + resourceTitle(entry) +
    (labels.length ? '<small>' + esc(labels.join(' · ')) + '</small>' : '') +
    (note ? '<p class="event-resource-note">' + esc(note) + '</p>' : '') +
    (usageDetails ? '<dl class="resource-template-fields">' + usageDetails + '</dl>' : '') + '</div>' + controls + '</li>';
}

function docPreview(state, session, area, { flow, index = 0, resources, selected } = {}) {
  const version = currentVersion(session);
  const minutes = version.workshopMinutes;
  const summary = flow ? version.body?.trim().split(/\r?\n/, 1)[0].slice(0, 125) : '';
  const history = session.versions.filter(item => item !== version).slice().reverse();
  const controls = session.workshopArchivedAt ? '' : '<div class="event-row-actions work-actions">' + editButton('编辑 ' + version.title, area, session.id) +
    (flow ? addButton(area, session.id) + smallAction('copy', '复制环节', 'data-event-copy-flow="' + esc(session.id) + '"') +
      smallAction('trash', '删除环节', 'data-event-remove-flow="' + esc(session.id) + '"') +
      orderControls('flow', session, flow, index) : '') + '</div>';
  const linked = flow ? resources.filter(entry => entry.row.workshopFlowIds?.includes(session.id)) : [];
  const details = '<details class="event-document" data-event-document="' + esc(session.id) + '"' + (selected ? ' open' : '') + '><summary>' +
    '<span>' + esc(version.title) + (minutes != null ? '<small> · ' + minutes + ' 分钟</small>' : '') + '</span>' +
    (summary ? '<small class="event-flow-excerpt">' + esc(summary) + '</small>' : '') +
    '</summary><div class="event-document-body">' + documentVersion(version) +
    [...new Set([version.coverAssetId, ...(version.assetIds ?? [])].filter(Boolean))].map(id => imageAttachment(state, id)).join('') +
    (version.workshopPrompts ? '<h4>主持提示</h4>' + markdown(version.workshopPrompts) : '') +
    (version.workshopNotes ? '<h4>备注</h4>' + markdown(version.workshopNotes) : '') +
    (linked.length ? '<ul class="event-resource-list">' + linked.map(entry => resourceRow(entry, state, true)).join('') + '</ul>' : '') +
    (history.length ? '<details class="work-history"><summary>历史版本 (' + history.length + ')</summary>' + history.map(old =>
      '<details><summary>' + esc(old.title) + ' · ' + esc(timestamp(old.createdAt)) + '</summary>' + documentVersion(old) +
      (old.workshopMinutes != null ? '<p>' + old.workshopMinutes + ' 分钟</p>' : '') +
      (old.workshopPrompts ? markdown(old.workshopPrompts) : '') + (old.workshopNotes ? markdown(old.workshopNotes) : '') + '</details>').join('') +
      '</details>' : '') + '</div></details>';
  return '<div class="event-preview-row" data-event-saved="' + esc(session.id) + '"' +
    (flow ? ' data-order-item="flow" data-id="' + esc(session.id) + '"' : '') + ' tabindex="-1">' + details + controls + '</div>';
}

function imageAttachment(state, id) {
  const asset = state.assets.find(row => row.id === id);
  if (!asset || !imageTypes.includes(asset.mime)) return '';
  return '<img class="event-inline-image" alt="' + esc(asset.name) + '" src="data:' + asset.mime + ';base64,' + esc(asset.data) + '">';
}

export function eventDetail({ event, params }) {
  const state = studioStore.state;
  const sessions = sessionsFor(state, 'event', event.id).filter(row => !row.workshopArchivedAt);
  const flow = activeFlow(state, event.id);
  const resources = eventResources(state, event);
  const project = objectFor(state, 'project', event.projectId);
  const poster = imageUrl(event, 'posterUrl') || imageUrl(event);
  const tags = tagsFor(state, event);
  const fields = Object.entries(eventFields).filter(([key]) => key !== 'date' && event[key] != null && event[key] !== '')
    .map(([key, label]) => '<div><dt>' + label + '</dt><dd>' + esc(event[key]) + '</dd></div>').join('');
  const requested = { materials: 'resources', publish: 'overview' }[params?.get('view')] || params?.get('view');
  const more = '<details class="workshop-menu"' + (params?.get('view') === 'publish' ? ' open' : '') +
    '><summary class="header-icon" aria-label="Event 更多操作" title="Event 更多操作">' + icon('more') +
    '</summary><div><button type="button" class="text-button" data-event-duplicate>复制 Event</button>' +
    (reusableFor(state, event.projectId).length ? '<button type="button" class="text-button" data-work-adopt>采用 Project 共通内容</button>' : '') +
    '<details' + (params?.get('view') === 'publish' ? ' open' : '') + '><summary>发布预览</summary>' +
    publicationPanel('event', event) + '</details></div></details>';
  const header = '<div class="event-detail-meta" data-event-saved="metadata" tabindex="-1"><div><p>' +
    esc([event.date, eventStatus(event)].filter(Boolean).join(' · ')) +
    (project ? ' <a href="' + objectHref('project', project) + '">' + esc(project.title) + '</a>' : ' <span>未分组</span>') +
    '</p>' + (tags.length ? '<p class="event-detail-tags">' + esc(tags.map(tag => '#' + tag).join(' ')) + '</p>' : '') +
    '</div><div class="work-actions">' + editButton('编辑 Event 基础信息', 'overview', 'metadata') + more + '</div></div>';
  const formats = [...new Set([...formatsFor(event).map(key => eventFormats[key] || key),
    ...[event.format, event.form, event.activityFormat].flat().filter(value => typeof value === 'string' && value && !Object.hasOwn(eventFormats, value))])];
  const overview = (poster ? '<img class="event-poster" src="' + esc(poster) + '" alt="活动海报" referrerpolicy="no-referrer">' : '') +
    (fields ? '<dl class="event-fields">' + fields + '</dl>' : '') +
    (formats.length ? '<p class="work-meta">' + esc(formats.join(' · ')) + '</p>' : '') +
    ['description', 'body'].filter(key => event[key]).map(key => {
      const label = key === 'description' ? '活动介绍' : '活动正文';
      return '<div class="event-legacy-body" data-event-saved="legacy-' + key + '" tabindex="-1">' +
        '<div class="section-heading"><h3>' + label + '</h3>' + editButton('编辑' + label, 'overview', 'legacy-' + key) +
        '</div>' + markdown(event[key]) + '</div>';
    }).join('');
  const groupedResources = [[false, 'Event 通用'], [true, 'Flow 关联']].map(([linked, title]) => {
    const entries = resources.filter(entry => Boolean(entry.row.workshopFlowIds?.length) === linked);
    return entries.length ? '<h3>' + title + '</h3><ul class="event-resource-list">' +
      entries.map(entry => resourceRow(entry, state)).join('') + '</ul>' : '';
  }).join('');
  const files = eventAttachmentReferences(state, event);
  const fileList = files.length ? '<h3>附件</h3><ul class="event-resource-list">' + files.map(([id, owners]) => '<li><div>' +
    resourceTitle({ kind: 'asset', row: { assetId: id }, title: state.assets.find(asset => asset.id === id)?.name || id }) +
    (owners.length ? '<small>' + esc(owners.map(session => currentVersion(session).title).join(' · ')) + '</small>' : '') +
    '</div>' + smallAction('link', '关联此附件', 'data-event-target="resources" data-event-asset="' + esc(id) + '"') + '</li>').join('') + '</ul>' : '';
  const inherited = ['wiki', 'tool'].flatMap(kind => workshopLinks(state, 'event', event, kind).inherited);
  const projectLinks = inherited.length ? '<details class="work-history"><summary>Project 继承资源</summary><ul class="event-resource-list">' +
    inherited.map(entry => resourceRow({ ...entry, row: entry.edge, kind: 'edge', title: entry.item.title || '未命名资源' }, state, true, true)).join('') +
    '</ul></details>' : '';
  const content = { overview, flow: '', resources: groupedResources + fileList + projectLinks, review: '' };
  const archived = sessionsFor(state, 'event', event.id).filter(row => row.workshopArchivedAt);
  const preview = Object.entries(areaLabels).map(([area, label]) => {
    const rows = area === 'flow' ? flow : sessions.filter(row => areaFor(row.section) === area);
    const documents = rows.map((session, index) => docPreview(state, session, area, {
      flow: area === 'flow' ? flow : undefined, index, resources,
      selected: requested === area && index === 0,
    })).join('');
    const history = area === 'flow' && archived.length ? '<details class="work-history"><summary>已删除环节 (' + archived.length + ')</summary>' +
      archived.map(session => '<div class="event-archived-flow">' + docPreview(state, session, area) +
        smallAction('undo', '恢复 ' + currentVersion(session).title, 'data-event-restore-flow="' + esc(session.id) + '"') + '</div>').join('') +
      '</details>' : '';
    return '<section class="event-preview-section" data-event-area="' + area + '"><div class="section-heading"><h2>' +
      label + '</h2><div class="work-actions">' + (area === 'flow' ?
        smallAction('develop', '从其他 Event 复用环节', 'data-event-reuse-flow') : '') + addButton(area) +
      '</div></div>' + (content[area] || '') + documents + history + '</section>';
  }).join('');
  return '<article class="event-workspace event-detail" data-event-detail="' + esc(event.id) + '">' + header +
    '<div data-event-copy-slot></div><form class="event-inline-form event-editor" data-event-editor>' +
    '<div class="section-heading"><h2>编辑器</h2><span data-event-edit-label></span></div>' +
    select('area', '目标区域', Object.entries(areaLabels), Object.hasOwn(areaLabels, requested) ? requested : 'overview') +
    '<div data-event-fields></div><div class="event-form-actions"><button type="submit" class="action-button">' +
    icon('check') + '保存</button>' + smallAction('remove', '取消当前编辑', 'data-event-editor-reset') + '</div>' +
    saveStatus() + '</form><p class="event-save-status" data-order-status role="status"></p>' + preview + '</article>';
}
