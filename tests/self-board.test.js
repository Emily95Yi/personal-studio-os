import test from 'node:test';
import assert from 'node:assert/strict';
import { boardHref, readRoute } from '../site/pages.js';
import { boardRecords, boardSection, developThought, discoverDirectory, existingResource, markBoardContent, matchContent, moveBoardContentToPinnedFolder,
  removeReflectionLabel, saveBoardContent, saveBoardFolder, saveReflectionLabel, toggleBoardFolderPin } from '../site/self-board-data.js';
import { addAsset, emptyStudio, relatedObjects, removeRelation, saveEvent, saveProject, saveRelation,
  studioStore } from '../site/studio-data.js';
import { compareLines, reviewChanges } from '../site/self-board-review.js';
import { importMigration, studioExport } from '../site/studio-migration.js';

test('legacy routes and records keep their IDs and legacy fields when edited', () => {
  const state = studioStore.state;
  const legacy = { id: 'old-wiki', primaryWorkspace: 'Self-Board', views: ['discover', 'experience'],
    title: '旧资料', contentType: 'Wiki', description: '原文', tags: ['主题'], coverUrl: '/cover.png' };
  try {
    state.content.push(legacy);
    assert.equal(readRoute('#/self-board/discover/old-wiki').record, legacy);
    assert.equal(readRoute('#/self-board/experience/old-wiki').record, legacy);
    assert.equal(readRoute(boardHref('writing', 'published')).view, 'published');
    assert.equal(readRoute('#/self-board/writing/new').view, 'new');
    assert.equal(readRoute(boardHref('writing', 'in-progress')).view, 'drafts');
    assert.equal(readRoute(boardHref('writing', 'unused-fragments')).redirect, boardHref('reflections', 'fragments'));
    const [row] = boardRecords(state);
    assert.equal(row.type, 'knowledge');
    assert.equal(row.body, '原文');
    assert.equal(row.visibility, 'private');
    assert.deepEqual(row.topics, ['主题']);
    assert.equal(matchContent(row, { query: '原文', topic: '主题' }), true);
    const saved = saveBoardContent(state, { id: row.id, title: '新标题', discoverCategory: '工作坊笔记' });
    assert.equal(discoverDirectory(boardRecords(state)).find(category => category.name === '工作坊笔记').count, 1);
    assert.equal(saved.coverUrl, legacy.coverUrl);
    assert.deepEqual(saved.views, legacy.views);
    assert.equal(saved.id, legacy.id);
    assert.equal(state.content.length, 1);
  } finally {
    Object.assign(state, emptyStudio());
  }
});

test('private capture, writing versions, attachments and draft parents survive transfer', () => {
  const state = emptyStudio();
  const thought = saveBoardContent(state, { type: 'thought', body: '只有正文', status: 'inbox' });
  assert.equal(thought.title, '');
  assert.equal(thought.visibility, 'private');
  const fragment = saveBoardContent(state, { type: 'draft', body: '未采用的段落', fragment: true });
  assert.equal(boardSection(fragment), 'reflections');
  const article = developThought(state, thought.id, 'article');
  assert.equal(boardSection(article), 'writing');
  const asset = addAsset(state, { name: 'source.txt', mime: 'text/plain', data: 'dGVzdA==' });
  const draft = saveBoardContent(state, { type: 'draft', parentContentId: article.id, body: '第一版', assetIds: [asset] });
  const revised = saveBoardContent(state, { id: draft.id, body: '第二版', provenance: 'AI_assisted' });
  assert.equal(revised.revisions[0].body, '第一版');
  assert.deepEqual(revised.revisions[0].assetIds, [asset]);
  assert.equal(revised.revisionGroupId, article.revisionGroupId);
  const restored = emptyStudio();
  importMigration(restored, studioExport(state), restored.revision);
  assert.deepEqual(restored.content, state.content);
  assert.deepEqual(restored.assets, state.assets);
  assert.equal(relatedObjects(restored, 'discover', thought.id).direct[0].item.id, article.id);
});

test('resource duplicates and cross-module links use canonical records', () => {
  const state = emptyStudio();
  const resource = saveBoardContent(state, { type: 'resource', sourceUrl: 'https://example.org/notes#part-one' });
  assert.equal(existingResource(state, 'https://EXAMPLE.org/notes#part-two').id, resource.id);
  assert.throws(() => saveBoardContent(state, { type: 'resource', sourceUrl: 'https://example.org/notes' }), /已有资料/);
  const project = saveProject(state, { title: 'Project' });
  const event = saveEvent(state, { title: 'Event', projectId: project.id });
  const edge = saveRelation(state, { sourceType: 'discover', sourceId: resource.id, targetType: 'event',
    targetId: event.id, relationType: 'used_in_event' });
  markBoardContent(state, resource.id, 'delete');
  assert.equal(relatedObjects(state, 'event', event.id).direct.length, 0);
  assert.equal(boardRecords(state).length, 0);
  markBoardContent(state, resource.id, 'recover');
  assert.equal(relatedObjects(state, 'event', event.id).direct[0].item.id, resource.id);
  removeRelation(state, edge.id);
  assert.equal(state.content.length, 1);
  assert.equal(state.events.length, 1);
});


test('review separates text additions, removals and modifications without losing context', () => {
  const previous = '原标题\n开头不变\n删除的一段\n中间不变\n结尾不变';
  const current = '新标题\n开头不变\n中间不变\n补充的一段\n结尾不变';
  const rows = compareLines(previous, current);
  assert.deepEqual(rows.map(row => row.kind), ['modified', 'same', 'removed', 'same', 'added', 'same']);
  assert.deepEqual(rows.flatMap(row => row.kind === 'added' ? [] : [row.before ?? row.line]), previous.split('\n'));
  assert.deepEqual(rows.flatMap(row => row.kind === 'removed' ? [] : [row.after ?? row.line]), current.split('\n'));
  assert.match(reviewChanges({ body: '修改<script>之后', revisions: [{ body: '修改之前' }] }, 0, 1), /<ins>&lt;script&gt;之后<\/ins>/);
});

test('folder placement and reflection color labels survive transfer from the old schema', () => {
  const state = emptyStudio();
  delete state.boardFolders;
  delete state.reflectionLabels;
  const folder = saveBoardFolder(state, { category: 'Tools & Methods', title: '手册' });
  const child = saveBoardFolder(state, { category: folder.category, title: '流程', parentId: folder.id });
  const resources = saveBoardFolder(state, { category: 'Resources', title: '书籍' });
  assert.throws(() => saveBoardFolder(state, { category: child.category, title: '再下一层', parentId: child.id }), /第一层/);
  assert.throws(() => saveBoardFolder(state, { category: resources.category, title: '子文件夹', parentId: resources.id }), /第一层/);
  assert.throws(() => saveBoardFolder(state, { category: folder.category, title: '错误上级', parentId: resources.id }), /第一层/);
  const label = saveReflectionLabel(state, { name: '观察', color: 'lilac' });
  const thought = saveBoardContent(state, { type: 'thought', body: '想法', reflectionLabelId: label.id });
  const entry = saveBoardContent(state, { type: 'exercise', body: '说明', folderId: child.id });
  assert.throws(() => saveBoardContent(state, { id: entry.id, discoverCategory: 'Resources' }), /当前分类/);
  assert.throws(() => saveBoardFolder(state, { category: 'Tools & Methods', title: '手册' }), /同名/);
  const restored = emptyStudio();
  const exported = studioExport(state);
  const invalid = structuredClone(exported);
  invalid.boardFolders.find(row => row.id === child.id).parentId = resources.id;
  assert.throws(() => importMigration(restored, invalid, restored.revision), /上级目录无效/);
  importMigration(restored, exported, restored.revision);
  assert.deepEqual(restored.boardFolders, [folder, child, resources]);
  assert.deepEqual(restored.reflectionLabels, [label]);
  assert.equal(restored.content.find(row => row.id === entry.id).folderId, child.id);
  removeReflectionLabel(restored, label.id);
  assert.equal(restored.content.find(row => row.id === thought.id).reflectionLabelId, undefined);
});


test('moving to a pinned folder keeps the content ID, source link and Workshop relation', () => {
  const state = emptyStudio();
  const link = saveBoardContent(state, { type: 'resource', sourceUrl: 'https://example.org/source', body: '阅读笔记' });
  const folder = saveBoardFolder(state, { category: 'Tools & Methods', title: '材料' });
  const project = saveProject(state, { title: '活动' });
  const edge = saveRelation(state, { sourceType: 'discover', sourceId: link.id, targetType: 'project',
    targetId: project.id, relationType: 'related' });
  assert.throws(() => moveBoardContentToPinnedFolder(state, link.id, folder.id), /置顶文件夹/);
  toggleBoardFolderPin(state, folder.id);
  const moved = moveBoardContentToPinnedFolder(state, link.id, folder.id);
  assert.equal(moved.id, link.id);
  assert.equal(moved.folderId, folder.id);
  assert.equal(moved.discoverCategory, folder.category);
  assert.equal(moved.body, link.body);
  assert.equal(existingResource(state, link.sourceUrl).id, link.id);
  assert.equal(state.content.length, 1);
  assert.equal(relatedObjects(state, 'project', project.id).direct[0].edge.id, edge.id);
  assert.equal(studioExport(state).boardFolders[0].pinned, true);
});
