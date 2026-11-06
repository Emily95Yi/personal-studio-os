import { escapeHtml as esc } from './html.js';
import { collectionsAddress, explorationAddress, readRoute } from './pages.js';
import { categoryFor, categoryList, entriesFor, entryTypes, foldersFor, moveCollectionCategory, moveExplorationEntry,
  removeCollectionCategory, removeCollectionFolder, removeExplorationEntry, resourceAtUrl, resourceTypes, saveCollectionCategory,
  saveCollectionFolder, saveCollectionItem, saveExplorationEntry, saveExplorationTopic, setLibraryDeleted } from './board-library-data.js';
import { collectionLocation, explorationResults, optionsHtml } from './board-library-view.js';
import { contentTitle, objectFor, relationCandidates, studioStore, studioTags } from './studio-data.js';
import { studioDialog } from './studio-dialog.js';
import { objectHref, objectLabels } from './workshop-view.js';

const field = (name, label, value = '', attrs = '') => '<label>' + label + '<input name="' + name + '" value="' +
  esc(value) + '" ' + attrs + '></label>';
const text = (name, label, value = '', rows = 3) => '<label>' + label + '<textarea rows="' + rows + '" name="' +
  name + '">' + esc(value) + '</textarea></label>';
const select = (name, label, choices, value, attrs = '') => '<label>' + label + '<select name="' + name + '" ' +
  attrs + '>' + optionsHtml(choices, value) + '</select></label>';
const pair = (...fields) => '<div class="work-form-pair">' + fields.join('') + '</div>';
const state = () => studioStore.state;
const save = callback => studioStore.change(callback);
const categoryOptions = (except = '') => [['', 'Inbox'],
  ...categoryList(state()).filter(row => row.id !== except)
    .map(row => [row.id, row.title + (row.hidden ? '（已隐藏）' : '')])];
const duplicateLink = '<a data-library-duplicate class="return-link" hidden>打开已有条目 ↗</a>';

function checkDuplicate(form, url, item) {
  const output = form.querySelector('[data-library-duplicate]');
  output.hidden = true;
  if (!url || url === item?.url) return;
  const duplicate = resourceAtUrl(state(), url, item?.id);
  if (duplicate) {
    output.href = objectHref(duplicate.type, duplicate.item);
    output.hidden = false;
    throw new Error('这个链接已保存。可以打开原条目，或在相关内容里引用它。');
  }
}

export function initLibraryActions(app, render) {
  let explorationTag = '';
  const dialog = (...args) => studioDialog(app, ...args);
  const go = address => { location.hash = address; };
  function refresh(action, id) {
    const keepManager = app.querySelector('[data-library-manager]')?.open;
    const keepRelations = app.querySelector('.library-reader .sb-related')?.open;
    render();
    if (keepManager && app.querySelector('[data-library-manager]')) app.querySelector('[data-library-manager]').open = true;
    if (keepRelations && app.querySelector('.library-reader .sb-related')) app.querySelector('.library-reader .sb-related').open = true;
    const matching = action && [...app.querySelectorAll('[data-library]')].find(button =>
      button.dataset.library === action && button.dataset.id === (id || '') && !button.disabled && button.getClientRects().length);
    const summary = app.querySelector('[data-library-manager][open] > summary, [data-library-sidebar] > summary');
    (matching || summary || app.querySelector('main')).focus({ preventScroll: true });
  }

  function editItem(item) {
    const form = dialog('编辑收藏', field('title', '标题', item.title, 'required maxlength="200" autofocus') +
      text('description', '简介', item.description) +
      pair(select('categoryId', '分类', categoryOptions(), item.categoryId),
        select('folderId', '文件夹', [])) +
      pair(select('resourceType', '资源类型', Object.entries(resourceTypes), item.resourceType), select('status', '状态', [])) +
      '<p class="work-meta" data-status-note hidden>当前分类没有这个状态。可保留原值，也可以选择新状态或明确清空。</p>' +
      field('tags', '标签（逗号分隔）', item.tags.join(', ')) + field('url', '原始链接', item.url, 'type="url"') +
      field('coverUrl', '封面图片地址', item.coverUrl, 'type="url" placeholder="https://"') +
      text('notes', '备注 · Markdown', item.notes, 5) + duplicateLink, data => {
      checkDuplicate(form, data.get('url').trim(), item);
      return save(snapshot => saveCollectionItem(snapshot, { ...Object.fromEntries(data), id: item.id, tags: studioTags(data.get('tags')) }));
    }, () => refresh('item', item.id));

    function sync(folderId, status) {
      const categoryId = form.elements.categoryId.value;
      const category = categoryFor(state(), categoryId);
      form.elements.folderId.innerHTML = optionsHtml([['', '不使用文件夹'],
        ...foldersFor(state(), categoryId).map(row => [row.id, row.title])], folderId);
      const retained = item.status && !category.statuses.includes(item.status);
      const statuses = category.statuses.map(value => [value, value]);
      if (retained) statuses.push([item.status, item.status + '（保留原状态）']);
      form.elements.status.innerHTML = optionsHtml([['', '未设状态'], ...statuses],
        !status || statuses.some(([value]) => value === status) ? status : item.status);
      form.querySelector('[data-status-note]').hidden = !retained;
    }
    form.elements.categoryId.addEventListener('change', () => sync(form.elements.folderId.value, form.elements.status.value));
    sync(item.folderId, item.status);
  }

  function editCategory(id) {
    const row = id ? categoryFor(state(), id) : null;
    dialog(row ? '重命名分类' : '新建分类',
      field('title', '分类名称', row?.title, 'required maxlength="100" autofocus'),
    data => save(snapshot => saveCollectionCategory(snapshot, {
      id, title: data.get('title'),
    })), () => refresh(id ? 'category' : 'categories', id));
  }

  function deleteCategory(id, route) {
    const row = categoryFor(state(), id);
    const count = state().collectionItems.filter(item => item.categoryId === id).length;
    dialog('删除分类', '<p>' + esc(row.title) + ' 的 ' + count + ' 条收藏将迁往选定分类的根目录。文件夹将移除，原状态与关联会保留。</p>' +
      select('destination', '迁移到', categoryOptions(id), ''), data =>
      save(snapshot => removeCollectionCategory(snapshot, id, data.get('destination'))), () => {
      if (route.params.get('category') === id) go(collectionsAddress());
      else refresh('categories');
    }, '迁移并删除分类');
  }

  function editFolder(id, route) {
    const { category } = collectionLocation(route);
    const row = id ? foldersFor(state(), category).find(folder => folder.id === id) : null;
    dialog(row ? '重命名文件夹' : 'New Folder', field('title', '文件夹名称', row?.title, 'required maxlength="100" autofocus'),
      data => save(snapshot => saveCollectionFolder(snapshot, { id, categoryId: category, title: data.get('title') })),
      () => refresh('folder', id));
  }

  function deleteFolder(id, route) {
    const location = collectionLocation(route);
    const row = foldersFor(state(), location.category).find(folder => folder.id === id);
    dialog('删除文件夹', '<p>移除「' + esc(row.title) + '」，其中的收藏将保留在分类根目录。</p>',
      () => save(snapshot => removeCollectionFolder(snapshot, id)), () => {
      if (location.folder === id) go(collectionsAddress({ ...location, folder: '' }));
      else refresh('folder');
    }, '移出收藏并删除文件夹');
  }

  function editTopic(id) {
    const row = id ? objectFor(state(), 'topic', id) : null;
    dialog(row ? '编辑主题' : 'New Topic', field('title', '主题名称', row?.title, 'required maxlength="200" autofocus') +
      text('description', '简介 · Markdown', row?.description) + field('tags', '标签（逗号分隔）', row?.tags.join(', ')) +
      pair(field('icon', '图标（例如一个 Emoji）', row?.icon, 'maxlength="16"'),
        field('coverUrl', '封面图片地址', row?.coverUrl, 'type="url" placeholder="https://"')),
    data => save(snapshot => saveExplorationTopic(snapshot, { ...Object.fromEntries(data), id, tags: studioTags(data.get('tags')) })),
    item => id ? refresh('topic', id) : go(explorationAddress(item.id)));
  }

  function editEntry(topic, id) {
    const row = id ? entriesFor(state(), topic.id).find(entry => entry.id === id) : null;
    const ref = (type, key) => JSON.stringify([type, key]);
    let selected = row?.reference ? ref(row.reference.type, row.reference.id) : '';
    const form = dialog(row ? '编辑条目' : 'New Entry', select('type', '条目类型', Object.entries(entryTypes), row?.type ?? 'note') +
      field('title', '标题（可选）', row?.title, 'maxlength="200" autofocus') + text('body', '正文 · Markdown', row?.body, 6) +
      '<fieldset class="work-form-fields library-reference-fields" data-entry-reference>' +
      field('url', '外部资料链接', row?.url, 'type="url"') + field('query', '搜索现有内容', '', 'type="search"') +
      select('reference', '引用对象（可选）', []) + '</fieldset>', data => {
      const value = data.get('reference');
      const [type, key] = value ? JSON.parse(value) : [];
      return save(snapshot => saveExplorationEntry(snapshot, topic.id, { ...Object.fromEntries(data), id,
        reference: type ? { type, id: key } : null }));
    }, () => refresh('entry', id));

    function targets() {
      const current = row?.reference && objectFor(state(), row.reference.type, row.reference.id);
      const options = new Map([['', '不引用现有内容']]);
      for (const { type, item } of relationCandidates(state(), 'topic', topic.id, { query: form.elements.query.value, includeLinked: true })) {
        options.set(ref(type, item.id), contentTitle(item) + ' · ' + objectLabels[type]);
      }
      if (current && !options.has(ref(row.reference.type, current.id))) {
        options.set(ref(row.reference.type, current.id), contentTitle(current) + (current.deletedAt ? '（当前不可用）' : '（原引用）'));
      }
      if (selected && !options.has(selected)) {
        const [type, key] = JSON.parse(selected);
        const item = objectFor(state(), type, key);
        if (item) options.set(selected, contentTitle(item) + '（已选择）');
      }
      form.elements.reference.innerHTML = optionsHtml([...options], selected);
    }
    function toggle() {
      const show = form.elements.type.value === 'reference';
      const block = form.querySelector('[data-entry-reference]');
      block.hidden = !show;
      block.disabled = !show;
    }
    form.elements.type.addEventListener('change', toggle);
    form.elements.query.addEventListener('input', targets);
    form.elements.reference.addEventListener('change', () => { selected = form.elements.reference.value; });
    targets();
    toggle();
  }

  function applyTopicTag(tag) {
    explorationTag = tag;
    app.querySelector('[data-library-results]').innerHTML = explorationResults(tag);
  }

  app.addEventListener('change', event => {
    if (event.target.matches('[data-library-topic-tag]')) applyTopicTag(event.target.value);
  });

  app.addEventListener('click', async event => {
    const button = event.target.closest('[data-library]');
    if (!button) return;
    const { library: action, id } = button.dataset;
    const route = readRoute(location.hash);
    if (action === 'item') editItem(route.record);
    if (action === 'topic') editTopic(id);
    if (action === 'entry') editEntry(route.record, id);
    if (action === 'category') editCategory(id);
    if (action === 'folder') editFolder(id, route);
    if (action === 'delete-category') deleteCategory(id, route);
    if (action === 'delete-folder') deleteFolder(id, route);
    if (action === 'categories') {
      app.querySelector('[data-library-sidebar]').open = false;
      const details = app.querySelector('[data-library-manager]');
      details.open = true;
      details.querySelector('summary').focus();
    }
    if (action === 'delete-entry') {
      const row = entriesFor(state(), route.record.id).find(entry => entry.id === id);
      dialog('删除探索条目', '<p>确定删除「' + esc(row.title) + '」？</p>',
        () => save(snapshot => removeExplorationEntry(snapshot, route.record.id, id)), () => refresh('entry'), '删除条目');
    }
    if (['delete-topic', 'delete-item', 'recover'].includes(action)) {
      const type = action === 'recover' ? button.dataset.type : route.entity;
      const deleting = action !== 'recover';
      const row = objectFor(state(), type, id);
      const label = deleting ? '移到回收站' : '恢复记录';
      dialog(label, '<p>' + esc(row.title) + '</p>',
        () => save(snapshot => setLibraryDeleted(snapshot, type, id, deleting)), () => {
          go(deleting ? route.parent : objectHref(type, row));
        }, label);
    }
    if (action === 'category-visibility' || /^(category|entry)-(up|down)$/.test(action)) {
      const step = action.endsWith('-up') ? -1 : 1;
      button.disabled = true;
      try {
        await save(snapshot => {
          if (action === 'category-visibility') {
            const row = categoryFor(snapshot, id);
            return saveCollectionCategory(snapshot, { id, title: row.title, hidden: !row.hidden });
          }
          if (action.startsWith('category-')) return moveCollectionCategory(snapshot, id, step);
          return moveExplorationEntry(snapshot, route.record.id, id, step);
        });
        refresh(action === 'category-visibility' ? action : action.startsWith('category-') ? 'category' : 'entry', id);
      } catch (error) {
        const message = document.createElement('p');
        message.className = 'work-error';
        message.setAttribute('role', 'alert');
        message.textContent = error.message;
        button.closest('li').append(message);
        button.disabled = false;
      }
    }
  });

  return () => {
    const filter = app.querySelector('[data-library-topic-tag]');
    if (!filter || !explorationTag) return;
    if ([...filter.options].some(option => option.value === explorationTag)) filter.value = explorationTag;
    applyTopicTag(filter.value);
  };
}
