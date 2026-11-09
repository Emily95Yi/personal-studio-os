import { addDays, dateKey, parseDate, planReminderDates } from './calendar.js';
import { isDiscover, objectFor, relatedObjects, studioStore } from './studio-data.js';

const activities = [];
const stories = [];

export function selfBoardIncludes(item, view) {
  return !item.deletedAt && (item.domains?.includes('Self-Board') || item.primaryWorkspace === 'Self-Board') &&
    (!view || (item.views?.includes(view) ?? view === 'discover'));
}

export const studioRepository = {
  list({ domain, kind, query = '' } = {}) {
    const q = query.trim().toLowerCase();
    return studioStore.state.content.filter(item =>
      !item.deletedAt && (!domain || item.domains?.includes(domain) || item.primaryWorkspace === domain) &&
      (!kind || item.kind === kind) &&
      [item.title, item.category, item.summary, item.description, item.body, item.contentType, item.sourceInfo,
        ...(item.domains ?? []), ...(item.tags ?? [])].join(' ').toLowerCase().includes(q));
  },
  get(id) { return objectFor(studioStore.state, 'discover', id); },
  discover(filters) { return this.list(filters).filter(isDiscover); },
  related(id) { return relatedObjects(studioStore.state, 'discover', id).direct; },
};

export const publicRepository = {
  activities() { return activities; },
  stories() { return stories; },
};

export const workshopRepository = {
  listProjects() { return studioStore.state.projects; },
  getProject(id) { return objectFor(studioStore.state, 'project', id); },
  listEvents(projectId) { return studioStore.state.events.filter(event => event.projectId === projectId); },
  eventsBetween(start, end) {
    return studioStore.state.events.filter(event => /^\d{4}-\d{2}-\d{2}$/.test(event.date) && event.date >= start && event.date <= end);
  },
  getEvent(projectId, id) {
    const event = objectFor(studioStore.state, 'event', id);
    return event?.projectId === projectId ? event : undefined;
  },
};

/**
 * Session-only sandbox. Plans, occurrences and completion history have separate identities.
 * @typedef {{ id: string, title: string, kind: 'one-off'|'recurring'|'quota', paused: boolean,
 * period?: 'day'|'week'|'month', interval?: number, target?: number, periodDays?: number, periodStart?: string,
 * startDate?: string, reminder?: string, handledThrough?: string, snoozedUntil?: string, deletedAt?: string,
 * inboxId?: string, sourceIds: string[] }} AutoPlan
 * @typedef {{ id: string, title: string, date?: string, done: boolean, skipped?: boolean,
 * planId?: string, sourceContentId?: string, autoReminder?: boolean }} PlannedTask
 * @typedef {{ id: string, planId: string, date: string, taskId?: string }} Completion
 */
/** @type {AutoPlan[]} */
const plans = [];
/** @type {PlannedTask[]} */
const tasks = [];
/** @type {Completion[]} */
const completions = [];
const habitDates = new Set();
const reviews = [];
const calendarEvents = [];
const listeners = new Set();

function changed() { for (const listener of listeners) listener(); }

function replace(target, source) {
  target.splice(0, target.length, ...structuredClone(source ?? []));
}

// Keep one pending reminder per plan. Dismissing it advances past today's cycles without a backlog.
function dueReminder(plan, today) {
  if (plan.deletedAt || !plan.startDate || plan.snoozedUntil > today) return null;
  const after = plan.handledThrough ? dateKey(addDays(parseDate(plan.handledThrough), 1)) : plan.startDate;
  const [date] = planReminderDates(plan, after, today, 1);
  return date ? { planId: plan.id, date, title: plan.title, notes: plan.reminder } : null;
}

function removeTasks(ids) {
  replace(tasks, tasks.filter(task => !ids.has(task.id)));
  replace(reviews, reviews.filter(review => !ids.has(review.taskId)));
  for (const event of calendarEvents) {
    if (!ids.has(event.taskId)) continue;
    delete event.taskId;
    delete event.reviewId;
  }
  replace(completions, completions.filter(item => !ids.has(item.taskId)));
}

export const plannerRepository = {
  onChange(listener) { listeners.add(listener); },
  snapshot() { return structuredClone({ plans, tasks, completions, reviews, events: calendarEvents, habitDates: [...habitDates] }); },
  restore(snapshot) {
    replace(plans, snapshot?.plans);
    replace(tasks, snapshot?.tasks);
    replace(completions, snapshot?.completions);
    replace(reviews, snapshot?.reviews);
    replace(calendarEvents, snapshot?.events);
    habitDates.clear();
    for (const date of snapshot?.habitDates ?? []) habitDates.add(date);
  },
  getReview(taskId) {
    const review = reviews.find(row => row.taskId === taskId);
    return review && { ...review };
  },
  calendarEvents() { return calendarEvents.map(event => ({ ...event })); },
  eventForTask(taskId) {
    const event = calendarEvents.find(row => row.taskId === taskId);
    return event && { ...event };
  },
  confirmReview(taskId, action, details) {
    const task = this.getTask(taskId);
    if (!task || task.skipped || this.eventForTask(taskId) || !['remind', 'todo', 'calendar'].includes(action) ||
        (action === 'calendar' && !details)) return null;
    const previous = reviews.find(row => row.taskId === taskId);
    const review = { id: previous?.id ?? crypto.randomUUID(), taskId, action, confirmedAt: new Date().toISOString() };
    if (previous) Object.assign(previous, review);
    else reviews.push(review);
    const event = action === 'calendar' ? {
      ...details, id: crypto.randomUUID(), taskId, reviewId: review.id,
      title: task.title, status: 'export_pending', timeZone: 'Asia/Tokyo',
    } : null;
    if (event) calendarEvents.push(event);
    changed();
    return { review: { ...review }, event: event && { ...event } };
  },
  dueReminders(today = dateKey()) {
    return plans.map(plan => dueReminder(plan, today)).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  },
  getReminder(planId, date, today = dateKey()) {
    const plan = plans.find(item => item.id === planId);
    const reminder = plan && dueReminder(plan, today);
    return reminder?.date === date ? reminder : null;
  },
  deferReminder(planId, date, days, today = dateKey()) {
    if (!this.getReminder(planId, date, today) || !Number.isSafeInteger(days) || days < 1) return false;
    const until = dateKey(addDays(parseDate(today), days));
    if (!parseDate(until)) return false;
    plans.find(plan => plan.id === planId).snoozedUntil = until;
    changed();
    return true;
  },
  dismissReminder(planId, date, today = dateKey()) {
    if (!this.getReminder(planId, date, today)) return false;
    const plan = plans.find(item => item.id === planId);
    plan.handledThrough = today;
    delete plan.snoozedUntil;
    changed();
    return true;
  },
  saveCalendarEvent(details, { convertTaskId } = {}) {
    const title = details?.title?.trim();
    if (!title || title.length > 120) return null;
    if (convertTaskId && !tasks.some(task => task.id === convertTaskId && !task.autoReminder)) return null;
    const event = { ...details, title, id: crypto.randomUUID(), status: 'export_pending', timeZone: 'Asia/Tokyo' };
    calendarEvents.push(event);
    if (convertTaskId) {
      // Keep plan completion history after moving the task out of the list.
      for (const completion of completions) {
        if (completion.taskId === convertTaskId) delete completion.taskId;
      }
      removeTasks(new Set([convertTaskId]));
    }
    changed();
    return { ...event };
  },
  updateCalendarDraft(id, details) {
    const event = calendarEvents.find(row => row.id === id);
    if (!event || event.syncMode !== 'caldav') return null;
    for (const key of ['start', 'end', 'allDay', 'location', 'notes']) event[key] = details[key];
    if (details.title) event.title = details.title;
    changed();
    return { ...event };
  },
  markDeviceResult(id, result) {
    const event = calendarEvents.find(row => row.id === id);
    if (event?.status !== 'export_launched' || !['added', 'existing'].includes(result)) return;
    event.deviceResult = result;
    changed();
  },
  markEvent(id, status) {
    if (!['export_pending', 'export_launched', 'sync_error'].includes(status)) return;
    const event = calendarEvents.find(row => row.id === id);
    if (event && event.status !== status) {
      event.status = status;
      changed();
    }
  },
  listPlans() { return plans.filter(plan => !plan.deletedAt).map(plan => ({ ...plan, sourceIds: [...plan.sourceIds] })); },
  getPlan(id) { return this.listPlans().find(plan => plan.id === id); },
  trashedPlans() {
    return plans.filter(plan => plan.deletedAt).map(({ id, title, deletedAt }) => ({ id, title, deletedAt }));
  },
  setPlanTrashed(id, trashed) {
    const plan = plans.find(item => item.id === id);
    if (!plan || Boolean(plan.deletedAt) === trashed) return false;
    if (trashed) plan.deletedAt = new Date().toISOString();
    else delete plan.deletedAt;
    changed();
    return true;
  },
  clearPlanTrash() {
    const ids = new Set(plans.filter(plan => plan.deletedAt).map(plan => plan.id));
    if (!ids.size) return;
    removeTasks(new Set(tasks.filter(task => ids.has(task.planId)).map(task => task.id)));
    replace(completions, completions.filter(item => !ids.has(item.planId)));
    replace(plans, plans.filter(plan => !ids.has(plan.id)));
    changed();
  },
  savePlan(input) {
    const index = input.id ? plans.findIndex(plan => plan.id === input.id) : -1;
    if (input.id && (index === -1 || plans[index].deletedAt)) return undefined;
    const title = input.title.trim();
    if (!title || !['one-off', 'recurring', 'quota'].includes(input.kind)) return undefined;
    if (input.startDate !== undefined && !parseDate(input.startDate)) return undefined;
    if (input.kind === 'one-off' && input.id && this.tasksForPlan(input.id).filter(task => !task.skipped).length > 1) return undefined;
    if (input.kind !== 'one-off' && !['day', 'week', 'month'].includes(input.period)) return undefined;
    if (input.kind === 'recurring' && (!Number.isSafeInteger(input.interval) || input.interval < 1)) return undefined;
    if (input.kind === 'quota' && (!Number.isInteger(input.target) || input.target < 1 || input.target > 999)) return undefined;
    const { periodDays = 1, periodStart: _periodStart, ...fields } = input;
    const previous = plans[index];
    let cycle;
    if (input.kind === 'quota' && input.period === 'day') {
      if (!Number.isSafeInteger(periodDays) || periodDays < 1) return undefined;
      cycle = { periodDays, periodStart: input.startDate ?? (previous?.periodDays === periodDays ? previous.periodStart : dateKey()) };
    }
    const plan = {
      ...fields, ...cycle, title, id: input.id ?? crypto.randomUUID(),
      paused: plans[index]?.paused ?? false, sourceIds: [...new Set(input.sourceIds ?? [])],
    };
    const sameRule = previous && ['kind', 'period', 'startDate', 'interval', 'periodDays'].every(key =>
      previous[key] === plan[key]);
    if (sameRule) {
      plan.handledThrough = previous.handledThrough;
      plan.snoozedUntil = previous.snoozedUntil;
    }
    if (index === -1) plans.unshift(plan);
    else {
      plans.splice(index, 1);
      plans.unshift(plan);
    }
    changed();
    return this.getPlan(plan.id);
  },
  togglePause(id) {
    const plan = plans.find(entry => entry.id === id && !entry.deletedAt);
    if (plan) {
      plan.paused = !plan.paused;
      changed();
    }
  },
  listTasks() {
    const trashed = new Set(plans.filter(plan => plan.deletedAt).map(plan => plan.id));
    return tasks.filter(task => !task.autoReminder && !task.skipped && !trashed.has(task.planId)).map(task => ({ ...task }));
  },
  tasksForPlan(id) { return tasks.filter(task => task.planId === id && !task.autoReminder).map(task => ({ ...task })); },
  standaloneTasks() { return tasks.filter(task => !task.planId).map(task => ({ ...task })); },
  getTask(id) {
    const task = tasks.find(entry => entry.id === id);
    return task && { ...task };
  },
  removeTask(id) {
    if (!tasks.some(task => task.id === id && !task.autoReminder)) return false;
    removeTasks(new Set([id]));
    changed();
    return true;
  },
  saveTask({ id, title, date, done, planId, completedOn, sourceContentId }) {
    const existing = tasks.find(task => task.id === id);
    if ((id && !existing) || (date !== undefined && !parseDate(date))) return undefined;
    const owner = existing ? existing.planId : planId;
    const plan = owner ? this.getPlan(owner) : undefined;
    if (!existing && planId && (!plan || plan.paused ||
      (plan.kind === 'one-off' && this.tasksForPlan(planId).some(task => !task.skipped)))) return undefined;
    const task = { ...existing, id: existing?.id ?? crypto.randomUUID(), title: title.trim(),
      done: Boolean(done) && !existing?.skipped, planId: owner };
    if (date !== undefined) task.date = date;
    if (sourceContentId === '') delete task.sourceContentId;
    else if (sourceContentId && (plan?.sourceIds.includes(sourceContentId) || existing?.sourceContentId === sourceContentId)) {
      task.sourceContentId = sourceContentId;
    }
    if (!task.title) return undefined;
    if (existing) Object.assign(existing, task);
    else tasks.push(task);
    if (task.planId && task.done && !completions.some(entry => entry.taskId === task.id) && completedOn) {
      completions.push({ id: crypto.randomUUID(), planId: task.planId, taskId: task.id, date: completedOn });
    }
    if (!task.done) {
      const index = completions.findIndex(entry => entry.taskId === task.id);
      if (index !== -1) completions.splice(index, 1);
    }
    changed();
    return { ...task };
  },
  toggleSkip(id) {
    const task = tasks.find(entry => entry.id === id);
    if (!task || task.done) return false;
    if (task.skipped && this.getPlan(task.planId)?.kind === 'one-off' &&
        tasks.some(entry => entry.planId === task.planId && entry.id !== task.id && !entry.autoReminder && !entry.skipped)) return false;
    task.skipped = !task.skipped;
    changed();
    return true;
  },
  recordCompletion(planId, date) {
    if (plans.some(plan => plan.id === planId && !plan.paused && plan.kind !== 'one-off')) {
      completions.push({ id: crypto.randomUUID(), planId, date });
      changed();
    }
  },
  undoCompletion(planId) {
    const index = completions.findLastIndex(entry => entry.planId === planId && !entry.taskId);
    if (index !== -1) {
      completions.splice(index, 1);
      changed();
    }
  },
  completionsForPlan(planId) { return completions.filter(entry => entry.planId === planId).map(entry => ({ ...entry })); },
  checkInsBetween(start, end) {
    return [...habitDates].filter(date => date >= start && date <= end).sort();
  },
  toggleCheckIn(date) {
    if (habitDates.has(date)) habitDates.delete(date);
    else habitDates.add(date);
    changed();
  },
};
