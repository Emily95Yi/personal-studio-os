/**
 * @typedef {{ id: string, title: string, domains: string[], kind: 'input'|'output',
 * primaryWorkspace?: string, contentType?: string, tags?: string[], views?: string[],
 * category: string, state: string, visibility: string, format?: string, coverUrl?: string,
 * date: string, description: string }} StudioContent
 * @typedef {[sourceId: string, targetId: string, label: string]} Relation
 * @typedef {{ id: string, title: string, subtitle: string, type: string,
 * time: string, place: string, description: string }} Activity
 * @typedef {{ id: string, title: string, category: string, time: string,
 * description: string }} Story
 */

/** @type {StudioContent[]} */
const content = [];
/** @type {Relation[]} */
const relations = [];
/** @type {Activity[]} */
const activities = [];
/** @type {Story[]} */
const stories = [];

export function selfBoardIncludes(item, view) {
  return (item.domains.includes('Self-Board') || item.primaryWorkspace === 'Self-Board') &&
    (!view || (item.views?.includes(view) ?? view === 'discover'));
}

export const studioRepository = {
  list({ domain, kind, query = '' } = {}) {
    const q = query.trim().toLowerCase();
    return content.filter(item => (!domain || item.domains.includes(domain) || item.primaryWorkspace === domain) &&
      (!kind || item.kind === kind) &&
      [item.title, item.category, item.description, ...item.domains].join(' ').toLowerCase().includes(q));
  },
  get(id) { return content.find(item => item.id === id); },
  related(id) {
    return relations.filter(row => row[0] === id || row[1] === id).map(([source, target, label]) => ({
      item: this.get(source === id ? target : source), label, incoming: target === id,
    }));
  },
};

export const publicRepository = {
  activities() { return activities; },
  stories() { return stories; },
};

/**
 * @typedef {{ id: string, label: string, zh?: string }} ResourceModule
 * @typedef {{ id: string, title: string, description?: string, coverUrl?: string, resourceModules?: ResourceModule[] }} WorkshopProject
 * @typedef {{ id: string, projectId: string, title: string, theme?: string, date?: string,
 * location?: string, attendeeCount?: number, status?: string, posterUrl?: string,
 * flow?: string, reflection?: string, media?: { url: string, label: string }[],
 * resourceUses?: { resourceId: string, versionId?: string, snapshot?: object }[] }} WorkshopEvent
 * @typedef {{ id: string, projectId: string, moduleId: string, title: string,
 * sourceContentId?: string, versionId?: string }} ProjectResource
 */

/** @type {WorkshopProject[]} */
const projects = [];
/** @type {WorkshopEvent[]} */
const events = [];
/** @type {ProjectResource[]} */
const projectResources = [];

export const workshopRepository = {
  listProjects() { return projects.slice(); },
  getProject(id) { return projects.find(project => project.id === id); },
  listEvents(projectId) { return events.filter(event => event.projectId === projectId); },
  eventsBetween(start, end) {
    return events.filter(event => /^\d{4}-\d{2}-\d{2}$/.test(event.date) && event.date >= start && event.date <= end);
  },
  getEvent(projectId, id) { return events.find(event => event.projectId === projectId && event.id === id); },
  listResources(projectId) { return projectResources.filter(resource => resource.projectId === projectId); },
};

/**
 * Session-only sandbox. Plans, occurrences and completion history have separate identities.
 * @typedef {{ id: string, title: string, kind: 'one-off'|'recurring'|'quota', paused: boolean,
 * period?: 'day'|'week'|'month', interval?: number, target?: number, reminder?: string, sourceIds: string[] }} AutoPlan
 * @typedef {{ id: string, title: string, date: string, done: boolean, skipped?: boolean,
 * planId?: string, sourceContentId?: string }} PlannedTask
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
  listPlans() { return plans.map(plan => ({ ...plan, sourceIds: [...plan.sourceIds] })); },
  getPlan(id) { return this.listPlans().find(plan => plan.id === id); },
  savePlan(input) {
    const index = input.id ? plans.findIndex(plan => plan.id === input.id) : -1;
    if (input.id && index === -1) return undefined;
    const title = input.title.trim();
    if (!title || !['one-off', 'recurring', 'quota'].includes(input.kind)) return undefined;
    if (input.kind === 'one-off' && input.id && this.tasksForPlan(input.id).filter(task => !task.skipped).length > 1) return undefined;
    if (input.kind !== 'one-off' && !['day', 'week', 'month'].includes(input.period)) return undefined;
    if (input.kind === 'recurring' && (!Number.isInteger(input.interval) || input.interval < 1 || input.interval > 999)) return undefined;
    if (input.kind === 'quota' && (!Number.isInteger(input.target) || input.target < 1 || input.target > 999)) return undefined;
    const plan = {
      ...input, title, id: input.id ?? crypto.randomUUID(),
      paused: plans[index]?.paused ?? false, sourceIds: [...new Set(input.sourceIds ?? [])],
    };
    if (index === -1) plans.unshift(plan);
    else {
      plans.splice(index, 1);
      plans.unshift(plan);
    }
    changed();
    return this.getPlan(plan.id);
  },
  togglePause(id) {
    const plan = plans.find(entry => entry.id === id);
    if (plan) {
      plan.paused = !plan.paused;
      changed();
    }
  },
  tasksBetween(start, end) {
    return tasks.filter(task => !task.skipped && task.date >= start && task.date <= end).map(task => ({ ...task }));
  },
  tasksForPlan(id) { return tasks.filter(task => task.planId === id).map(task => ({ ...task })); },
  standaloneTasks() { return tasks.filter(task => !task.planId).map(task => ({ ...task })); },
  getTask(id) {
    const task = tasks.find(entry => entry.id === id);
    return task && { ...task };
  },
  saveTask({ id, title, date, done, planId, completedOn, sourceContentId }) {
    const existing = tasks.find(task => task.id === id);
    if (id && !existing) return undefined;
    const owner = existing ? existing.planId : planId;
    const plan = owner ? this.getPlan(owner) : undefined;
    if (!existing && planId && (!plan || plan.paused ||
      (plan.kind === 'one-off' && this.tasksForPlan(planId).some(task => !task.skipped)))) return undefined;
    const task = { ...existing, id: existing?.id ?? crypto.randomUUID(), title: title.trim(), date,
      done: Boolean(done) && !existing?.skipped, planId: owner };
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
        tasks.some(entry => entry.planId === task.planId && entry.id !== task.id && !entry.skipped)) return false;
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
