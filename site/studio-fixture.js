import { mappingFormat, rawFormat } from './studio-migration.js';

const createdAt = '2026-09-10T03:00:00Z';
const updatedAt = '2026-09-12T04:30:00Z';
const poster = {
  $blob: {
    name: 'test-poster.png', mime: 'image/png',
    data: 'iVBORw0KGgoAAAANSUhEUgAAAEgAAABgCAIAAAAxcKNLAAABi0lEQVR42u3az2nDMBTHce2UITpBRskGnaSXnjJJIZmhxx4LufTUFgrFsSvp/Zef+oPvzWDeB2xhyy5vt88pK4ABBhhggAEGGGCAAQYYYPedL+/t8sG6pCG8EqmKtJVIUiSvDFEF2ACzVnnbykCVqw0wH5WfDTDAAAMMMMAAA2yvMDwEJ4RN+z6GrYE8sIfT8zKlanW2WgNgYh6RFAf7XzvBM+/d4zMSYPVeXj8aVWGrY4lIHdjp6boqhefPaTuwgTwWSQgLtlFIW5UQFsAjemoqFew7jwWGRaqptLAfmxWPS2qoDGC/Ng1PQGqrbGBLG0so81BUXjDvKCPZwCJtxHnMYDE2+jCWMFcedwx7mJNtTphgBi3scHwkFqmSw+gepVB81bBhGhKXp7kdGDArEpGnUVFhHqQ2T6kiwbxVW5te1YHFkJaZkDqweJUtb48wE9tOYXrh3mFiXg6YwJYGxuUlg9Ft+WBEXlZYl5cb1hBOAtvypoItAwwwwAADDDDAAAPMD4bf+gADzLwvc0QwKA6hERQAAAAASUVORK5CYII=',
  },
};

export const testArchive = {
  format: rawFormat, database: 'workshop-fixture', version: 1,
  stores: [
    { name: 'projects', rows: [{ key: 'p1', value: { name: '测试 · 对话工作坊', note: 'Workshop 演示项目', createdAt, updatedAt, poster } }] },
    { name: 'events', rows: [{ key: 'e1', value: { name: '测试 · 第一场', topic: '观察与提问', date: '2026-09-12', time: '14:00–16:00', location: '测试场地', attendees: 8, fee: '¥0', project: 'p1', createdAt, updatedAt, poster } }] },
    { name: 'documents', rows: [
      { key: 'd1', value: { kind: 'flow', title: '通用流程', previous: '1. 开场\n2. 讨论', body: '1. 开场\n2. 分组\n3. 回顾',
        project: 'p1', createdAt, updatedAt } },
      { key: 'd2', value: { kind: 'review', title: '第一场复盘', body: '## 观察\n- 留出分享时间。', event: 'e1', createdAt, updatedAt } },
      { key: 'd3', value: { kind: 'adopted', title: '通用流程', body: '1. 开场\n2. 讨论', event: 'e1',
        source: 'd1', createdAt, updatedAt } },
      { key: 'd4', value: { kind: 'unassigned', body: '测试 · 待确认归属' } },
    ] },
    { name: 'materials', rows: [{ key: 'm1', value: { type: 'Wiki', title: '测试 · 提问笔记', text: '## 开放式提问\n描述观察到的变化。',
      from: '测试资料', tags: ['测试'], createdAt, updatedAt } }] },
    { name: 'links', rows: [{ key: 'l1', value: { material: 'm1', event: 'e1', createdAt } }] },
  ],
};

const field = (...keys) => ({ $field: keys });
const id = slot => ({ $id: slot });
const ref = (store, key, slot) => ({ $ref: { store, path: [key], slot } });
const dates = { createdAt: field('createdAt'), updatedAt: field('updatedAt') };
const image = { to: 'assets', slot: 'poster', fields: {
  name: field('poster', '$blob', 'name'), mime: field('poster', '$blob', 'mime'), data: field('poster', '$blob', 'data'),
} };
const doc = (kind, ownerType, section, fields) => ({
  store: 'documents', when: { path: ['kind'], equals: kind },
  outputs: [{ to: 'sessions', fields: { ownerType, section, ...dates, ...fields } }],
});

export const testMapping = {
  format: mappingFormat, database: testArchive.database, version: 1, namespace: 'studio-test',
  rules: [
    { store: 'projects', outputs: [
      { to: 'projects', fields: { title: field('name'), description: field('note'), coverAssetId: id('poster'), tags: ['测试'], ...dates } },
      image,
    ] },
    { store: 'events', outputs: [
      { to: 'events', fields: { title: field('name'), theme: field('topic'), date: field('date'), time: field('time'),
        location: field('location'), attendeeCount: field('attendees'), fee: field('fee'), projectId: ref('projects', 'project'),
        coverAssetId: id('poster'), tags: ['测试'], ...dates } },
      image,
    ] },
    doc('flow', 'project', 'flow', { ownerId: ref('projects', 'project'), currentVersionId: id('v2'), versions: [
      { id: id('v1'), title: field('title'), body: field('previous'), createdAt: field('createdAt') },
      { id: id('v2'), title: field('title'), body: field('body'), createdAt: field('updatedAt') },
    ] }),
    doc('review', 'event', 'review', { ownerId: ref('events', 'event'), currentVersionId: id('v1'), versions: [
      { id: id('v1'), title: field('title'), body: field('body'), createdAt: field('createdAt') },
    ] }),
    doc('adopted', 'event', 'flow', { ownerId: ref('events', 'event'), currentVersionId: id('v1'),
      adoptedFrom: ref('documents', 'source'), versions: [
        { id: id('v1'), title: field('title'), body: field('body'), createdAt: field('createdAt'),
          source: { sessionId: ref('documents', 'source'), versionId: ref('documents', 'source', 'v1'), mode: 'adopted' } },
      ] }),
    { store: 'materials', outputs: [{ to: 'content', fields: { title: field('title'), contentType: field('type'), body: field('text'),
      sourceInfo: field('from'), tags: field('tags'), domains: ['Self-Board'], views: ['discover'], kind: 'input', visibility: 'private', ...dates } }] },
    { store: 'links', outputs: [{ to: 'relations', fields: { sourceType: 'discover', sourceId: ref('materials', 'material'),
      targetType: 'event', targetId: ref('events', 'event'), relationType: 'related', createdAt: field('createdAt') } }] },
  ],
};
