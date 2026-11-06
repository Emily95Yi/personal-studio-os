const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const actions = ['remind', 'todo', 'calendar'];
const statuses = ['confirmed', 'export_pending', 'export_launched', 'sync_error'];
const text = (value, max) => typeof value === 'string' && value.length <= max;
const matches = (value, pattern) => typeof value === 'string' && pattern.test(value);
const optional = (value, check) => value === undefined || check(value);
const id = value => matches(value, uuid);
const day = value => matches(value, date) && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const dateTime = value => matches(value, instant) && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z');

function validPlan(row) {
  return text(row.title, 120) && typeof row.paused === 'boolean' &&
    ['one-off', 'recurring', 'quota'].includes(row.kind) &&
    (row.kind === 'one-off' || ['day', 'week', 'month'].includes(row.period)) &&
    (row.kind !== 'recurring' || Number.isInteger(row.interval) && row.interval >= 1 && row.interval <= 999) &&
    (row.kind !== 'quota' || Number.isInteger(row.target) && row.target >= 1 && row.target <= 999) &&
    optional(row.reminder, value => text(value, 100)) && Array.isArray(row.sourceIds) &&
    row.sourceIds.length <= 100 && row.sourceIds.every(value => text(value, 256));
}

function validTask(row, plans) {
  return text(row.title, 120) && day(row.date) && typeof row.done === 'boolean' &&
    optional(row.skipped, value => typeof value === 'boolean') &&
    optional(row.planId, value => plans.has(value)) &&
    optional(row.sourceContentId, value => text(value, 256));
}

// Only these fields cross the CalDAV boundary. Planner links stay in the planner snapshot.
export function scheduleFields(row) {
  if (!row || typeof row !== 'object') return null;
  const { title, notes, location, allDay, start, end } = row;
  const validTime = allDay === true ? day : allDay === false ? dateTime : () => false;
  if (!text(title, 300) || !title.trim() || !text(notes, 8000) || !text(location, 300) ||
      !validTime(start) || !validTime(end) || (allDay ? start >= end : Date.parse(start) >= Date.parse(end))) return null;
  const lines = value => value.replace(/\r\n?/g, '\n');
  return { title: lines(title), notes: lines(notes), location: lines(location), allDay, start, end, timeZone: 'Asia/Tokyo' };
}

function validEvent(row, reviews) {
  const review = reviews.get(row.reviewId);
  return review?.action === 'calendar' && review.taskId === row.taskId &&
    row.timeZone === 'Asia/Tokyo' && statuses.includes(row.status) &&
    optional(row.syncMode, value => value === 'caldav') &&
    optional(row.deviceResult, value => ['added', 'existing'].includes(value)) &&
    text(row.title, 120) && text(row.notes, 700) && text(row.location, 200) && text(row.targetCalendar, 80) &&
    Boolean(scheduleFields(row));
}

export function validSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const maps = {};
  const ids = new Set();
  for (const kind of ['plans', 'tasks', 'completions', 'reviews', 'events']) {
    const rows = snapshot[kind];
    if (!Array.isArray(rows) || rows.length > 500) return false;
    maps[kind] = new Map();
    for (const row of rows) {
      if (!row || !id(row.id) || ids.has(row.id)) return false;
      ids.add(row.id);
      maps[kind].set(row.id, row);
    }
  }
  const onePerTask = rows => new Set(rows.map(row => row.taskId)).size === rows.length;
  return snapshot.plans.every(validPlan) &&
    snapshot.tasks.every(row => validTask(row, maps.plans)) &&
    snapshot.completions.every(row => maps.plans.has(row.planId) && day(row.date) &&
      optional(row.taskId, value => maps.tasks.get(value)?.planId === row.planId)) &&
    onePerTask(snapshot.reviews) && onePerTask(snapshot.events) &&
    snapshot.reviews.every(row => maps.tasks.has(row.taskId) && actions.includes(row.action) && dateTime(row.confirmedAt)) &&
    snapshot.events.every(row => validEvent(row, maps.reviews)) &&
    snapshot.reviews.filter(row => row.action === 'calendar').length === snapshot.events.length &&
    Array.isArray(snapshot.habitDates) && snapshot.habitDates.length <= 500 && snapshot.habitDates.every(day);
}

export async function getPlanner(db, owner) {
  const row = await db.prepare('SELECT revision, snapshot FROM planner_states WHERE owner = ?').bind(owner).first();
  return row ? { revision: row.revision, snapshot: JSON.parse(row.snapshot) } : { revision: 0, snapshot: null };
}

export async function savePlanner(db, owner, revision, snapshot) {
  const body = JSON.stringify(snapshot);
  const result = revision === 0
    ? await db.prepare('INSERT OR IGNORE INTO planner_states (owner, revision, snapshot) VALUES (?, 1, ?)').bind(owner, body).run()
    : await db.prepare('UPDATE planner_states SET revision = revision + 1, snapshot = ? WHERE owner = ? AND revision = ?')
      .bind(body, owner, revision).run();
  return result.meta.changes ? { revision: revision + 1 } : null;
}
