import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoute } from '../site/pages.js';
import { currentVersion, adoptVersion, emptyStudio, relationCandidates, relatedObjects, removeRelation, saveDiscover,
  saveEvent, saveProject, saveRelation, saveSession, sessionsFor, studioStore } from '../site/studio-data.js';
import { importMigration, mapLegacyArchive, previewMigration, studioExport } from '../site/studio-migration.js';
import { testArchive, testMapping } from '../site/studio-fixture.js';
import { markdown, objectHref, workshopGallery } from '../site/workshop-view.js';

function fixture() {
  return mapLegacyArchive(testArchive, testMapping);
}

test('Event retains exact adopted Project version and appends custom and adopted versions', () => {
  const state = emptyStudio();
  const project = saveProject(state, { title: 'Project' });
  const owner = { ownerType: 'project', ownerId: project.id, section: 'flow', title: 'Flow' };
  const source = saveSession(state, { ...owner, body: '# First', sourceInfo: 'test', sourceUrl: 'https://example.test' });
  const first = currentVersion(source);
  const event = saveEvent(state, { title: 'First event', projectId: project.id }, [source.id, source.id]);
  const other = saveEvent(state, { title: 'Second event', projectId: project.id });
  const [adopted] = sessionsFor(state, 'event', event.id);
  assert.equal(sessionsFor(state, 'event', other.id).length, 0);
  assert.equal(adopted.versions.length, 1);
  assert.equal(currentVersion(adopted).sourceUrl, 'https://example.test');
  assert.deepEqual(currentVersion(adopted).source, { sessionId: source.id, versionId: first.id, mode: 'adopted' });

  saveSession(state, { ...owner, id: source.id, body: '# Second' });
  const latest = currentVersion(source);
  assert.equal(currentVersion(adopted).body, '# First');
  assert.throws(() => adoptVersion(state, event.id, source.id, first.id), /版本已变化/);
  saveSession(state, { id: adopted.id, ownerType: 'event', ownerId: event.id, section: 'flow', title: 'Custom', body: '# Custom' });
  assert.deepEqual(currentVersion(adopted).source, { sessionId: source.id, versionId: first.id, mode: 'custom' });
  adoptVersion(state, event.id, source.id, latest.id);
  adoptVersion(state, event.id, source.id, latest.id);
  assert.deepEqual(adopted.versions.map(version => version.body), ['# First', '# Custom', '# Second']);
  assert.equal(currentVersion(adopted).source.versionId, latest.id);
  saveSession(state, { ownerType: 'event', ownerId: event.id, section: 'review', title: 'Review', body: 'Retrospective' });
  assert.equal(sessionsFor(state, 'project', project.id).length, 1);
  assert.equal(sessionsFor(state, 'event', event.id).length, 2);
});

test('one stable edge supplies both backlinks without writing a Project edge for Event associations', () => {
  const state = emptyStudio();
  const first = saveProject(state, { title: 'Project A', tags: ['A'] });
  const second = saveProject(state, { title: 'Project B', tags: ['B'] });
  const event = saveEvent(state, { title: 'Event A', projectId: first.id, tags: ['A'] });
  const wiki = saveDiscover(state, { title: 'Wiki', body: 'Original Markdown', contentType: 'Wiki' });
  const fromEvent = { sourceType: 'event', sourceId: event.id, targetType: 'discover', targetId: wiki.id };
  const direct = { sourceType: 'discover', sourceId: wiki.id, targetType: 'project', targetId: first.id };
  const edge = saveRelation(state, fromEvent);
  assert.equal(relatedObjects(state, 'event', event.id).direct[0].edge.id, edge.id);
  assert.equal(relatedObjects(state, 'discover', wiki.id).direct[0].edge.id, edge.id);
  assert.equal(relatedObjects(state, 'project', first.id).derived[0].via[0].id, event.id);
  assert.equal(state.relations.length, 1);
  assert.throws(() => saveRelation(state, {
    sourceType: 'discover', sourceId: wiki.id, targetType: 'event', targetId: event.id,
  }), /已经关联/);
  const extra = saveRelation(state, direct);
  assert.equal(relatedObjects(state, 'project', first.id).derived.length, 0);
  const edit = saveRelation(state, { ...direct, id: extra.id, targetId: second.id, relationType: 'reference' });
  assert.equal(edit.id, extra.id);
  assert.equal(edit.createdAt, extra.createdAt);
  assert.equal(relatedObjects(state, 'project', first.id).derived.length, 1);
  assert.equal(relatedObjects(state, 'project', second.id).direct[0].edge.relationType, 'reference');
  assert.deepEqual(relationCandidates(state, 'discover', wiki.id, { type: 'project', tag: 'A', query: 'project' })
    .map(row => row.item.id), [first.id]);
  removeRelation(state, edge.id);
  assert.equal(relatedObjects(state, 'event', event.id).direct.length, 0);
  assert.equal(relatedObjects(state, 'project', first.id).derived.length, 0);
  assert.equal(relatedObjects(state, 'discover', wiki.id).direct.length, 1);
  assert.equal(wiki.body, 'Original Markdown');
});

test('raw export maps original text, type, source, dates, assets, versions and relationships without mutating originals', () => {
  const raw = structuredClone(testArchive);
  const { transfer, retained } = mapLegacyArchive(raw, testMapping);
  const state = emptyStudio();
  const plan = previewMigration(state, transfer, retained);
  assert.equal(plan.additions.length, 9);
  assert.deepEqual(plan.integrity, { images: 2, covers: 2, versions: 4, relations: 1 });
  assert.equal(plan.retained[0].key, 'd4');
  assert.equal(state.content.length, 0);
  assert.deepEqual(raw, testArchive);
  const wiki = raw.stores.find(row => row.name === 'materials').rows[0].value;
  assert.deepEqual([transfer.content[0].body, transfer.content[0].contentType, transfer.content[0].sourceInfo,
    transfer.content[0].createdAt, transfer.content[0].updatedAt],
  [wiki.text, wiki.type, wiki.from, wiki.createdAt, wiki.updatedAt]);
  const blob = raw.stores[0].rows[0].value.poster.$blob;
  assert.equal(transfer.assets[0].data, blob.data);
  assert.equal(transfer.projects[0].coverAssetId, transfer.assets[0].id);
  importMigration(state, transfer, 0, retained);
  assert.deepEqual(studioExport(state), transfer);
  const roundTrip = JSON.parse(JSON.stringify(studioExport(state)));
  assert.equal(previewMigration(emptyStudio(), roundTrip).additions.length, 9);
  const repeated = previewMigration(state, fixture().transfer);
  assert.equal(repeated.additions.length, 0);
  assert.equal(repeated.counts.content.duplicate, 1);
});

test('migration blocks conflicts, stale previews, missing references and corrupt image data before applying changes', () => {
  const state = emptyStudio();
  const { transfer } = fixture();
  const before = structuredClone(state);
  const dangling = structuredClone(transfer);
  dangling.relations[0].targetId = 'missing';
  assert.throws(() => importMigration(state, dangling, 0), /关联缺少/);
  const absentAsset = structuredClone(transfer);
  absentAsset.assets.pop();
  assert.throws(() => importMigration(state, absentAsset, 0), /缺少可读/);
  const corrupt = structuredClone(transfer);
  corrupt.assets[0].data = btoa('not a valid image');
  assert.throws(() => importMigration(state, corrupt, 0), /缺少可读/);
  const ephemeral = structuredClone(transfer);
  ephemeral.events[0].coverAssetId = '';
  ephemeral.events[0].posterUrl = 'blob:https://old.example/123';
  assert.throws(() => importMigration(state, ephemeral, 0), /已导出的附件/);
  const history = structuredClone(transfer);
  history.sessions[0].currentVersionId = 'missing';
  assert.throws(() => importMigration(state, history, 0), /找不到当前版本/);
  assert.throws(() => importMigration(state, transfer, 1), /重新预览/);
  assert.deepEqual(state, before);

  importMigration(state, transfer, 0);
  const changed = structuredClone(transfer);
  changed.content[0].body = 'Changed Markdown';
  assert.equal(previewMigration(state, changed).counts.content.conflict, 1);
  assert.throws(() => importMigration(state, changed, 0), /没有可安全导入/);
  assert.equal(state.content[0].body, transfer.content[0].body);
  assert.throws(() => mapLegacyArchive(testArchive, { ...testMapping, version: 999 }), /不匹配/);
});

test('existing routes still resolve, including Workshop aliases and Calendar', () => {
  const { transfer } = fixture();
  const state = studioStore.state;
  try {
    importMigration(state, transfer, state.revision);
    const project = objectHref('project', transfer.projects[0]);
    const event = objectHref('event', transfer.events[0]);
    const discover = objectHref('discover', transfer.content[0]);
    const workshop = workshopGallery(readRoute('#/workshop'));
    assert.equal((workshop.match(/class="workspace-entry"/g) ?? []).length, 3);
    assert.ok(workshop.includes('href="' + event + '"'));
    const projectsRoute = readRoute('#/workshop/projects');
    assert.equal(projectsRoute.type, 'workshop-gallery');
    assert.match(workshopGallery(projectsRoute), /poster-grid/);
    assert.match(workshopGallery(readRoute('#/workshop/projects?view=projects')), /project-grid/);
    assert.equal(readRoute(project + '/resources').redirect, project + '/common');
    assert.equal(readRoute(project + '/common').tab, 'common');
    assert.equal(readRoute(project + '/events').redirect, project);
    assert.equal(readRoute(event).type, 'event');
    assert.equal(readRoute(discover).type, 'content-detail');
    assert.equal(readRoute('#/self-board/experience').type, 'collection');
    assert.equal(readRoute('#/calendar?view=week&date=2026-09-12').type, 'calendar');
  } finally {
    Object.assign(state, emptyStudio());
  }
});

test('Markdown renders its supported syntax while escaping HTML and unsafe links', () => {
  const html = markdown('## Review\n- **Note**\n\n<script>alert(1)</script>\n[bad](javascript:alert(1))\n[good](https://example.test/)');
  assert.match(html, /<h4>Review<\/h4>/);
  assert.match(html, /<ul><li><strong>Note<\/strong><\/li><\/ul>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|href="javascript/);
  assert.match(html, /href="https:\/\/example.test\/"/);
});
