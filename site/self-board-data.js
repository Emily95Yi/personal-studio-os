import { isSelfBoard, objectFor, saveRelation } from './studio-data.js';

export const contentTypes = {
  article: 'Article', draft: 'Draft', journal: 'Journal', thought: 'Thought',
  knowledge: 'Knowledge', resource: 'Resource', exercise: 'Exercise', note: 'Note',
};
export const statuses = { inbox: 'Inbox', exploring: 'Exploring', draft: 'Draft', complete: 'Complete', archived: 'Archived' };
export const provenances = {
  original: '个人原创', source_extracted: '原文摘录', AI_response: 'AI 回复', AI_assisted: 'AI 辅助编辑', unverified: '来源待确认',
};
export const visibilities = { private: 'Private', candidate_public: 'Candidate Public', published: 'Published' };
export const exerciseFields = { steps: '步骤', duration: '所需时间', materials: '材料', scenarios: '适用场景', facilitation: '主持提示' };
export const relationTypes = {
  related_to: '相关', inspired_by: '受到启发', cites: '引用', developed_into: '发展为', used_in_event: '用于活动',
  alternate_version: '另一版本', contradicts: '观点相异', open_question: '待探索问题', follow_up: '后续跟进',
};

const legacyTypes = {
  article: 'article', draft: 'draft', journal: 'journal', thought: 'thought', wiki: 'knowledge', knowledge: 'knowledge',
  exercise: 'exercise', material: 'resource', pin: 'resource', inspiration: 'resource', 'raw source': 'resource',
  'resource link': 'resource', resource: 'resource',
};
const editingKeys = ['type', 'title', 'body', 'summary', 'provenance', 'sourceUrl', 'sourceInfo', 'assetIds'];
export const isWriting = type => ['article', 'draft'].includes(type);
export const isDiscoverType = type => ['knowledge', 'resource', 'exercise', 'note'].includes(type);

export function boardSection(item) {
  if (item.type === 'draft' && item.fragment && !(item.parentContentId && item.status === 'complete')) return 'reflections';
  if (isWriting(item.type)) return 'writing';
  return isDiscoverType(item.type) ? 'discover' : 'reflections';
}

const toolsCategory = 'Tools & Methods';
export const resourcesCategory = 'Resources';

export const initialDiscoverCategories = [
  [toolsCategory, '工具与方法', 'exercise'],
  ['Prompts & Facilitation', '引导与提问', 'note'],
  ['Concepts & Principles', '概念与原则', 'knowledge'],
  [resourcesCategory, '资料与摘录', 'resource'],
];

export function discoverCategory(item) {
  if (item.discoverCategory?.trim()) return item.discoverCategory;
  if (item.type === 'exercise') return toolsCategory;
  if (item.type === 'resource') return resourcesCategory;
  return 'Concepts & Principles';
}

export function discoverDirectory(items, folders = []) {
  const categories = new Map(initialDiscoverCategories.map(([name, description, type]) =>
    [name, { name, description, type, count: 0 }]));
  for (const folder of folders) {
    if (!categories.has(folder.category)) categories.set(folder.category, { name: folder.category, description: '', type: 'note', count: 0 });
  }
  for (const item of items) {
    if (boardSection(item) !== 'discover') continue;
    const name = discoverCategory(item);
    if (!categories.has(name)) categories.set(name, { name, description: '', type: 'note', count: 0 });
    categories.get(name).count += 1;
  }
  return [...categories.values()];
}

export const reflectionColors = {
  blue: '浅蓝', mint: '薄荷绿', lilac: '浅紫', peach: '蜜桃色', yellow: '浅黄', rose: '浅粉',
};

export function saveReflectionLabel(state, { id, name, color }) {
  const labels = state.reflectionLabels ??= [];
  const previous = id && labels.find(label => label.id === id);
  name = name.trim();
  if (!name || name.length > 40 || !Object.hasOwn(reflectionColors, color) || (id && !previous)) {
    throw new Error('请输入标签名称并选择浅色。');
  }
  if (labels.some(label => label.id !== id && label.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('已经有同名标签。');
  }
  if (previous) {
    Object.assign(previous, { name, color });
    return previous;
  }
  const label = { id: crypto.randomUUID(), name, color };
  labels.push(label);
  return label;
}

export function removeReflectionLabel(state, id) {
  state.reflectionLabels = (state.reflectionLabels ?? []).filter(label => label.id !== id);
  for (const item of state.content) {
    if (isSelfBoard(item) && item.reflectionLabelId === id) delete item.reflectionLabelId;
  }
}

export function canAddSubfolder(folder, category = folder?.category) {
  return category === toolsCategory && folder?.category === category && !folder.parentId;
}

export function boardFolderPath(folders, folder) {
  const parent = folder.parentId && folders.find(row => row.id === folder.parentId && row.category === folder.category);
  return parent ? [parent, folder] : [folder];
}

export function saveBoardFolder(state, { id, category, title, parentId = '' }) {
  const folders = state.boardFolders ??= [];
  const previous = id && folders.find(folder => folder.id === id);
  title = title.trim();
  if (!title || title.length > 100 || !category || (id && previous?.category !== category)) {
    throw new Error('请输入文件夹名称。');
  }
  const parent = previous ? previous.parentId || '' : parentId;
  if (parent && !canAddSubfolder(folders.find(folder => folder.id === parent), category)) {
    throw new Error('只有 Tools & Methods 的第一层文件夹可以建立子文件夹。');
  }
  if (folders.some(folder => folder.id !== id && folder.category === category && (folder.parentId || '') === parent &&
    folder.title.toLowerCase() === title.toLowerCase())) {
    throw new Error('当前目录下已有同名文件夹。');
  }
  if (previous) {
    previous.title = title;
    return previous;
  }
  const folder = { id: crypto.randomUUID(), category, title, ...(parent ? { parentId: parent } : {}) };
  folders.push(folder);
  return folder;
}

export function toggleBoardFolderPin(state, id) {
  const folder = state.boardFolders?.find(row => row.id === id);
  if (!folder) throw new Error('这个文件夹已不可用。');
  folder.pinned = !folder.pinned;
  return folder;
}

export function removeBoardFolder(state, id) {
  const folders = state.boardFolders ?? [];
  const folder = folders.find(row => row.id === id);
  if (!folder) throw new Error('这个文件夹已不可用。');
  const children = folders.filter(row => row.parentId === id);
  if (children.some(child => folders.some(row => row.category === child.category && row.id !== id &&
      !row.parentId && row.title.toLowerCase() === child.title.toLowerCase()))) {
    throw new Error('分类根目录有同名文件夹。请先重命名子文件夹。');
  }
  for (const child of children) delete child.parentId;
  for (const row of state.content) {
    if (row.folderId === id && isSelfBoard(row)) {
      row.folderId = folder.parentId || '';
      row.updatedAt = new Date().toISOString();
    }
  }
  state.boardFolders = folders.filter(row => row.id !== id);
  return folder;
}

export function pinnedBoardFolders(state, currentId) {
  return (state.boardFolders ?? []).filter(folder => folder.pinned && folder.id !== currentId);
}

export function moveBoardContentToPinnedFolder(state, id, folderId) {
  const stored = objectFor(state, 'discover', id);
  if (!isSelfBoard(stored) || stored.deletedAt || boardSection(boardContent(stored)) !== 'discover') {
    throw new Error('请选择一条 Discover 条目。');
  }
  const folder = pinnedBoardFolders(state, stored.folderId).find(row => row.id === folderId);
  if (!folder) throw new Error('请选择一个可用的置顶文件夹。');
  return saveBoardContent(state, { id, discoverCategory: folder.category, folderId: folder.id });
}

export const isPublished = item => item.type === 'article' && item.visibility === 'published';

export function boardContent(row) {
  const legacy = (row.contentType ?? row.category ?? '').trim().toLowerCase();
  const type = Object.hasOwn(contentTypes, row.type) ? row.type :
    Object.hasOwn(legacyTypes, legacy) ? legacyTypes[legacy] :
    row.sourceUrl ? 'resource' : row.views?.includes('reflect-create') ? 'thought' : row.views?.includes('experience') ? 'journal' : 'note';
  return {
    ...row, type, body: row.body ?? row.description ?? '', topics: row.topics ?? row.tags ?? [],
    provenance: Object.hasOwn(provenances, row.provenance) ? row.provenance : 'unverified',
    visibility: Object.hasOwn(visibilities, row.visibility) ? row.visibility : 'private',
    inspired: row.inspired ?? legacy === 'inspiration',
  };
}

export function boardRecords(state, includeArchived = false) {
  return state.content.filter(row => isSelfBoard(row) && !row.deletedAt && (includeArchived || row.status !== 'archived'))
    .map(boardContent).sort((a, b) => (b.updatedAt ?? b.createdAt ?? b.date ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? a.date ?? ''));
}

export function matchContent(row, { query = '', type = '', status = '', topic = '', visibility = '' } = {}) {
  return (!type || type === row.type) && (!status || status === (row.status || 'unset')) &&
    (!topic || row.topics.includes(topic)) && (!visibility || visibility === row.visibility) &&
    [row.title, row.body, row.summary, row.sourceInfo, row.sourceUrl, row.excerpt, row.personalNotes, row.aiNotes, row.discoverCategory, ...row.topics].join(' ').toLowerCase().includes(query.trim().toLowerCase());
}

export function resourceKey(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

export function existingResource(state, sourceUrl, exceptId) {
  const key = resourceKey(sourceUrl);
  return key && boardRecords(state, true).find(row => row.id !== exceptId && row.type === 'resource' && resourceKey(row.sourceUrl) === key);
}

export function existingCollectionUrl(state, sourceUrl) {
  const key = resourceKey(sourceUrl);
  return key && state.collectionItems?.find(row => !row.deletedAt && resourceKey(row.url) === key);
}

export function saveBoardContent(state, input) {
  const stored = input.id && objectFor(state, 'discover', input.id);
  if (input.id && (!isSelfBoard(stored) || stored.deletedAt)) throw new Error('这条记录已不可用。');
  const previous = stored ? boardContent(stored) : null;
  const stamp = new Date().toISOString();
  const record = {
    domains: ['Self-Board'], provenance: 'original', visibility: 'private', topics: [], body: '',
    ...previous, ...input, id: stored?.id ?? crypto.randomUUID(), createdAt: stored?.createdAt ?? stamp, updatedAt: stamp,
  };
  record.title = record.title?.trim() || '';
  record.tags = record.topics;
  if (!Object.hasOwn(contentTypes, record.type) || !Object.hasOwn(provenances, record.provenance) ||
      !Object.hasOwn(visibilities, record.visibility) || (record.status && !Object.hasOwn(statuses, record.status))) {
    throw new Error('请选择有效的内容类型、来源或状态。');
  }
  if (!record.title && !record.body.trim() && !record.sourceUrl && !record.assetIds?.length && !record.coverAssetId) {
    throw new Error('请输入文字、链接或添加一个文件。');
  }
  if (record.reflectionLabelId && !state.reflectionLabels?.some(label => label.id === record.reflectionLabelId)) {
    throw new Error('这个卡片标签已不可用。');
  }
  if (record.folderId && (!isDiscoverType(record.type) ||
      !state.boardFolders?.some(folder => folder.id === record.folderId && folder.category === discoverCategory(record)))) {
    throw new Error('请选择当前分类内的文件夹。');
  }
  const urlChanged = !previous || previous.sourceUrl !== record.sourceUrl || previous.type !== record.type;
  if (record.sourceUrl && urlChanged && !resourceKey(record.sourceUrl)) throw new Error('请输入有效的 HTTP 或 HTTPS 来源链接。');
  if (record.type === 'resource' && urlChanged && existingResource(state, record.sourceUrl, record.id)) {
    throw new Error('已有资料使用这个链接，可从搜索打开后直接引用。');
  }
  if (isDiscoverType(record.type) && urlChanged && existingCollectionUrl(state, record.sourceUrl)) {
    throw new Error('Collections 已保存这个链接，可从搜索打开后直接引用。');
  }
  if (record.type === 'draft' && record.parentContentId && record.parentContentId !== previous?.parentContentId) {
    const parent = objectFor(state, 'discover', record.parentContentId);
    if (record.type !== 'draft' || !isSelfBoard(parent) || parent.deletedAt || parent.id === record.id || boardContent(parent).type !== 'article') {
      throw new Error('请选择有效的对应文章。');
    }
    record.revisionGroupId = parent.revisionGroupId || parent.id;
  }
  if (record.type !== 'draft' || (previous?.parentContentId && !record.parentContentId)) {
    record.parentContentId = '';
    if (previous?.parentContentId) record.revisionGroupId = isWriting(record.type) ? record.id : '';
  }
  if (isWriting(record.type)) record.revisionGroupId ||= record.id;
  if (previous && (isWriting(previous.type) || isWriting(record.type)) &&
      editingKeys.some(key => JSON.stringify(previous[key]) !== JSON.stringify(record[key]))) {
    record.revisions = [...(previous.revisions ?? []), {
      ...Object.fromEntries(editingKeys.map(key => [key, previous[key]])),
      id: crypto.randomUUID(), createdAt: previous.updatedAt ?? previous.createdAt ?? stamp,
    }];
  }
  if (stored) state.content[state.content.indexOf(stored)] = record;
  else state.content.push(record);
  return record;
}

export function developThought(state, id, type) {
  const previous = objectFor(state, 'discover', id);
  if (!isSelfBoard(previous) || previous.deletedAt || boardSection(boardContent(previous)) !== 'reflections' ||
      !['journal', 'article', 'draft'].includes(type)) throw new Error('这条想法已不可用。');
  const record = saveBoardContent(state, {
    type, title: previous.title?.trim() || '来自一条想法',
    topics: boardContent(previous).topics, status: isWriting(type) ? 'draft' : '',
  });
  saveRelation(state, { sourceType: 'discover', sourceId: id, targetType: 'discover', targetId: record.id, relationType: 'developed_into' });
  return record;
}

export function markBoardContent(state, id, action) {
  const row = objectFor(state, 'discover', id);
  if (!isSelfBoard(row) || (row.deletedAt && action !== 'recover')) throw new Error('这条记录已不可用。');
  const stamp = new Date().toISOString();
  if (action === 'delete') row.deletedAt = stamp;
  else if (action === 'recover') {
    if (boardSection(boardContent(row)) === 'discover' && existingCollectionUrl(state, row.sourceUrl)) {
      throw new Error('Collections 已保存这个链接，无法恢复重复资料。');
    }
    delete row.deletedAt;
  }
  else if (action === 'pin') {
    row.pinned = !row.pinned;
    return row;
  } else if (action === 'revisit') row.revisitedAt = stamp;
  else if (action === 'archive') {
    row.previousStatus = row.status || '';
    row.status = 'archived';
  } else if (action === 'restore') {
    row.status = row.previousStatus || '';
    delete row.previousStatus;
  }
  row.updatedAt = stamp;
  return row;
}
