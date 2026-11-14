import { collections, emptyStudio, isSelfBoard } from './studio-data.js';
import { boardContent, boardSection, discoverCategory, isWorkshopWiki, isWorkshopWikiCategory, resourcesCategory } from './self-board-data.js';
import { previewMigration, studioExport } from './studio-migration.js';

export function workshopMigrationReport(snapshot) {
  const state = previewMigration(emptyStudio(), snapshot).next;
  const count = rows => rows.length;
  const wiki = state.content.filter(isWorkshopWiki);
  const folders = state.boardFolders.filter(row => isWorkshopWikiCategory(row.category));
  const ids = new Set(wiki.map(row => row.id));
  const records = wiki.map(row => {
    const content = boardContent(row);
    return {
      id: row.id, categoryKey: discoverCategory(content), folderId: row.folderId || null,
      attachmentIds: [...new Set([row.coverAssetId, ...(row.assetIds ?? []), ...(row.revisions ?? [])
        .flatMap(version => [version.coverAssetId, ...(version.assetIds ?? [])])].filter(Boolean))],
      captureAttachment: Boolean(row.captureHasAttachment),
      revisionIds: (row.revisions ?? []).map(version => version.id),
      relationIds: state.relations.filter(edge =>
        edge.sourceType === 'discover' && edge.sourceId === row.id ||
        edge.targetType === 'discover' && edge.targetId === row.id).map(edge => edge.id),
    };
  });
  const before = Object.fromEntries(collections.map(key => [key, count(state[key])]));
  const exported = studioExport(state);
  const after = Object.fromEntries(collections.map(key => [key, count(exported[key])]));
  return { format: 'yistudio-workshop-read-mapping-v1', before, after,
    persistedChanges: 0, movedReadScope: { wiki: records, folders: folders.map(({ id, category, parentId }) =>
      ({ id, categoryKey: category, parentId: parentId || null })) },
    retainedDiscoverIds: state.content.filter(row => isSelfBoard(row) && !ids.has(row.id) &&
      boardSection(boardContent(row)) === 'discover').map(row => row.id),
    checks: { idsUnchanged: collections.every(key => state[key].every((row, i) => exported[key][i]?.id === row.id)),
      attachmentsUnchanged: before.assets === after.assets, relationsUnchanged: before.relations === after.relations,
      unmappedCategoryKeys: [...new Set(state.content.map(boardContent).filter(row => boardSection(row) === 'discover').map(discoverCategory))].filter(key =>
        !isWorkshopWikiCategory(key) && key !== resourcesCategory) },
  };
}
