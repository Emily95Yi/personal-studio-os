import { escapeHtml as esc } from './html.js';
import { boardContentHref, boardHref, boardSections, discoverAddress, readRoute } from './pages.js';
import { boardContent, boardFolderPath, boardRecords, boardSection, contentTypes, developThought, discoverCategory, discoverDirectory,
  initialDiscoverCategories, isPublished, markBoardContent, moveBoardContentToPinnedFolder, pinnedBoardFolders, reflectionColors,
  relationTypes, removeBoardFolder, removeReflectionLabel, resourceKey, resourcesCategory, saveBoardContent, saveBoardFolder,
  saveReflectionLabel, toggleBoardFolderPin } from './self-board-data.js';
import { boardOptions, boardResults, searchResults, setReflectionOrder, wikiSearchResults } from './self-board-view.js';
import { reviewChanges } from './self-board-review.js';
import { contentTitle, maxAssetBytes, objectFor, relationCandidates, removeRelation, saveRelation, studioStore } from './studio-data.js';
import { studioDialog } from './studio-dialog.js';
import { attachmentInputs, retainedFiles, withAssets } from './workshop-actions.js';
import { categoryList, entriesFor, foldersFor, resourceAtUrl, saveCollectionItem, saveExplorationEntry, saveExplorationTopic,
  topicsFor, itemsFor } from './board-library-data.js';
import { collectionLocation } from './board-library-view.js';
import { objectHref, objectLabels } from './workshop-view.js';

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
    '<div class="sb-capture-options-scroll"><div class="segmented sb-capture-options">' +
    Object.entries(choices).map(([value, title]) =>
      '<label><input type="radio" name="' + name + '" value="' + esc(value) + '"' +
      (selected === value ? ' checked' : '') + '><span title="' + esc(title) + '">' + esc(title) + '</span></label>').join('') +
    '</div></div></fieldset>';
}

function revealCaptureOption(input) {
  const label = input.closest('label');
  const track = label.closest('.sb-capture-options-scroll');
  const option = label.getBoundingClientRect();
  const viewport = track.getBoundingClientRect();
  if (option.left < viewport.left) track.scrollLeft += option.left - viewport.left;
  else if (option.right > viewport.right) track.scrollLeft += option.right - viewport.right;
}

function collectionFolderOptions(category) {
  return { '': '分类根目录', ...Object.fromEntries(foldersFor(studioStore.state, category).map(folder => [folder.id, folder.title])) };
}

function captureFields(mode, { importing, labels, collectionCategory, linkDestination, collection, folders, resourceFolder, topicId, topics }) {
  const group = (destination, fields) => '<fieldset class="work-form-fields sb-capture-location" data-capture-destination="' +
    destination + '">' + fields + '</fieldset>';
  const collectionFields = () => group('collections', captureOptions('categoryId', '收藏分类（可选）', { '': '未分类',
    ...Object.fromEntries(categoryList(studioStore.state).filter(row => !row.hidden || row.id === collectionCategory)
      .map(row => [row.id, row.title])) }, collectionCategory) +
    '<div data-capture-collection-folder>' +
    select('collectionFolder', '收藏文件夹', collectionFolderOptions(collectionCategory), collection?.folder) + '</div>');
  const personalFields = () => group('personal', captureOptions('topicId', '探索主题', {
    ...Object.fromEntries(topics.map(row => [row.id, row.title])), '': '新建主题…',
  }, topicId || topics[0]?.id || '') +
    '<div data-capture-topic-name>' + field('topicTitle', '新主题名称', '', 'maxlength="200" required') + '</div>');
  if (mode === 'text') return text('body', '文字', '', 5, 'required autofocus placeholder="先记下一句话…"') +
    captureOptions('destination', '保存到', { reflections: 'Reflections', collections: 'Collections' }, collection ? 'collections' : 'reflections') +
    group('reflections', captureOptions('reflectionLabelId', '标签（可选）', reflectionLabelOptions(labels), '')) + collectionFields();
  if (mode === 'link') {
    const input = field('sourceUrl', '链接', '', 'type="url" required autofocus placeholder="https://"');
    const notes = text('personalNotes', '个人备注（可选）');
    if (importing) return input + notes;
    const resources = categoryFolders(folders, resourcesCategory);
    return input + captureOptions('destination', '保存到', {
      resources: 'Resources', personal: 'Personal Explorations', collections: 'Collections',
    }, linkDestination) +
      (resources.length ? group('resources', select('resourceFolder', 'Resources 文件夹', folderOptions(folders, resources), resourceFolder)) : '') +
      personalFields() + collectionFields() + notes;
  }
  if (importing) return '<label>文件<input type="file" name="attachments" required multiple></label>' + text('personalNotes', '文件说明（可选）');
  return '<label>Markdown 文件<input type="file" name="document" accept=".md" required></label>' +
    captureOptions('destination', '添加到', Object.fromEntries(Object.entries(boardSections)
      .map(([id, section]) => [id, section.label])), collection ? 'collections' : 'discover') +
    group('discover', captureOptions('discoverArea', 'Discover 板块', { wiki: 'Workshop Wiki', personal: 'Personal Explorations' },
      linkDestination === 'personal' ? 'personal' : 'wiki') +
      group('wiki', captureOptions('discoverCategory', 'Wiki 分类',
        Object.fromEntries(initialDiscoverCategories.map(([name]) => [name, name])), resourcesCategory) +
        '<div data-capture-folder>' + select('folderId', '文件夹（可选）',
          folderOptions(folders, categoryFolders(folders, resourcesCategory)), resourceFolder) + '</div>') +
      personalFields()) + collectionFields();
}

export function initBoardActions(app, render) {
  const open = id => { location.hash = boardContentHref(id); };
  const wikiDrafts = new Map();
  let lastWiki = discoverAddress();
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

  function quickCapture({ importing = false, category = '', folderId = '', collection,
    linkDestination = 'collections', topicId = '', resourceFolder = '' } = {}) {
    let mode = importing || collection ? 'link' : 'text';
    const folders = studioStore.state.boardFolders ?? [];
    const labels = studioStore.state.reflectionLabels ?? [];
    const collectionCategory = collection && collection.category !== 'all' ? collection.category : '';
    const options = { importing, labels, collection, collectionCategory, linkDestination, folders, resourceFolder,
      topicId, topics: topicsFor(studioStore.state) };
    const modes = importing ? { link: 'Link', file: 'File' } : { text: 'Text', link: 'Link', file: 'File' };
    const form = dialog(importing ? '导入资料' : 'Quick Capture', '<div class="segmented sb-capture-modes" aria-label="记录方式">' +
      Object.entries(modes).map(([key, label]) => '<button type="button" data-capture-mode="' + key +
        '" aria-pressed="' + (key === mode) + '">' + label + '</button>').join('') + '</div>' +
      '<div class="work-form-fields" data-capture-fields>' + captureFields(mode, options) +
      '</div><a class="return-link" data-capture-duplicate hidden>打开已有资料 ↗</a>', async data => {
      const destination = data.get('destination');
      const status = importing ? '' : 'inbox';
      const save = async input => ({ type: 'discover', item: await studioStore.change(state => saveBoardContent(state, { status, ...input })) });
      const saveCollection = async input => {
        const categoryId = data.get('categoryId') || '';
        const folderId = data.get('collectionFolder') || '';
        const item = await studioStore.change(state => saveCollectionItem(state, { ...input, categoryId, folderId }));
        return { type: 'collection-item', item };
      };
      const saveToTopic = async entry => {
        const item = await studioStore.change(state => {
          const id = data.get('topicId');
          const topic = id ? objectFor(state, 'topic', id) : saveExplorationTopic(state, { title: data.get('topicTitle') });
          if (!topic || topic.deletedAt) throw new Error('请选择有效的探索主题。');
          saveExplorationEntry(state, topic.id, typeof entry === 'function' ? entry(state, topic) : entry);
          return topic;
        });
        return { type: 'topic', item };
      };
      if (mode === 'text') {
        const body = data.get('body');
        if (destination === 'collections') {
          const title = body.trim().split(/\r?\n/, 1)[0].slice(0, 200);
          return saveCollection({ title, notes: body, resourceType: 'other' });
        }
        return save({ type: 'thought', body, reflectionLabelId: data.get('reflectionLabelId') || '' });
      }
      if (mode === 'file' && !importing) {
        const document = await readImportedDocument(data.get('document'), true);
        if (destination === 'writing') return save({ ...document, type: 'article' });
        if (destination === 'reflections') return save({ ...document, type: 'thought' });
        const title = document.title.slice(0, 200);
        if (destination === 'collections') return saveCollection({ title, notes: document.body, resourceType: 'other' });
        if (data.get('discoverArea') === 'personal') return saveToTopic({ type: 'note', title, body: document.body });
        const category = data.get('discoverCategory');
        const selected = initialDiscoverCategories.find(([name]) => name === category);
        if (destination !== 'discover' || !selected) throw new Error('请选择要添加到的栏目和分类。');
        return save({ ...document, type: selected[2], discoverCategory: category, folderId: data.get('folderId') || '' });
      }

      const personalNotes = data.get('personalNotes')?.trim() || '';
      if (mode === 'file') {
        const attachments = await attachmentInputs(data);
        if (!attachments.length) throw new Error('请选择一个文件。');
        const item = await studioStore.change(state => saveBoardContent(state, {
          type: 'resource', status, ...(category ? { discoverCategory: category, folderId } : {}),
          title: attachments[0].name, sourceType: 'file', assetIds: withAssets(state, data, attachments), personalNotes,
        }));
        return { type: 'discover', item };
      }
      const duplicate = form.querySelector('[data-capture-duplicate]');
      duplicate.hidden = true;
      const sourceUrl = data.get('sourceUrl').trim();
      const key = resourceKey(sourceUrl);
      if (!key) throw new Error('请输入有效的 HTTP 或 HTTPS 链接。');
      if (destination === 'personal') {
        return saveToTopic((state, topic) => {
          const existing = resourceAtUrl(state, sourceUrl);
          const reference = existing ? { type: existing.type, id: existing.item.id } : null;
          if (entriesFor(state, topic.id).some(entry => entry.type === 'reference' &&
              (resourceKey(entry.url) === key || (reference && entry.reference?.type === reference.type && entry.reference.id === reference.id)))) {
            throw new Error('该主题已经收录这个链接。');
          }
          return {
            type: 'reference', title: existing ? contentTitle(existing.item) : new URL(sourceUrl).hostname,
            body: personalNotes, url: reference ? '' : sourceUrl, reference,
          };
        });
      }
      const existing = resourceAtUrl(studioStore.state, sourceUrl);
      if (existing) {
        duplicate.hidden = false;
        duplicate.href = objectHref(existing.type, existing.item);
        throw new Error('这个链接已收藏。可以打开已有记录补充备注。');
      }
      if (destination === 'collections') return saveCollection({ url: sourceUrl, notes: personalNotes });
      return save({
        type: 'resource', discoverCategory: category || resourcesCategory,
        folderId: importing ? folderId : data.get('resourceFolder') || '',
        title: new URL(sourceUrl).hostname, sourceUrl, sourceType: sourceType(sourceUrl), savedAt: new Date().toISOString(), personalNotes,
      });
    }, ({ type, item }) => {
      const address = objectHref(type, item);
      if (location.hash === address) refresh(item.id);
      else location.hash = address;
    }, importing ? '导入资料' : '保存', importing ? '' : 'sb-capture-dialog');

    function syncLocation() {
      const destination = form.elements.destination?.value;
      const area = destination === 'discover' ? form.elements.discoverArea.value : '';
      for (const group of form.querySelectorAll('[data-capture-destination]')) {
        const location = group.dataset.captureDestination;
        group.hidden = group.disabled = location !== destination && location !== area;
      }
      const topicName = form.querySelector('[data-capture-topic-name]');
      if (topicName) {
        const isNew = !form.elements.topicId.value;
        topicName.hidden = !isNew;
        form.elements.topicTitle.disabled = !isNew;
      }
      if (destination === 'collections') {
        const folder = form.elements.collectionFolder;
        const choices = collectionFolderOptions(form.elements.categoryId.value);
        const selected = folder.value;
        const options = Object.entries(choices);
        folder.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
        folder.value = Object.hasOwn(choices, selected) ? selected : '';
        folder.disabled = form.querySelector('[data-capture-collection-folder]').hidden = options.length === 1;
      }
      if (area === 'wiki') {
        const choices = categoryFolders(folders, form.elements.discoverCategory.value);
        const folder = form.elements.folderId;
        fillFolderSelect(folder, folders, choices);
        folder.disabled = form.querySelector('[data-capture-folder]').hidden = !choices.length;
      }
      for (const checked of form.querySelectorAll('.sb-capture-options input:checked:not(:disabled)')) {
        revealCaptureOption(checked);
      }
    }

    const drafts = new Map();
    syncLocation();
    form.addEventListener('change', event => {
      if (event.target.type === 'radio') syncLocation();
    });
    form.addEventListener('focusin', event => {
      if (event.target.matches('.sb-capture-options input')) revealCaptureOption(event.target);
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

  function inlineEditor(host, fields, save, after, { writing, cancelTo, draftKey }) {
    const box = host.querySelector('[data-sb-editor]');
    const reading = host.querySelector('[data-sb-reading]');
    if (!box.hidden) return;
    const buffered = draftKey && wikiDrafts.get(draftKey);
    if (buffered) {
      box.append(buffered);
      box.hidden = false;
      buffered.elements.title.focus();
      return;
    }
    box.innerHTML = '<form class="sb-inline-form"><div class="work-form-fields">' + fields +
      '</div><p class="work-error" role="alert" hidden></p><div class="sb-inline-actions">' +
      '<button type="button" class="action-button secondary" data-sb-cancel-edit>取消</button>' +
      '<button type="submit" class="action-button">' + (writing ? cancelTo ? '保存文章' : '保存版本' : cancelTo ? '保存文件' : '保存') + '</button></div></form>';
    box.hidden = false;
    if (reading) reading.hidden = true;
    const form = box.querySelector('form');
    if (draftKey) form.addEventListener('input', () => wikiDrafts.set(draftKey, form));
    const returnFocus = reading?.querySelector('[data-sb-edit]');
    form.querySelector('[data-sb-cancel-edit]').addEventListener('click', () => {
      if (cancelTo) {
        wikiDrafts.delete(draftKey);
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
        const saved = await save(data);
        wikiDrafts.delete(draftKey);
        after(saved);
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

  function editContent({ stored, type, category, folderId, host, cancelTo, draftKey }) {
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
    const form = host ? inlineEditor(host, fields, save, after, { writing, cancelTo, draftKey }) : dialog('新建记录', fields, save, after);
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

  function editRelation(id, sourceId, sourceType) {
    const state = studioStore.state;
    const current = state.relations.find(row => row.id === id);
    const board = boardRecords(state, true);
    const library = [['topic', topicsFor(state)], ['collection-item', itemsFor(state)]];
    if (!board.length && library.every(([, rows]) => !rows.length)) {
      quickCapture();
      return;
    }
    const ref = (type, itemId) => JSON.stringify([type, itemId]);
    const currentSource = current ? ref(current.sourceType, current.sourceId) : sourceId ? ref(sourceType || 'discover', sourceId) : '';
    const currentTarget = current && ref(current.targetType, current.targetId);
    const choices = { '': '选择起点' };
    for (const [kind, items] of [['discover', board], ...library, ['project', state.projects], ['event', state.events]]) {
      for (const item of items) choices[ref(kind, item.id)] = contentTitle(item) + ' · ' +
        (kind === 'discover' ? contentTypes[item.type] : objectLabels[kind]);
    }
    const form = dialog(current ? '编辑关联' : '新增关联', select('source', '起点', choices, currentSource, 'required') +
      pair(field('query', '搜索目标', '', 'type="search" placeholder="标题或正文"'),
        select('kind', '目标模块', { '': '所有对象', ...objectLabels })) +
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
        (row.type === 'discover' ? contentTypes[boardContent(row.item).type] : objectLabels[row.type]), ref(row.type, row.item.id))));
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
  function searchWiki(event) {
    const form = event.target.closest('[data-sb-wiki-search]');
    if (!form) return;
    if (event.type === 'submit') event.preventDefault();
    const results = app.querySelector('[data-sb-wiki-results]');
    const query = form.elements.query.value.trim();
    results.hidden = !query;
    results.innerHTML = wikiSearchResults(readRoute(location.hash), query);
    app.querySelector('[data-sb-wiki-directory]').hidden = Boolean(query);
  }
  for (const event of ['input', 'submit']) app.addEventListener(event, searchWiki);
  function searchFromHeader(event) {
    const form = event.target.closest('[data-sb-floating-search]');
    if (!form) return;
    if (event.type === 'submit') event.preventDefault();
    const query = form.elements.query.value.trim();
    app.querySelector('[data-sb-search-results]').innerHTML = query ? searchResults(query) : '';
  }
  for (const event of ['input', 'submit']) app.addEventListener(event, searchFromHeader);
  app.addEventListener('toggle', event => {
    if (event.target.matches('[data-sb-header-search][open]')) {
      event.target.querySelector('input').focus({ preventScroll: true });
    }
  }, true);
  app.addEventListener('submit', event => {
    if (!event.target.matches('[data-sb-search]')) return;
    event.preventDefault();
    const query = new FormData(event.target).get('query').trim();
    location.hash = boardHref('search') + (query ? '?' + new URLSearchParams({ q: query }) : '');
  });
  app.addEventListener('pointerover', event => {
    const details = event.target.closest('[data-sb-title-switcher]');
    if (event.pointerType === 'mouse' && details && !details.contains(event.relatedTarget)) details.open = true;
  });
  app.addEventListener('pointerout', event => {
    const details = event.target.closest('[data-sb-title-switcher]');
    if (event.pointerType === 'mouse' && details && !details.contains(event.relatedTarget) &&
        !details.querySelector('nav :focus-visible')) details.open = false;
  });
  app.addEventListener('focusout', event => {
    const details = event.target.closest('[data-sb-title-switcher][open]');
    if (details && !details.contains(event.relatedTarget) && !details.matches(':hover')) details.open = false;
  });
  app.addEventListener('click', event => {
    if (event.pointerType === 'mouse' && event.target.closest('[data-sb-title-switcher][open] > summary')) {
      event.preventDefault();
    }
    for (const details of app.querySelectorAll('[data-sb-disclosure][open]')) {
      if (!details.contains(event.target) || event.target.closest('a')) details.open = false;
    }
  });
  app.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || app.querySelector('dialog[open]')) return;
    const details = event.target.closest('[data-sb-disclosure][open]') || app.querySelector('[data-sb-disclosure][open]');
    if (!details) return;
    details.open = false;
    details.querySelector('summary').focus();
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
    if (sbCapture === '') {
      let collection;
      if (route.section === 'collections') {
        collection = route.entity ? { category: route.record.categoryId, folder: route.record.folderId } : collectionLocation(route);
      }
      const record = route.type === 'content-detail' ? boardContent(route.record) : null;
      const wiki = route.section === 'discover' || (record && boardSection(record) === 'discover');
      const wikiCategory = record ? discoverCategory(record) : route.params?.get('category');
      const resourceFolder = wikiCategory === resourcesCategory ? record?.folderId || route.params?.get('folder') || '' : '';
      const linkDestination = route.tab === 'explorations' ? 'personal' : wiki ? 'resources' : 'collections';
      quickCapture({ collection, linkDestination, topicId: route.entity === 'topic' ? route.record.id : '', resourceFolder });
    }
    else if (sbCapture) editContent({ type: sbCapture });
    if (sbImport === 'article') importArticle();
    if (sbImport === 'resource') quickCapture({ importing: true, category: sbCategory, folderId: sbFolder });
    if (sbEdit) editContent({ stored: objectFor(studioStore.state, 'discover', sbEdit), host });
    if (sbRelation !== undefined) editRelation(sbRelation || undefined, sbSource, button.dataset.sbSourceType);
    if (sbMakeFolder !== undefined) editFolder(sbMakeFolder || undefined, sbCategory, sbFolder);
    if (button.dataset.sbDeleteFolder) {
      const id = button.dataset.sbDeleteFolder;
      dialog('删除 Wiki 文件夹', '<p>条目和子文件夹会移到上一级，关联保持不变。</p>',
        () => studioStore.change(state => removeBoardFolder(state, id)), () => refresh(), '移出内容并删除文件夹');
    }
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
    if (route.section === 'search') app.querySelector('[data-sb-search] input').focus({ preventScroll: true });
    if (route.section === 'discover' && route.tab === 'explorations') {
      const wikiTab = app.querySelector('.library-discover-tabs a');
      if (wikiTab) wikiTab.href = lastWiki;
    } else if (route.type === 'board' && route.section === 'discover') {
      lastWiki = location.hash || discoverAddress();
    }
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
    editContent({ type, category, folderId: folder?.id, host, cancelTo: route.parent, draftKey: discoverAddress(category, folder?.id, true) });
  };
}
