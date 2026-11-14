import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoute, wikiAddress } from '../site/pages.js';
import { boardDetail, boardView } from '../site/self-board-view.js';
import { markBoardContent, saveBoardContent, saveBoardFolder, workshopWikiCategories } from '../site/self-board-data.js';
import { addAsset, emptyStudio, saveEvent, saveProject, saveRelation, studioStore } from '../site/studio-data.js';
import { applyStudioDelta, studioDelta } from '../site/studio-delta.js';
import { previewMigration, studioExport } from '../site/studio-migration.js';
import { interactiveToolsView, interactiveToolView, linkedWorkshopPanel } from '../site/workshop-library-view.js';
import { linkWiki, publicationProjection, saveCardSet, saveInteractiveTool, saveWiki, saveWorkshopTag,
  searchEvents, setWikiStatus, tagsFor, workshopLinks } from '../site/workshop-library.js';
import { workshopMigrationReport } from '../site/workshop-migration-report.js';
import { captureOptions } from '../worker/capture-state.js';

const [tools, prompts, concepts] = workshopWikiCategories.map(([key]) => key);

function wiki(state, fields = {}) {
  return saveWiki(state, { title: 'Resource', body: 'First version', type: 'exercise',
    discoverCategory: tools, wikiStatus: 'active', ...fields });
}

test('Workshop read switch keeps file IDs, nested folders, source, history and old deep links', () => {
  const state = emptyStudio();
  const a = saveBoardFolder(state, { category: tools, title: 'Root' });
  const b = saveBoardFolder(state, { category: tools, title: 'Child', parentId: a.id });
  const resourceFolder = saveBoardFolder(state, { category: 'Resources', title: 'References' });
  const asset = addAsset(state, { name: 'example.txt', mime: 'text/plain', data: btoa('example') });
  const old = wiki(state, { folderId: b.id, assetIds: [asset], sourceUrl: 'https://example.test/source', topics: ['method'] });
  wiki(state, { id: old.id, folderId: b.id, assetIds: [asset], sourceUrl: old.sourceUrl, topics: old.topics, body: 'Updated' });
  wiki(state, { title: 'Prompt', discoverCategory: prompts, type: 'note' });
  wiki(state, { title: 'Concept', discoverCategory: concepts, type: 'knowledge' });
  const external = saveBoardContent(state, { title: 'Link', type: 'resource', folderId: resourceFolder.id });
  const before = structuredClone(studioExport(state));
  const report = workshopMigrationReport(before);
  assert.deepEqual(report.before, report.after);
  assert.equal(report.persistedChanges, 0);
  assert.deepEqual(report.movedReadScope.wiki.find(row => row.id === old.id).attachmentIds, [asset]);
  assert.equal(report.movedReadScope.folders.find(row => row.id === b.id).parentId, a.id);
  assert.deepEqual(report.retainedDiscoverIds, [external.id]);
  assert.deepEqual(studioExport(state), before);
  studioStore.receiveCloud(state, 1);
  try {
    const legacy = '#/self-board/discover?' + new URLSearchParams({ category: tools, folder: b.id });
    assert.equal(readRoute(readRoute(legacy).redirect).params.get('folder'), b.id);
    assert.equal(readRoute('#/self-board/content/' + old.id).record.id, old.id);
    assert.equal(readRoute('#/self-board/content/' + old.id).workspaceId, 'workshop');
    assert.equal(readRoute(wikiAddress(old.id)).record.sourceUrl, old.sourceUrl);
    assert.match(boardDetail(readRoute(wikiAddress(old.id))), /example.txt/);
    assert.match(boardDetail(readRoute(wikiAddress(old.id))), /First version/);
    assert.match(boardView(readRoute('#/self-board/discover')), /References/);
    assert.doesNotMatch(boardView(readRoute('#/self-board/discover')), /Workshop Wiki|Tools &amp; Methods/);
    assert.equal(readRoute('#/self-board/discover?tab=explorations').tab, 'explorations');
    assert.equal(readRoute(readRoute('#/self-board/discover?view=knowledge').redirect).params.get('view'), 'knowledge');
  } finally {
    studioStore.receiveCloud(emptyStudio(), 0);
  }
});

test('direct, derived, archived and fixed Wiki references keep their original identity and data', () => {
  const state = emptyStudio();
  const [a, b, c] = ['A', 'B', 'C'].map(title => saveProject(state, { title }));
  const [event, other] = [c, b].map(project => saveEvent(state, { title: project.title, projectId: project.id }));
  const shared = wiki(state, { title: 'Shared' });
  const eventOnly = wiki(state, { title: 'Fixed' });
  const independent = wiki(state, { title: 'No links' });
  for (const owner of [a, b]) linkWiki(state, { ownerType: 'project', ownerId: owner.id, resourceId: shared.id });
  const fixed = linkWiki(state, { ownerType: 'event', ownerId: event.id, resourceId: eventOnly.id, mode: 'pinned_version' });
  assert.equal(workshopLinks(state, 'project', c, 'wiki').direct.length, 0);
  assert.equal(workshopLinks(state, 'project', c, 'wiki').derived[0].item.id, eventOnly.id);
  assert.equal(workshopLinks(state, 'event', other, 'wiki').inherited[0].item.id, shared.id);
  assert.equal(workshopLinks(state, 'event', event, 'wiki').direct[0].edge.id, fixed.id);
  const baseline = structuredClone(state);
  wiki(state, { id: shared.id, title: 'Shared', body: 'Updated live' });
  wiki(state, { id: eventOnly.id, title: 'Fixed', body: 'Updated separately' });
  const history = state.content.find(row => row.id === eventOnly.id).revisions;
  const historical = linkWiki(state, { ownerType: 'event', ownerId: other.id, resourceId: eventOnly.id,
    mode: 'pinned_version', versionId: fixed.versionId });
  assert.equal(historical.versionId, fixed.versionId);
  assert.equal(history.length, 1);
  setWikiStatus(state, eventOnly.id, 'archived');
  assert.throws(() => markBoardContent(state, eventOnly.id, 'delete'), /归档/);
  assert.throws(() => linkWiki(state, { ownerType: 'event', ownerId: event.id, resourceId: eventOnly.id }), /不可用/);
  const restored = previewMigration(emptyStudio(), applyStudioDelta(baseline, studioDelta(baseline, state))).next;
  assert.equal(restored.content.find(row => row.id === independent.id).title, 'No links');
  assert.equal(workshopLinks(restored, 'project', a, 'wiki').direct[0].item.body, 'Updated live');
  const version = restored.content.find(row => row.id === eventOnly.id).revisions.find(row => row.id === fixed.versionId);
  assert.equal(version.body, 'First version');
  studioStore.receiveCloud(restored, 1);
  try {
    assert.match(linkedWorkshopPanel('event', event, 'wiki'), /First version/);
    assert.doesNotMatch(linkedWorkshopPanel('event', event, 'wiki'), /Updated separately/);
  } finally {
    studioStore.receiveCloud(emptyStudio(), 0);
  }
  const invalid = structuredClone(studioExport(restored));
  invalid.relations.find(edge => edge.id === fixed.id).versionId = 'missing';
  assert.throws(() => previewMigration(emptyStudio(), invalid), /固定版本/);
});

test('tags, card roles and formats compose without mutating Project and Tool projection excludes private fields', () => {
  const state = emptyStudio();
  const tag = saveWorkshopTag(state, 'Practice');
  const oh = saveCardSet(state, 'OH');
  assert.equal(saveCardSet(state, 'oh').id, oh.id);
  const project = saveProject(state, { title: 'Series', tags: ['Series only'] });
  const card = role => [{ cardSetId: oh.id, role, usageNote: 'Private instructions' }];
  const primary = saveEvent(state, { title: 'Main', projectId: project.id, tagIds: [tag.id],
    cardUses: card('primary'), formats: ['weaving', 'intuitive_drawing'] });
  const supporting = saveEvent(state, { title: 'Support', projectId: project.id, cardUses: card('supporting'),
    format: '编织' });
  assert.deepEqual(searchEvents(state, { card: oh.id, formats: ['weaving'] }).map(row => row.id), [primary.id, supporting.id]);
  assert.deepEqual(searchEvents(state, { project: project.id, card: oh.id, role: 'primary', tag: tag.title,
    formats: ['weaving', 'intuitive_drawing'] }).map(row => row.id), [primary.id]);
  assert.deepEqual(tagsFor(state, project), ['Series only']);
  const tool = saveInteractiveTool(state, { title: 'Example', description: 'Demo', type: 'game', version: 'v1',
    visibility: 'public', appLocation: 'https://example.test/game?private-token=private', audience: 'Private audience' });
  assert.throws(() => saveInteractiveTool(state, { ...tool, appLocation: '//example.test' }), /HTTPS/);
  for (const event of [primary, supporting]) saveRelation(state, { sourceType: 'event', sourceId: event.id, targetType: 'tool', targetId: tool.id });
  saveRelation(state, { sourceType: 'project', sourceId: project.id, targetType: 'tool', targetId: tool.id });
  const resource = wiki(state);
  linkWiki(state, { ownerType: 'event', ownerId: primary.id, resourceId: resource.id });
  assert.deepEqual(searchEvents(state, { wiki: resource.id }).map(row => row.id), [primary.id]);
  const projection = publicationProjection('tool', tool);
  assert.deepEqual(projection, { title: 'Example', description: 'Demo', type: '小游戏', version: 'v1' });
  assert.equal(workshopLinks(state, 'event', supporting, 'tool').direct[0].item.id, tool.id);
  assert.equal(previewMigration(emptyStudio(), studioExport(state)).next.interactiveTools[0].id, tool.id);
});

test('mobile Capture keeps stable category targets while moving Wiki choices to Workshop', () => {
  const options = captureOptions(emptyStudio());
  const discover = options.find(row => row.label === 'Discover');
  assert.equal(discover.groups[0].label, 'Resources');
  assert.deepEqual(JSON.parse(discover.groups[0].options[0].target), ['discover', 'wiki', 'Resources']);
  const workshop = options.find(row => row.label === 'Workshop');
  assert.deepEqual(workshop.groups[0].options.map(row => JSON.parse(row.target)), [tools, prompts, concepts]
    .map(category => ['discover', 'wiki', category]));
});


test('built-in external tools open stable Render addresses and can be linked without copying tool records', () => {
  const state = emptyStudio();
  const project = saveProject(state, { title: 'Workshop series' });
  const event = saveEvent(state, { title: 'Session', projectId: project.id });
  const id = 'external:relationship-game-2';
  saveRelation(state, { sourceType: 'event', sourceId: event.id, targetType: 'tool', targetId: id });
  const exported = studioExport(state);
  assert.deepEqual(exported.interactiveTools, []);
  const restored = previewMigration(emptyStudio(), exported).next;
  studioStore.receiveCloud(restored, 1);
  try {
    const list = interactiveToolsView();
    assert.doesNotMatch(list, /GitHub|打开应用/);
    for (const host of ['relationship-game-2', 'app-presence', 'yiqiyihui-workshop-website']) {
      assert.ok(list.includes('class="workspace-entry" href="https://' + host + '.onrender.com/"'));
      const route = readRoute('#/workshop/tools/' + encodeURIComponent('external:' + host));
      assert.equal(route.type, 'workshop-tool');
      assert.doesNotMatch(interactiveToolView(route), /github\.com/);
    }
    assert.equal(workshopLinks(restored, 'event', event, 'tool').direct[0].item.id, id);
  } finally {
    studioStore.receiveCloud(emptyStudio(), 0);
  }
});
