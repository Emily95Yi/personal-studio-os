import { escapeHtml as esc, safeUrl } from './html.js';
import { readRoute } from './pages.js';
import { discoverCards } from './views.js';
import { addAsset, adoptVersion, currentVersion, eventSections, imageTypes, maxAssetBytes, projectSections,
  relationCandidates, relatedObjects, removeRelation, reusableFor, saveDiscover, saveEvent, saveProject, saveRelation,
  saveSession, sessionsFor, studioStore, studioTags, validImage } from './studio-data.js';
import { documentVersion, eventFields, objectHref, objectLabels, timestamp } from './workshop-view.js';

const recordTypes = { project: 'Project', event: 'Event', discover: '资料' };
const textField = (key, label, value, options = '') =>
  '<label>' + label + '<input name="' + key + '" value="' + esc(value ?? '') + '" ' + options + '></label>';
const textarea = (key, label, value, rows = 6) =>
  '<label>' + label + '<textarea name="' + key + '" rows="' + rows + '">' + esc(value ?? '') + '</textarea></label>';
const option = (value, label) => '<option value="' + esc(value) + '">' + esc(label) + '</option>';

function owner(route) {
  if (route.type === 'event') return { type: 'event', item: route.event };
  if (route.type === 'project') return { type: 'project', item: route.project };
  return { type: 'discover', item: route.record };
}

function fileField(label, name, accept = '', multiple = false) {
  return '<label>' + label + '<input type="file" name="' + name + '"' +
    (accept ? ' accept="' + accept + '"' : '') + (multiple ? ' multiple' : '') + '></label>';
}

function retainedFiles(ids = []) {
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

function recordFields(type, item, projectId) {
  const title = textField('title', '标题', item.title, 'required maxlength="200" autofocus');
  const tags = textField('tags', '标签', item.tags?.join('，'), 'placeholder="用逗号分隔"');
  if (type === 'project') return title + textarea('description', '简介', item.description, 2) + tags + coverFields(item, false);
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
      'type="number" min="0" step="1"' : '')).join('') + '</div>' + tags + coverFields(item, true) +
    (reusable.length ? '<fieldset class="work-choices"><legend>采用 Project 共通内容</legend>' + reusable.map(session =>
      '<label class="work-check"><input type="checkbox" name="adopt" value="' + esc(session.id) + '">' +
      esc(currentVersion(session).title) + '</label>').join('') + '</fieldset>' : '');
}

async function fileInput(file, imageOnly = false) {
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

async function attachmentInputs(data) {
  const files = [];
  for (const file of data.getAll('attachments')) {
    const input = await fileInput(file);
    if (input) files.push(input);
  }
  return files;
}

function withAssets(state, data, files) {
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

  function dialog(title, fields, save, after, submitLabel = '保存', extraClass = '') {
    const box = document.createElement('dialog');
    box.className = 'work-dialog ' + extraClass;
    box.innerHTML = '<form><h2>' + esc(title) + '</h2><div class="work-form-fields">' + fields +
      '</div><p class="work-error" role="alert" hidden></p><div class="work-dialog-actions">' +
      '<button class="action-button secondary" type="button" data-work-close>取消</button>' +
      '<button type="submit" class="action-button">' + submitLabel + '</button></div></form>';
    const form = box.querySelector('form');
    const submit = form.querySelector('[type="submit"]');
    box.querySelector('[data-work-close]').addEventListener('click', () => box.close());
    box.addEventListener('close', () => box.remove(), { once: true });
    box.addEventListener('cancel', event => { if (form.inert) event.preventDefault(); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form);
      const error = form.querySelector('[role="alert"]');
      error.hidden = true;
      form.inert = true;
      try {
        const result = await save(data);
        box.close();
        after(result);
      } catch (cause) {
        error.textContent = cause.message || '保存失败。';
        error.hidden = false;
      } finally {
        form.inert = false;
        if (box.open && !submit.disabled) submit.focus();
      }
    });
    app.append(box);
    box.showModal();
    return form;
  }

  function editRecord(type, edit, route) {
    const item = edit ? owner(route).item : {};
    const projectId = route.project?.id;
    dialog((edit ? '编辑 ' : '新建 ') + recordTypes[type], recordFields(type, item, projectId), async data => {
      const cover = await fileInput(data.get('cover'), true);
      const files = await attachmentInputs(data);
      const coverUrl = data.get(type === 'event' ? 'posterUrl' : 'coverUrl').trim();
      if (coverUrl && !safeUrl(coverUrl)) throw new Error('图片链接须使用 HTTPS 或站内路径。');
      return studioStore.change(state => {
        const tags = studioTags(data.get('tags'));
        const coverAssetId = cover ? addAsset(state, cover) : data.has('clearCover') ? '' : item.coverAssetId;
        const common = { id: item.id, title: data.get('title'), tags, coverAssetId };
        if (type === 'project') return saveProject(state, { ...common, description: data.get('description'), coverUrl });
        if (type === 'event') {
          const fields = Object.fromEntries(Object.keys(eventFields).map(key => [key, data.get(key).trim()]));
          return saveEvent(state, { ...common, ...fields, projectId, posterUrl: coverUrl }, data.getAll('adopt'));
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

  function editSession(id, { type, item }, reopen) {
    const session = id && sessionsFor(studioStore.state, type, item.id).find(row => row.id === id);
    const current = currentVersion(session);
    const sections = type === 'event' ? eventSections : projectSections;
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
    const typeKeys = type === 'discover' ? ['project', 'event'] : ['discover'];
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
      target.replaceChildren(...rows.map(row => new Option(row.item.title + ' · ' + objectLabels[row.type],
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
    if (workSession !== undefined) editSession(workSession, owner(route), reopen);
    if (workRelation !== undefined) editRelation(workRelation, owner(route), reopen);
    if (workAdopt !== undefined) compareVersions(route.event, workAdopt, reopen);
    if (workUnlink) {
      dialog('移除关联', '', () => studioStore.change(state => removeRelation(state, workUnlink)),
        () => refresh('[data-work-relation=""]', reopen), '移除关联');
    }
  });

  const filterDiscover = event => {
    const form = event.target.closest('[data-discover-filter]');
    if (form) app.querySelector('[data-discover-results]').innerHTML =
      discoverCards(Object.fromEntries(new FormData(form)));
  };
  app.addEventListener('input', filterDiscover);
  app.addEventListener('change', filterDiscover);
  app.addEventListener('submit', event => { if (event.target.matches('[data-discover-filter]')) event.preventDefault(); });
}
