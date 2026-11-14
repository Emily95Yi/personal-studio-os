import { workshopTools } from './workshop-external-tools.js';
import { escapeHtml as esc, safeUrl } from './html.js';
import { studioDialog } from './studio-dialog.js';
import { commonResourcesAddress, readRoute, wikiAddress } from './pages.js';
import { contentTitle, addAsset, adoptVersion, currentVersion, eventSections, imageTypes, maxAssetBytes, projectSections,
  objectFor, relationCandidates, relatedObjects, removeRelation, reusableFor, saveDiscover, saveEvent, saveProject, saveRelation,
  saveSession, sessionsFor, studioStore, studioTags, validImage } from './studio-data.js';
import { boardContent, canAddSubfolder, discoverCategory, isWorkshopWikiCategory, saveBoardFolder, toggleBoardFolderPin,
  workshopWikiCategories } from './self-board-data.js';
import { cardRoles, eventFormats, linkWiki, publicationProjection, saveCardSet, saveInteractiveTool, saveWiki, saveWorkshopTag,
  setWikiStatus, toolTypes, toolVisibility, wikiRecords, wikiStatus, wikiStatuses, workshopLinks } from './workshop-library.js';
import { documentVersion, eventFields, objectHref, objectLabels, timestamp } from './workshop-view.js';

const recordTypes = { project: 'Project', event: 'Event', discover: '资料' };
const textField = (key, label, value, options = '') =>
  '<label>' + label + '<input name="' + key + '" value="' + esc(value ?? '') + '" ' + options + '></label>';
const textarea = (key, label, value, rows = 6) =>
  '<label>' + label + '<textarea name="' + key + '" rows="' + rows + '">' + esc(value ?? '') + '</textarea></label>';
const option = (value, label) => '<option value="' + esc(value) + '">' + esc(label) + '</option>';

function owner(route) {
  if (route.type === 'workshop-tool') return { type: 'tool', item: route.tool };
  if (route.type === 'event') return { type: 'event', item: route.event };
  if (route.type === 'project') return { type: 'project', item: route.project };
  return { type: 'discover', item: route.record };
}

function fileField(label, name, accept = '', multiple = false) {
  return '<label>' + label + '<input type="file" name="' + name + '"' +
    (accept ? ' accept="' + accept + '"' : '') + (multiple ? ' multiple' : '') + '></label>';
}

export function retainedFiles(ids = []) {
  return ids.map(id => {
    const asset = studioStore.state.assets.find(item => item.id === id);
    return asset ? '<label class="work-check"><input type="checkbox" checked name="retainAsset" value="' + esc(id) + '">' +
      esc(asset.name) + '</label>' : '';
  }).join('');
}

function coverFields(item, isEvent) {
  const urlKey = isEvent ? 'posterUrl' : 'coverUrl';
  const label = isEvent ? '海报' : '封面';
  return '<div class="work-form-pair">' + textField(urlKey, label + '链接', item[urlKey], 'placeholder="https://"') +
    fileField(label + '文件', 'cover', imageTypes.join(',')) + '</div>' +
    (item.coverAssetId ? '<label class="work-check"><input type="checkbox" name="clearCover">移除已上传图片</label>' : '');
}

const choices = (rows, current) => rows.map(([value, label]) =>
  '<option value="' + esc(value) + '"' + (value === current ? ' selected' : '') + '>' + esc(label) + '</option>').join('');
const selectField = (name, label, rows, current) => '<label>' + label + '<select name="' + name + '">' +
  choices(rows, current) + '</select></label>';
const checkField = (name, value, label, checked) => '<label class="work-check"><input type="checkbox" name="' + name +
  '" value="' + esc(value) + '"' + (checked ? ' checked' : '') + '>' + esc(label) + '</label>';

function recordTags(item) {
  const dictionary = studioStore.state.workshopTags;
  return '<fieldset class="work-choices"><legend>统一标签</legend>' +
    dictionary.map(tag => checkField('tagId', tag.id, tag.title, item.tagIds?.includes(tag.id))).join('') +
    textField('newTags', '添加标签到字典', '', 'placeholder="用逗号分隔"') +
    (item.tags?.length ? '<p class="work-meta">原标签 · ' + esc(item.tags.join('、')) + '</p>' : '') + '</fieldset>';
}

function activityFields(item) {
  const cards = studioStore.state.cardSets;
  return '<fieldset class="work-choices"><legend>活动形式</legend>' +
    Object.entries(eventFormats).map(([id, label]) => checkField('format', id, label, item.formats?.includes(id))).join('') +
    '</fieldset><fieldset class="work-choices"><legend>本场使用的卡组</legend>' + cards.map(card => {
      const use = item.cardUses?.find(row => row.cardSetId === card.id);
      return '<div class="work-form-pair">' + selectField('role-' + esc(card.id), esc(card.title),
        [['', '未使用'], ...Object.entries(cardRoles)], use?.role ?? '') +
        textField('note-' + esc(card.id), '使用说明', use?.usageNote, 'maxlength="1000"') + '</div>';
    }).join('') +
    textField('cardTitle', '登记并使用新卡组', '', 'maxlength="80"') +
    '<div class="work-form-pair">' + selectField('cardRole', '新卡组角色', Object.entries(cardRoles), 'primary') +
    textField('cardNote', '使用说明', '', 'maxlength="1000"') + '</div></fieldset>';
}

function readActivity(state, data) {
  const uses = state.cardSets.flatMap(card => {
    const role = data.get('role-' + card.id);
    return Object.hasOwn(cardRoles, role) ? [{ cardSetId: card.id, role, usageNote: data.get('note-' + card.id).trim() }] : [];
  });
  const title = data.get('cardTitle').trim();
  if (title) {
    const card = saveCardSet(state, title);
    if (uses.some(row => row.cardSetId === card.id)) throw new Error('该卡组已选择，请在对应行修改角色。');
    uses.push({ cardSetId: card.id, role: data.get('cardRole'), usageNote: data.get('cardNote').trim() });
  }
  return { formats: data.getAll('format'), cardUses: uses };
}

function recordFields(type, item, projectId) {
  const title = textField('title', '标题', item.title, 'required maxlength="200" autofocus');
  const tags = textField('tags', '标签', item.tags?.join('，'), 'placeholder="用逗号分隔"');
  if (type === 'project') return title + textarea('description', '简介', item.description, 2) + recordTags(item) + coverFields(item, false);
  if (type === 'discover') {
    return title + '<div class="work-form-pair">' + textField('contentType', '内容类型', item.contentType ?? item.category,
      'list="discover-types" placeholder="可选"') +
      '<datalist id="discover-types">' + ['Material', 'Pin', 'Inspiration', 'Wiki', 'Knowledge', 'Raw Source', 'Resource Link']
        .map(type => option(type, type)).join('') + '</datalist>' + tags + '</div>' +
      textarea('body', '正文 · Markdown', item.body ?? item.description, 8) +
      '<div class="work-form-pair">' + textField('sourceInfo', '来源说明', item.sourceInfo) +
      textField('sourceUrl', '来源链接', item.sourceUrl, 'placeholder="https://"') + '</div>' + coverFields(item, false) +
      retainedFiles(item.assetIds) + fileField('附件', 'attachments', '', true);
  }
  const reusable = item.id ? [] : reusableFor(studioStore.state, projectId);
  return title + '<div class="work-form-pair">' + Object.entries(eventFields).map(([key, label]) =>
    textField(key, label, item[key], key === 'date' ? 'type="date"' : key === 'attendeeCount' ?
      'type="number" min="0" step="1"' : '')).join('') + '</div>' + recordTags(item) + activityFields(item) + coverFields(item, true) +
    (reusable.length ? '<fieldset class="work-choices"><legend>采用 Project 共通内容</legend>' + reusable.map(session =>
      '<label class="work-check"><input type="checkbox" name="adopt" value="' + esc(session.id) + '">' +
      esc(currentVersion(session).title) + '</label>').join('') + '</fieldset>' : '');
}

export async function fileInput(file, imageOnly = false) {
  if (!file?.name) return null;
  if (!file.size || file.size > maxAssetBytes) throw new Error('每个文件须介于 1 字节和 12 MB 之间。');
  const mime = file.type || 'application/octet-stream';
  if (imageOnly && !imageTypes.includes(mime)) throw new Error('请选择 PNG、JPEG、GIF、WebP 或 AVIF 图片。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const asset = { name: file.name, mime, data: btoa(binary) };
  if (imageOnly && !validImage(asset)) throw new Error('图片文件与所选格式不符。');
  return asset;
}

export async function attachmentInputs(data) {
  const files = [];
  for (const file of data.getAll('attachments')) {
    const input = await fileInput(file);
    if (input) files.push(input);
  }
  return files;
}

export function withAssets(state, data, files) {
  return [...data.getAll('retainAsset'), ...files.map(file => addAsset(state, file))];
}

function download(asset) {
  const bytes = Uint8Array.from(atob(asset.data), char => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = asset.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initWorkshopActions(app, render) {
  const refresh = (selector, reopen = []) => {
    render();
    for (const details of app.querySelectorAll('[data-work-document]')) {
      if (reopen.includes(details.dataset.workDocument)) details.open = true;
    }
    (app.querySelector(selector) ?? app.querySelector('main')).focus({ preventScroll: true });
  };

  const dialog = (...args) => studioDialog(app, ...args);

  function editRecord(type, edit, route) {
    const item = edit ? owner(route).item : {};
    const projectId = route.project?.id;
    dialog((edit ? '编辑 ' : '新建 ') + recordTypes[type], recordFields(type, item, projectId), async data => {
      const cover = await fileInput(data.get('cover'), true);
      const files = await attachmentInputs(data);
      const coverUrl = data.get(type === 'event' ? 'posterUrl' : 'coverUrl').trim();
      if (coverUrl && !safeUrl(coverUrl)) throw new Error('图片链接须使用 HTTPS 或站内路径。');
      return studioStore.change(state => {
        const tags = data.has('tags') ? studioTags(data.get('tags')) : item.tags;
        const tagIds = type === 'discover' ? undefined : [...new Set([...data.getAll('tagId'),
          ...studioTags(data.get('newTags')).map(name => saveWorkshopTag(state, name).id)])];
        const coverAssetId = cover ? addAsset(state, cover) : data.has('clearCover') ? '' : item.coverAssetId;
        const common = { id: item.id, title: data.get('title'), ...(tags && { tags }), ...(tagIds && { tagIds }), coverAssetId };
        if (type === 'project') return saveProject(state, { ...common, description: data.get('description'), coverUrl });
        if (type === 'event') {
          const fields = Object.fromEntries(Object.keys(eventFields).map(key => [key, data.get(key).trim()]));
          return saveEvent(state, { ...common, ...fields, ...readActivity(state, data), projectId, posterUrl: coverUrl,
            ...(item.workshopPublication && (common.title.trim() !== item.title || fields.date !== (item.date || '') ||
              fields.theme !== (item.theme || '')) && { workshopPublication: undefined }) }, data.getAll('adopt'));
        }
        return saveDiscover(state, { ...common, contentType: data.get('contentType').trim(),
          body: data.get('body'), sourceInfo: data.get('sourceInfo'), sourceUrl: data.get('sourceUrl').trim(),
          coverUrl, assetIds: withAssets(state, data, files) });
      });
    }, record => {
      if (edit) refresh('[data-record-edit]');
      else location.hash = objectHref(type, record);
    });
  }

  function editSession(id, { type, item }, reopen, view) {
    const session = id && sessionsFor(studioStore.state, type, item.id).find(row => row.id === id);
    const current = currentVersion(session);
    const filter = { flow: ['flow', 'facilitation', 'questions', 'preparation'], materials: ['visual', 'artifact'],
      review: ['notes', 'review', 'session'] }[view];
    const sections = type === 'event' ? Object.fromEntries(Object.entries(eventSections)
      .filter(([key]) => !filter || filter.includes(key))) : projectSections;
    const section = session?.section;
    const select = !section ? '<label>内容类型<select name="section" required><option value="">请选择</option>' +
      Object.entries(sections).map(([key, label]) => option(key, label)).join('') + '</select></label>' : '';
    dialog(session ? '编辑文档' : '新建文档', select + textField('title', '标题', current?.title, 'required autofocus maxlength="200"') +
      textarea('body', 'Markdown', current?.body, 10) + textField('sourceInfo', '来源说明', current?.sourceInfo) +
      textField('sourceUrl', '来源链接', current?.sourceUrl, 'placeholder="https://"') + retainedFiles(current?.assetIds) +
      fileField('附件', 'attachments', '', true), async data => {
      const files = await attachmentInputs(data);
      return studioStore.change(state => saveSession(state, { id, ownerType: type, ownerId: item.id,
        section: section || data.get('section'), title: data.get('title'), body: data.get('body'),
        sourceInfo: data.get('sourceInfo'), sourceUrl: data.get('sourceUrl').trim(), assetIds: withAssets(state, data, files) }));
    }, saved => refresh('[data-work-document="' + CSS.escape(saved.id) + '"] summary', [...reopen, saved.id]));
  }

  function editRelation(id, { type, item }, reopen) {
    const current = relatedObjects(studioStore.state, type, item.id).direct.find(row => row.edge.id === id);
    const options = relationCandidates(studioStore.state, type, item.id, { edgeId: id });
    const typeKeys = [...new Set(options.map(row => row.type))];
    const tags = [...new Set(options.flatMap(row => row.item.tags ?? []))].sort();
    const fields = '<div class="work-filters">' +
      '<input name="query" type="search" aria-label="搜索对象" placeholder="搜索对象" autofocus>' +
      '<select name="type" aria-label="对象类型">' + option('', '所有对象') +
      typeKeys.map(key => option(key, objectLabels[key])).join('') + '</select>' +
      '<select name="tag" aria-label="标签">' + option('', '所有标签') + tags.map(tag => option(tag, tag)).join('') +
      '</select></div><label>关联对象<select name="target" size="6" required></select></label>' +
      '<p class="work-meta" data-no-candidates hidden>没有匹配的对象</p>' +
      textField('relationType', '关系类型', current?.edge.relationType, 'placeholder="related" maxlength="80"');
    const form = dialog(current ? '编辑关联' : '新增关联', fields, data => {
      const [targetType, targetId] = JSON.parse(data.get('target'));
      const endpoints = current?.edge.targetType === type && current.edge.targetId === item.id
        ? { sourceType: targetType, sourceId: targetId, targetType: type, targetId: item.id }
        : { sourceType: type, sourceId: item.id, targetType, targetId };
      return studioStore.change(state => saveRelation(state, { id, ...endpoints, relationType: data.get('relationType') }));
    }, () => refresh('[data-work-relation=""]', reopen));
    const target = form.elements.target;
    let selected = current && JSON.stringify([current.type, current.item.id]);
    function filter() {
      const { query, type: filterType, tag } = form.elements;
      const rows = relationCandidates(studioStore.state, type, item.id,
        { edgeId: id, query: query.value, type: filterType.value, tag: tag.value });
      target.replaceChildren(...rows.map(row => new Option(contentTitle(row.item) + ' · ' + objectLabels[row.type],
        JSON.stringify([row.type, row.item.id]))));
      target.value = selected || '';
      form.querySelector('[data-no-candidates]').hidden = rows.length > 0;
      form.querySelector('[type="submit"]').disabled = !rows.length;
    }
    form.addEventListener('input', event => {
      if (event.target === target) selected = target.value;
      if (event.target === form.elements.query) filter();
    });
    form.addEventListener('change', event => {
      if (event.target === target) selected = target.value;
      if (event.target === form.elements.type || event.target === form.elements.tag) filter();
    });
    filter();
  }

  function compareVersions(event, sourceId, reopen) {
    const sources = reusableFor(studioStore.state, event.projectId);
    const inherited = sessionsFor(studioStore.state, 'event', event.id);
    const fields = '<label>Project 文档<select name="source" required>' + sources.map(session =>
      option(session.id, currentVersion(session).title)).join('') + '</select></label><div data-work-comparison></div>';
    let versionId;
    const form = dialog('比较 Project 版本', fields, data =>
      studioStore.change(state => adoptVersion(state, event.id, data.get('source'), versionId)),
    saved => refresh('[data-work-document="' + CSS.escape(saved.id) + '"] summary', [...reopen, saved.id]), '采用此版本', 'work-compare');
    if (sourceId) form.elements.source.value = sourceId;
    const compare = () => {
      const key = form.elements.source.value;
      const current = currentVersion(inherited.find(session => session.adoptedFrom === key));
      const latest = currentVersion(sources.find(session => session.id === key));
      versionId = latest?.id;
      form.querySelector('[type="submit"]').disabled = !latest ||
        (current?.source?.versionId === latest.id && current.source.mode === 'adopted');
      const panel = (label, version) => '<section><h3>' + label + '</h3>' + (version
        ? '<p class="work-meta">' + esc(timestamp(version.createdAt)) + '</p>' + '<strong>' + esc(version.title) + '</strong>' +
          documentVersion(version) : '<p class="work-meta">尚未采用</p>') + '</section>';
      form.querySelector('[data-work-comparison]').innerHTML =
        panel('Event 当前版本', current) + panel('Project 最新版本', latest);
    };
    form.elements.source.addEventListener('change', compare);
    compare();
  }

  function editWiki(route) {
    const state = studioStore.state;
    const item = route.record ? boardContent(route.record) : null;
    const selectedCategory = item ? discoverCategory(item) : route.params.get('category');
    const category = isWorkshopWikiCategory(selectedCategory) ? selectedCategory : workshopWikiCategories[0][0];
    const folderId = item?.folderId ?? route.params.get('folder') ?? '';
    const categories = workshopWikiCategories.map(([key]) => [key, key]);
    const form = dialog(item ? '编辑共通资源' : '新建共通资源',
      textField('title', '标题', item?.title, 'maxlength="200" autofocus') +
      selectField('category', '分类', categories, category) +
      selectField('folderId', '文件夹', [], '') +
      selectField('status', '状态', Object.entries(wikiStatuses), item ? wikiStatus(item) : 'draft') +
      textField('tags', '标签（逗号分隔）', item?.topics.join('，')) +
      textarea('body', '正文 · Markdown', item?.body, 10) +
      textField('sourceInfo', '来源说明', item?.sourceInfo) + textField('sourceUrl', '来源链接', item?.sourceUrl) +
      retainedFiles(item?.assetIds) + fileField('添加附件', 'attachments', '', true),
    async data => {
      const files = await attachmentInputs(data);
      return studioStore.change(snapshot => {
        const category = data.get('category');
        return saveWiki(snapshot, { id: item?.id, title: data.get('title'), body: data.get('body'),
          type: item?.type ?? workshopWikiCategories.find(([id]) => id === category)?.[2],
          topics: studioTags(data.get('tags')), sourceInfo: data.get('sourceInfo').trim(), sourceUrl: data.get('sourceUrl').trim(),
          discoverCategory: category, folderId: data.get('folderId'), wikiStatus: data.get('status'),
          assetIds: withAssets(snapshot, data, files) });
      });
    }, saved => { if (item) refresh('[data-work-wiki-edit]'); else location.hash = wikiAddress(saved.id); });
    const updateFolders = selected => {
      const rows = state.boardFolders.filter(row => row.category === form.elements.category.value);
      form.elements.folderId.replaceChildren(new Option('分类根目录', ''), ...rows.map(row => {
        const parent = rows.find(parent => parent.id === row.parentId);
        return new Option((parent ? parent.title + ' / ' : '') + row.title, row.id);
      }));
      form.elements.folderId.value = rows.some(row => row.id === selected) ? selected : '';
    };
    form.elements.category.addEventListener('change', () => updateFolders(folderId));
    updateFolders(folderId);
  }

  function editWikiFolder(route, rename) {
    const category = route.params.get('category');
    if (!isWorkshopWikiCategory(category)) return;
    const current = studioStore.state.boardFolders.find(row => row.id === route.params.get('folder') && row.category === category);
    if (rename && !current) return;
    const parentId = !rename && canAddSubfolder(current) ? current.id : undefined;
    dialog(rename ? '重命名文件夹' : '新建文件夹',
      textField('title', '文件夹名称', rename ? current.title : '', 'required maxlength="100" autofocus'),
      data => studioStore.change(state => saveBoardFolder(state, { id: rename ? current.id : undefined,
        category, parentId, title: data.get('title') })), folder => {
        if (rename) refresh('[data-work-wiki-folder="rename"]');
        else location.hash = commonResourcesAddress(new URLSearchParams({ category, folder: folder.id }));
      });
  }

  function linkAsset(route, kind, pinId) {
    const { type, item } = owner(route);
    const state = studioStore.state;
    const links = workshopLinks(state, type, item, kind);
    const pinned = pinId && links.direct.find(row => row.edge.id === pinId);
    if (pinId && !pinned) return;
    const linked = new Set(links.direct.map(row => row.item.id));
    const options = pinned ? [pinned.item] : (kind === 'tool' ? workshopTools(state) :
      wikiRecords(state).filter(item => wikiStatus(item) !== 'archived')).filter(item => !linked.has(item.id));
    const resource = selectField('target', kind === 'tool' ? '互动工具' : '共通资源', options.map(row => [row.id, contentTitle(row)]), '');
    const canPin = kind === 'wiki' && type === 'event';
    const mode = canPin && !pinId
      ? selectField('mode', '引用方式', [['live', '实时引用'], ['pinned_version', '固定版本']], 'live') : '';
    const versions = canPin && options.length ? selectField('version', '采用版本', [], '') : '';
    const fields = options.length ? (options.length > 1 ? textField('query', '筛选条目', '', 'type="search"') : '') + resource + mode + versions +
      (pinId ? '<p class="work-meta">选择此活动所使用的版本。</p>' : '') :
      '<p>没有可选条目，请先在对应目录中创建资源。</p>';
    const form = dialog(pinId ? '固定版本' : kind === 'tool' ? '关联互动工具' : '引用共通资源', fields,
      data => studioStore.change(snapshot => kind === 'tool' ?
        saveRelation(snapshot, { sourceType: type, sourceId: item.id, targetType: 'tool', targetId: data.get('target') }) :
        linkWiki(snapshot, { ownerType: type, ownerId: item.id, resourceId: data.get('target'),
          mode: pinId ? 'pinned_version' : data.get('mode') ?? 'live', id: pinId, versionId: data.get('version') ?? '' })),
      () => refresh('[data-work-link="' + kind + '"]'), pinId ? '确认固定' : '添加引用');
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = !options.length;
    const version = form.elements.version;
    const updateVersions = () => {
      if (!version) return;
      const show = Boolean(form.elements.target.value) && (pinId || form.elements.mode?.value === 'pinned_version');
      version.disabled = !show;
      version.closest('label').hidden = !show;
      const item = options.find(row => row.id === form.elements.target.value);
      version.replaceChildren(new Option('当前版本', ''), ...(item?.revisions ?? []).slice().reverse().map(row =>
        new Option((row.title || contentTitle(item)) + (row.createdAt ? ' · ' + timestamp(row.createdAt) : ''), row.id)));
    };
    form.elements.target?.addEventListener('change', updateVersions);
    form.elements.mode?.addEventListener('change', updateVersions);
    const query = form.elements.query;
    query?.addEventListener('input', () => {
      const target = form.elements.target;
      const selected = target.value;
      const needle = query.value.trim().toLocaleLowerCase();
      const results = options.filter(row => [contentTitle(row), ...(row.topics ?? [])]
        .join(' ').toLocaleLowerCase().includes(needle));
      target.replaceChildren(...results.map(row => new Option(contentTitle(row), row.id)));
      if (results.some(row => row.id === selected)) target.value = selected;
      submit.disabled = !results.length;
      updateVersions();
    });
    updateVersions();
  }

  function editTool(item) {
    dialog(item ? '编辑工具' : '登记互动工具', textField('title', '标题', item?.title, 'required maxlength="200" autofocus') +
      textarea('description', '简介', item?.description) + selectField('type', '类型', Object.entries(toolTypes), item?.type || 'app') +
      textField('audience', '适用对象', item?.audience, 'maxlength="200"') +
      textField('appLocation', '启动地址（HTTPS 或站内路径）', item?.appLocation, 'maxlength="2048"') +
      textField('version', '版本', item?.version, 'maxlength="100"') +
      selectField('visibility', '预期可见性', Object.entries(toolVisibility), item?.visibility || 'private') +
      '<p class="work-meta">所有工具登记均在私有工作台内。外部应用沿用其自身权限。</p>',
    data => studioStore.change(state => saveInteractiveTool(state, { id: item?.id,
      ...Object.fromEntries(['title', 'description', 'type', 'audience', 'appLocation', 'version', 'visibility']
        .map(key => [key, data.get(key).trim()])) })),
    saved => { if (item) refresh('[data-work-tool-edit]'); else location.hash = objectHref('tool', saved); });
  }

  function editDictionary(key, id) {
    const isTag = key === 'tag';
    const rows = isTag ? studioStore.state.workshopTags : studioStore.state.cardSets;
    const item = rows.find(row => row.id === id);
    dialog((item ? '重命名' : '添加') + (isTag ? '标签' : '卡组'),
      textField('title', '名称', item?.title, 'required maxlength="80" autofocus'),
      data => studioStore.change(state => (isTag ? saveWorkshopTag : saveCardSet)(state, data.get('title'), id)),
      () => refresh('[data-work-dictionary="' + key + '"]'));
  }

  function changePublication(route, kind, withdraw) {
    const { item } = owner(route);
    const preview = publicationProjection(kind, item);
    dialog(withdraw ? '撤回发布预览' : '准备发布预览', withdraw ? '<p>撤回此私有预览。</p>' :
      '<p>这份预览仅在工作台内查看。检查以下字段是否适合公开。</p><ul>' +
      Object.values(preview).map(value => '<li>' + esc(value || '—') + '</li>').join('') + '</ul>' +
      '<label class="work-check"><input type="checkbox" required>已确认版权和参加者隐私，所列字段可公开</label>',
    () => studioStore.change(state => {
      const saved = objectFor(state, kind, item.id);
      if (!saved) throw new Error('记录已不可用。');
      if (withdraw) delete saved.workshopPublication;
      else {
        if (JSON.stringify(preview) !== JSON.stringify(publicationProjection(kind, saved))) {
          throw new Error('内容已变化，请重新检查发布预览。');
        }
        saved.workshopPublication = { preparedAt: new Date().toISOString(), preview };
      }
    }), () => refresh('[data-work-publish]'), withdraw ? '撤回' : '保存私有预览');
  }

  app.addEventListener('submit', event => {
    const form = event.target.closest('[data-work-filter]');
    if (!form) return;
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (value.trim()) params.append(key, value.trim());
    location.hash = form.dataset.workFilter + (params.size ? '?' + params : '');
  });

  app.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const { workRecord, workSession, workRelation, workUnlink, workAdopt, workDownload } = button.dataset;
    if (workDownload) {
      const asset = studioStore.state.assets.find(row => row.id === workDownload);
      if (asset) download(asset);
      return;
    }
    const route = readRoute(location.hash);
    const reopen = [...app.querySelectorAll('[data-work-document][open]')].map(node => node.dataset.workDocument);
    if (workRecord) editRecord(workRecord, button.hasAttribute('data-record-edit'), route);
    if (workSession !== undefined) editSession(workSession, owner(route), reopen, route.params?.get('view'));
    if (workRelation !== undefined) editRelation(workRelation, owner(route), reopen);
    if (workAdopt !== undefined) compareVersions(route.event, workAdopt, reopen);
    const { workWikiEdit, workWikiStatus, workWikiFolder, workLink, workPin, workToolEdit, workDictionary, workPublish, workUnpublish } = button.dataset;
    if (workWikiEdit !== undefined) editWiki(route);
    if (workWikiFolder === '' || workWikiFolder === 'rename') editWikiFolder(route, workWikiFolder === 'rename');
    if (workWikiFolder === 'pin') {
      const folderId = route.params.get('folder');
      dialog(button.getAttribute('aria-pressed') === 'true' ? '取消置顶文件夹' : '置顶文件夹', '',
        () => studioStore.change(state => toggleBoardFolderPin(state, folderId)),
        () => refresh('[data-work-wiki-folder="pin"]'), '确认');
    }
    if (workWikiStatus !== undefined) {
      const archiving = wikiStatus(route.record) !== 'archived';
      dialog(archiving ? '归档共通资源' : '恢复共通资源',
        archiving ? '<p>已有的引用和版本历史仍可访问。</p>' : '<p>资源将重新出现在可选引用中。</p>',
        () => studioStore.change(state => setWikiStatus(state, route.record.id, archiving ? 'archived' : 'active')),
        () => refresh('[data-work-wiki-status]'));
    }
    if (workLink) linkAsset(route, workLink);
    if (workPin) linkAsset(route, 'wiki', workPin);
    if (workToolEdit !== undefined) editTool(route.tool);
    if (workDictionary) editDictionary(workDictionary, button.dataset.id);
    if (workPublish || workUnpublish) changePublication(route, workPublish || workUnpublish, Boolean(workUnpublish));
    if (workUnlink) {
      dialog('移除关联', '', () => studioStore.change(state => removeRelation(state, workUnlink)),
        () => refresh('[data-work-relation=""]', reopen), '移除关联');
    }
  });

  return route => {
    if (route.type !== 'workshop-wiki' || route.params.get('view') !== 'new') return;
    const params = new URLSearchParams(route.params);
    params.delete('view');
    history.replaceState(history.state, '', commonResourcesAddress(params));
    editWiki(route);
  };
}
