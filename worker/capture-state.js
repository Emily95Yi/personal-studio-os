import { ensureCaptureTopic } from '../site/capture-topic.js';
import { emptyStudio } from '../site/studio-data.js';
import { boardSection, initialDiscoverCategories, isWorkshopWikiCategory, resourceKey } from '../site/self-board-data.js';
import { categoryList, collectionCategoryLabel, foldersFor, inbox, topicsFor } from '../site/board-library-data.js';
import { previewMigration, studioExport } from '../site/studio-migration.js';

export const sql = (db, query, ...args) => db.prepare(query).bind(...args);
export const readCloud = (db, owner) => sql(db, 'SELECT * FROM studio_cloud WHERE owner = ?', owner).first();
export const readProjections = (db, owner) => sql(db,
  "SELECT id, document, native_collection, status FROM capture_items WHERE owner = ? AND status = 'organized'", owner);
export const captureError = (code, status = 400) => Object.assign(new Error(code), { captureCode: code, status });

export async function readStudio(env, owner, requestedRevision) {
  const { DB: db, STUDIO_CONTENT: storage } = env;
  for (let attempt = 0; attempt < 3; attempt++) {
    const [cloud, projected] = await db.batch([
      sql(db, 'SELECT * FROM studio_cloud WHERE owner = ?', owner), readProjections(db, owner),
    ]);
    const row = cloud.results[0];
    if (String(row?.revision ?? 0) === requestedRevision) return { row, unchanged: true };
    const object = row?.object_key ? await storage.get(row.object_key) : null;
    if (row?.object_key && !object) continue;
    const snapshot = object ? await object.json() : null;
    const state = snapshot ?? emptyStudio();
    ensureCaptureTopic(state);
    for (const projection of projected.results) {
      if (projection.status === 'organized') state[projection.native_collection].push(JSON.parse(projection.document));
    }
    return { row, state, projections: projected.results, empty: !snapshot && !row?.revision };
  }
  throw captureError('studio_unavailable', 503);
}

export function captureOptions(state) {
  const group = (label, options) => ({ label, options });
  const option = (module, branch, id, label) => ({ label, target: JSON.stringify([module, branch, id]) });
  const topics = topicsFor(state);
  const topicOrder = [...topics.filter(row => row.title === '待分类'), ...topics.filter(row => row.title !== '待分类')];
  return [
    { label: 'Reflections', groups: [group('标签', [
      option('reflections', 'tag', '', '标签待定'),
      ...state.reflectionLabels.map(row => option('reflections', 'tag', row.id, row.name)),
    ])] },
    { label: 'Collection', groups: [inbox, ...categoryList(state).filter(row => !row.hidden)].map(row => {
      const root = option('collection', row.id, '', row.id ? '不指定' : '待分类');
      return { label: collectionCategoryLabel(row), target: root.target, options: [
        root, ...foldersFor(state, row.id).map(folder => option('collection', row.id, folder.id, folder.title)),
      ] };
    }) },
    { label: 'Discover', groups: [
      group('Resources', initialDiscoverCategories.filter(([name]) => !isWorkshopWikiCategory(name))
        .map(([name]) => option('discover', 'wiki', name, name))),
      group('Personal Explorations', topicOrder.map(row => option('discover', 'personal', row.id, row.title))),
    ] },
    { label: 'Workshop', groups: [group('Common Resources', initialDiscoverCategories.filter(([name]) => isWorkshopWikiCategory(name))
      .map(([name]) => option('discover', 'wiki', name, name)))] },
  ];
}

function hasTarget(state, target) {
  return captureOptions(state).some(module => module.groups.some(group => group.options.some(row => row.target === target)));
}

export function nativeTarget(state, collection, record) {
  const choices = collection === 'collectionItems' ? ['collection', record.categoryId, record.folderId ?? ''] :
    collection === 'explorationEntries' ? ['discover', 'personal', record.topicId] :
    boardSection(record) === 'reflections' ? ['reflections', 'tag', record.reflectionLabelId ?? ''] :
    ['discover', 'wiki', record.discoverCategory];
  const target = JSON.stringify(choices);
  return hasTarget(state, target) ? target : null;
}

export function validateTarget(state, target) {
  if (!hasTarget(state, target)) {
    throw captureError('invalid_target');
  }
}

export function unpack(row) {
  const doc = JSON.parse(row.document);
  switch (row.native_collection) {
    case 'collectionItems': return { title: doc.title, originalText: doc.description, userNote: doc.notes,
      sourceUrl: doc.url || doc.captureSourceUrl || '' };
    case 'explorationEntries': return { title: doc.title, originalText: doc.body, userNote: doc.captureNote ?? '',
      sourceUrl: doc.url || doc.captureSourceUrl || '' };
    case 'content': return { title: doc.title, originalText: doc.body, userNote: doc.personalNotes ?? '',
      sourceUrl: doc.sourceUrl || doc.captureSourceUrl || '' };
    default: return { ...doc, sourceUrl: row.source_url };
  }
}

export function detachProjection(state, row) {
  const key = row.native_collection;
  if (key) state[key] = state[key].filter(record => record.id !== row.id);
}

export function projectCapture(state, row, target, values) {
  validateTarget(state, target);
  const [module, branch, id] = JSON.parse(target);
  const { originalText, userNote, sourceUrl } = values;
  const common = {
    id: row.id, title: values.title, createdAt: row.captured_at, updatedAt: new Date().toISOString(),
    ...(row.attachment_id ? { captureHasAttachment: true } : {}),
  };
  let collection;
  let record;
  if (module === 'collection') {
    collection = 'collectionItems';
    record = { ...common, categoryId: branch, folderId: id, tags: [], resourceType: row.type === 'url' ? 'link' : 'other',
      description: originalText, notes: userNote, url: row.type === 'url' ? sourceUrl : '',
      captureSourceUrl: row.type !== 'url' ? sourceUrl : '' };
  } else if (branch === 'personal') {
    collection = 'explorationEntries';
    const order = state.explorationEntries.filter(entry => entry.topicId === id).reduce((max, entry) => Math.max(max, entry.order), -1);
    record = { ...common, topicId: id, order: order + 1, type: sourceUrl ? 'reference' : 'note',
      body: originalText, captureNote: userNote, captureSourceUrl: sourceUrl, url: sourceUrl };
  } else {
    const reflection = module === 'reflections';
    collection = 'content';
    const category = initialDiscoverCategories.find(([name]) => name === id);
    record = { ...common, type: reflection ? 'thought' : category[2], domains: ['Self-Board'],
      status: 'draft', visibility: 'private', provenance: 'source_extracted', topics: [], tags: [],
      body: originalText, personalNotes: userNote, sourceUrl: reflection || row.type === 'url' ? sourceUrl : '',
      captureSourceUrl: !reflection && row.type !== 'url' ? sourceUrl : '',
      ...(reflection ? { reflectionLabelId: id } : { discoverCategory: id }) };
    if (!reflection && row.type === 'url' && state.content.some(item => !item.deletedAt &&
        resourceKey(item.sourceUrl) === resourceKey(sourceUrl) && initialDiscoverCategories.some(([, , type]) => type === item.type))) {
      throw captureError('native_conflict', 409);
    }
  }
  if (row.native_collection === collection) {
    const previous = JSON.parse(row.document);
    // Keep edits and editor-added attachments when moving within the same native table.
    record = { ...previous, ...record };
    if (collection === 'content') {
      record.topics = previous.topics;
      record.tags = previous.tags;
      if (module === 'reflections') {
        delete record.discoverCategory;
      } else {
        delete record.reflectionLabelId;
      }
      if (previous.discoverCategory !== record.discoverCategory) delete record.folderId;
    } else if (collection === 'collectionItems') {
      record.tags = previous.tags;
      record.resourceType = previous.resourceType;
      if (previous.categoryId !== record.categoryId) record.status = '';
    } else if (previous.topicId === id) {
      record.order = previous.order;
      record.type = previous.type;
      record.url = previous.url;
    }
  } else if (row.native_collection) {
    checkPortable(row);
  }
  delete record.deletedAt;
  state[collection].push(record);
  return { collection, record };
}

// Some native editor fields have no equivalent in another module or in Inbox.
export function checkPortable(row) {
  if (!row.native_collection) return;
  const native = JSON.parse(row.document);
  const portable = new Set(['id', 'title', 'createdAt', 'updatedAt', 'deletedAt', 'captureHasAttachment',
    'captureSourceUrl', 'categoryId', 'folderId', 'resourceType', 'description', 'notes', 'url', 'topicId',
    'order', 'type', 'body', 'captureNote', 'domains', 'status', 'visibility', 'provenance', 'sourceUrl',
    'personalNotes', 'reflectionLabelId', 'discoverCategory']);
  if (Object.entries(native).some(([key, value]) => !portable.has(key) && value &&
      (!Array.isArray(value) || value.length)) || native.type === 'article' || native.type === 'draft' ||
      (native.status && native.status !== 'draft') || (native.visibility && native.visibility !== 'private')) {
    throw captureError('native_conflict', 409);
  }
}

export function verifyCaptureState(state) {
  try {
    previewMigration(emptyStudio(), studioExport(state));
  } catch {
    throw captureError('native_conflict', 409);
  }
}
