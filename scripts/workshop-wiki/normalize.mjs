import { identity, legacyId, legacyUrl, object, pointerPart, sha256, string, strings, wikiStores } from './archive.mjs';
import { mediaFor } from './media.mjs';

const sectionNames = {
  tools_cards: '工具 / 卡牌', activity_positioning: '活动定位', activity_design: '活动设计',
  facilitation: 'Facilitation / 带领原则', community_brand: '社群 / 品牌', content_expression: '内容表达',
  system_workflow: '系统 / 工作流', ai_memory: 'AI Memory', methodology: '方法论', lexicon: '术语',
  wechat_reading: '微信读书', notion: 'Notion', original_document: '原始文档', personal_notes: '个人记录',
  xiaohongshu: '小红书', video: '视频', blog: 'Blog', website: '网站', article: '文章', podcast: 'Podcast', other: '其他',
};

const categories = { core: '讨论整理', raw_sources: '原始长文', resource_links: '资源链接' };
export const destinations = {
  tools_methods: ['Tools & Methods', 'knowledge'],
  prompts_facilitation: ['Prompts & Facilitation', 'note'],
  concepts_principles: ['Concepts & Principles', 'knowledge'],
  selfboard_resources: ['Resources', 'resource'],
};
const coreSections = {
  tools_cards: 'tools_methods', activity_design: 'tools_methods', facilitation: 'prompts_facilitation',
  activity_positioning: 'concepts_principles', methodology: 'concepts_principles',
};
const lossMarkers = new Set(['unreadable', 'depth-limit', 'repeated-reference']);
const formats = { markdown: 'markdown', plain_text: 'text', text: 'text', html: 'html', richtext: 'richtext', json: 'json' };

function oldClassification(store, row) {
  if (store === 'tools') return ['core', row.wikiSection ?? 'tools_cards'];
  if (store === 'resources') {
    const category = row.wikiCategory ?? (row.type === 'link' && row.url ? 'resource_links' : 'raw_sources');
    const fallback = row.type === 'link' ? 'website' : ['book', 'excerpt'].includes(row.type) ? 'original_document' : 'other';
    return [category, row.wikiSection ?? fallback];
  }
  const fallback = row.category === 'resources' ? 'raw_sources' :
    ['raw_sources', 'resource_links'].includes(row.category) ? row.category :
    ['core', 'tools', 'guides'].includes(row.category) ? 'core' : null;
  return [row.wikiCategory ?? fallback, row.wikiSection ?? 'other'];
}

function mappingFor(store, category, section) {
  if (store === 'resources' || category === 'resource_links') return 'selfboard_resources';
  if (category === 'core' && Object.hasOwn(coreSections, section)) return coreSections[section];
  return 'needs_review';
}

function bodyOf(store, value) {
  const choices = store === 'tools' ? ['content', 'understanding'] :
    store === 'resources' ? ['content', 'originalExcerpt', 'userNotes', 'url'] : ['content'];
  return choices.find(key => value[key] != null && value[key]?.$kind !== 'undefined') ??
    ['originalContent', 'originalRawContent'].find(key => value[key] != null) ?? null;
}

function representation(value, field, format) {
  const textBlob = ['Blob', 'File'].includes(value?.$kind) && typeof value.text === 'string';
  const raw = textBlob ? value.text : typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  const encoding = !textBlob && (object(value) || Array.isArray(value)) ? (format === 'richtext' ? format : 'json') : format;
  return { field, format: encoding, raw, sha256: sha256(raw), bytes: Buffer.byteLength(raw), characters: [...raw].length };
}

const outgoing = {
  sourceProjectId: ['project', ['projects']], relatedProjectIds: ['project', ['projects']], linkedProjectIds: ['project', ['projects']],
  sourceEventId: ['event', ['eventInfos', 'projectSessions']], relatedEventIds: ['event', ['eventInfos', 'projectSessions']],
  linkedEventIds: ['event', ['eventInfos', 'projectSessions']], eventId: ['event', ['eventInfos', 'projectSessions']],
  relatedToolIds: ['wiki', ['tools']], supportingToolIds: ['wiki', ['tools']], linkedToolIds: ['wiki', ['tools']],
  sourceResourceId: ['resource', ['resources']], linkedResourceIds: ['resource', ['resources']],
  relatedKnowledgeIds: ['wiki', ['knowledgeEntries']], relatedMaterialIds: ['unknown', [...wikiStores, 'pins', 'inspirations']],
  sourcePinId: ['unknown', ['pins']], linkedPinIds: ['unknown', ['pins']],
  sourceInspirationId: ['unknown', ['inspirations']], linkedInspirationIds: ['unknown', ['inspirations']],
  relatedInspirationIds: ['unknown', ['inspirations']], sourceArtifactId: ['unknown', ['artifacts']],
  usedInArtifactIds: ['unknown', ['artifacts']], sourceDiscussionId: ['unknown', ['discussions']],
  sourceEventLearningId: ['unknown', ['eventLearnings']], sourceCaptureId: ['unknown', ['captureItems']],
};

const inboundFields = {
  tools: ['primaryToolId', 'supportingToolIds', 'relatedToolIds', 'linkedToolIds', 'toolIds', 'requiredToolIds', 'additionalToolIds'],
  resources: ['resourceId', 'linkedResourceIds', 'selectedResourceIds', 'sourceResourceIds', 'sourceResourceId'],
  knowledgeEntries: ['knowledgeId', 'knowledgeEntryId', 'knowledgeDocumentId', 'relatedKnowledgeIds', 'linkedKnowledgeIds'],
};
const inboundScopes = { projects: 'project', eventInfos: 'event', projectSessions: 'event',
  tools: 'wiki', knowledgeEntries: 'wiki', resources: 'resource' };
const values = value => (Array.isArray(value) ? value : [value]).map(legacyId).filter(value => value != null);

function collectRelations(archive) {
  const refs = new Map();
  const sourceRow = new Map();
  for (const [store, rows] of archive.stores) {
    sourceRow.set(store, new Map(rows.map(row => [row.legacyRef.id, row])));
    if (wikiStores.includes(store)) for (const row of rows) refs.set(identity(row.legacyRef), []);
  }
  function add(article, referred, field, scope, store, id, direction, paths = {}) {
    const list = refs.get(identity(article.legacyRef));
    list.push({ direction, kind: field, scope, targetLegacyId: id, targetLegacyStore: store ?? null,
      sourcePointer: paths.sourcePointer ?? referred?.pointer ?? null, targetPointer: referred?.pointer ?? null,
      pinnedVersion: null, ...paths });
  }

  for (const store of wikiStores) for (const row of archive.stores.get(store) ?? []) {
    for (const [field, [scope, tables]] of Object.entries(outgoing)) {
      for (const id of values(row.value[field])) {
        const matches = tables.filter(table => sourceRow.get(table)?.has(id));
        const targetStore = matches.length === 1 ? matches[0] : tables.length === 1 ? tables[0] : null;
        add(row, sourceRow.get(targetStore)?.get(id), field, scope, targetStore, id, 'outbound',
          { sourcePointer: row.pointer + '/' + field });
      }
    }
    // No native version edge structure was found in the audited source. Retain unknown shapes for review.
    for (const field of ['relations', 'backlinks', 'references']) if (row.value[field]?.length) {
      refs.get(identity(row.legacyRef)).push({ direction: 'outbound', kind: field, scope: 'unknown',
        targetLegacyId: null, targetLegacyStore: null, pinnedVersion: null, sourcePointer: row.pointer + '/' + field,
        raw: row.value[field] });
    }
  }
  for (const [store, rows] of archive.stores) {
    if (store === 'assets') continue;
    for (const row of rows) {
      const containers = [[row.value, ''], ...(object(row.value.snapshot) ? [[row.value.snapshot, '/snapshot']] : [])];
      for (const [container, path] of containers) {
        for (const [wikiStore, fields] of Object.entries(inboundFields)) for (const field of fields) {
          if (wikiStores.includes(store) && !path && Object.hasOwn(outgoing, field)) continue;
          for (const id of values(container[field])) {
            const article = sourceRow.get(wikiStore)?.get(id);
            if (article) add(article, row, field, inboundScopes[store] ?? 'unknown', store, row.legacyRef.id, 'inbound',
              { sourcePointer: row.pointer + path + '/' + pointerPart(field) });
          }
        }
      }
    }
  }
  return refs;
}

function contentIssues(value, field) {
  if (value?.textReadError || lossMarkers.has(value?.$kind)) return [field];
  if (Array.isArray(value)) return value.flatMap((child, index) => contentIssues(child, field + '/' + index));
  if (object(value)) return Object.entries(value).flatMap(([key, child]) => contentIssues(child, field + '/' + pointerPart(key)));
  return [];
}

export function normalizeWiki(archive, digest, decisions = {}) {
  const records = [];
  const excluded = [];
  const groups = new Map();
  const usedDecisions = new Set();
  const relations = collectRelations(archive);
  for (const store of wikiStores) {
    for (const row of archive.stores.get(store) ?? []) {
      const { value, pointer, legacyRef } = row;
      if (store === 'knowledgeEntries' && value.category === 'feedback') {
        excluded.push({ legacyRef, pointer, reason: 'legacy_feedback_excluded_by_Wiki_view' });
        continue;
      }
      const [category, section] = oldClassification(store, value);
      const targetId = identity(legacyRef);
      const suggested = mappingFor(store, category, section);
      const decision = Object.hasOwn(decisions, targetId) ? decisions[targetId] : null;
      if (decision) {
        if (!Object.hasOwn(destinations, decision) || suggested !== 'needs_review') throw new Error('无效的人工分类：' + targetId);
        usedDecisions.add(targetId);
      }
      const target = decision ?? suggested;
      const incompleteFields = contentIssues(value, '').filter(path => !path.startsWith('/blob'));
      const title = string(store === 'tools' ? value.name : value.title);
      const displayField = bodyOf(store, value);
      const format = Object.hasOwn(formats, value.contentFormat) ? formats[value.contentFormat] :
        value.contentFormat == null ? 'text' : 'unknown';
      const fields = new Set(['content', 'originalContent', 'originalRawContent', displayField,
        ...(store === 'resources' ? ['originalExcerpt', 'userNotes', 'url'] : []), ...(store === 'tools' ? ['understanding'] : [])]);
      const bodies = [...fields].filter(field => field && value[field] != null && value[field]?.$kind !== 'undefined')
        .map(field => representation(value[field], field, ['url', 'userNotes'].includes(field) ? 'text' : format));
      const chosen = bodies.find(body => body.field === displayField) ?? representation(null, null, format);
      const rawSource = bodies.find(body => body.field === 'originalRawContent') ?? bodies.find(body => body.field === 'originalContent') ?? chosen;
      const revisions = Array.isArray(value.revisions) ? value.revisions : Array.isArray(value.versions) ? value.versions : [];
      const revisionBodies = revisions.flatMap((revision, index) => {
        if (!object(revision)) return [];
        const field = ['body', 'content', 'markdown'].find(key => typeof revision[key] === 'string');
        const versionFormat = Object.hasOwn(formats, revision.contentFormat) ? formats[revision.contentFormat] : format;
        return field ? [representation(revision[field], 'revision/' + index + '/' + field, versionFormat)] : [];
      });
      const allBodies = [...bodies, ...revisionBodies];
      const sourceUrl = string(value.sourceUrl) ?? (store === 'resources' ? string(value.url) : null);
      const legacyName = Object.hasOwn(categories, category) ? categories[category] : null;
      const legacySectionName = Object.hasOwn(sectionNames, section) ? sectionNames[section] : null;
      const record = {
        legacyRef: { ...legacyRef, legacyUrl: string(value.legacyUrl) ?? legacyUrl(category, legacyRef.id) },
        targetId, title: title ?? '',
        category: { legacyId: legacyId(category), legacyName, target, legacySectionId: legacyId(section), legacySectionName,
          storedCategory: legacyId(value.category), storedWikiCategory: legacyId(value.wikiCategory), storedWikiSection: legacyId(value.wikiSection),
          mappingEvidence: decision ? 'reviewed-record-id' : target === 'needs_review' ? null : 'verified-Wiki-projection-and-category-fields' },
        content: { format: rawSource.format, raw: rawSource.raw, sourceRawField: rawSource.field, sha256: rawSource.sha256,
          bytes: rawSource.bytes, characters: rawSource.characters, displayField, variants: allBodies, incompleteFields },
        sourceRecord: { archiveSha256: digest, pointer },
        metadata: {
          subtitle: string(value.subtitle), summary: string(value.summary ?? value.purpose ?? value.aiSummary),
          tags: strings(value.tags), links: [...new Set([sourceUrl, string(value.url), ...strings(value.links)].filter(Boolean))],
          source: string(value.source), sourceType: string(value.sourceType), sourceTitle: string(value.sourceTitle ?? value.authorOrSource),
          sourceUrl, author: string(value.author ?? value.authorOrSource), createdAt: string(value.createdAt), updatedAt: string(value.updatedAt),
          status: string(value.status), folderId: legacyId(value.folderId), folderPath: string(value.folderPath),
          legacyDirectory: [legacyName ?? category, legacySectionName ?? section].filter(Boolean), version: value.version ?? null,
          revisions, currentVersionId: value.currentVersionId ?? null,
        },
        relations: relations.get(targetId),
        mediaSlots: mediaFor(row, allBodies, archive.stores.get('assets') ?? []),
      };
      records.push(record);
      const groupKey = JSON.stringify([store, record.category.storedCategory, record.category.storedWikiCategory,
        record.category.storedWikiSection, category, section, suggested]);
      if (!groups.has(groupKey)) groups.set(groupKey, {
        store, legacyCategoryId: category, legacyCategoryName: legacyName, legacySectionId: section,
        storedCategory: record.category.storedCategory, storedWikiCategory: record.category.storedWikiCategory,
        storedWikiSection: record.category.storedWikiSection, automaticTarget: suggested, records: [],
      });
      groups.get(groupKey).records.push({ legacyId: legacyRef.id, targetId, target });
    }
  }
  // Links between imported Markdown files use the stored source filename, not the article title.
  const sourceFiles = new Map();
  for (const record of records) {
    const name = record.metadata.sourceTitle;
    if (name) sourceFiles.set(name, [...(sourceFiles.get(name) ?? []), record]);
  }
  for (const record of records) {
    const links = record.content.format === 'markdown' ?
      record.content.raw.matchAll(/(?<!!)\[([^\]\n]+)\]\(([^)\s]+\.md(?:#[^)\s]*)?)\)/gi) : [];
    const occurrencesByFile = new Map();
    for (const link of links) {
      const path = link[2];
      const [file] = path.split('#');
      const occurrences = occurrencesByFile.get(file) ?? [];
      occurrences.push({ offset: link.index, length: link[0].length, url: path, label: link[1] });
      occurrencesByFile.set(file, occurrences);
    }
    for (const [file, occurrences] of occurrencesByFile) {
      const candidates = sourceFiles.get(file.replace(/^\.\//, '')) ?? [];
      const exact = candidates.length === 1 ? candidates[0] : null;
      record.relations.push({ direction: 'outbound', kind: 'markdown_source_filename', scope: 'wiki',
        targetLegacyId: exact?.legacyRef.id ?? null, targetLegacyStore: exact?.legacyRef.store ?? null,
        targetPointer: exact?.sourceRecord.pointer ?? null, sourcePointer: record.sourceRecord.pointer + '/' + record.content.sourceRawField,
        originalLink: file, pinnedVersion: null, occurrences });
    }
  }
  for (const key of Object.keys(decisions)) {
    if (!usedDecisions.has(key)) throw new Error('人工分类找不到待审记录：' + key);
  }
  return { records, excluded, mapping: [...groups.values()] };
}
