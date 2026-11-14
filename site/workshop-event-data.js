import { safeUrl } from './html.js';
import { addAsset, currentVersion, objectFor, relatedObjects, saveEvent, saveRelation, saveSession, sessionsFor } from './studio-data.js';
import { linkWiki, saveCardSet, wikiRecords } from './workshop-library.js';

export const eventAreas = {
  overview: ['overview', 'visual', 'recruitment'],
  flow: ['flow', 'facilitation', 'questions', 'preparation'],
  resources: ['artifact'],
  review: ['notes', 'review', 'session'],
};

export const areaFor = section => Object.keys(eventAreas).find(key => eventAreas[key].includes(section));
export const activeFlow = (state, eventId) => ordered(sessionsFor(state, 'event', eventId)
  .filter(row => !row.workshopArchivedAt && areaFor(row.section) === 'flow'), 'workshopOrder');
export const projectKey = event => event.projectId || '';
export const groupEvents = (state, projectId) => ordered(state.events.filter(event => projectKey(event) === projectId), 'workshopGroupOrder');
export const orderedEvents = state => ordered(state.events, 'workshopOrder');

export function legacyProjectOrder(projects) {
  if (projects.some(project => project.workshopOrder != null)) return [];
  try {
    const order = JSON.parse(globalThis.window?.localStorage.getItem('yistudio-workshop-gallery') ?? 'null')?.order;
    return Array.isArray(order) ? order.filter(id => projects.some(project => project.id === id)) : [];
  } catch {
    return [];
  }
}

export function orderedProjects(projects, legacy = []) {
  if (!legacy.length) return ordered(projects, 'workshopOrder');
  const byId = new Map(projects.map(project => [project.id, project]));
  const saved = [...new Set(legacy)].map(id => {
    const project = byId.get(id);
    byId.delete(id);
    return project;
  }).filter(Boolean);
  return [...saved, ...byId.values()];
}

export function ordered(rows, field) {
  return [...rows].sort((a, b) => (a[field] ?? Infinity) - (b[field] ?? Infinity));
}

function insert(rows, item, target, after, field) {
  const next = rows.filter(row => row !== item);
  const index = target ? next.findIndex(row => row.id === target) : next.length;
  if (index < 0) throw new Error('排序目标已变化，请重新选择。');
  next.splice(index + (target && after ? 1 : 0), 0, item);
  next.forEach((row, i) => { row[field] = i; });
}

export function moveWorkshopItem(state, { kind, id, target, after, projectId, eventId, projectOrder }) {
  if (id === target) return;
  const groups = kind === 'group-event';
  const rows = {
    project: () => orderedProjects(state.projects, projectOrder),
    event: () => orderedEvents(state),
    'group-event': () => groupEvents(state, projectId),
    flow: () => activeFlow(state, eventId),
  }[kind]();
  let item = (groups ? state.events : rows).find(row => row.id === id);
  if (!item) throw new Error('排序对象已不可用。');
  if (groups && projectKey(item) !== projectId) item = saveEvent(state, { id, title: item.title, projectId });
  insert(rows, item, target, after, groups ? 'workshopGroupOrder' : 'workshopOrder');
}

export function saveEventDocument(state, eventId, input, afterId) {
  const flow = areaFor(input.section) === 'flow';
  const session = input.id && sessionsFor(state, 'event', eventId).find(row => row.id === input.id);
  if (input.id && (!session || session.workshopArchivedAt)) throw new Error('内容已不可用。');
  const saved = saveSession(state, { ...input, ownerType: 'event', ownerId: eventId });
  if (flow && !session && afterId) insert(activeFlow(state, eventId), saved, afterId, true, 'workshopOrder');
  return saved;
}

const keyFor = (kind, id) => JSON.stringify([kind, id]);

export function eventResources(state, event) {
  const cards = (event.cardUses ?? []).map(row => ({
    key: keyFor('card', row.cardSetId), kind: 'card', id: row.cardSetId, row,
    title: state.cardSets.find(card => card.id === row.cardSetId)?.title ?? row.cardSetId,
  }));
  const edges = relatedObjects(state, 'event', event.id).direct.map(({ edge, type, item }) => ({
    key: keyFor('edge', edge.id), kind: 'edge', id: edge.id, row: edge, type, item, title: item.title || item.body?.slice(0, 60) || '未命名资源',
  }));
  const extra = (event.workshopResources ?? []).map(row => ({
    key: keyFor('extra', row.id), kind: row.kind, id: row.id, row,
    title: row.kind === 'asset' ? state.assets.find(asset => asset.id === row.assetId)?.name ?? row.title : row.title,
  }));
  return [...cards, ...edges, ...extra];
}

export function eventAttachmentReferences(state, event) {
  const linked = new Set((event.workshopResources ?? []).filter(row => row.kind === 'asset').map(row => row.assetId));
  const sources = new Map();
  for (const id of [...(event.assetIds ?? []), event.coverAssetId].filter(Boolean)) sources.set(id, []);
  for (const session of sessionsFor(state, 'event', event.id).filter(row => !row.workshopArchivedAt)) {
    const version = currentVersion(session);
    for (const id of [...(version.assetIds ?? []), version.coverAssetId].filter(Boolean)) {
      if (!sources.has(id)) sources.set(id, []);
      sources.get(id).push(session);
    }
  }
  return [...sources].filter(([id]) => !linked.has(id));
}

const assignments = (flowIds = []) => [...new Set(flowIds.filter(Boolean))];

function attach(row, flowId) {
  if (flowId) row.workshopFlowIds = assignments([...(row.workshopFlowIds ?? []), flowId]);
  return row;
}

export function addEventResource(state, event, input, flowId) {
  const existing = eventResources(state, event);
  if (input.kind === 'card' || input.kind === 'new-card') {
    const card = input.kind === 'new-card' ? saveCardSet(state, input.title) : state.cardSets.find(row => row.id === input.id);
    if (!card) throw new Error('卡组已不可用。');
    const current = existing.find(row => row.kind === 'card' && row.id === card.id);
    if (current) return attach(current.row, flowId);
    const row = { cardSetId: card.id, role: input.role || 'primary', usageNote: input.note || '', workshopQuantity: input.quantity || '' };
    (event.cardUses ??= []).push(row);
    return attach(row, flowId);
  }
  if (['wiki', 'related'].includes(input.kind)) {
    const type = input.kind === 'wiki' ? 'discover' : input.type;
    const current = existing.find(row => row.kind === 'edge' && row.type === type && row.item.id === input.id);
    if (current) return attach(current.row, flowId);
    const row = input.kind === 'wiki'
      ? linkWiki(state, { ownerType: 'event', ownerId: event.id, resourceId: input.id, mode: input.mode, versionId: input.versionId })
      : saveRelation(state, { sourceType: 'event', sourceId: event.id, targetType: type, targetId: input.id, relationType: input.relationType });
    row.workshopRole = input.role || '';
    row.workshopUsage = input.note || '';
    row.workshopQuantity = input.quantity || '';
    return attach(row, flowId);
  }
  if (!['asset', 'link', 'material'].includes(input.kind)) throw new Error('请选择资源类型。');
  if (input.kind === 'link' && !safeUrl(input.url)) throw new Error('链接须使用 HTTPS 或站内路径。');
  if (input.kind === 'material' && !input.title) throw new Error('请输入物料名称。');
  if (input.kind === 'asset' && (input.assetId ? !state.assets.some(asset => asset.id === input.assetId) : !input.file)) {
    throw new Error('文件已不可用。');
  }
  const assetId = input.kind === 'asset' ? input.assetId || addAsset(state, input.file) : undefined;
  const current = existing.find(({ row, kind }) => kind === input.kind &&
    (kind === 'asset' ? row.assetId === assetId : kind === 'link' ? row.url === input.url : row.title === input.title));
  if (current) return attach(current.row, flowId);
  const row = { id: crypto.randomUUID(), kind: input.kind, title: input.title || input.url || '',
    ...(assetId && { assetId }), ...(input.url && { url: input.url }), role: input.role || '',
    workshopUsage: input.note || '', workshopQuantity: input.quantity || '' };
  (event.workshopResources ??= []).push(row);
  return attach(row, flowId);
}

export function editEventResource(state, event, key, input) {
  const entry = eventResources(state, event).find(row => row.key === key);
  if (!entry) throw new Error('资源已不可用。');
  let { row } = entry;
  if (input.mode) {
    row = linkWiki(state, { ownerType: 'event', ownerId: event.id, resourceId: entry.item.id, id: row.id,
      mode: input.mode, versionId: input.versionId });
  }
  if (entry.kind === 'card') {
    row.role = input.role;
    row.usageNote = input.note;
  } else {
    if (entry.kind === 'edge') row.workshopRole = input.role;
    else row.role = input.role;
    row.workshopUsage = input.note;
  }
  row.workshopQuantity = input.quantity;
  row.workshopFlowIds = assignments(input.flowIds);
  return entry;
}

export function removeEventResource(state, event, key) {
  const entry = eventResources(state, event).find(row => row.key === key);
  if (!entry) throw new Error('资源已不可用。');
  if (entry.kind === 'edge') state.relations = state.relations.filter(row => row !== entry.row);
  else if (entry.kind === 'card') event.cardUses = event.cardUses.filter(row => row !== entry.row);
  else event.workshopResources = event.workshopResources.filter(row => row !== entry.row);
}

export function archiveEventFlow(state, event, id) {
  const session = activeFlow(state, event.id).find(row => row.id === id);
  if (!session) throw new Error('环节已不可用。');
  session.workshopArchivedAt = new Date().toISOString();
  const rows = [...(event.cardUses ?? []), ...(event.workshopResources ?? []), ...state.relations];
  for (const row of rows) if (row.workshopFlowIds?.includes(id)) {
    row.workshopFlowIds = row.workshopFlowIds.filter(flowId => flowId !== id);
  }
}

export function setFlowResources(state, event, id, keys, visibleKeys) {
  for (const entry of eventResources(state, event)) {
    if (keys.includes(entry.key)) attach(entry.row, id);
    else if (visibleKeys.includes(entry.key) && entry.row.workshopFlowIds?.includes(id)) {
      entry.row.workshopFlowIds = entry.row.workshopFlowIds.filter(flowId => flowId !== id);
    }
  }
}

function copyDocument(state, eventId, source, afterId) {
  const { source: adoption, id, createdAt, ...version } = structuredClone(currentVersion(source));
  return saveEventDocument(state, eventId, { ...version, section: source.section, details: version }, afterId);
}

function copyResource(state, event, entry, flowIds) {
  const { row } = entry;
  const wiki = entry.kind === 'edge' && wikiRecords(state).some(item => item.id === entry.item.id);
  const input = { kind: wiki ? 'wiki' : entry.kind === 'edge' ? 'related' : entry.kind,
    id: entry.item?.id ?? entry.id, type: entry.type, title: row.title, url: row.url, assetId: row.assetId,
    role: row.role || row.workshopRole, relationType: row.relationType, note: row.usageNote ?? row.workshopUsage,
    quantity: row.workshopQuantity,
    mode: row.versionId ? 'pinned_version' : 'live', versionId: row.versionId };
  const existing = eventResources(state, event).find(other => other.kind === 'edge' && other.type === entry.type &&
    other.item.id === entry.item?.id);
  // An archived Wiki can still be reused through an already valid Event reference.
  const copy = wiki && !existing
    ? saveRelation(state, { sourceType: 'event', sourceId: event.id, targetType: 'discover',
      targetId: entry.item.id, relationType: row.relationType, versionId: row.versionId })
    : addEventResource(state, event, input);
  if (wiki && !existing) {
    if (input.role) copy.workshopRole = input.role;
    if (input.note) copy.workshopUsage = input.note;
    if (input.quantity) copy.workshopQuantity = input.quantity;
  }
  for (const id of flowIds) attach(copy, id);
}

export function copyEventFlow(state, event, source, afterId, resources = true) {
  if (source.ownerType !== 'event' || source.workshopArchivedAt || areaFor(source.section) !== 'flow') {
    throw new Error('来源环节已不可用。');
  }
  const saved = copyDocument(state, event.id, source, afterId);
  if (!resources) return saved;
  const origin = objectFor(state, 'event', source.ownerId);
  for (const entry of eventResources(state, origin).filter(({ row }) => row.workshopFlowIds?.includes(source.id))) {
    copyResource(state, event, entry, [saved.id]);
  }
  return saved;
}

export function duplicateEvent(state, source, input, options) {
  const { date, time, location, theme, fee, posterUrl, coverAssetId, description, body, formats, format, form, activityFormat } = source;
  const event = saveEvent(state, {
    ...(options.planning && { date, time, location, theme, fee, posterUrl, coverAssetId, description, body, formats, format, form, activityFormat }),
    tags: source.tags, ...input,
  });
  const flowMap = new Map();
  if (options.flow) for (const session of activeFlow(state, source.id)) {
    flowMap.set(session.id, copyDocument(state, event.id, session).id);
  }
  if (options.planning) {
    for (const session of sessionsFor(state, 'event', source.id).filter(row => eventAreas.overview.includes(row.section))) {
      copyDocument(state, event.id, session);
    }
  }
  if (options.resources) {
    event.assetIds = source.assetIds;
    for (const session of sessionsFor(state, 'event', source.id).filter(row => row.section === 'artifact')) {
      copyDocument(state, event.id, session);
    }
    for (const entry of eventResources(state, source)) {
      copyResource(state, event, entry, (entry.row.workshopFlowIds ?? []).map(id => flowMap.get(id)).filter(Boolean));
    }
  }
  return event;
}
