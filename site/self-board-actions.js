import { escapeHtml as esc } from './html.js';
import { boardContentHref, boardHref, boardSections, discoverAddress, readRoute } from './pages.js';
import { boardContent, boardFolderPath, boardRecords, boardSection, contentTypes, developThought, discoverCategory, discoverDirectory,
  existingResource, initialDiscoverCategories, isPublished, markBoardContent, moveBoardContentToPinnedFolder, pinnedBoardFolders, reflectionColors,
  relationTypes, removeReflectionLabel, resourceKey, resourcesCategory, saveBoardContent, saveBoardFolder,
  saveReflectionLabel, toggleBoardFolderPin } from './self-board-data.js';
import { boardOptions, boardResults, setReflectionOrder } from './self-board-view.js';
import { reviewChanges } from './self-board-review.js';
import { contentTitle, maxAssetBytes, objectFor, relationCandidates, removeRelation, saveRelation, studioStore } from './studio-data.js';
import { studioDialog } from './studio-dialog.js';
import { attachmentInputs, retainedFiles, withAssets } from './workshop-actions.js';

const field = (name, label, value = '', attributes = '') => '<label>' + label + '<input name="' + name + '" value="' +
  esc(value ?? '') + '" ' + attributes + '></label>';
const text = (name, label, value = '', rows = 3, attributes = '') => '<label>' + label + '<textarea rows="' +
  rows + '" name="' + name + '" ' + attributes + '>' + esc(value ?? '') + '</textarea></label>';
const select = (name, label, choices, value = '', attributes = '') => '<label>' + label + '<select name="' + name + '" ' +
  attributes + '>' + boardOptions(choices, value) + '</select></label>';
const pair = (...fields) => '<div class="work-form-pair">' + fields.join('') + '</div>';
const files = '<label>添加附件<input type="file" name="attachments" multiple></label>';

function sourceType(url) {
  if (!resourceKey(url)) return '';
  const { hostname, pathname } = new URL(url);
  if (/\.pdf$/i.test(pathname)) return 'pdf';
  if (/\.(png|jpe?g|webp|gif|avif)$/i.test(pathname)) return 'image';
  if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|bilibili\.com)$/i.test(hostname)) return 'video';
  if (/(^|\.)(podcasts\.apple\.com|spotify\.com|xiaoyuzhoufm\.com)$/i.test(hostname)) return 'podcast';
  return 'web';
}

function folderName(folders, folder) {
  return boardFolderPath(folders, folder).map(entry => entry.title).join(' / ');
}

function categoryFolders(folders, category) {
  return folders.filter(row => row.category === category).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
}

function folderOptions(folders, choices) {
  return { '': '分类根目录', ...Object.fromEntries(choices.map(folder => [
    folder.id, (folder.pinned ? '置顶 · ' : '') + folderName(folders, folder),
  ])) };
}

function fillFolderSelect(control, folders, choices, selected = control.value) {
  control.replaceChildren(...Object.entries(folderOptions(folders, choices)).map(([value, title]) => new Option(title, value)));
  control.value = choices.some(row => row.id === selected) ? selected : '';
}

function reflectionLabelOptions(labels) {
  return { '': '不添加标签', ...Object.fromEntries(labels.map(label => [label.id, label.name + ' · ' + reflectionColors[label.color]])) };
}

async function readImportedDocument(file, markdownOnly = false) {
  const allowed = markdownOnly ? /\.md$/i : /\.(md|markdown|txt)$/i;
  if (!file || !allowed.test(file.name) || !file.size || file.size > maxAssetBytes) {
    throw new Error(markdownOnly ? '请选择不超过 12 MB 的 .md 文件。' : '请选择不超过 12 MB 的 Markdown 或纯文本文件。');
  }
  const content = (await file.text()).replace(/^\uFEFF/, '');
  if (!content.trim() || content.includes('\0')) throw new Error('文件没有可导入的正文。');
  const heading = /^\s*# ([^\r\n]+)(?:\r?\n|$)/.exec(content);
  const title = (heading?.[1] || file.name.replace(/\.[^.]+$/, '')).trim();
  const body = heading ? content.slice(heading[0].length).trimStart() : content;
  return { title, body, sourceType: 'file', sourceInfo: file.name };
}

function captureOptions(name, label, choices, selected) {
  return '<fieldset class="sb-capture-choice"><legend>' + esc(label) + '</legend>' +
    '<div class="sb-capture-options-scroll"><div class="segmented sb-module-tabs sb-capture-options" data-capture-options="' + name + '">' +
    Object.entries(choices).map(([value, title]) =>
      '<label><input type="radio" name="' + name + '" value="' + esc(value) + '"' +
      (selected === value ? ' checked' : '') + '><span>' + esc(title) + '</span></label>').join('') +
    '</div></div></fieldset>';
}

function captureFields(mode, { importing, folders, labels }) {
  if (mode === 'text') return text('body', '文字', '', 5, 'required autofocus placeholder="先记下一句话…"') +
    select('reflectionLabelId', '标签（可选）', reflectionLabelOptions(labels));
  if (mode === 'link') {
    const choices = categoryFolders(folders, resourcesCategory);
    return field('sourceUrl', '链接', '', 'type="url" required placeholder="https://"') +
      (importing ? '' : choices.length ? select('folderId', 'Resources 文件夹（可选）', folderOptions(folders, choices)) :
        '<p class="work-meta">保存到 Resources</p>') +
      text('personalNotes', '个人备注（可选）');
  }
  if (importing) return '<label>文件<input type="file" name="attachments" required multiple></label>' + text('personalNotes', '文件说明（可选）');
  return '<label>Markdown 文件<input type="file" name="document" accept=".md" required></label>' +
    captureOptions('destination', '添加到', Object.fromEntries(Object.entries(boardSections).map(([id, section]) => [id, section.label])), 'discover') +
    '<fieldset class="work-form-fields sb-capture-location" data-capture-location>' +
    captureOptions('discoverCategory', 'Discover 分类',
      Object.fromEntries(initialDiscoverCategories.map(([name]) => [name, name])), resourcesCategory) +
    '<div data-capture-folder>' + select('folderId', '文件夹（可选）', {}) + '</div></fieldset>';
}

export function initBoardActions(app, render) {
  const open = id => { location.hash = boardContentHref(id); };
  function refresh(focusId) {
    const opened = new Set([...app.querySelectorAll('[data-sb-card] > details[open]')]
      .map(details => details.parentElement.dataset.sbCard));
    render();
    for (const card of app.querySelectorAll('[data-sb-card]')) {
      if (opened.has(card.dataset.sbCard)) {
        const details = card.querySelector(':scope > details');
        if (details) details.open = true;
      }
    }
    const updated = focusId && [...app.querySelectorAll('[data-sb-card]')].find(card => card.dataset.sbCard === focusId);
    const focus = updated && [...updated.querySelectorAll('[data-sb-edit], [data-sb-pin], .sb-card-title')]
      .find(control => control.getClientRects().length);
    (focus || app.querySelector('main')).focus({ preventScroll: true });
  }
  const dialog = (...args) => studioDialog(app, ...args);

  function quickCapture({ importing = false, category = '', folderId = '' } = {}) {
    let mode = importing ? 'link' : 'text';
    const folders = studioStore.state.boardFolders ?? [];
    const labels = studioStore.state.reflectionLabels ?? [];
    const options = { importing, folders, labels };
    const form = dialog(importing ? '导入资料' : 'Quick Capture', '<div class="segmented sb-capture-modes" aria-label="记录方式">' +
      (importing ? ['Link', 'File'] : ['Text', 'Link', 'File']).map(label => '<button type="button" data-capture-mode="' + label.toLowerCase() +
        '" aria-pressed="' + (label.toLowerCase() === mode) + '">' + label + '</button>').join('') + '</div>' +
      '<div class="work-form-fields" data-capture-fields>' + captureFields(mode, options) +
      '</div><a class="return-link" data-capture-duplicate hidden>打开已有资料 ↗</a>', async data => {
      const status = importing ? '' : 'inbox';
      const save = input => studioStore.change(state => saveBoardContent(state, { status, ...input }));
      if (mode === 'text') {
        return save({ type: 'thought', body: data.get('body'), reflectionLabelId: data.get('reflectionLabelId') || '' });
      }
      if (mode === 'file' && !importing) {
        const document = await readImportedDocument(data.get('document'), true);
        const destination = data.get('destination');
        if (destination === 'writing') return save({ ...document, type: 'article' });
        if (destination === 'reflections') return save({ ...document, type: 'thought' });
        const category = data.get('discoverCategory');
        const selected = initialDiscoverCategories.find(([name]) => name === category);
        if (destination !== 'discover' || !selected) throw new Error('请选择要添加到的栏目和分类。');
        return save({ ...document, type: selected[2], discoverCategory: category, folderId: data.get('folderId') || '' });
      }

      const personalNotes = data.get('personalNotes')?.trim() || '';
      if (mode === 'file') {
        const attachments = await attachmentInputs(data);
        if (!attachments.length) throw new Error('请选择一个文件。');
        return studioStore.change(state => saveBoardContent(state, {
          type: 'resource', status, ...(category ? { discoverCategory: category, folderId } : {}),
          title: attachments[0].name, sourceType: 'file', assetIds: withAssets(state, data, attachments), personalNotes,
        }));
      }
      const duplicate = form.querySelector('[data-capture-duplicate]');
      duplicate.hidden = true;
      const sourceUrl = data.get('sourceUrl')?.trim() || '';
      if (!resourceKey(sourceUrl)) throw new Error('请输入有效的 HTTP 或 HTTPS 链接。');
      const existing = existingResource(studioStore.state, sourceUrl);
      if (existing) {
        duplicate.hidden = false;
        duplicate.href = boardContentHref(existing.id);
        throw new Error('这个链接已收藏。可以打开已有记录补充备注。');
      }
      return save({
        type: 'resource', discoverCategory: (importing && category) || resourcesCategory,
        folderId: importing ? folderId : data.get('folderId') || '',
        title: new URL(sourceUrl).hostname, sourceUrl, sourceType: sourceType(sourceUrl), savedAt: new Date().toISOString(), personalNotes,
      });
    }, saved => open(saved.id), importing ? '导入资料' : '保存到 Inbox', importing ? '' : 'sb-capture-dialog');

    function syncLocation() {
      const location = form.querySelector('[data-capture-location]');
      if (!location) return;
      const inDiscover = form.elements.destination.value === 'discover';
      location.hidden = !inDiscover;
      location.disabled = !inDiscover;
      if (!inDiscover) return;
      const choices = categoryFolders(folders, form.elements.discoverCategory.value);
      const folder = form.elements.folderId;
      fillFolderSelect(folder, folders, choices);
      form.querySelector('[data-capture-folder]').hidden = !choices.length;
      folder.disabled = !choices.length;
    }

    const drafts = new Map();
    form.addEventListener('change', event => {
      if (['destination', 'discoverCategory'].includes(event.target.name)) syncLocation();
    });
    form.addEventListener('click', event => {
      const button = event.target.closest('[data-capture-mode]');
      if (!button || button.dataset.captureMode === mode) return;
      const fields = form.querySelector('[data-capture-fields]');
      drafts.set(mode, [...fields.children]);
      mode = button.dataset.captureMode;
      if (drafts.has(mode)) fields.replaceChildren(...drafts.get(mode));
      else fields.innerHTML = captureFields(mode, options);
      syncLocation();
      for (const tab of form.querySelectorAll('[data-capture-mode]')) tab.setAttribute('aria-pressed', String(tab === button));
      fields.querySelector('textarea, input')?.focus();
      form.querySelector('[role="alert"]').hidden = true;
      form.querySelector('[data-capture-duplicate]').hidden = true;
    });
  }

  function importArticle() {
    dialog('导入文章', '<label>Markdown 或纯文本文件<input type="file" name="document" accept=".md,.markdown,.txt,text/plain,text/markdown" required></label>',
      async data => {
        const document = await readImportedDocument(data.get('document'));
        return studioStore.change(state => saveBoardContent(state, { ...document, type: 'article', status: 'draft' }));
      }, item => open(item.id), '导入为未发布');
  }

  function inlineEditor(host, fields, save, after, { writing, cancelTo }) {
    const box = host.querySelector('[data-sb-editor]');
    const reading = host.querySelector('[data-sb-reading]');
    if (!box.hidden) return;
    box.innerHTML = '<form class="sb-inline-form"><div class="work-form-fields">' + fields +
      '</div><p class="work-error" role="alert" hidden></p><div class="sb-inline-actions">' +
      '<button type="button" class="action-button secondary" data-sb-cancel-edit>取消</button>' +
      '<button type="submit" class="action-button">' + (writing ? cancelTo ? '保存文章' : '保存版本' : cancelTo ? '保存文件' : '保存') + '</button></div></form>';
    box.hidden = false;
    if (reading) reading.hidden = true;
    const form = box.querySelector('form');
    const returnFocus = reading?.querySelector('[data-sb-edit]');
    form.querySelector('[data-sb-cancel-edit]').addEventListener('click', () => {
      if (cancelTo) {
        location.hash = cancelTo;
        return;
      }
      box.hidden = true;
      box.replaceChildren();
      reading.hidden = false;
      returnFocus?.focus();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form);
      const error = form.querySelector('[role="alert"]');
      form.inert = true;
      error.hidden = true;
      try {
        after(await save(data));
      } catch (cause) {
        error.textContent = cause.message || '保存失败。';
        error.hidden = false;
      } finally {
        form.inert = false;
      }
    });
    (writing && !cancelTo ? form.elements.body : form.elements.title).focus();
    return form;
  }

  function editContent({ stored, type, category, folderId, host, cancelTo }) {
    const item = stored ? boardContent(stored) : { type, discoverCategory: category, folderId };
    const section = boardSection(item);
    const writing = section === 'writing';
    const discover = section === 'discover';
    const creating = !stored;
    const folders = studioStore.state.boardFolders ?? [];
    const labels = studioStore.state.reflectionLabels ?? [];
    const categories = discoverDirectory(boardRecords(studioStore.state, true), folders);
    const categoryList = 'sb-category-' + (item.id || 'new');
    const fields = field('title', writing ? '文章标题' : '标题（可选）', item.title, 'autofocus maxlength="200"') +
      (writing ? field('summary', '摘要（可选）', item.summary) : '') +
      text('body', '正文 · Markdown', item.body, writing ? 14 : 7) +
      (writing ? select('publication', '发布状态', { unpublished: '未发布', published: '已发布' },
        isPublished(item) ? 'published' : 'unpublished') : '') +
      (section === 'reflections' && labels.length ? select('reflectionLabelId', '卡片颜色', reflectionLabelOptions(labels), item.reflectionLabelId) : '') +
      (discover ? pair(field('discoverCategory', '分类', discoverCategory(item),
        'list="' + esc(categoryList) + '" required maxlength="80"'), select('folderId', '文件夹', {})) +
        '<datalist id="' + esc(categoryList) + '">' + categories.map(({ name }) => '<option value="' + esc(name) + '"></option>').join('') +
        '</datalist>' + pair(field('sourceInfo', '来源名称', item.sourceInfo), field('sourceUrl', '来源链接', item.sourceUrl)) +
        text('personalNotes', '我的笔记', item.personalNotes) + retainedFiles(item.assetIds) + files : '');
    const save = async data => {
      const attachments = discover ? await attachmentInputs(data) : [];
      const body = data.get('body');
      const title = data.get('title').trim();
      return studioStore.change(state => {
        const input = { id: item.id, type: item.type, title, body };
        if (writing) {
          input.summary = data.get('summary').trim();
          if (data.get('publication') === 'published') {
            input.type = 'article';
            input.visibility = 'published';
          } else if (isPublished(item) || creating) input.visibility = 'private';
          if (creating) input.status = 'draft';
        }
        if (data.has('reflectionLabelId')) input.reflectionLabelId = data.get('reflectionLabelId');
        if (discover) {
          input.discoverCategory = data.get('discoverCategory').trim();
          input.folderId = data.get('folderId');
          input.sourceInfo = data.get('sourceInfo').trim();
          input.sourceUrl = data.get('sourceUrl').trim();
          input.personalNotes = data.get('personalNotes');
          input.assetIds = withAssets(state, data, attachments);
          if (input.sourceUrl !== (item.sourceUrl || '')) input.sourceType = sourceType(input.sourceUrl);
        }
        return saveBoardContent(state, input);
      });
    };
    const after = saved => {
      if (stored) refresh(saved.id);
      else if (discover) location.hash = discoverAddress(discoverCategory(saved), saved.folderId);
      else open(saved.id);
    };
    const form = host ? inlineEditor(host, fields, save, after, { writing, cancelTo }) : dialog('新建记录', fields, save, after);
    if (!form || !discover) return;

    const categoryInput = form.elements.discoverCategory;
    const folderSelect = form.elements.folderId;
    function populateFolders(selected = folderSelect.value) {
      fillFolderSelect(folderSelect, folders, categoryFolders(folders, categoryInput.value.trim()), selected);
    }
    categoryInput.addEventListener('input', () => populateFolders());
    populateFolders(item.folderId);
  }

  function editFolder(id, category, parentId) {
    const item = id && studioStore.state.boardFolders?.find(row => row.id === id);
    dialog(item ? '重命名文件夹' : parentId ? '新建子文件夹' : '新建文件夹',
      field('title', '文件夹名称', item?.title, 'required maxlength="100" autofocus'),
      data => studioStore.change(state => saveBoardFolder(state, { id, category, parentId, title: data.get('title') })),
      folder => {
        if (item) refresh();
        else location.hash = discoverAddress(folder.category, folder.id);
      }, item ? '保存' : '创建文件夹');
  }

  function moveToPinnedFolder(id, route) {
    const state = studioStore.state;
    const item = objectFor(state, 'discover', id);
    const pinned = pinnedBoardFolders(state, item?.folderId);
    if (!item || !pinned.length) return;
    const folders = state.boardFolders ?? [];
    const choices = Object.fromEntries(pinned.map(folder => [folder.id, folder.category + ' / ' + folderName(folders, folder)]));
    dialog('移动到置顶文件夹', '<p class="work-meta">' + esc(contentTitle(item)) + '</p>' +
      select('folderId', '目标文件夹', pinned.length === 1 ? choices : { '': '请选择文件夹', ...choices }, '', 'required'),
      data => studioStore.change(snapshot => moveBoardContentToPinnedFolder(snapshot, id, data.get('folderId'))),
      saved => {
        if (route.type === 'content-detail') refresh(saved.id);
        else location.hash = discoverAddress(discoverCategory(saved), saved.folderId);
      }, '移动');
  }

  function editLabel(id) {
    const label = id && studioStore.state.reflectionLabels?.find(row => row.id === id);
    const colors = '<fieldset class="work-choices"><legend>卡片上缘颜色</legend><div class="sb-palette">' +
      Object.entries(reflectionColors).map(([key, name]) => '<label><input type="radio" name="color" value="' + key +
        '"' + ((label?.color || 'blue') === key ? ' checked' : '') + '><span class="sb-swatch" data-sb-color="' + key +
        '" aria-hidden="true"></span>' + esc(name) + '</label>').join('') + '</div></fieldset>';
    dialog(label ? '编辑标签' : '新建标签',
      field('name', '标签名称', label?.name, 'required maxlength="40" autofocus') + colors,
      data => studioStore.change(state => saveReflectionLabel(state, { id, name: data.get('name'), color: data.get('color') })),
      () => refresh());
  }

  function editRelation(id, sourceId) {
    const state = studioStore.state;
    const current = state.relations.find(row => row.id === id);
    const board = boardRecords(state, true);
    if (!board.length) {
      quickCapture();
      return;
    }
    const ref = (type, itemId) => JSON.stringify([type, itemId]);
    const currentSource = current ? ref(current.sourceType, current.sourceId) : sourceId ? ref('discover', sourceId) : '';
    const currentTarget = current && ref(current.targetType, current.targetId);
    const choices = { '': '选择起点' };
    for (const [kind, items] of [['discover', board], ['project', state.projects], ['event', state.events]]) {
      for (const item of items) choices[ref(kind, item.id)] = contentTitle(item) + ' · ' +
        (kind === 'discover' ? contentTypes[item.type] : kind === 'project' ? 'Project' : 'Event');
    }
    const form = dialog(current ? '编辑关联' : '新增关联', select('source', '起点', choices, currentSource, 'required') +
      pair(field('query', '搜索目标', '', 'type="search" placeholder="标题或正文"'),
        select('kind', '目标模块', { '': '所有对象', discover: 'Self-board', project: 'Project', event: 'Event' })) +
      select('target', '目标', {}, '', 'required size="5"') + '<p class="work-meta" data-sb-no-target>请先选择起点。</p>' +
      select('relationType', '关系', { ...relationTypes, '': '自定义关系' },
        current ? Object.hasOwn(relationTypes, current.relationType) ? current.relationType : '' : 'related_to') +
      '<div data-sb-custom-relation>' + field('customType', '自定义关系名称',
        current && !Object.hasOwn(relationTypes, current.relationType) ? current.relationType : '', 'maxlength="80"') +
      '</div>', data => {
      const [sourceType, sourceId] = JSON.parse(data.get('source'));
      const [targetType, targetId] = JSON.parse(data.get('target'));
      return studioStore.change(snapshot => saveRelation(snapshot, { id, sourceType, sourceId, targetType, targetId,
        relationType: data.get('relationType') || data.get('customType').trim() }));
    }, refresh);

    const target = form.elements.target;
    function filter(preferred) {
      const source = form.elements.source.value;
      const prior = preferred ?? target.value;
      const [kind, itemId] = source ? JSON.parse(source) : [];
      const rows = source ? relationCandidates(state, kind, itemId, {
        edgeId: id, query: form.elements.query.value, type: form.elements.kind.value,
      }) : [];
      target.replaceChildren(...rows.map(row => new Option(contentTitle(row.item) + ' · ' +
        (row.type === 'discover' ? contentTypes[boardContent(row.item).type] : row.type === 'project' ? 'Project' : 'Event'), ref(row.type, row.item.id))));
      target.value = prior || '';
      form.querySelector('[data-sb-no-target]').hidden = rows.length > 0;
      form.querySelector('[data-sb-no-target]').textContent = source ? '没有匹配的目标。' : '请先选择起点。';
      form.querySelector('[type="submit"]').disabled = !rows.length;
    }
    form.addEventListener('input', event => { if (event.target.name === 'query') filter(); });
    form.addEventListener('change', event => { if (['source', 'kind'].includes(event.target.name)) filter(); });
    function showCustom() {
      const custom = !form.elements.relationType.value;
      form.querySelector('[data-sb-custom-relation]').hidden = !custom;
      form.elements.customType.required = custom;
      form.elements.customType.disabled = !custom;
    }
    form.elements.relationType.addEventListener('change', showCustom);
    showCustom();
    filter(currentTarget);
  }

  function filterResults(event) {
    const form = event.target.closest('[data-sb-filter]');
    if (!form) return;
    if (event.type === 'submit') event.preventDefault();
    app.querySelector('[data-sb-results]').innerHTML = boardResults(readRoute(location.hash), Object.fromEntries(new FormData(form)));
  }

  for (const event of ['input', 'change', 'submit']) app.addEventListener(event, filterResults);
  app.addEventListener('submit', event => {
    if (!event.target.matches('[data-sb-search]')) return;
    event.preventDefault();
    const query = new FormData(event.target).get('query').trim();
    location.hash = boardHref('search') + (query ? '?' + new URLSearchParams({ q: query }) : '');
  });
  function updateReview(panel, record) {
    const output = panel.querySelector('[data-sb-review-diff]');
    if (!output) return;
    const from = Number(panel.querySelector('[data-sb-review-from]').value);
    const to = Number(panel.querySelector('[data-sb-review-to]').value);
    output.innerHTML = reviewChanges(boardContent(record), from, to);
  }

  app.addEventListener('change', event => {
    if (event.target.matches('[data-sb-review-from], [data-sb-review-to]')) {
      updateReview(event.target.closest('[data-sb-review-panel]'), readRoute(location.hash).record);
    }
  });
  app.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    const { sbCapture, sbEdit, sbRelation, sbUnlink, sbMark, sbRecover, sbDevelop, sbSource,
      sbCategory, sbFolder, sbImport, sbPin, sbReview, sbWritingFilter, sbOrder, sbLabel, sbRemoveLabel, sbMakeFolder, sbFolderPin, sbMovePinned } = button.dataset;
    const route = readRoute(location.hash);
    const host = button.closest('[data-sb-card]');
    if (sbCapture === '') quickCapture();
    else if (sbCapture) editContent({ type: sbCapture });
    if (sbImport === 'article') importArticle();
    if (sbImport === 'resource') quickCapture({ importing: true, category: sbCategory, folderId: sbFolder });
    if (sbEdit) editContent({ stored: objectFor(studioStore.state, 'discover', sbEdit), host });
    if (sbRelation !== undefined) editRelation(sbRelation || undefined, sbSource);
    if (sbMakeFolder !== undefined) editFolder(sbMakeFolder || undefined, sbCategory, sbFolder);
    if (sbMovePinned) moveToPinnedFolder(sbMovePinned, route);
    if (sbLabel !== undefined) editLabel(sbLabel || undefined);
    if (sbRemoveLabel) dialog('移除标签', '<p>使用此标签的卡片将恢复默认颜色。</p>',
      () => studioStore.change(state => removeReflectionLabel(state, sbRemoveLabel)), () => refresh(), '移除');
    if (sbWritingFilter) location.hash = boardHref('writing', route.view === sbWritingFilter ? '' : sbWritingFilter);
    if (sbOrder) {
      setReflectionOrder(sbOrder);
      render();
      app.querySelector('[data-sb-order="' + sbOrder + '"]')?.focus({ preventScroll: true });
    }
    if (sbReview !== undefined) {
      const panel = host.querySelector('[data-sb-review-panel]');
      panel.hidden = !panel.hidden;
      host.querySelector('[data-sb-article-copy]').hidden = !panel.hidden;
      if (!panel.hidden) updateReview(panel, route.record);
      button.setAttribute('aria-pressed', String(!panel.hidden));
    }
    if (sbPin || sbFolderPin) {
      button.disabled = true;
      try {
        await studioStore.change(state => sbFolderPin ? toggleBoardFolderPin(state, sbFolderPin) : markBoardContent(state, sbPin, 'pin'));
        refresh(sbPin);
        if (sbFolderPin) {
          [...app.querySelectorAll('[data-sb-folder-pin]')].find(control => control.dataset.sbFolderPin === sbFolderPin)
            ?.focus({ preventScroll: true });
        }
      } catch (cause) {
        const error = document.createElement('p');
        error.className = 'work-error';
        error.setAttribute('role', 'alert');
        error.textContent = cause.message;
        button.after(error);
      } finally {
        button.disabled = false;
      }
    }
    if (sbUnlink) dialog('移除关联', '<p>这条关联将从两个对象的关联列表中移除。</p>',
      () => studioStore.change(state => removeRelation(state, sbUnlink)), () => refresh(), '移除关联');
    if (sbMark) {
      const label = { delete: '移到回收站', restore: '移出旧归档', revisit: '标记为已回看' }[sbMark];
      dialog(label, '<p>' + esc(contentTitle(route.record)) + '</p>',
        () => studioStore.change(state => markBoardContent(state, route.record.id, sbMark)),
        () => sbMark === 'delete' ? (location.hash = boardHref(undefined, 'trash')) : refresh(), label);
    }
    if (sbRecover) {
      const item = objectFor(studioStore.state, 'discover', sbRecover);
      dialog('恢复记录', '<p>' + esc(contentTitle(item)) + '</p>',
        () => studioStore.change(state => markBoardContent(state, sbRecover, 'recover')), restored => open(restored.id), '恢复');
    }
    if (sbDevelop) dialog('写成文章', '<p>新文章将以未发布状态打开，并关联这张灵感卡。</p>',
      () => studioStore.change(state => developThought(state, sbDevelop, 'article')), item => open(item.id), '创建文章');
  });
  return route => {
    if (route.view !== 'new') return;
    const host = app.querySelector('[data-sb-create-editor]');
    if (route.section === 'writing') {
      editContent({ type: 'article', host, cancelTo: boardHref('writing') });
      return;
    }
    const category = route.params.get('category') || undefined;
    const folders = studioStore.state.boardFolders ?? [];
    const folder = folders.find(row => row.id === route.params.get('folder') && row.category === category);
    const directory = discoverDirectory(boardRecords(studioStore.state), folders);
    const type = directory.find(row => row.name === category)?.type ?? 'note';
    editContent({ type, category, folderId: folder?.id, host, cancelTo: route.parent });
  };
}
