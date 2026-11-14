import { externalWorkshopTool } from './workshop-external-tools.js';
import { safeUrl } from './html.js';
import { boardContent, boardRecords, discoverCategory, isWorkshopWiki, isWorkshopWikiCategory, saveBoardContent } from './self-board-data.js';
import { objectFor, relatedObjects, saveRecord, saveRelation } from './studio-data.js';

export const wikiStatuses = { draft: '草稿', active: '使用中', archived: '已归档' };
export const cardRoles = { primary: '主卡', supporting: '副卡' };
export const eventFormats = {
  dialogue: '对话', free_writing: '自由书写', intuitive_drawing: '直觉涂鸦',
  mandala: '曼陀罗', weaving: '编织', co_creation: '共同创作',
};
export const toolTypes = { app: '互动应用', gallery: '卡牌画廊', game: '小游戏', other: '其他' };
export const toolVisibility = { private: 'Private', unlisted: 'Unlisted', public: 'Public' };

export const wikiStatus = row => row.wikiStatus ?? (row.status === 'archived' ? 'archived' : row.status === 'draft' ? 'draft' : 'active');
export const wikiRecords = state => boardRecords(state, true).filter(isWorkshopWiki);

const snapshotFields = [
  'title', 'body', 'summary', 'assetIds', 'coverAssetId', 'coverUrl', 'sourceInfo', 'sourceUrl', 'provenance',
  'captureSourceUrl', 'captureHasAttachment', 'personalNotes', 'originalPath', 'originalBlockRange', 'notionPageId',
  'excerpt', 'aiNotes', 'steps', 'duration', 'materials', 'scenarios', 'facilitation',
];
function snapshotWiki(item) {
  const snapshot = { body: '', createdAt: item.updatedAt ?? item.createdAt ?? '' };
  for (const field of snapshotFields) if (item[field] !== undefined) snapshot[field] = item[field];
  return snapshot;
}

function retainWikiVersion(item, original = item) {
  const snapshot = snapshotWiki(boardContent(original));
  const revisions = item.revisions ??= [];
  const existing = revisions.find(version =>
    Object.keys(snapshot).every(field => JSON.stringify(version[field]) === JSON.stringify(snapshot[field])));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  revisions.push({ ...structuredClone(snapshot), id });
  return id;
}

export function saveWiki(state, input) {
  const previous = input.id && objectFor(state, 'discover', input.id);
  if ((input.id && (!isWorkshopWiki(previous) || previous.deletedAt)) ||
      !isWorkshopWikiCategory(input.discoverCategory) || !Object.hasOwn(wikiStatuses, input.wikiStatus)) {
    throw new Error('请选择有效的共通资源分类与状态。');
  }
  const saved = saveBoardContent(state, input);
  if (previous && snapshotFields.some(field =>
    JSON.stringify(boardContent(previous)[field]) !== JSON.stringify(saved[field]))) {
    retainWikiVersion(saved, previous);
  }
  return saved;
}

export function setWikiStatus(state, id, status) {
  const item = objectFor(state, 'discover', id);
  if (!isWorkshopWiki(item) || item.deletedAt || !Object.hasOwn(wikiStatuses, status)) throw new Error('共通资源已不可用。');
  item.wikiStatus = status;
  item.updatedAt = new Date().toISOString();
  return item;
}

export function linkWiki(state, { ownerType, ownerId, resourceId, mode = 'live', id, versionId: requestedVersion = '' }) {
  const item = objectFor(state, 'discover', resourceId);
  const owner = objectFor(state, ownerType, ownerId);
  const current = owner && relatedObjects(state, ownerType, ownerId).direct
    .find(row => row.type === 'discover' && row.item.id === resourceId);
  const existing = current?.edge;
  const canPin = mode === 'pinned_version' && ownerType === 'event';
  const badVersion = requestedVersion && (!canPin || !item?.revisions?.some(version => version.id === requestedVersion));
  if (!['project', 'event'].includes(ownerType) || !owner || owner.deletedAt || !isWorkshopWiki(item) || item.deletedAt ||
      (id ? existing?.id !== id : Boolean(existing) || wikiStatus(item) === 'archived') ||
      (mode !== 'live' && !canPin) || badVersion) throw new Error('共通资源或引用方式不可用。');
  // A recorded adoption stays independent of later live edits.
  const versionId = mode === 'pinned_version' ? requestedVersion || retainWikiVersion(item) : '';
  return saveRelation(state, { id, sourceType: ownerType, sourceId: ownerId,
    targetType: 'discover', targetId: resourceId, relationType: existing?.relationType ?? (ownerType === 'event' ? 'used_in_event' : 'cites'), versionId });
}

export function workshopLinks(state, type, item, kind) {
  const matches = row => kind === 'tool' ? row.type === 'tool' : row.type === 'discover' && isWorkshopWiki(row.item);
  const { direct, derived } = relatedObjects(state, type, item.id, { includeDirect: true });
  const inherited = type === 'event' ? relatedObjects(state, 'project', item.projectId).direct.filter(matches) : [];
  return { direct: direct.filter(matches), derived: derived.filter(matches), inherited };
}

function saveDictionaryEntry(rows, title, id) {
  const name = title.trim();
  if (!name || name.length > 80) throw new Error('名称须为 1–80 个字符。');
  const current = rows.find(row => row.title.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (current && !id) return current;
  if (current && current.id !== id) throw new Error('这个名称已经存在。');
  return saveRecord(rows, { id, title: name });
}

export function saveWorkshopTag(state, title, id) {
  return saveDictionaryEntry(state.workshopTags, title, id);
}

export function saveCardSet(state, title, id) {
  return saveDictionaryEntry(state.cardSets, title, id);
}

export function tagsFor(state, item) {
  return [...new Set([...(item.tags ?? []), ...(item.tagIds ?? []).map(id =>
    state.workshopTags.find(tag => tag.id === id)?.title).filter(Boolean)])];
}

export function formatsFor(event) {
  const legacy = [event.format, event.form, event.activityFormat].flat().filter(value => typeof value === 'string');
  const legacyFormats = Object.entries(eventFormats).filter(([id, label]) =>
    legacy.some(value => value === id || value === label)).map(([id]) => id);
  return [...new Set([...(event.formats ?? []), ...legacyFormats])];
}

export function searchEvents(state, { project = '', tag = '', card = '', role = '', formats = [], wiki = '', query = '' } = {}) {
  const term = query.trim().toLocaleLowerCase();
  return state.events.filter(event =>
    (!project || event.projectId === project) &&
    (!tag || tagsFor(state, event).includes(tag)) &&
    ((!card && !role) || (event.cardUses ?? []).some(use => (!card || use.cardSetId === card) && (!role || use.role === role))) &&
    formats.every(format => formatsFor(event).includes(format)) &&
    (!wiki || Object.values(workshopLinks(state, 'event', event, 'wiki')).some(rows => rows.some(row => row.item.id === wiki))) &&
    (!term || [event.title, event.theme, tagsFor(state, event).join(' ')].join(' ').toLocaleLowerCase().includes(term)));
}

export function saveInteractiveTool(state, input) {
  if (externalWorkshopTool(input.id)) throw new Error('这个工具的入口由项目配置管理。');
  const location = input.appLocation.trim();
  if (!Object.hasOwn(toolTypes, input.type) || !Object.hasOwn(toolVisibility, input.visibility) ||
      (location && (!safeUrl(location) || location.startsWith('./')))) {
    throw new Error('请选择工具类型和可见性。启动地址须为 HTTPS 或站内绝对路径。');
  }
  const previous = input.id && objectFor(state, 'tool', input.id);
  if (previous && ['title', 'description', 'type', 'version'].some(key => input[key] !== previous[key])) {
    input = { ...input, workshopPublication: undefined };
  }
  return saveRecord(state.interactiveTools, { ...input, appLocation: location });
}

// An explicit, whitelisted preview within the private application.
export function publicationProjection(kind, item) {
  if (kind === 'tool') return { title: item.title, description: item.description || '',
    type: Object.hasOwn(toolTypes, item.type) ? toolTypes[item.type] : '', version: item.version || '' };
  if (kind === 'event') return { title: item.title, date: String(item.date || ''), theme: String(item.theme || '') };
  return null;
}
