import { collections } from './studio-data.js';
import { studioExport } from './studio-migration.js';

export const deltaFormat = 'yistudio-delta-v1';
const byId = rows => new Map(rows.map(row => [row.id, row]));
const validId = id => typeof id === 'string' && id.trim().length > 0 && id.length <= 2000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function sameRecord(before, after) {
  const keys = Object.keys(before);
  // In particular, compare unchanged asset strings without serializing them.
  return (keys.length === Object.keys(after).length && keys.every(key => Object.hasOwn(after, key) && before[key] === after[key])) ||
    JSON.stringify(before) === JSON.stringify(after);
}

export function studioDelta(previous, next) {
  const before = studioExport(previous);
  const after = studioExport(next);
  const changes = {};
  for (const collection of collections) {
    const old = byId(before[collection]);
    const current = byId(after[collection]);
    const remove = [...old.keys()].filter(id => !current.has(id));
    const upsert = after[collection].filter(row => !old.has(row.id) || !sameRecord(old.get(row.id), row));
    const naturalOrder = [...old.keys()].filter(id => current.has(id)).concat(upsert.filter(row => !old.has(row.id)).map(row => row.id));
    const order = naturalOrder.some((id, index) => id !== after[collection][index].id) ? [...current.keys()] : undefined;
    if (upsert.length || remove.length || order) changes[collection] = { upsert, remove, ...(order && { order }) };
  }
  return { format: deltaFormat, changes };
}

export function applyStudioDelta(state, { changes }) {
  if (!object(changes)) throw new Error('Invalid Studio changes');
  const transfer = studioExport(state);
  for (const [collection, change] of Object.entries(changes)) {
    if (!collections.includes(collection) || !object(change) || !Array.isArray(change.remove) || !Array.isArray(change.upsert)) {
      throw new Error('Invalid Studio collection change');
    }
    const { remove, upsert, order } = change;
    const rows = byId(transfer[collection]);
    if (rows.size !== transfer[collection].length) throw new Error('Duplicate Studio record');
    const edited = new Set();
    for (const id of remove) {
      if (!validId(id) || !rows.delete(id)) throw new Error('Invalid Studio removal');
      edited.add(id);
    }
    for (const row of upsert) {
      if (!object(row) || !validId(row.id) || edited.has(row.id)) throw new Error('Invalid Studio update');
      edited.add(row.id);
      rows.set(row.id, row);
    }
    if (order !== undefined && (!Array.isArray(order) || order.length !== rows.size ||
        new Set(order).size !== rows.size || order.some(id => !rows.has(id)))) {
      throw new Error('Invalid Studio collection order');
    }
    transfer[collection] = order ? order.map(id => rows.get(id)) : [...rows.values()];
  }
  return transfer;
}
