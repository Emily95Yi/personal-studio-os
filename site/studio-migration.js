import { canRelate, collections, currentVersion, eventSections, imageTypes, isDiscover, maxAssetBytes,
  objectFor, projectSections, relationKey, validImage } from './studio-data.js';
import { safeUrl } from './html.js';

export const transferFormat = 'yistudio-transfer-v1';
export const rawFormat = 'yistudio-indexeddb-v1';
export const mappingFormat = 'yistudio-mapping-v1';
export const maxTransferBytes = 50 * 1024 * 1024;
const has = Object.hasOwn;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const require = (condition, message) => { if (!condition) throw new Error(message); };

export function studioExport(state) {
  return { format: transferFormat, ...Object.fromEntries(collections.map(key => [key, key === 'content' ? state.content.filter(isDiscover) : state[key]])) };
}

function field(value, path) {
  require(Array.isArray(path) && path.every(key => typeof key === 'string' || Number.isInteger(key)), '字段路径须为数组。');
  for (const key of path) {
    if (value == null || !has(value, key)) return undefined;
    value = value[key];
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (plain(value)) return '{' + Object.keys(value).filter(key => value[key] !== undefined).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function legacyId(namespace, store, key, slot) {
  require(nonempty(store) && key !== undefined && (slot === undefined || nonempty(slot)), '旧记录引用缺少 store、key 或有效的 slot。');
  return 'legacy:' + canonical([namespace, store, key, slot ?? 'record']);
}

function mapValue(template, source) {
  if (Array.isArray(template)) return template.map(value => mapValue(value, source)).filter(value => value !== undefined);
  if (!plain(template)) return template;
  const keys = Object.keys(template);
  if (keys.length === 1) {
    if (has(template, '$field')) return field(source.value, template.$field);
    if (has(template, '$key')) return source.key;
    if (has(template, '$id')) return legacyId(source.namespace, source.store, source.key, template.$id);
    if (has(template, '$ref')) {
      const ref = template.$ref;
      require(plain(ref), '旧记录引用格式不正确。');
      const key = has(ref, 'key') ? ref.key : field(source.value, ref.path);
      if (key === undefined && ref.optional === true) return undefined;
      return legacyId(source.namespace, ref.store, key, ref.slot);
    }
  }
  return Object.fromEntries(Object.entries(template).flatMap(([key, value]) => {
    const mapped = mapValue(value, source);
    return mapped === undefined ? [] : [[key, mapped]];
  }));
}

export function mapLegacyArchive(raw, mapping) {
  require(raw?.format === rawFormat && nonempty(raw.database) && Number.isInteger(raw.version) &&
    Array.isArray(raw.stores), '无法读取原始 IndexedDB 导出。');
  require(mapping?.format === mappingFormat && mapping.database === raw.database && mapping.version === raw.version &&
    nonempty(mapping.namespace) && Array.isArray(mapping.rules), '映射与原始数据库名称或版本不匹配。');
  const stores = new Map();
  for (const store of raw.stores) {
    require(nonempty(store?.name) && !stores.has(store.name) && Array.isArray(store.rows), '原始数据表格式不正确。');
    stores.set(store.name, store);
  }
  for (const rule of mapping.rules) {
    require(stores.has(rule?.store) && Array.isArray(rule.outputs) && (rule.outputs.length || rule.keepRaw === true),
      '映射规则缺少有效的数据表或输出。');
    require(rule.when === undefined || (plain(rule.when) && Array.isArray(rule.when.path) && has(rule.when, 'equals')),
      '映射条件缺少字段路径或比较值。');
  }

  const transfer = { format: transferFormat, ...Object.fromEntries(collections.map(key => [key, []])) };
  const retained = [];
  for (const [store, { rows }] of stores) {
    for (const row of rows) {
      require(plain(row) && has(row, 'key') && has(row, 'value'), '原始记录缺少 key 或 value。');
      const rules = mapping.rules.filter(rule => rule.store === store &&
        (!rule.when || canonical(field(row.value, rule.when.path)) === canonical(rule.when.equals)));
      const outputs = rules.flatMap(rule => rule.outputs);
      if (!outputs.length) {
        retained.push({ store, key: row.key, reason: rules.length ? '保留在原始导出' : '未映射' });
      }
      for (const output of outputs) {
        require(collections.includes(output?.to) && plain(output.fields), '映射输出缺少有效的类型或字段。');
        const source = { namespace: mapping.namespace, store, key: row.key, value: row.value };
        const record = mapValue(output.fields, source);
        record.id ??= legacyId(mapping.namespace, store, row.key, output.slot);
        transfer[output.to].push(record);
      }
    }
  }
  return { transfer, retained };
}

function optionalFields(row, fields, label) {
  for (const key of fields) {
    require(row[key] == null || typeof row[key] === 'string', label + ' 的 ' + key + ' 须为文字。');
  }
}

function optionalList(row, key, label) {
  require(row[key] == null || (Array.isArray(row[key]) && row[key].every(nonempty)), label + ' 的 ' + key + ' 须为文字列表。');
}

function validateRecords(state) {
  const assets = new Map(state.assets.map(asset => [asset.id, asset]));
  function validateAssets(row, label) {
    optionalList(row, 'assetIds', label);
    for (const id of row.assetIds ?? []) require(assets.has(id), label + ' 缺少附件 ' + id);
    if (row.coverAssetId) {
      const image = assets.get(row.coverAssetId);
      require(image && validImage(image), label + ' 缺少可读的封面或海报。');
    } else {
      const url = row.posterUrl || row.coverUrl;
      require(!url || safeUrl(url), label + ' 的封面或海报须引用已导出的附件或有效图片地址。');
    }
  }

  for (const asset of state.assets) {
    const data = asset.data;
    require(nonempty(asset.name) && nonempty(asset.mime) && /^[\w.+-]+\/[\w.+-]+$/.test(asset.mime) &&
      nonempty(data) && data.length <= Math.ceil(maxAssetBytes / 3) * 4 && data.length % 4 === 0 &&
      /^[A-Za-z0-9+/]*={0,2}$/.test(data), '附件格式或大小无效：' + asset.id);
  }

  for (const key of ['projects', 'events', 'content']) {
    for (const row of state[key]) {
      require(nonempty(row.title), '记录缺少标题：' + row.id);
      optionalFields(row, ['description', 'body', 'coverAssetId', 'coverUrl', 'posterUrl', 'sourceInfo', 'sourceUrl',
        'date', 'time', 'location', 'fee', 'theme', 'createdAt', 'updatedAt', 'contentType', 'category', 'primaryWorkspace'], row.title);
      optionalList(row, 'tags', row.title);
      optionalList(row, 'domains', row.title);
      optionalList(row, 'views', row.title);
      validateAssets(row, row.title);
      if (key === 'events') {
        require(objectFor(state, 'project', row.projectId), row.title + ' 缺少所属 Project。');
        require(row.attendeeCount == null || typeof row.attendeeCount === 'string' ||
          (Number.isInteger(row.attendeeCount) && row.attendeeCount >= 0), row.title + ' 的人数无效。');
      }
    }
  }

  const sessions = new Map(state.sessions.map(row => [row.id, row]));
  function validOrigin(session, sourceId) {
    const original = sessions.get(sourceId);
    const event = objectFor(state, 'event', session.ownerId);
    return session.ownerType === 'event' && original?.ownerType === 'project' && original.ownerId === event?.projectId ? original : null;
  }

  const adoptions = new Set();
  for (const session of state.sessions) {
    const sections = session.ownerType === 'project' ? projectSections : session.ownerType === 'event' ? eventSections : {};
    require(objectFor(state, session.ownerType, session.ownerId) && has(sections, session.section) &&
      Array.isArray(session.versions), '文档缺少有效归属、类型或版本：' + session.id);
    optionalFields(session, ['createdAt', 'updatedAt'], session.id);
    const ids = new Set();
    if (session.adoptedFrom) {
      require(validOrigin(session, session.adoptedFrom), '文档的采用来源无效：' + session.id);
      const pair = JSON.stringify([session.ownerId, session.adoptedFrom]);
      require(!adoptions.has(pair), '同一 Event 重复采用同一来源：' + session.id);
      adoptions.add(pair);
    }
    for (const version of session.versions) {
      require(plain(version) && nonempty(version.id) && !ids.has(version.id) && nonempty(version.title) &&
        typeof version.body === 'string', '文档版本无效：' + session.id);
      ids.add(version.id);
      optionalFields(version, ['sourceInfo', 'sourceUrl', 'createdAt'], version.title);
      validateAssets(version, version.title);
      if (version.source) {
        const source = version.source;
        require(plain(source) && session.adoptedFrom === source.sessionId && ['custom', 'adopted'].includes(source.mode) &&
          validOrigin(session, source.sessionId)?.versions?.some(row => row.id === source.versionId),
        '文档版本缺少 Project 来源：' + version.title);
      }
    }
    require(ids.has(session.currentVersionId), '找不到当前版本：' + session.id);
  }

  const edges = new Set();
  for (const edge of state.relations) {
    require(canRelate(state, edge.sourceType, edge.sourceId, edge.targetType, edge.targetId) && nonempty(edge.relationType),
      '关联缺少可用的对象或类型：' + edge.id);
    optionalFields(edge, ['createdAt'], edge.id);
    const pair = relationKey(edge);
    require(!edges.has(pair), '同一对对象有重复关联：' + edge.id);
    edges.add(pair);
  }
}

export function previewMigration(state, transfer, retained = []) {
  require(transfer?.format === transferFormat, '请选择 Studio 迁移包或带映射的 IndexedDB 导出。');
  const next = { revision: state.revision };
  const conflicts = [];
  const additions = [];
  const counts = {};
  for (const collection of collections) {
    const rows = transfer[collection] ?? [];
    require(Array.isArray(rows), collection + ' 须为列表。');
    const existing = new Map(state[collection].map(row => [row.id, row]));
    const incoming = new Set();
    next[collection] = [...state[collection]];
    counts[collection] = { added: 0, duplicate: 0, conflict: 0 };
    for (const row of rows) {
      require(plain(row) && nonempty(row.id) && row.id.length <= 2000, collection + ' 有无效 ID。');
      require(!incoming.has(row.id), collection + ' 有重复的迁移 ID：' + row.id);
      incoming.add(row.id);
      const prior = existing.get(row.id);
      if (prior) {
        if (canonical(prior) === canonical(row)) counts[collection].duplicate += 1;
        else {
          counts[collection].conflict += 1;
          conflicts.push({ collection, id: row.id, label: row.title || row.name || row.id });
        }
      } else {
        require(collection !== 'content' || isDiscover(row), '迁移的资料须属于 Discover：' + row.id);
        next[collection].push(row);
        counts[collection].added += 1;
        additions.push({ collection, id: row.id, label: row.title || row.name || currentVersion(row.versions ? row : null)?.title || row.id });
      }
    }
  }
  if (!conflicts.length) validateRecords(next);
  return { next, counts, additions, conflicts, retained, integrity: {
    images: next.assets.filter(asset => imageTypes.includes(asset.mime)).length,
    covers: [...next.projects, ...next.events, ...next.content].filter(row => row.coverAssetId || row.coverUrl || row.posterUrl).length,
    versions: next.sessions.reduce((total, session) => total + (session.versions?.length ?? 0), 0),
    relations: next.relations.length,
  } };
}

export function importMigration(state, transfer, expectedRevision, retained = []) {
  require(state.revision === expectedRevision, 'Studio 数据已变化，请重新预览。');
  const plan = previewMigration(state, transfer, retained);
  require(!plan.conflicts.length && plan.additions.length, '没有可安全导入的新记录。');
  for (const key of collections) state[key] = plan.next[key];
  return plan;
}
