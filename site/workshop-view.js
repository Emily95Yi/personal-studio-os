import { escapeHtml as esc, safeUrl } from './html.js';
import { icon } from './icons.js';
import { boardContentHref, collectionItemAddress, commonResourcesAddress, explorationAddress, href, wikiAddress, workshopEventAddress } from './pages.js';
import { workshopRepository } from './repository.js';
import { contentTitle, currentVersion, imageTypes, objectFor, projectSections, relatedObjects,
  sessionsFor, studioStore } from './studio-data.js';

import { isWorkshopWiki } from './self-board-data.js';
import { tagsFor } from './workshop-library.js';
import { groupEvents, legacyProjectOrder, orderedEvents, orderedProjects, projectKey } from './workshop-event-data.js';
import { chronologicalEvents } from './workshop-event-sort.js';
import { creationForm, eventStatus, orderControls } from './workshop-event-view.js';
import { linkedWorkshopPanel, workshopTabs } from './workshop-library-view.js';

export const objectLabels = { project: 'Project', event: 'Event', discover: 'Self-board', topic: 'Personal Explorations',
  'collection-item': 'Collections', tool: 'Interactive Tool' };
export const eventFields = {
  theme: '本场主题', date: '日期', time: '时间', location: '地点', attendeeCount: '人数', fee: '费用',
};

export function objectHref(type, item) {
  if (type === 'discover') return isWorkshopWiki(item) ? wikiAddress(item.id) : boardContentHref(item.id);
  if (type === 'tool') return href('workshop', 'tools', item.id);
  if (type === 'topic') return explorationAddress(item.id);
  if (type === 'collection-item') return collectionItemAddress(item.id);
  if (type === 'event') return workshopEventAddress(item.id);
  return href('workshop', 'projects', item.id);
}

export function imageUrl(item, urlKey = 'coverUrl') {
  const asset = item.coverAssetId && studioStore.state.assets.find(row => row.id === item.coverAssetId);
  if (asset && imageTypes.includes(asset.mime)) return 'data:' + asset.mime + ';base64,' + asset.data;
  return safeUrl(item[urlKey]);
}

function inline(text, deferImages = false) {
  const tokens = /(!?)\[([^\]\n]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(tokens)) {
    const [raw, image, label, url, code, strong, emphasis] = match;
    result += esc(text.slice(cursor, match.index));
    const link = url && safeUrl(url);
    if (link) {
      result += image
        ? (deferImages ? esc('图片待补' + (label ? ' · ' + label : '')) : '<img loading="lazy" referrerpolicy="no-referrer" src="' + esc(link) + '" alt="' + esc(label) + '">')
        : '<a href="' + esc(link) + '" rel="noreferrer">' + esc(label) + '</a>';
    } else if (code) result += '<code>' + esc(code) + '</code>';
    else if (strong) result += '<strong>' + esc(strong) + '</strong>';
    else if (emphasis) result += '<em>' + esc(emphasis) + '</em>';
    else result += esc(raw);
    cursor = match.index + raw.length;
  }
  return result + esc(text.slice(cursor));
}

export function markdown(body = '', deferImages = false) {
  const renderInline = text => inline(text, deferImages);
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) blocks.push('<p>' + paragraph.map(renderInline).join('<br>') + '</p>');
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
      blocks.push('<h' + level + '>' + renderInline(heading[2]) + '</h' + level + '>');
      continue;
    }
    const list = /^\s*[-*+]\s+(.+)$/.test(line) ? ['ul', /^\s*[-*+]\s+(.+)$/] :
      /^\s*\d+\.\s+(.+)$/.test(line) ? ['ol', /^\s*\d+\.\s+(.+)$/] : null;
    if (list) {
      flush();
      const [tag, pattern] = list;
      const items = [];
      while (i < lines.length && pattern.test(lines[i])) items.push('<li>' + renderInline(pattern.exec(lines[i++])[1]) + '</li>');
      i -= 1;
      blocks.push('<' + tag + '>' + items.join('') + '</' + tag + '>');
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const quotes = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quotes.push(renderInline(lines[i++].replace(/^>\s?/, '')));
      i -= 1;
      blocks.push('<blockquote>' + quotes.join('<br>') + '</blockquote>');
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return '<div class="work-markdown">' + blocks.join('') + '</div>';
}

export function boardBody({ body = '', bodyFormat, mediaSlots }) {
  if (!Array.isArray(mediaSlots) && bodyFormat !== 'text') return markdown(body);
  let displayed = '';
  let cursor = 0;
  const detached = [];
  const pending = (slot, label = slot.placement === 'cover' ? '封面待补' : '图片待补') =>
    [label, slot.alt || slot.name || slot.caption].filter(Boolean).join(' · ');
  const slots = (mediaSlots ?? []).filter(slot => slot?.status === 'pending_upload')
    .sort((a, b) => (a.offset ?? Infinity) - (b.offset ?? Infinity));
  for (const slot of slots) {
    const { offset, length, reference } = slot;
    const text = Number.isInteger(offset) && offset >= cursor && Number.isInteger(length) && length > 0
      ? body.slice(offset, offset + length) : '';
    const inline = slot.placement === 'inline' && offset + length <= body.length &&
      (reference ? text === reference : /^!\[|^<img\b/i.test(text) && /data:/i.test(text));
    if (inline) {
      displayed += body.slice(cursor, offset) + pending(slot).replace(/[\[\]`*<>]/g, '');
      cursor = offset + length;
    } else {
      detached.push(pending(slot, slot.placement === 'attachment' && slot.mime && !slot.mime.startsWith('image/')
        ? '附件待补' : undefined));
    }
  }
  displayed += body.slice(cursor);
  const content = bodyFormat === 'text' ? '<div class="work-markdown"><div class="work-markdown-plain">' +
    esc(displayed) + '</div></div>' : markdown(displayed, slots.some(slot => slot.placement === 'inline'));
  return content + (detached.length ? '<ul class="work-files">' + detached.map(label => '<li>' + esc(label) + '</li>').join('') + '</ul>' : '');
}

export function smallAction(name, label, data = '') {
  return '<button type="button" class="header-icon work-icon" title="' + esc(label) + '" aria-label="' + esc(label) +
    '" ' + data + '>' + icon(name) + '</button>';
}

function action(label, data) {
  return '<button type="button" class="action-button" ' + data + '>' + esc(label) + '</button>';
}

function cover(kind, url) {
  return '<div class="gallery-cover cover-' + kind + '">' +
    (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' :
      '<span aria-hidden="true" class="cover-mark">' + (kind === 'event' ? 'E' : 'P') + '</span>') + '</div>';
}

function galleryCard(type, item) {
  const detail = type === 'event' ? item.date : item.description;
  return '<a class="gallery-card" href="' + objectHref(type, item) + '">' +
    cover(type, imageUrl(item, type === 'event' ? 'posterUrl' : 'coverUrl') || imageUrl(item)) +
    '<div class="gallery-copy"><strong>' + esc(item.title) + '</strong>' +
    (detail ? '<p>' + esc(detail) + '</p>' : '') + (type === 'event' ? '<p class="event-card-tags">' +
      esc([...tagsFor(studioStore.state, item).slice(0, 3).map(tag => '#' + tag), eventStatus(item)].filter(Boolean).join(' · ')) + '</p>' : '') + '</div></a>';
}

function workshopEntries() {
  const entries = [
    [href('workshop', 'projects') + '?view=projects', 'Projects', 'workshop'],
    [commonResourcesAddress(), 'Common Resources', 'file'],
    [href('workshop', 'tools'), 'Interactive Tools', 'auto'],
  ];
  return '<nav class="workspace-entries workshop-entries" aria-label="Workshop 入口">' + entries.map(([url, label, glyph]) =>
    '<a class="workspace-entry" href="' + url + '"><span class="entry-icon">' + icon(glyph, 24) +
    '</span><span class="entry-label">' + label + '</span></a>').join('') + '</nav>';
}

function eventCards(events, kind, projectId = '', { sort = false, projects = [], query = '' } = {}) {
  const matches = (sort ? events : chronologicalEvents(events, studioStore.state.events)).filter(event => [event.title, event.theme, ...tagsFor(studioStore.state, event)]
    .join(' ').toLocaleLowerCase().includes(query));
  const grid = '<div class="gallery-grid poster-grid" data-event-group="' + esc(projectId) + '">';
  return grid + matches.map((event, i) => {
    const move = sort && kind ? orderControls(kind, event, matches, i, { projectId }) : '';
    const group = sort && projects.length ? '<label class="event-group-picker"><span class="visually-hidden">移动 ' +
      esc(event.title) + ' 到 Project</span><select data-event-move-project data-id="' + esc(event.id) + '">' +
      [{ id: '', title: '未分组' }, ...projects].map(project => '<option value="' + esc(project.id) + '"' +
        (project.id === projectKey(event) ? ' selected' : '') + '>' + esc(project.title) + '</option>').join('') + '</select></label>' : '';
    return '<div class="event-card-wrap"' + (sort && kind ? ' data-order-item="' + kind + '" data-id="' + esc(event.id) + '"' : '') +
      '>' + galleryCard('event', event) + (move || group ? '<div class="event-card-tools">' + move + group + '</div>' : '') + '</div>';
  }).join('') + (!matches.length ? '<p class="work-empty">暂无 Event</p>' : '') + '</div>';
}

export function workshopGallery({ collectionId, params }) {
  const state = studioStore.state;
  const projectListRows = workshopRepository.listProjects();
  const legacyOrder = legacyProjectOrder(projectListRows);
  const projects = orderedProjects(projectListRows, legacyOrder);
  const projectList = params?.get('view') === 'projects';
  const grouped = params?.get('view') === 'grouped';
  const sort = params?.get('order') === 'manual';
  const q = params?.get('q') ?? '';
  const path = projectList ? href('workshop', 'projects') : collectionId ? href('workshop', 'projects') : href('workshop');
  const address = (view, reorder = sort) => {
    const query = new URLSearchParams();
    if (view) query.set('view', view);
    if (reorder) query.set('order', 'manual');
    if (q.trim() && !reorder && view !== 'projects') query.set('q', q);
    return path + (query.size ? '?' + query : '');
  };
  const settings = '<details class="workshop-menu"><summary class="header-icon" title="Workshop 设置" aria-label="Workshop 设置">' +
    icon('settings') + '</summary><div><a href="' + href('workshop', 'projects') + '?view=projects">Projects</a>' +
    '<a href="' + href('workshop', 'dictionaries') + '">标签与卡组</a><a href="' + href('workshop', 'import') +
    '">数据迁移</a>' + (legacyOrder.length ? '<button class="text-button" type="button" data-event-import-order>同步本机 Project 排序</button>' : '') +
    '</div></details>';
  const tabs = projectList ? '<a class="return-link" href="' + href('workshop') + '">全部 Events</a>' :
    workshopTabs([['all', '全部', address('')], ['grouped', '按 Project 分组', address('grouped')]],
      grouped ? 'grouped' : 'all', 'Event 排列');
  const heading = '<div class="section-heading work-heading workshop-actions"><h2>' + (projectList ? 'Projects' : 'Events') +
    '</h2><div class="work-actions">' +
    (projectList ? smallAction('add', '新建 Project', 'data-work-record="project"') :
      smallAction('add', '新建 Event', 'data-event-new aria-expanded="false"') +
      smallAction('search', '搜索 Events', 'data-event-search-toggle aria-expanded="' + Boolean(q) + '"')) + settings + '</div></div>' +
    '<div class="event-gallery-controls">' + tabs + '<a class="header-icon' + (sort ? ' event-order-active' : '') +
    '" href="' + esc(address(projectList ? 'projects' : grouped ? 'grouped' : '', !sort)) +
    '" aria-label="' + (sort ? '完成排序' : '手动排序') + '" title="' + (sort ? '完成排序' : '手动排序') + '">' +
    icon(sort ? 'check' : 'grip') + '</a></div>';
  const search = projectList ? '' : '<form class="work-filters event-gallery-search" data-work-filter="' + path +
    '" data-event-search' + (q ? '' : ' hidden') + '><input name="q" type="search" aria-label="搜索 Events" placeholder="搜索 Events" value="' +
    esc(q) + '">' + (grouped ? '<input type="hidden" name="view" value="grouped">' : '') +
    '<button type="submit" class="action-button secondary">搜索</button><a class="return-link" href="' + href('workshop', 'activities') +
    '">高级筛选</a></form>';
  const query = q.trim().toLocaleLowerCase();
  let gallery;
  if (projectList) {
    gallery = projects.length ? '<div class="gallery-grid project-grid">' + projects.map((project, i) =>
      '<div class="event-card-wrap" data-order-item="project" data-id="' + esc(project.id) + '">' + galleryCard('project', project) +
      (sort ? orderControls('project', project, projects, i) : '') + '</div>').join('') + '</div>' :
      '<p class="work-empty">暂无 Project</p>';
  } else if (grouped) {
    gallery = '<div class="project-board event-project-board">' + [...projects, { id: '', title: '未分组' }].map((project, i) => {
      const name = project.id ? '<a href="' + objectHref('project', project) + '">' + esc(project.title) + '</a>' : esc(project.title);
      return '<section class="project-panel" data-event-panel="' + esc(project.id) + '"' +
        (project.id && sort ? ' data-order-item="project" data-id="' + esc(project.id) + '"' : '') + '>' +
        '<div class="project-panel-header"><h3>' + name + '</h3>' + (project.id && sort ? orderControls('project', project, projects, i) : '') +
        '</div>' + eventCards(groupEvents(state, project.id), 'group-event', project.id, { sort, projects, query }) + '</section>';
    }).join('') + '</div>';
  } else {
    gallery = eventCards(orderedEvents(state), 'event', '', { sort, projects, query });
  }
  return (collectionId ? '' : workshopEntries()) + '<section class="event-workspace" data-event-gallery>' + heading +
    (!projectList ? creationForm(state) : '') + search + '<p class="event-save-status" data-order-status role="status"></p>' + gallery + '</section>';
}

export function projectOverview({ project, projectPath, tab = 'events', documentId, versionId }) {
  const events = groupEvents(studioStore.state, project.id);
  const path = href(...projectPath);
  const nav = workshopTabs([
    ['overview', 'Overview', path + '/overview'], ['events', 'Events', path],
    ['linked-resources', 'Linked Resources', path + '/linked-resources'], ['tools', 'Tools', path + '/tools'],
    ['common', 'Project 文档', path + '/common'],
  ], tab, 'Project 视图');
  const actionPanel = '<div class="work-actions">' +
    smallAction('edit', '编辑 Project', 'data-work-record="project" data-record-edit') +
    (tab === 'common' ? action('新建文档', 'data-work-session') : tab === 'events' ? smallAction('add', '新建 Event', 'data-event-new aria-expanded="false"') : '') +
    '</div>';
  const state = studioStore.state;
  const tags = tagsFor(state, project);
  const eventTags = [...new Set(events.flatMap(event => tagsFor(state, event)))];
  const metadata = (project.description ? '<div class="work-reading">' + markdown(project.description) + '</div>' : '') +
    (tags.length ? '<p class="work-meta">Project 标签 · ' + esc(tags.join('、')) + '</p>' : '') +
    (eventTags.length ? '<p class="work-meta">Event 标签汇总 · ' + esc(eventTags.join('、')) + '</p>' : '');
  const gallery = '<p><a class="return-link" href="' + href('workshop', 'activities') + '?' +
    new URLSearchParams({ project: project.id }) + '">筛选本 Project 的活动</a></p>' +
    eventCards(events);
  const panels = {
    overview: metadata + '<div class="work-reading">' + projectDocuments(project.id, { sectionsOnly: ['overview'] }) + '</div>',
    events: (project.description ? '<p class="page-note">' + esc(project.description) + '</p>' : '') + gallery,
    common: '<div class="work-reading">' + projectDocuments(project.id, { documentId, versionId }) +
      relatedPanel('project', project.id, { workshop: false }) + '</div>',
    'linked-resources': linkedWorkshopPanel('project', project, 'wiki'),
    tools: linkedWorkshopPanel('project', project, 'tool'),
  };
  return '<div class="section-heading work-heading workshop-actions">' + nav + actionPanel + '</div>' +
    (tab === 'events' ? creationForm(state, { projectId: project.id }) : '') + panels[tab];
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
  return from + boardBody(version) + attachments(version.assetIds) + provenance(version);
}

function projectDocuments(id, { documentId, versionId, sectionsOnly } = {}) {
  const sessions = sessionsFor(studioStore.state, 'project', id);
  return Object.entries(projectSections).filter(([section]) => !sectionsOnly || sectionsOnly.includes(section)).map(([section, label]) => {
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

export function relatedPanel(type, id, { workshop = true } = {}) {
  const { direct, derived } = relatedObjects(studioStore.state, type, id);
  const visible = row => workshop || (row.type !== 'tool' && !(row.type === 'discover' && isWorkshopWiki(row.item)));
  const label = type === 'tool' ? '关联 Project、Event 与资源' : type === 'discover' ? '内容关联' : '关联 Self-board';
  const entries = direct.filter(visible).map(({ edge, type: key, item }) => '<li><div><a href="' + objectHref(key, item) + '">' +
    esc(contentTitle(item)) + '</a><small>' + objectLabels[key] +
    (edge.relationType === 'related' ? '' : ' · ' + esc(edge.relationType)) + '</small></div><div class="work-actions">' +
    smallAction('edit', '编辑关联', 'data-work-relation="' + esc(edge.id) + '"') +
    smallAction('remove', '移除关联', 'data-work-unlink="' + esc(edge.id) + '"') + '</div></li>');
  const indirect = derived.filter(visible).map(({ type: key, item, via }) => '<li><div><a href="' + objectHref(key, item) + '">' +
    esc(contentTitle(item)) + '</a><small>经由 ' + via.map(event => '<a href="' + objectHref('event', event) + '">' +
    esc(event.title) + '</a>').join('、') + '</small></div></li>');
  return '<section class="work-related"><div class="section-heading work-heading"><h2>' + label + '</h2>' +
    smallAction('add', '新增关联', 'data-work-relation') + '</div>' +
    (entries.length ? '<ul class="work-relations" aria-label="直接关联">' + entries.join('') + '</ul>' : '') +
    (indirect.length ? '<h3>Event 派生关联</h3><ul class="work-relations">' + indirect.join('') + '</ul>' : '') + '</section>';
}
