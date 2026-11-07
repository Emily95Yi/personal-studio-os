export const projectSections = {
  overview: 'Overview / 定位',
  inspiration: '主题与灵感',
  research: '理论与研究',
  flow: '通用流程',
  facilitation: '主持原则 / 模板',
  questions: '提问模板 / 方法',
  visual: '视觉模板',
  playbook: 'Playbook / 方法',
  session: '创作记录',
  artifact: 'Artifact / 成果物',
};

export const eventSections = {
  overview: 'Overview',
  flow: '本场流程',
  facilitation: '主持稿',
  questions: '提问方法',
  visual: '主视觉',
  recruitment: '招募文案',
  preparation: '执行准备',
  notes: '现场记录',
  review: 'Review / 复盘',
  session: '创作记录',
  artifact: 'Artifact / 成果物',
};

export const reusableSections = ['flow', 'facilitation', 'questions', 'visual', 'playbook', 'session'];
export const collections = ['projects', 'events', 'content', 'sessions', 'relations', 'assets', 'boardFolders', 'reflectionLabels',
  'collectionCategories', 'collectionFolders', 'collectionItems', 'explorationTopics', 'explorationEntries', 'explorationEntryTypes'];
export const relationObjectTypes = ['discover', 'topic', 'collection-item', 'project', 'event'];
const objectCollections = { project: 'projects', event: 'events', discover: 'content',
  topic: 'explorationTopics', 'collection-item': 'collectionItems' };
export const maxAssetBytes = 12 * 1024 * 1024;
export const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];

export function emptyStudio() {
  return { revision: 0, ...Object.fromEntries(collections.map(key => [key, []])) };
}

const now = () => new Date().toISOString();
const nextId = () => globalThis.crypto.randomUUID();
const fail = message => { throw new Error(message); };
const find = (rows, id) => rows.find(item => item.id === id);

export function objectFor(state, type, id) {
  return Object.hasOwn(objectCollections, type) ? find(state[objectCollections[type]] ?? [], id) : undefined;
}

const boardObjectTypes = relationObjectTypes.slice(0, 3);
const selfBoardObject = (type, item) => type === 'discover' ? isSelfBoard(item) : boardObjectTypes.includes(type);
export const relationTargetTypes = type => boardObjectTypes.includes(type) ? relationObjectTypes : boardObjectTypes;

export function isSelfBoard(item) {
  return Boolean(item && (item.primaryWorkspace === 'Self-Board' || (Array.isArray(item.domains) && item.domains.includes('Self-Board'))));
}

export function contentTitle(item) {
  return item.title?.trim() || (item.body ?? item.description ?? '').trim().split(/\r?\n/, 1)[0].slice(0, 56) || '未命名记录';
}

export function isDiscover(item) {
  return isSelfBoard(item) && (item.views == null || (Array.isArray(item.views) && item.views.includes('discover')));
}

export function studioTags(text) {
  return [...new Set(text.split(/[,，]/).map(value => value.trim()).filter(Boolean))];
}

export function validImage({ data, mime }) {
  if (!imageTypes.includes(mime) || typeof data !== 'string' || data.length < 16) return false;
  try {
    const header = atob(data.slice(0, 32));
    switch (mime) {
      case 'image/png': return header.startsWith('\x89PNG\r\n\x1a\n');
      case 'image/jpeg': return header.startsWith('\xff\xd8\xff');
      case 'image/gif': return header.startsWith('GIF87a') || header.startsWith('GIF89a');
      case 'image/webp': return header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
      case 'image/avif': return header.slice(4, 8) === 'ftyp' && /avi[fs]/.test(header.slice(8));
    }
  } catch {
    return false;
  }
}

export function addAsset(state, input) {
  const asset = { id: nextId(), ...input };
  state.assets.push(asset);
  return asset.id;
}

export function saveRecord(rows, input) {
  const existing = input.id ? find(rows, input.id) : null;
  if (input.id && !existing) fail('这条记录已不可用。');
  const title = input.title.trim();
  if (!title) fail('请输入标题。');
  const stamp = now();
  const record = { ...existing, ...input, id: existing?.id ?? nextId(), title,
    createdAt: existing?.createdAt ?? stamp, updatedAt: stamp };
  if (existing) rows[rows.indexOf(existing)] = record;
  else rows.push(record);
  return record;
}

export function saveProject(state, input) {
  return saveRecord(state.projects, input);
}

export function saveDiscover(state, input) {
  const existing = input.id && objectFor(state, 'discover', input.id);
  if (input.id && !isDiscover(existing)) fail('资料已不可用。');
  return saveRecord(state.content, existing ? input : {
    domains: ['Self-Board'], views: ['discover'], kind: 'input', visibility: 'private', ...input,
  });
}

export function saveEvent(state, input, sourceIds = []) {
  const existing = input.id && objectFor(state, 'event', input.id);
  if (!objectFor(state, 'project', input.projectId) || (existing && existing.projectId !== input.projectId)) {
    fail('Project 已不可用。');
  }
  const event = saveRecord(state.events, input);
  for (const id of new Set(sourceIds)) adoptVersion(state, event.id, id);
  return event;
}

export function sessionsFor(state, ownerType, ownerId) {
  return state.sessions.filter(session => session.ownerType === ownerType && session.ownerId === ownerId);
}

export function currentVersion(session) {
  return session?.versions?.find(version => version.id === session.currentVersionId);
}

export function saveSession(state, input) {
  const { id, ownerType, ownerId, section, title, body, assetIds = [], sourceInfo = '', sourceUrl = '' } = input;
  const allowed = ownerType === 'project' ? projectSections : ownerType === 'event' ? eventSections : {};
  const session = id ? find(state.sessions, id) : null;
  if (!objectFor(state, ownerType, ownerId) || !Object.hasOwn(allowed, section) ||
      (id && (!session || session.ownerId !== ownerId || session.ownerType !== ownerType || session.section !== section))) {
    fail('文档位置已不可用。');
  }
  if (!title.trim()) fail('请输入标题。');
  const stamp = now();
  const source = currentVersion(session)?.source;
  const version = { id: nextId(), title: title.trim(), body, assetIds, sourceInfo, sourceUrl, createdAt: stamp,
    ...(source ? { source: { ...source, mode: 'custom' } } : {}) };
  if (session) {
    session.versions.push(version);
    session.currentVersionId = version.id;
    session.updatedAt = stamp;
    return session;
  }
  const created = { id: nextId(), ownerType, ownerId, section, createdAt: stamp, updatedAt: stamp,
    currentVersionId: version.id, versions: [version] };
  state.sessions.push(created);
  return created;
}

export function reusableFor(state, projectId) {
  return sessionsFor(state, 'project', projectId).filter(session => reusableSections.includes(session.section));
}

export function adoptVersion(state, eventId, sourceId, versionId) {
  const event = objectFor(state, 'event', eventId);
  const sourceSession = event && reusableFor(state, event.projectId).find(session => session.id === sourceId);
  const sourceVersion = currentVersion(sourceSession);
  if (!sourceVersion || (versionId && sourceVersion.id !== versionId)) fail('Project 版本已变化，请重新比较。');
  let session = sessionsFor(state, 'event', eventId).find(item => item.adoptedFrom === sourceId);
  const current = currentVersion(session);
  if (current?.source?.versionId === sourceVersion.id && current.source.mode === 'adopted') return session;
  const stamp = now();
  const version = { ...structuredClone(sourceVersion), id: nextId(), createdAt: stamp,
    source: { sessionId: sourceId, versionId: sourceVersion.id, mode: 'adopted' } };
  if (!session) {
    const section = sourceSession.section === 'playbook' ? 'session' : sourceSession.section;
    session = { id: nextId(), ownerType: 'event', ownerId: eventId, section, createdAt: stamp,
      adoptedFrom: sourceId, versions: [] };
    state.sessions.push(session);
  }
  session.versions.push(version);
  session.updatedAt = stamp;
  session.currentVersionId = version.id;
  return session;
}

export function relationKey(edge) {
  return JSON.stringify([[edge.sourceType, edge.sourceId], [edge.targetType, edge.targetId]]
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])));
}

export function canRelate(state, aType, aId, bType, bId) {
  if (aType === bType && aId === bId) return false;
  const a = objectFor(state, aType, aId);
  const b = objectFor(state, bType, bId);
  return Boolean(a && b && (selfBoardObject(aType, a) || selfBoardObject(bType, b)) &&
    (aType !== 'discover' || isSelfBoard(a)) && (bType !== 'discover' || isSelfBoard(b)));
}

export function saveRelation(state, { id, sourceType, sourceId, targetType, targetId, relationType }) {
  if (!canRelate(state, sourceType, sourceId, targetType, targetId) ||
      objectFor(state, sourceType, sourceId)?.deletedAt || objectFor(state, targetType, targetId)?.deletedAt) fail('关联对象已不可用。');
  const candidate = { sourceType, sourceId, targetType, targetId, relationType: relationType?.trim() || 'related' };
  const existing = id && find(state.relations, id);
  if (id && !existing) fail('这条关联已不可用。');
  if (state.relations.some(edge => edge.id !== id && relationKey(edge) === relationKey(candidate))) {
    fail('这两个对象已经关联。');
  }
  if (existing) {
    Object.assign(existing, candidate);
    return existing;
  }
  const created = { ...candidate, id: nextId(), createdAt: now() };
  state.relations.push(created);
  return created;
}

export function removeRelation(state, id) {
  state.relations = state.relations.filter(edge => edge.id !== id);
}

function directRelations(state, type, id) {
  return state.relations.flatMap(edge => {
    if (edge.sourceType === type && edge.sourceId === id) {
      return [{ edge, type: edge.targetType, item: objectFor(state, edge.targetType, edge.targetId) }];
    }
    if (edge.targetType === type && edge.targetId === id) {
      return [{ edge, type: edge.sourceType, item: objectFor(state, edge.sourceType, edge.sourceId) }];
    }
    return [];
  }).filter(row => row.item && !row.item.deletedAt);
}

export function relatedObjects(state, type, id) {
  const direct = directRelations(state, type, id);
  const derived = new Map();
  if (type === 'project') {
    const keyFor = (type, item) => JSON.stringify([type, item.id]);
    const directIds = new Set(direct.map(row => keyFor(row.type, row.item)));
    for (const event of state.events.filter(row => row.projectId === id)) {
      for (const { type: targetType, item } of directRelations(state, 'event', event.id)) {
        const key = keyFor(targetType, item);
        if (!directIds.has(key)) {
          if (!derived.has(key)) derived.set(key, { item, type: targetType, via: [] });
          derived.get(key).via.push(event);
        }
      }
    }
  }
  return { direct, derived: [...derived.values()] };
}

export function relationCandidates(state, ownerType, ownerId, { type, query = '', tag = '', edgeId, includeLinked = false } = {}) {
  const types = relationTargetTypes(ownerType);
  const blocked = new Set(directRelations(state, ownerType, ownerId).filter(row => row.edge.id !== edgeId)
    .map(row => JSON.stringify([row.type, row.item.id])));
  const needle = query.trim().toLocaleLowerCase();
  return types.filter(key => !type || key === type).flatMap(key => (state[objectCollections[key]] ?? [])
    .filter(item => !item.deletedAt && canRelate(state, ownerType, ownerId, key, item.id) &&
      (includeLinked || !blocked.has(JSON.stringify([key, item.id]))) && (!tag || (item.topics ?? item.tags)?.includes(tag)) &&
      [item.title, item.body, item.summary, item.description, item.theme, item.type, item.contentType, item.notes, item.url, ...(item.topics ?? item.tags ?? [])].join(' ').toLocaleLowerCase().includes(needle))
    .map(item => ({ type: key, item })));
}

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('yistudio-content', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('studio');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const normalizeStudio = data => ({ ...emptyStudio(), ...data });

export function createStudioStore(open = database) {
  let db;
  let state = emptyStudio();
  let cloud;
  let pending;
  return {
    get state() { return state; },
    useCloud(save) { cloud = save; },
    receiveCloud(snapshot, revision) { state = { ...normalizeStudio(snapshot), revision }; },
    load() {
      pending ??= (async () => {
        db ??= await open();
        state = await new Promise((resolve, reject) => {
          const request = db.transaction('studio').objectStore('studio').get('data');
          request.onsuccess = () => resolve(normalizeStudio(request.result));
          request.onerror = () => reject(request.error);
        });
      })().catch(error => { pending = undefined; throw error; });
      return pending;
    },
    async change(update) {
      await this.load();
      if (cloud) {
        const revision = state.revision;
        const next = structuredClone(state);
        const result = update(next);
        next.revision = await cloud(next, revision);
        state = next;
        return result;
      }
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('studio', 'readwrite');
        const store = transaction.objectStore('studio');
        const read = store.get('data');
        let next;
        let result;
        let error;
        read.onsuccess = () => {
          const saved = read.result ?? emptyStudio();
          try {
            if (saved.revision !== state.revision) {
              fail('另一标签页已保存修改。请刷新页面后重试。');
            }
            next = structuredClone(normalizeStudio(saved));
            result = update(next);
            next.revision += 1;
            store.put(next, 'data');
          } catch (cause) {
            error = cause;
            transaction.abort();
          }
        };
        transaction.oncomplete = () => { state = next; resolve(result); };
        transaction.onabort = () => reject(error ?? transaction.error ?? new Error('保存失败。'));
      });
    },
  };
}

export const studioStore = createStudioStore();
