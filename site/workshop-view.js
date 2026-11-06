import { escapeHtml as esc, safeUrl } from './html.js';
import { icon } from './icons.js';
import { boardContentHref, href } from './pages.js';
import { workshopRepository } from './repository.js';
import { contentTitle, currentVersion, eventSections, imageTypes, objectFor, projectSections, relatedObjects,
  reusableFor, sessionsFor, studioStore } from './studio-data.js';

export const objectLabels = { project: 'Project', event: 'Event', discover: 'Self-board' };
export const eventFields = {
  theme: '本场主题', date: '日期', time: '时间', location: '地点', attendeeCount: '人数', fee: '费用',
};

export function objectHref(type, item) {
  if (type === 'discover') return boardContentHref(item.id);
  if (type === 'event') return href('workshop', 'projects', item.projectId, 'events', item.id);
  return href('workshop', 'projects', item.id);
}

export function imageUrl(item, urlKey = 'coverUrl') {
  const asset = item.coverAssetId && studioStore.state.assets.find(row => row.id === item.coverAssetId);
  if (asset && imageTypes.includes(asset.mime)) return 'data:' + asset.mime + ';base64,' + asset.data;
  return safeUrl(item[urlKey]);
}

function inline(text) {
  const tokens = /(!?)\[([^\]\n]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(tokens)) {
    const [raw, image, label, url, code, strong, emphasis] = match;
    result += esc(text.slice(cursor, match.index));
    const link = url && safeUrl(url);
    if (link) {
      result += image
        ? '<img loading="lazy" referrerpolicy="no-referrer" src="' + esc(link) + '" alt="' + esc(label) + '">'
        : '<a href="' + esc(link) + '" rel="noreferrer">' + esc(label) + '</a>';
    } else if (code) result += '<code>' + esc(code) + '</code>';
    else if (strong) result += '<strong>' + esc(strong) + '</strong>';
    else if (emphasis) result += '<em>' + esc(emphasis) + '</em>';
    else result += esc(raw);
    cursor = match.index + raw.length;
  }
  return result + esc(text.slice(cursor));
}

export function markdown(body = '') {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) blocks.push('<p>' + paragraph.map(inline).join('<br>') + '</p>');
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) { flush(); continue; }
    if (/^\s*```/.test(line)) {
      flush();
      const code = [];
      while (++i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i]);
      blocks.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length + 2, 6);
      blocks.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>');
      continue;
    }
    const list = /^\s*[-*+]\s+(.+)$/.test(line) ? ['ul', /^\s*[-*+]\s+(.+)$/] :
      /^\s*\d+\.\s+(.+)$/.test(line) ? ['ol', /^\s*\d+\.\s+(.+)$/] : null;
    if (list) {
      flush();
      const [tag, pattern] = list;
      const items = [];
      while (i < lines.length && pattern.test(lines[i])) items.push('<li>' + inline(pattern.exec(lines[i++])[1]) + '</li>');
      i -= 1;
      blocks.push('<' + tag + '>' + items.join('') + '</' + tag + '>');
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const quotes = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quotes.push(inline(lines[i++].replace(/^>\s?/, '')));
      i -= 1;
      blocks.push('<blockquote>' + quotes.join('<br>') + '</blockquote>');
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return '<div class="work-markdown">' + blocks.join('') + '</div>';
}

export function smallAction(name, label, data = '') {
  return '<button type="button" class="header-icon work-icon" title="' + esc(label) + '" aria-label="' + esc(label) +
    '" ' + data + '>' + icon(name) + '</button>';
}

function action(label, data) {
  return '<button type="button" class="action-button" ' + data + '>' + esc(label) + '</button>';
}

function linkIcon(name, label, address) {
  return '<a class="header-icon work-icon" href="' + address + '" title="' + esc(label) + '" aria-label="' + esc(label) +
    '">' + icon(name) + '</a>';
}

function cover(kind, url) {
  return '<div class="gallery-cover cover-' + kind + '">' +
    (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' :
      '<span aria-hidden="true" class="cover-mark">' + (kind === 'event' ? 'E' : 'P') + '</span>') + '</div>';
}

function galleryCard(type, item) {
  const detail = type === 'event' ? item.date : item.description;
  return '<a class="gallery-card" href="' + objectHref(type, item) + '">' +
    cover(type, imageUrl(item, type === 'event' ? 'posterUrl' : 'coverUrl')) +
    '<div class="gallery-copy"><strong>' + esc(item.title) + '</strong>' +
    (detail ? '<p>' + esc(detail) + '</p>' : '') + '</div></a>';
}

export function workshopGallery() {
  const projects = workshopRepository.listProjects();
  return '<section aria-label="Project Gallery"><div class="section-heading work-heading"><h2>Projects</h2>' +
    '<div class="work-actions">' + linkIcon('import', '数据迁移', href('workshop', 'import')) +
    action('新建 Project', 'data-work-record="project"') + '</div></div>' +
    (projects.length ? '<div class="gallery-grid project-grid">' + projects.map(project => galleryCard('project', project)).join('') +
      '</div>' : '<p class="work-empty">暂无 Project</p>') + '</section>';
}

export function projectOverview({ project, projectPath, tab, documentId, versionId }) {
  const common = tab === 'common';
  const events = workshopRepository.listEvents(project.id);
  const current = active => active ? ' aria-current="page"' : '';
  const nav = '<div class="section-heading work-heading"><nav class="segmented work-tabs" aria-label="Project 视图">' +
    '<a href="' + href(...projectPath) + '"' + current(!common) + '>Events</a><a href="' + href(...projectPath, 'common') +
    '"' + current(common) + '>共通内容</a></nav><div class="work-actions">' +
    smallAction('edit', '编辑 Project', 'data-work-record="project" data-record-edit') +
    (common ? action('新建文档', 'data-work-session') : action('新建 Event', 'data-work-record="event"')) + '</div></div>';
  return nav + (project.description ? '<p class="page-note">' + esc(project.description) + '</p>' : '') + (common
    ? '<div class="work-reading">' + documents('project', project.id, { documentId, versionId }) + relatedPanel('project', project.id) + '</div>'
    : (events.length ? '<div class="gallery-grid poster-grid">' + events.map(event => galleryCard('event', event)).join('') +
      '</div>' : '<p class="work-empty">暂无 Event</p>'));
}

export function eventDetail({ event }) {
  const poster = imageUrl(event, 'posterUrl');
  const fields = Object.entries(eventFields).filter(([key]) => event[key] != null && event[key] !== '')
    .map(([key, label]) => '<div><dt>' + label + '</dt><dd>' + esc(event[key]) + '</dd></div>').join('');
  return '<div class="event-hero' + (poster ? ' has-poster' : '') + '">' +
    (poster ? '<img class="event-poster" src="' + esc(poster) + '" alt="活动海报" referrerpolicy="no-referrer">' : '') +
    '<div><div class="section-heading work-heading"><h2>Overview</h2>' +
    smallAction('edit', '编辑 Event', 'data-work-record="event" data-record-edit') + '</div>' +
    (fields ? '<dl class="event-fields">' + fields + '</dl>' : '') + '</div></div>' +
    '<div class="work-reading"><div class="section-heading work-heading"><h2>本场内容</h2><div class="work-actions">' +
    (reusableFor(studioStore.state, event.projectId).length ? smallAction('link', '采用 Project 共通内容', 'data-work-adopt') : '') +
    action('新建文档', 'data-work-session') + '</div></div>' + documents('event', event.id) +
    relatedPanel('event', event.id) + '</div>';
}

export function timestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-Hans', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function attachments(ids = []) {
  if (!ids.length) return '';
  return '<ul class="work-files">' + ids.map(id => {
    const asset = studioStore.state.assets.find(row => row.id === id);
    return asset ? '<li><button class="text-button" type="button" data-work-download="' + esc(id) + '">' +
      esc(asset.name) + '</button></li>' : '';
  }).join('') + '</ul>';
}

export function provenance(item) {
  const url = safeUrl(item.sourceUrl);
  return (item.sourceInfo ? '<p class="work-meta">' + esc(item.sourceInfo) + '</p>' : '') +
    (url ? '<p class="work-meta"><a href="' + esc(url) + '" rel="noreferrer">来源 ' + icon('arrow', 12) + '</a></p>' : '');
}

export function documentVersion(version) {
  const source = version.source;
  const original = source && studioStore.state.sessions.find(session => session.id === source.sessionId);
  const reference = original?.versions.find(item => item.id === source.versionId);
  const project = original && objectFor(studioStore.state, 'project', original.ownerId);
  const sourceLink = project && href('workshop', 'projects', project.id, 'common') + '?' +
    new URLSearchParams({ document: original.id, version: source.versionId });
  const from = reference && project ? '<p class="work-meta">' + (source.mode === 'custom' ? '本场版本 · 基于 ' : '采用 ') +
    '<a href="' + esc(sourceLink) + '">' + esc(reference.title) + '</a> · ' +
    esc(timestamp(reference.createdAt)) + '</p>' : '';
  return from + markdown(version.body) + attachments(version.assetIds) + provenance(version);
}

function documents(type, id, { documentId, versionId } = {}) {
  const sections = type === 'project' ? projectSections : eventSections;
  const sessions = sessionsFor(studioStore.state, type, id);
  return Object.entries(sections).map(([section, label]) => {
    const group = sessions.filter(item => item.section === section);
    if (!group.length) return '';
    return '<section class="work-document-group"><h2>' + label + '</h2>' + group.map(session => {
      const version = currentVersion(session);
      const key = esc(session.id);
      const compare = session.adoptedFrom ? smallAction('link', '比较 Project 版本', 'data-work-adopt="' + esc(session.adoptedFrom) + '"') : '';
      const previous = session.versions.filter(row => row.id !== version.id).reverse();
      const selected = session.id === documentId;
      const showHistory = selected && previous.some(row => row.id === versionId);
      const history = previous.length ? '<details class="work-history"' + (showHistory ? ' open' : '') +
        '><summary>历史版本 (' + previous.length + ')</summary>' + previous.map(row =>
          '<details' + (selected && versionId === row.id ? ' open' : '') + '><summary>' + esc(row.title) +
          (row.createdAt ? ' · ' + esc(timestamp(row.createdAt)) : '') + '</summary>' + documentVersion(row) +
          '</details>').join('') + '</details>' : '';
      return '<details class="work-document" data-work-document="' + key + '"' +
        (selected ? ' open data-work-selected' : '') + '><summary>' + esc(version.title) + '</summary>' +
        '<div class="work-document-body"><div class="section-heading work-heading"><small class="work-meta">当前版本' +
        (version.createdAt ? ' · ' + esc(timestamp(version.createdAt)) : '') + '</small><div class="work-actions">' + compare +
        smallAction('edit', '编辑文档', 'data-work-session="' + key + '"') + '</div></div>' +
        documentVersion(version) + history + '</div></details>';
    }).join('') + '</section>';
  }).join('');
}

export function relatedPanel(type, id) {
  const { direct, derived } = relatedObjects(studioStore.state, type, id);
  const label = type === 'discover' ? '内容关联' : '关联 Self-board';
  const entries = direct.map(({ edge, type: key, item }) => '<li><div><a href="' + objectHref(key, item) + '">' +
    esc(contentTitle(item)) + '</a><small>' + objectLabels[key] +
    (edge.relationType === 'related' ? '' : ' · ' + esc(edge.relationType)) + '</small></div><div class="work-actions">' +
    smallAction('edit', '编辑关联', 'data-work-relation="' + esc(edge.id) + '"') +
    smallAction('remove', '移除关联', 'data-work-unlink="' + esc(edge.id) + '"') + '</div></li>');
  const indirect = derived.map(({ item, via }) => '<li><div><a href="' + objectHref('discover', item) + '">' +
    esc(contentTitle(item)) + '</a><small>经由 ' + via.map(event => '<a href="' + objectHref('event', event) + '">' +
    esc(event.title) + '</a>').join('、') + '</small></div></li>');
  return '<section class="work-related"><div class="section-heading work-heading"><h2>' + label + '</h2>' +
    smallAction('add', '新增关联', 'data-work-relation') + '</div>' +
    (entries.length ? '<ul class="work-relations" aria-label="直接关联">' + entries.join('') + '</ul>' : '') +
    (indirect.length ? '<h3>Event 派生关联</h3><ul class="work-relations">' + indirect.join('') + '</ul>' : '') + '</section>';
}
