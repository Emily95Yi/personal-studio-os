/**
 * @typedef {{ id: string, title: string, domains: string[], kind: 'input'|'output',
 * primaryWorkspace?: string, contentType?: string, tags?: string[],
 * category: string, state: string, visibility: string, format?: string,
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

export const studioRepository = {
  list({ domain, kind, query = '' } = {}) {
    const q = query.trim().toLowerCase();
    return content.filter(item => (!domain || item.domains.includes(domain)) &&
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
 * @typedef {{ id: string, title: string, description?: string, resourceModules?: ResourceModule[] }} WorkshopProject
 * @typedef {{ id: string, projectId: string, title: string, theme?: string, date?: string,
 * location?: string, attendeeCount?: number, status?: string,
 * resourceUses?: { resourceId: string, versionId?: string, snapshot?: object }[] }} WorkshopEvent
 * @typedef {{ id: string, projectId: string, moduleId: string, title: string,
 * sourceContentId?: string, versionId?: string }} ProjectResource
 * @typedef {{ id: string, title: string, steps: string[] }} Sop
 * @typedef {{ id: string, title: string, frequency: string }} Habit
 * @typedef {{ id: string, title: string, state: string }} Todo
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
  getEvent(projectId, id) { return events.find(event => event.projectId === projectId && event.id === id); },
  listResources(projectId) { return projectResources.filter(resource => resource.projectId === projectId); },
};
