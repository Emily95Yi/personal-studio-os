import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryFor, categoryList, entriesFor, explorationTypes, filterCollections, moveCollectionCategory, moveExplorationEntry,
  removeCollectionCategory, removeCollectionFolder, removeExplorationEntry, resourceAtUrl, saveCollectionCategory,
  saveCollectionFolder, saveCollectionItem, saveExplorationEntry, saveExplorationTopic, saveExplorationType, setLibraryDeleted,
} from '../site/board-library-data.js';
import { removeBoardFolder, saveBoardContent, saveBoardFolder } from '../site/self-board-data.js';
import { collectionItemAddress, explorationAddress, readRoute } from '../site/pages.js';
import { emptyStudio, relationCandidates, relatedObjects, removeRelation, saveEvent, saveProject, saveRelation, studioStore } from '../site/studio-data.js';
import { importMigration, previewMigration, studioExport } from '../site/studio-migration.js';

test('category and folder removal retain item identities, status, links and relations', () => {
  const state = emptyStudio();
  const books = categoryList(state)[0];
  const custom = saveCollectionCategory(state, { title: 'Places to research', statuses: ['Exploring'], hidden: true });
  const renamed = saveCollectionCategory(state, { id: custom.id, title: 'Places' });
  assert.deepEqual(renamed.statuses, ['Exploring']);
  assert.equal(renamed.hidden, true);
  moveCollectionCategory(state, custom.id, -1);
  assert.equal(categoryList(state).at(-2).id, custom.id);
  const folder = saveCollectionFolder(state, { categoryId: books.id, title: 'To keep' });
  const item = saveCollectionItem(state, { url: 'https://example.org/book', categoryId: books.id, folderId: folder.id,
    resourceType: 'book', status: 'Reading', tags: ['design'] });
  const writing = saveBoardContent(state, { type: 'article', title: 'My article' });
  const edge = saveRelation(state, { sourceType: 'discover', sourceId: writing.id, targetType: 'collection-item', targetId: item.id });
  assert.throws(() => saveCollectionItem(state, { id: item.id, categoryId: custom.id }), /分类和文件夹/);
  removeCollectionFolder(state, folder.id);
  assert.equal(state.collectionItems[0].folderId, '');
  assert.throws(() => removeCollectionCategory(state, books.id), /迁移目标/);
  removeCollectionCategory(state, books.id, custom.id);
  assert.equal(categoryFor(state, books.id), undefined);
  assert.deepEqual(filterCollections(state, { category: custom.id, status: 'value:Reading', tag: 'design', query: 'example' }).map(row => row.id), [item.id]);
  assert.equal(relatedObjects(state, 'collection-item', item.id).direct[0].edge.id, edge.id);
  const restored = emptyStudio();
  importMigration(restored, studioExport(state), 0);
  assert.equal(categoryFor(restored, books.id), undefined);
  assert.equal(categoryFor(restored, custom.id).hidden, true);
  assert.deepEqual(restored.collectionItems, state.collectionItems);
});

test('topic entries and shared relations survive transfer, with protection for referenced items', () => {
  const state = emptyStudio();
  const project = saveProject(state, { title: 'Workshop project' });
  const event = saveEvent(state, { title: 'Workshop event', projectId: project.id });
  const item = saveCollectionItem(state, { title: 'A source' });
  const topic = saveExplorationTopic(state, { title: 'Research', tags: ['exploration'] });
  const question = saveExplorationEntry(state, topic.id, { type: 'question', body: 'What happens?' });
  const ref = saveExplorationEntry(state, topic.id, { type: 'reference', reference: { type: 'collection-item', id: item.id } });
  moveExplorationEntry(state, topic.id, ref.id, -1);
  const eventEdge = saveRelation(state, { sourceType: 'event', sourceId: event.id, targetType: 'topic', targetId: topic.id });
  const itemEdge = saveRelation(state, { sourceType: 'topic', sourceId: topic.id, targetType: 'collection-item', targetId: item.id });
  assert.deepEqual(relationCandidates(state, 'project', project.id, { type: 'topic' }).map(row => row.item.id), [topic.id]);
  assert.equal(relatedObjects(state, 'project', project.id).derived[0].type, 'topic');
  assert.equal(relatedObjects(state, 'topic', topic.id).direct.find(row => row.edge.id === eventEdge.id).item.id, event.id);
  assert.throws(() => setLibraryDeleted(state, 'collection-item', item.id, true), /仍有其他内容引用/);
  removeRelation(state, itemEdge.id);
  assert.throws(() => setLibraryDeleted(state, 'collection-item', item.id, true), /仍有其他内容引用/);
  const target = emptyStudio();
  importMigration(target, studioExport(state), 0);
  assert.deepEqual(entriesFor(target, topic.id).map(row => row.id), [ref.id, question.id]);
  removeExplorationEntry(target, topic.id, ref.id);
  setLibraryDeleted(target, 'collection-item', item.id, true);
  assert.equal(filterCollections(target).length, 0);
  setLibraryDeleted(target, 'collection-item', item.id, false);
  assert.equal(filterCollections(target)[0].id, item.id);
});

test('exploration types keep stable IDs and colors through edits and backups', () => {
  const state = emptyStudio();
  const topic = saveExplorationTopic(state, { title: 'Research' });
  const existing = saveExplorationEntry(state, topic.id, { type: 'note', title: 'Earlier note' });
  const legacy = studioExport(state);
  delete legacy.explorationEntryTypes;
  const legacyRestored = emptyStudio();
  importMigration(legacyRestored, legacy, 0);
  assert.equal(entriesFor(legacyRestored, topic.id)[0].id, existing.id);
  assert.equal(explorationTypes(legacyRestored).find(row => row.id === 'note').color, 'blue');

  const custom = saveExplorationType(state, { title: '观察', color: 'rose' });
  const entry = saveExplorationEntry(state, topic.id, { type: custom.id, body: 'A new observation' });
  const renamed = saveExplorationType(state, { id: custom.id, title: '记录', color: 'mint' });
  saveExplorationType(state, { id: 'note', title: '笔记', color: 'lilac' });
  assert.throws(() => saveExplorationType(state, { title: '记录', color: 'blue' }), /同名/);
  assert.throws(() => saveExplorationType(state, { title: '想法', color: 'invalid' }), /颜色/);

  const restored = emptyStudio();
  const backup = studioExport(state);
  importMigration(restored, backup, 0);
  const types = explorationTypes(restored);
  assert.deepEqual(types.find(row => row.id === custom.id), renamed);
  assert.equal(types.find(row => row.id === 'note').color, 'lilac');
  assert.equal(entriesFor(restored, topic.id).find(row => row.id === entry.id).type, custom.id);
  assert.throws(() => previewMigration(emptyStudio(), {
    ...backup, explorationEntryTypes: backup.explorationEntryTypes.filter(row => row.id !== custom.id),
  }), /探索条目的主题、类型或引用无效/);
});

test('new views leave legacy Wiki folders and hashes intact and share URL identity', () => {
  const state = studioStore.state;
  try {
    const folder = saveBoardFolder(state, { category: 'Resources', title: 'Legacy resources' });
    const wiki = saveBoardContent(state, { type: 'resource', folderId: folder.id, sourceUrl: 'https://example.org/wiki#original' });
    const topic = saveExplorationTopic(state, { title: 'A topic' });
    const item = saveCollectionItem(state, { url: 'https://example.org/item' });
    assert.equal(readRoute('#/self-board/discover?category=Resources&folder=' + folder.id).params.get('folder'), folder.id);
    assert.equal(readRoute('#/self-board/discover/' + wiki.id).record.id, wiki.id);
    assert.equal(readRoute(explorationAddress()).tab, 'explorations');
    assert.equal(readRoute(explorationAddress(topic.id)).record.id, topic.id);
    assert.equal(readRoute(collectionItemAddress(item.id)).record.id, item.id);
    assert.equal(resourceAtUrl(state, 'https://EXAMPLE.org/wiki#another-part').item.id, wiki.id);
    assert.throws(() => saveCollectionItem(state, { url: 'https://example.org/wiki' }), /已保存/);
    assert.throws(() => saveBoardContent(state, { type: 'note', sourceUrl: 'https://example.org/item#another-part' }), /Collections/);
    removeBoardFolder(state, folder.id);
    assert.equal(readRoute('#/self-board/discover/' + wiki.id).record.folderId, '');
    const invalid = studioExport(state);
    invalid.collectionItems = [{ ...item, categoryId: 'missing' }];
    assert.throws(() => previewMigration(emptyStudio(), invalid), /收藏的分类/);
  } finally {
    Object.assign(state, emptyStudio());
  }
});
