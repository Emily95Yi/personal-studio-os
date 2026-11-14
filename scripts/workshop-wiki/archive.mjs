import { createHash } from 'node:crypto';

export const system = 'workshop-dashboard';
export const database = 'workshop-planning-workspace';
export const origin = 'https://workshop-creation-workspace-zy.cho-eki0915.chatgpt.site';
export const wikiStores = ['tools', 'resources', 'knowledgeEntries'];
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const string = value => typeof value === 'string' ? value : null;
export const legacyId = value => typeof value === 'string' || Number.isFinite(value) ? value : null;
export const pointerPart = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
export const strings = value => Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
const require = (condition, message) => { if (!condition) throw new Error(message); };

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!object(value)) return JSON.stringify(value);
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

export function sourceArchive(doc) {
  const backup = doc.database === database && object(doc.tables);
  require(backup || (doc.format === 'workshop-idb-text-export-v1' && Array.isArray(doc.databases)),
    '不支持的旧站导出格式。');
  if (!backup) require(doc.origin === origin, '旧站文本导出的 origin 不匹配。');
  const issues = [...(doc.errors ?? []).map(error => ({ reason: 'export_error', error }))];
  const databases = backup ? [{
    name: doc.database, version: null, stores: Object.entries(doc.tables).map(([name, records]) => ({ name, records })),
  }] : doc.databases;
  require(databases.filter(db => db.name === database).length === 1, '无法唯一定位旧 Workshop 数据库。');

  const counts = [];
  const stores = new Map();
  for (const [dbIndex, db] of databases.entries()) {
    require(Array.isArray(db.stores), '导出库缺少 stores。');
    const summary = { db: db.name, version: db.version, stores: [] };
    counts.push(summary);
    for (const [storeIndex, store] of db.stores.entries()) {
      const count = Array.isArray(store.records) ? store.records.length : null;
      summary.stores.push({ store: store.name, count, reportedCount: store.count ?? null });
      if (count === null || store.error || (store.count != null && count !== store.count)) {
        issues.push({ reason: 'store_read_error_or_count_mismatch', db: db.name, store: store.name, error: store.error ?? null });
      }
      if (db.name !== database) continue;
      require(!stores.has(store.name), '有重复的旧 store：' + store.name);
      const keys = new Set();
      const listed = (Array.isArray(store.records) ? store.records : []).flatMap((row, index) => {
        const value = backup ? row : row?.value;
        const key = backup ? value?.id : row?.primaryKey ?? row?.key;
        const pointer = backup ? '/tables/' + pointerPart(store.name) + '/' + index :
          '/databases/' + dbIndex + '/stores/' + storeIndex + '/records/' + index + '/value';
        const serialized = canonical(key);
        if (!object(value) || key == null || keys.has(serialized)) {
          issues.push({ reason: 'invalid_or_duplicate_primary_key', store: store.name, pointer, key: key ?? null });
          return [];
        }
        keys.add(serialized);
        return [{ value, pointer, legacyRef: { system, db: db.name, store: store.name, key: serialized, id: legacyId(value.id) } }];
      });
      stores.set(store.name, listed);
    }
  }

  for (const name of wikiStores) if (!stores.has(name)) issues.push({ reason: 'missing_wiki_store', store: name });
  const metaVersion = stores.get('meta')?.find(row => row.value.id === 'workspace')?.value.schemaVersion ?? null;
  return { backup, exportedAt: doc.exportedAt ?? doc.createdAt ?? null, exportVersion: doc.schemaVersion ?? null,
    metaVersion, stores, counts, issues };
}

export function identity(ref, prefix = 'wiki') {
  const tuple = JSON.stringify([ref.system, ref.db, ref.store, ref.key]);
  return 'legacy-' + prefix + '-' + sha256(tuple);
}

export function legacyUrl(category, id) {
  return id == null || !category ? null : origin + '/knowledge/' + encodeURIComponent(category) + '/' + encodeURIComponent(id);
}
