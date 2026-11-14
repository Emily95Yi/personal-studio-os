import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyStudio, saveEvent, saveProject, studioStore } from '../site/studio-data.js';
import { importMigration } from '../site/studio-migration.js';
import { boardBody } from '../site/workshop-view.js';
import { boardDetail, boardView } from '../site/self-board-view.js';
import { readRoute, wikiAddress } from '../site/pages.js';
import { linkWiki, saveWiki, setWikiStatus, workshopLinks } from '../site/workshop-library.js';
import { database, origin, sha256, sourceArchive } from '../scripts/workshop-wiki/archive.mjs';
import { normalizeWiki } from '../scripts/workshop-wiki/normalize.mjs';
import { planWiki } from '../scripts/workshop-wiki/plan.mjs';

const doc = { id: 'article-1', title: '試作', category: 'guides', wikiCategory: 'core', wikiSection: 'facilitation',
  status: 'confirmed', tags: ['手順'], content: '現行正文', contentFormat: 'markdown',
  originalRawContent: '> 中文 / 日本語\r\n\r\n前 ![桌面](asset://image-1) 中 ![配置](https://example.test/a.png) 后\n\n' +
    '```md\n![例子](asset://ignore)\n```\n\n![参考图][img]\n\n[img]: <https://example.test/b.png>\n',
  relatedProjectIds: ['p1', 'p2'], revisions: [{ id: 'v1', content: '第一版 ![位置](asset://image-1)' }] };
const old = { database, tables: { knowledgeEntries: [doc,
  { ...doc, id: 'review', wikiSection: 'other', relatedProjectIds: ['lost'], revisions: [] }],
tools: [{ id: 'old-tool', name: '卡牌', status: 'archived', understanding: '工具简介\n  保留空格' }],
resources: [{ id: 'external', type: 'link', status: 'active', title: 'Reference', url: 'https://example.test/source' }],
assets: [{ id: 'image-1', knowledgeDocumentId: doc.id, fileName: 'desk.png', mimeType: 'image/png', caption: '桌面' }],
projects: [{ id: 'p1' }, { id: 'p2' }], projectSessions: [{ id: 'old-event' }] } };
const textExport = { format: 'workshop-idb-text-export-v1', origin, databases: [{ name: database, version: 180,
  stores: Object.entries(old.tables).map(([name, rows]) => ({ name, count: rows.length, records: rows.map(value => ({
    key: value.id, primaryKey: value.id, value,
  })) })) }] };

test('both exports preserve identity, raw Unicode and line endings, routing and stable media slots', () => {
  const source = sourceArchive(old);
  const native = normalizeWiki(source, 'native');
  const text = normalizeWiki(sourceArchive(textExport), 'text');
  assert.deepEqual(source.issues, []);
  assert.deepEqual(native.records.map(row => row.targetId), text.records.map(row => row.targetId));
  const article = native.records.find(row => row.legacyRef.id === doc.id);
  const textArticle = text.records.find(row => row.legacyRef.id === doc.id);
  assert.equal(article.content.raw, doc.originalRawContent);
  assert.equal(article.content.sha256, sha256(doc.originalRawContent));
  assert.equal(article.content.variants.find(row => row.field === 'content').raw, doc.content);
  assert.equal(article.sourceRecord.pointer, '/tables/knowledgeEntries/0');
  assert.equal(textArticle.sourceRecord.pointer, '/databases/0/stores/0/records/0/value');
  assert.deepEqual(article.mediaSlots.map(slot => slot.mediaSlotId), textArticle.mediaSlots.map(slot => slot.mediaSlotId));
  assert.deepEqual(article.mediaSlots.map(slot => slot.order), [1, 2, 3, 1]);
  for (const slot of article.mediaSlots.filter(slot => slot.bodyField === 'originalRawContent')) {
    assert.equal(article.content.raw.slice(slot.offset, slot.offset + slot.length), slot.reference);
  }
  assert.equal(article.mediaSlots[0].name, 'desk.png');
  assert.ok(!article.mediaSlots.some(slot => slot.legacyMediaId === 'ignore'));
  assert.equal(native.records.find(row => row.legacyRef.id === 'review').category.target, 'needs_review');
  assert.equal(native.records.find(row => row.legacyRef.id === 'external').category.target, 'selfboard_resources');
  const invalid = structuredClone(textExport);
  invalid.databases[0].stores[0].count += 1;
  assert.equal(sourceArchive(invalid).issues[0].reason, 'store_read_error_or_count_mismatch');
});

test('additive import is idempotent and keeps media, project links, pinned Event and existing Resources', () => {
  const state = emptyStudio();
  const p1 = saveProject(state, { title: 'Project 1' });
  const p2 = saveProject(state, { title: 'Project 2' });
  const event = saveEvent(state, { title: 'Event', projectId: p1.id });
  state.content.push({ id: 'already-here', type: 'resource', title: 'Existing resource', body: 'existing original',
    domains: ['Self-Board'], sourceUrl: 'https://example.test/existing', provenance: 'unverified', visibility: 'private' });
  const snapshot = structuredClone(state);
  const source = sourceArchive(old);
  const { records } = normalizeWiki(source, 'source');
  const article = records.find(row => row.legacyRef.id === doc.id);
  const draft = planWiki(records, state, { '["projects","p1"]': p1.id, '["projects","p2"]': p2.id });
  assert.equal(draft.transfer.content.length, 3);
  assert.equal(draft.transfer.relations.length, 2);
  assert.equal(draft.retainedResources, 1);
  assert.deepEqual(state, snapshot);
  importMigration(state, draft.transfer, state.revision);
  assert.deepEqual(state.content[0], snapshot.content[0]);
  assert.equal(planWiki(records, state, { '["projects","p1"]': p1.id, '["projects","p2"]': p2.id }).appPlan.additions.length, 0);
  const row = state.content.find(row => row.id === article.targetId);
  assert.equal(row.body, doc.originalRawContent);
  const resource = state.content.find(row => row.legacyWiki?.ref.id === 'external');
  studioStore.receiveCloud(state, 1);
  try {
    const html = boardDetail(readRoute(wikiAddress(row.id)));
    assert.match(html, /前 图片待补 · 桌面 中 图片待补 · 配置 后/);
    assert.match(html, /图片待补 · 参考图/);
    assert.doesNotMatch(html, /<img\b/);
    assert.equal(readRoute('#/self-board/content/' + row.id).record.id, row.id);
    assert.match(boardView(readRoute('#/self-board/discover?category=Resources&folder=' + resource.folderId)), /Reference/);
    assert.equal(resource.sourceUrl, 'https://example.test/source');
  } finally {
    studioStore.receiveCloud(emptyStudio(), 0);
  }

  const fixed = linkWiki(state, { ownerType: 'event', ownerId: event.id, resourceId: row.id, mode: 'pinned_version', versionId: 'v1' });
  saveWiki(state, { id: row.id, title: row.title, body: 'updated', discoverCategory: row.discoverCategory, wikiStatus: 'active' });
  setWikiStatus(state, row.id, 'archived');
  assert.equal(workshopLinks(state, 'project', p2, 'wiki').direct[0].item.body, 'updated');
  assert.equal(workshopLinks(state, 'event', event, 'wiki').direct[0].edge.versionId, fixed.versionId);
  assert.match(boardBody(row.revisions.find(v => v.id === fixed.versionId)), /第一版 图片待补/);
  assert.equal(row.revisions.find(v => v.id === fixed.versionId).body, doc.revisions[0].content);
  assert.equal(planWiki(records, state).rows.find(row => row.id === article.targetId).action, 'update-by-verified-source-id');
});

test('existing same-source URL, with no verified identity, requires review', () => {
  const state = emptyStudio();
  state.content.push({ id: 'existing', type: 'resource', title: 'Existing', sourceUrl: 'https://example.test/source#read',
    body: 'keep', domains: ['Self-Board'], provenance: 'unverified', visibility: 'private' });
  const { records } = normalizeWiki(sourceArchive(old), 'source');
  const result = planWiki(records, state).rows.find(row => row.legacyRef.id === 'external');
  assert.equal(result.action, 'manual-review');
  assert.deepEqual(result.candidates, ['existing']);
});
