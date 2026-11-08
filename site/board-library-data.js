import { boardRecords, boardSection, reflectionColors, resourceKey } from './self-board-data.js';
import { canRelate, objectFor, saveRecord } from './studio-data.js';

const defaults = [
  ['books', 'Books & Reading', ['Want to Read', 'Reading', 'Read']],
  ['films', 'Films & Audio', ['Want to Watch', 'Watched']],
  ['art', 'Art & Exhibitions', ['Interested', 'Visited']],
  ['food', 'Food & Places', ['Want to Go', 'Visited']],
  ['travel', 'Travel', ['Wishlist', 'Visited']],
  ['health', 'Health & Wellness', []],
  ['experiences', 'Experiences & Courses', ['Interested', 'Booked', 'Experienced']],
  ['other', 'Other', []],
];
const initial = new Map(defaults.map(([key, title, statuses], order) =>
  ['default-' + key, { id: 'default-' + key, title, statuses, order, hidden: false }]));
export const inbox = { id: '', title: 'Inbox', statuses: [] };
const defaultEntryTypes = [
  { id: 'question', title: 'Question', color: 'peach' },
  { id: 'note', title: 'Note', color: 'blue' },
  { id: 'insight', title: 'Insight', color: 'mint' },
  { id: 'reference', title: 'Reference', color: 'lilac' },
];
export const resourceTypes = {
  link: 'Link', book: 'Book', article: 'Article', film: 'Film', audio: 'Audio', video: 'Video',
  exhibition: 'Exhibition', place: 'Place', course: 'Course', experience: 'Experience', other: 'Other',
};
const stamp = () => new Date().toISOString();
const list = (state, key) => state[key] ?? [];
const find = (rows, id) => rows.find(row => row.id === id);
const fail = message => { throw new Error(message); };
const clean = value => (value ?? '').trim();
const distinct = values => [...new Set(values.map(clean).filter(Boolean))];
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
const byOrder = (a, b) => a.order - b.order || a.title.localeCompare(b.title);
const byUpdated = (a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.title.localeCompare(b.title);

export function categoryList(state) {
  const combined = new Map(initial);
  for (const row of list(state, 'collectionCategories')) combined.set(row.id, row);
  return [...combined.values()].filter(row => !row.removed).sort(byOrder);
}
export const categoryFor = (state, id) => id ? find(categoryList(state), id) : inbox;
export const isDefaultCategory = id => initial.has(id);

function writeCategory(state, row) {
  const rows = state.collectionCategories ??= [];
  const index = rows.findIndex(current => current.id === row.id);
  if (index < 0) rows.push(row);
  else rows[index] = row;
  return row;
}

export function saveCollectionCategory(state, { id, title, statuses, hidden }) {
  title = clean(title);
  const categories = categoryList(state);
  const current = id && find(categories, id);
  statuses = distinct(statuses ?? current?.statuses ?? []);
  if (!title || title.length > 100 || statuses.some(status => status.length > 60) || (id && !current)) {
    fail('请输入有效的分类名称与状态。');
  }
  if (sameName(title, inbox.title) || categories.some(row => row.id !== id && sameName(row.title, title))) {
    fail('已经有同名分类。');
  }
  return writeCategory(state, { id: id || crypto.randomUUID(), title, statuses, hidden: Boolean(hidden ?? current?.hidden),
    order: current?.order ?? ((categories.at(-1)?.order ?? -1) + 1) });
}

export function moveCollectionCategory(state, id, step) {
  const categories = categoryList(state);
  const index = categories.findIndex(row => row.id === id);
  const adjacent = categories[index + step];
  if (index < 0 || ![-1, 1].includes(step) || !adjacent) return;
  [categories[index], categories[index + step]] = [adjacent, categories[index]];
  categories.forEach((row, order) => {
    if (row.order !== order) writeCategory(state, { ...row, order });
  });
}

export const foldersFor = (state, categoryId) => list(state, 'collectionFolders').filter(row => row.categoryId === categoryId);

export function saveCollectionFolder(state, { id, categoryId, title }) {
  const rows = state.collectionFolders ??= [];
  const current = id && find(rows, id);
  title = clean(title);
  if (!categoryId || !categoryFor(state, categoryId) || !title || title.length > 100 || (id && current?.categoryId !== categoryId)) {
    fail('请输入文件夹名称，并选择有效的分类。');
  }
  if (foldersFor(state, categoryId).some(row => row.id !== id && sameName(row.title, title))) fail('当前分类已有同名文件夹。');
  return saveRecord(rows, { id, categoryId, title });
}

export function removeCollectionFolder(state, id) {
  if (!find(list(state, 'collectionFolders'), id)) fail('文件夹已不可用。');
  for (const row of list(state, 'collectionItems')) {
    if (row.folderId === id) Object.assign(row, { folderId: '', updatedAt: stamp() });
  }
  state.collectionFolders = state.collectionFolders.filter(row => row.id !== id);
}

export function removeCollectionCategory(state, id, destination) {
  if (!id || id === destination || destination == null || !categoryFor(state, id) || !categoryFor(state, destination)) {
    fail('请选择有效的迁移目标。');
  }
  for (const row of list(state, 'collectionItems')) {
    if (row.categoryId === id) Object.assign(row, { categoryId: destination, folderId: '', updatedAt: stamp() });
  }
  state.collectionFolders = list(state, 'collectionFolders').filter(row => row.categoryId !== id);
  if (initial.has(id)) writeCategory(state, { ...initial.get(id), removed: true });
  else state.collectionCategories = state.collectionCategories.filter(row => row.id !== id);
}

export function resourceAtUrl(state, url, exceptId) {
  const key = resourceKey(url);
  if (!key) return;
  const item = list(state, 'collectionItems').find(row => !row.deletedAt && row.id !== exceptId && resourceKey(row.url) === key);
  if (item) return { type: 'collection-item', item };
  const wiki = boardRecords(state, true).find(row => boardSection(row) === 'discover' && resourceKey(row.sourceUrl) === key);
  if (wiki) return { type: 'discover', item: wiki };
}

function urlField(value) {
  const url = clean(value);
  if (url && !resourceKey(url)) fail('请输入有效的 HTTP 或 HTTPS 链接。');
  return url;
}

function coverField(value) {
  const url = urlField(value);
  if (url && !resourceKey(url).startsWith('https:')) fail('封面须使用 HTTPS 图片地址。');
  return url;
}

export function saveCollectionItem(state, input) {
  const rows = state.collectionItems ??= [];
  const previous = input.id && find(rows, input.id);
  if (input.id && (!previous || previous.deletedAt)) fail('收藏已不可用。');
  const { id, categoryId = '', folderId = '', status = '', tags = [], description = '', notes = '',
    coverUrl = '', resourceType = 'link' } = { ...previous, ...input };
  const category = categoryFor(state, categoryId);
  if (!category || (folderId && !foldersFor(state, categoryId).some(row => row.id === folderId))) {
    fail('请选择有效的分类和文件夹。');
  }
  if (!Object.hasOwn(resourceTypes, resourceType) || (status && status !== previous?.status && !category.statuses.includes(status))) {
    fail('请选择有效的资源类型与状态。');
  }
  const url = urlField(input.url ?? previous?.url);
  if (url && resourceKey(url) !== resourceKey(previous?.url) && resourceAtUrl(state, url, id)) {
    fail('这个链接已保存，可直接打开原条目或添加关联。');
  }
  const title = clean(input.title ?? previous?.title) || (url ? new URL(url).hostname : '');
  if (!title || title.length > 200) fail('请输入标题或粘贴链接。');
  return saveRecord(rows, { id, title, categoryId, folderId, status, tags: distinct(tags), description: clean(description),
    notes: clean(notes), coverUrl: coverField(coverUrl), resourceType, url });
}

export function saveExplorationTopic(state, input) {
  const rows = state.explorationTopics ??= [];
  const previous = input.id && find(rows, input.id);
  if (input.id && (!previous || previous.deletedAt)) fail('探索主题已不可用。');
  const { id, description = '', tags = [], coverUrl = '', icon = '' } = { ...previous, ...input };
  const title = clean(input.title ?? previous?.title);
  if (!title || title.length > 200 || clean(icon).length > 16) fail('请输入主题名称，图标最多 16 个字符。');
  return saveRecord(rows, { id, title, description: clean(description), tags: distinct(tags), coverUrl: coverField(coverUrl), icon: clean(icon) });
}

export function explorationTypes(state) {
  const rows = new Map(defaultEntryTypes.map(row => [row.id, row]));
  for (const row of list(state, 'explorationEntryTypes')) rows.set(row.id, row);
  return [...rows.values()];
}

export function explorationEntryTitle(entry) {
  // Earlier versions filled an empty title with the built-in type name.
  return entry.title === defaultEntryTypes.find(type => type.id === entry.type)?.title ? '未命名条目' : entry.title;
}

export function saveExplorationType(state, { id, title, color }) {
  const types = explorationTypes(state);
  title = clean(title);
  if (!title || title.length > 40 || !Object.hasOwn(reflectionColors, color) || (id && !find(types, id))) {
    fail('请输入条目类型名称并选择颜色。');
  }
  if (types.some(row => row.id !== id && sameName(row.title, title))) fail('已经有同名的条目类型。');
  const rows = state.explorationEntryTypes ??= [];
  const record = { id: id || crypto.randomUUID(), title, color };
  const index = rows.findIndex(row => row.id === record.id);
  if (index === -1) rows.push(record);
  else rows[index] = record;
  return record;
}

export function entriesFor(state, topicId) {
  return list(state, 'explorationEntries').filter(row => row.topicId === topicId).sort(byOrder);
}

export function validEntryTarget(state, topicId, target) {
  return target && canRelate(state, 'topic', topicId, target.type, target.id);
}

export function saveExplorationEntry(state, topicId, input) {
  const topic = objectFor(state, 'topic', topicId);
  const rows = state.explorationEntries ??= [];
  const previous = input.id && find(rows, input.id);
  if (!topic || topic.deletedAt || (input.id && previous?.topicId !== topicId)) fail('探索条目已不可用。');
  const { id, type, title = '', body = '', url = '', reference = null } = input;
  if (!find(explorationTypes(state), type) || clean(title).length > 200 ||
      (type === 'reference' && reference && (!validEntryTarget(state, topicId, reference) ||
        (objectFor(state, reference.type, reference.id).deletedAt &&
        (previous?.reference?.type !== reference.type || previous.reference.id !== reference.id))))) {
    fail('请选择有效的条目类型或引用对象。');
  }
  const source = type === 'reference' ? urlField(url) : '';
  if (!clean(title) && !clean(body) && !source && !(type === 'reference' && reference)) {
    fail('请输入标题、正文或引用。');
  }
  const record = saveRecord(rows, { id, topicId, type, title: clean(title) || '未命名条目', body: clean(body), url: source,
    ...(previous?.captureNote != null ? { captureNote: clean(input.captureNote ?? previous.captureNote) } : {}),
    reference: type === 'reference' ? reference : null, order: previous?.order ?? ((entriesFor(state, topicId).at(-1)?.order ?? -1) + 1) });
  topic.updatedAt = record.updatedAt;
  return record;
}

export function moveExplorationEntry(state, topicId, id, step) {
  const topic = objectFor(state, 'topic', topicId);
  const rows = entriesFor(state, topicId);
  const index = rows.findIndex(row => row.id === id);
  if (!topic || topic.deletedAt || index < 0 || ![-1, 1].includes(step) || !rows[index + step]) return;
  [rows[index], rows[index + step]] = [rows[index + step], rows[index]];
  rows.forEach((row, order) => { row.order = order; });
  topic.updatedAt = stamp();
}

export function removeExplorationEntry(state, topicId, id) {
  const topic = objectFor(state, 'topic', topicId);
  if (!topic || topic.deletedAt || !entriesFor(state, topicId).some(row => row.id === id)) fail('探索条目已不可用。');
  state.explorationEntries = state.explorationEntries.filter(row => row.id !== id);
  topic.updatedAt = stamp();
}

export function setLibraryDeleted(state, type, id, deleted) {
  const row = ['topic', 'collection-item'].includes(type) && objectFor(state, type, id);
  if (!row || Boolean(row.deletedAt) === deleted) fail('这条记录已不可用。');
  if (deleted && type === 'collection-item') {
    const endpoint = (kind, key) => kind === type && key === id;
    if (state.relations.some(edge => endpoint(edge.sourceType, edge.sourceId) || endpoint(edge.targetType, edge.targetId)) ||
        list(state, 'explorationEntries').some(entry => endpoint(entry.reference?.type, entry.reference?.id))) {
      fail('仍有其他内容引用此收藏。请先移除相关引用或关联。');
    }
  }
  if (!deleted && type === 'collection-item' && resourceAtUrl(state, row.url, id)) {
    fail('已有条目使用此链接，无法恢复重复收藏。');
  }
  row.updatedAt = stamp();
  if (deleted) row.deletedAt = row.updatedAt;
  else delete row.deletedAt;
  return row;
}

export function libraryMatches(item, fields, query) {
  return [...fields.map(key => item[key]), ...(item.tags ?? [])].join(' ').toLowerCase().includes(clean(query).toLowerCase());
}
export const topicsFor = state => list(state, 'explorationTopics').filter(row => !row.deletedAt).sort(byUpdated);
export const itemsFor = state => list(state, 'collectionItems').filter(row => !row.deletedAt).sort(byUpdated);

export function filterCollections(state, { category = 'all', folder = '', query = '', status = '', tag = '' } = {}) {
  return itemsFor(state).filter(row => (category === 'all' || row.categoryId === category) && (!folder || row.folderId === folder) &&
    (!status || (status === 'unset' ? !row.status : row.status === status.slice(6))) && (!tag || row.tags.includes(tag)) &&
    libraryMatches(row, ['title', 'description', 'notes', 'url', 'status', 'resourceType'], query));
}
