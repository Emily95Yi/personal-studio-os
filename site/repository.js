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
