import { canRelate, collections, emptyStudio, objectFor, relationKey } from '../../site/studio-data.js';
import { boardContent, boardSection, discoverCategory, resourceKey } from '../../site/self-board-data.js';
import { previewMigration, transferFormat } from '../../site/studio-migration.js';
import { boardContentHref, wikiAddress } from '../../site/pages.js';
import { identity, object, sha256 } from './archive.mjs';
import { destinations } from './normalize.mjs';

const equal = (a, b) => JSON.stringify(a, jsonOrder) === JSON.stringify(b, jsonOrder);
function jsonOrder(_key, value) {
  return object(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value;
}
const sourceKey = ref => ref && JSON.stringify([ref.system, ref.db, ref.store, ref.key]);
const handles = ['project', 'event'];
const textFormats = ['text', 'markdown'];
const embeddedBytes = /data:[^,;\s]+(?:;[^,;\s]+)*;base64,/i;
const placementFields = new Set(['coverUrl', 'imageUrl', 'url', null]);

export function studioBaseline(doc) {
  if (!object(doc) || (doc.format != null && doc.format !== transferFormat) ||
      !['projects', 'events', 'content', 'sessions', 'relations', 'assets'].every(key => Array.isArray(doc[key]))) {
    throw new Error('目标文件须为 Studio 的完整导出或 Studio 私有快照。');
  }
  const snapshot = { format: transferFormat, ...Object.fromEntries(collections.map(key => [key, doc[key] ?? []])) };
  return { ...previewMigration(emptyStudio(), snapshot).next, revision: doc.revision ?? 0 };
}

function proposedFolders(record, category, state) {
  const meta = record.metadata;
  if (meta.folderId != null || meta.folderPath) return null; // Unverified separate folder schema.
  if (!record.category.legacySectionName || record.category.legacySectionId === 'other') return [];
  const title = record.category.legacySectionName;
  const id = 'legacy-wiki-folder-' + sha256(JSON.stringify([category, record.category.legacySectionId]));
  const existing = state.boardFolders.find(folder => folder.id === id);
  if (existing && (existing.category !== category || existing.title !== title || existing.parentId)) return null;
  // An existing same-name folder could be independently curated. Do not implicitly adopt it.
  if (state.boardFolders.some(folder => folder.id !== id && folder.category === category &&
      !folder.parentId && folder.title.toLocaleLowerCase() === title.toLocaleLowerCase())) return null;
  return [existing ?? { id, category, title }];
}

function targetSlots(record, field, includeDetached = false) {
  return record.mediaSlots.filter(slot => slot.bodyField === field || (includeDetached && placementFields.has(slot.bodyField)))
    .map(({ sourceUrl, assetPointer, ...slot }) => slot);
}

function contentRow(record, folders, baseline) {
  const [discoverCategory, type] = destinations[record.category.target];
  const { legacyRef, content, metadata: meta } = record;
  const revisions = [];
  for (const [index, revision] of meta.revisions.entries()) {
    const source = content.variants.find(body => body.field.startsWith('revision/' + index + '/'));
    const id = revision?.id;
    if (!source || !textFormats.includes(source.format) || embeddedBytes.test(source.raw) || typeof id !== 'string' || !id || revisions.some(row => row.id === id)) {
      return null;
    }
    revisions.push({ id, title: typeof revision.title === 'string' ? revision.title : record.title,
      body: source.raw, bodyFormat: source.format, mediaSlots: targetSlots(record, source.field),
      ...(typeof revision.createdAt === 'string' && { createdAt: revision.createdAt }) });
  }
  return {
    id: baseline?.id ?? record.targetId, title: record.title, body: content.raw, type, discoverCategory,
    bodyFormat: content.format, mediaSlots: targetSlots(record, content.sourceRawField, true),
    ...(folders.length && { folderId: folders.at(-1).id }),
    ...(revisions.length && { revisions }),
    domains: ['Self-Board'], views: ['discover'], provenance: 'unverified', visibility: 'private',
    tags: meta.tags, topics: meta.tags,
    ...(meta.status === 'archived' ? { status: 'archived' } : {}),
    ...(type !== 'resource' && { wikiStatus: meta.status === 'archived' ? 'archived' : meta.status === 'draft' ? 'draft' : 'active' }),
    ...(meta.sourceTitle != null && { sourceInfo: meta.sourceTitle }),
    ...(meta.sourceUrl != null && !record.mediaSlots.some(slot => slot.bodyField === 'url') && { sourceUrl: meta.sourceUrl }),
    ...(meta.summary != null && { summary: meta.summary }),
    ...(meta.createdAt != null && { createdAt: meta.createdAt }),
    ...(meta.updatedAt != null && { updatedAt: meta.updatedAt }),
    legacyWiki: { ref: legacyRef, category: record.category, source: meta.source, sourceType: meta.sourceType,
      author: meta.author, subtitle: meta.subtitle, sourceStatus: meta.status, sourceVersion: meta.version,
      currentVersionId: meta.currentVersionId, directory: meta.legacyDirectory, bodySha256: content.sha256 },
  };
}

export function planWiki(records, state, ownerMap = {}, { sourceIssues = [] } = {}) {
  const transfer = { format: transferFormat, content: [], boardFolders: [], relations: [] };
  const reasons = [...sourceIssues];
  const rows = [];
  const stateByIdentity = new Map();
  const endpoints = new Map();
  for (const item of state.content) {
    const key = sourceKey(item.legacyWiki?.ref);
    if (key) stateByIdentity.set(key, [...(stateByIdentity.get(key) ?? []), item]);
  }
  const urlCandidates = new Map();
  for (const item of [...state.content, ...state.collectionItems]) {
    const key = resourceKey(item.sourceUrl ?? item.url);
    if (key && !item.deletedAt) urlCandidates.set(key, [...(urlCandidates.get(key) ?? []), item.id]);
  }
  const resources = state.content.filter(item => !item.deletedAt && boardSection(boardContent(item)) === 'discover' &&
    discoverCategory(boardContent(item)) === 'Resources');
  const beforeCounts = Object.fromEntries(collections.map(key => [key, state[key].length]));
  const relationRows = [];
  const seenIds = new Set();
  for (const record of records) {
    const prior = stateByIdentity.get(sourceKey(record.legacyRef)) ?? [];
    const id = prior.length === 1 ? prior[0].id : record.targetId;
    const result = { id, proposedId: record.targetId, legacyRef: record.legacyRef, title: record.title, target: record.category.target };
    rows.push(result);
    const mark = (action, reason, extra = {}) => {
      Object.assign(result, { action, reason, ...extra });
      reasons.push({ id, legacyRef: record.legacyRef, reason, ...extra });
    };
    if (seenIds.has(id) || prior.length > 1 || (!prior.length && state.content.some(item => item.id === id))) {
      mark('conflict', 'id_collision_or_duplicate_source_identity');
      continue;
    }
    seenIds.add(id);
    if (record.category.target === 'needs_review') {
      mark('manual-review', 'unmapped_source_category_or_section');
      continue;
    }
    const [category, type] = destinations[record.category.target];
    const url = resourceKey(record.metadata.sourceUrl);
    const matches = (urlCandidates.get(url) ?? []).filter(candidate => candidate !== id);
    const sameLegacyId = !prior.length && record.legacyRef.id != null ? state.content
      .filter(item => item.id === record.legacyRef.id || item.legacyId === record.legacyRef.id) : [];
    if (sameLegacyId.length || (type === 'resource' && url && matches.length)) {
      mark('manual-review', 'possible_existing_resource_check_identity', { candidates: [...new Set([...sameLegacyId.map(row => row.id), ...matches])] });
      continue;
    }
    if (record.content.incompleteFields.length) {
      mark('manual-review', 'source_export_has_unreadable_or_incomplete_fields', { fields: record.content.incompleteFields });
      continue;
    }
    if (record.legacyRef.id == null || !record.title.trim() || !textFormats.includes(record.content.format) ||
        (!record.content.raw && !record.metadata.sourceUrl && !record.mediaSlots.length) || embeddedBytes.test(record.content.raw) ||
        (record.metadata.sourceUrl && !url) || record.metadata.tags.some(tag => !tag.trim())) {
      mark('manual-review', 'invalid_or_unsupported_record_for_studio');
      continue;
    }
    const folders = proposedFolders(record, category, state);
    const target = folders && contentRow(record, folders, prior[0]);
    if (!target) {
      mark('manual-review', 'unmapped_folder_or_unsupported_revisions');
      continue;
    }
    if (prior.length && !equal(prior[0], target)) {
      mark('update-by-verified-source-id', 'verified_identity_differs_review_changes_before_any_write');
      continue;
    }
    result.href = type === 'resource' ? boardContentHref(id) : wikiAddress(id);
    endpoints.set(JSON.stringify([record.legacyRef.store, record.legacyRef.id]), id);
    result.action = prior.length ? 'skip-identical' : 'create';
    if (prior.length) continue;
    transfer.content.push(target);
    if (type === 'resource' && url) urlCandidates.set(url, [...(urlCandidates.get(url) ?? []), id]);
    for (const folder of folders) {
      if (!state.boardFolders.includes(folder) && !transfer.boardFolders.some(row => row.id === folder.id)) transfer.boardFolders.push(folder);
    }
  }

  const merge = { ...state, content: [...state.content, ...transfer.content] };
  const existingEdges = new Map(state.relations.map(edge => [relationKey(edge), edge]));
  for (const [index, record] of records.entries()) {
    const item = rows[index];
    for (const relation of record.relations) {
      const { scope, targetLegacyId, targetLegacyStore, pinnedVersion } = relation;
      const lookup = JSON.stringify([targetLegacyStore, targetLegacyId]);
      const type = handles.includes(scope) ? scope : 'discover';
      const id = handles.includes(scope) ? (Object.hasOwn(ownerMap, lookup) ? ownerMap[lookup] : null) : endpoints.get(lookup);
      const owner = id && objectFor(merge, type, id);
      const reason = !item.href ? 'source_article_pending' : !relation.targetPointer ? 'missing_or_untyped_legacy_endpoint' :
        !owner || owner.deletedAt ? 'target_endpoint_not_verified' :
        pinnedVersion && (type !== 'event' || !objectFor(merge, 'discover', item.id)?.revisions?.some(version => version.id === pinnedVersion)) ?
          'pinned_version_not_verified' :
          !canRelate(merge, type, id, 'discover', item.id) ? 'unsupported_studio_relation' : null;
      const mapping = { legacyRef: record.legacyRef, id: item.id, ...relation, target: owner ? { type, id } : null,
        action: reason ? 'manual-review' : 'create', reason };
      relationRows.push(mapping);
      if (reason) {
        reasons.push({ id: item.id, reason, kind: relation.kind, targetLegacyId, sourcePointer: relation.sourcePointer });
        continue;
      }
      const ownerFirst = relation.direction === 'inbound' || handles.includes(type);
      const orderedEndpoints = ownerFirst ? [type, id, 'discover', item.id] : ['discover', item.id, type, id];
      const [sourceType, sourceId, targetType, targetId] = orderedEndpoints;
      const edge = { sourceType, sourceId, targetType, targetId,
        relationType: type === 'event' ? 'used_in_event' : type === 'project' ? 'cites' : 'related_to',
        ...(pinnedVersion && { versionId: pinnedVersion }) };
      const key = relationKey(edge);
      const existing = existingEdges.get(key);
      if (existing) {
        const same = (existing.versionId ?? null) === (pinnedVersion ?? null) && existing.relationType === edge.relationType;
        mapping.action = same ? 'skip-identical' : 'conflict';
        mapping.reason = same ? null : 'existing_edge_uses_different_version_or_type';
        mapping.edgeId = existing.id;
        if (!same) reasons.push({ id: item.id, reason: mapping.reason, edgeId: existing.id });
        continue;
      }
      edge.id = identity({ ...record.legacyRef, key }, 'wiki-relation');
      mapping.edgeId = edge.id;
      existingEdges.set(key, edge);
      transfer.relations.push(edge);
    }
  }
  const appPlan = previewMigration(state, transfer);
  if (appPlan.conflicts.length) throw new Error('Studio 验证发现候选 ID 冲突。请复核基线后重跑。');
  const next = appPlan.next;
  const afterCounts = Object.fromEntries(collections.map(key => [key, next[key].length]));
  if (!collections.every(key => equal(next[key].slice(0, state[key].length), state[key])) ||
      !resources.every(row => equal(next.content.find(item => item.id === row.id), row))) {
    throw new Error('Dry-run 改动了现有记录。');
  }
  return { rows, transfer, reasons, relationRows, appPlan, beforeCounts, afterCounts, retainedResources: resources.length };
}
