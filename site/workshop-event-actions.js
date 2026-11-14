import { safeUrl } from './html.js';
import { readRoute } from './pages.js';
import { beginStudioEdit, refreshStudioSync, studioSync } from './studio-cloud.js';
import { addAsset, contentTitle, currentVersion, eventSections, objectFor, relationCandidates, saveEvent, studioStore, studioTags } from './studio-data.js';
import { fileInput } from './workshop-actions.js';
import { saveWorkshopTag, wikiRecords, wikiStatus } from './workshop-library.js';
import { eventFields, objectHref } from './workshop-view.js';
import { activeFlow, addEventResource, archiveEventFlow, copyEventFlow, duplicateEvent, editEventResource,
  eventResources, legacyProjectOrder, moveWorkshopItem, orderedProjects, removeEventResource, saveEventDocument, setFlowResources } from './workshop-event-data.js';
import { areaLabels, creationForm, documentFields, flowAssignment, initialSections, metadataFields, option,
  resourceFields, resourceInputFields, resourcePicker, select, textArea, wikiOptions } from './workshop-event-view.js';

const editor = '[data-event-editor]';
const creation = '[data-event-create]';
const formSelector = editor + ', ' + creation;
const value = (data, name) => String(data.get(name) ?? '').trim();
const tags = (state, data) => [...new Set([...data.getAll('tagId'),
  ...studioTags(value(data, 'newTags')).map(name => saveWorkshopTag(state, name).id)])];
const control = (form, name) => form.elements.namedItem(name);
const getEvent = id => objectFor(studioStore.state, 'event', id);
const legacyFields = { 'legacy-body': ['body', '活动正文'], 'legacy-description': ['description', '活动介绍'] };

function status(form, message, error = false, rebase = false) {
  const node = form.querySelector('[data-event-save-status]');
  node.textContent = message;
  node.classList.toggle('work-error', error);
  form.querySelector('[data-event-rebase]').hidden = !rebase;
}

function savedMessage() {
  return studioSync.mode === 'cloud' ? '已同步到云端' : '已保存到本地预览';
}

function syncConflict(error) {
  return ['conflict', 'lease_expired', 'stale_editor'].includes(error.code);
}

function baselineError() {
  return Object.assign(new Error('云端内容已更新。请查看最新预览，再决定是否提交这份草稿。'), { code: 'stale_editor' });
}

function readResource(data, file) {
  const kind = value(data, 'kind');
  if (!kind) return null;
  const target = value(data, 'resourceTarget');
  if (['card', 'wiki', 'related'].includes(kind) && !target) throw new Error('请选择要关联的资源。');
  const [type, id] = target ? JSON.parse(target) : [];
  const assetId = value(data, 'existingAsset');
  if (kind === 'asset' && !file && !assetId) throw new Error('请选择一个文件。');
  if (kind === 'asset' && file && assetId) throw new Error('请只选择一个文件。');
  return { kind, id, type, file, assetId, url: value(data, 'resourceUrl'), title: value(data, 'resourceTitle'),
    role: value(data, 'role'), note: value(data, 'note'), quantity: value(data, 'quantity'),
    mode: value(data, 'mode') || 'live', versionId: value(data, 'versionId') };
}

function saveMetadata(state, event, data, cover) {
  const posterUrl = value(data, 'posterUrl');
  if (posterUrl && !safeUrl(posterUrl)) throw new Error('海报链接须使用 HTTPS 或站内路径。');
  const fields = Object.fromEntries(Object.keys(eventFields).map(key => [key, value(data, key)]));
  const title = value(data, 'title');
  const publicationChanged = title !== event.title || fields.date !== (event.date || '') || fields.theme !== (event.theme || '');
  return saveEvent(state, { ...fields, id: event.id, title, posterUrl, tagIds: tags(state, data),
    projectId: value(data, 'projectId'), status: value(data, 'status'), formats: data.getAll('format'),
    coverAssetId: cover ? addAsset(state, cover) : data.has('clearCover') ? '' : event.coverAssetId,
    ...(data.has('clearCover') && { coverUrl: '' }),
    ...(publicationChanged && { workshopPublication: undefined }),
    ...(typeof event.attendeeCount === 'number' && fields.attendeeCount === String(event.attendeeCount) &&
      { attendeeCount: event.attendeeCount }),
  });
}

function candidateRows(state, event, kind) {
  if (kind === 'card') return state.cardSets.map(item => ({ type: 'card', item }));
  if (kind === 'wiki') return wikiRecords(state).filter(item => wikiStatus(item) !== 'archived' && !item.deletedAt)
    .map(item => ({ type: 'discover', item }));
  const wikiIds = new Set(wikiRecords(state).map(row => row.id));
  return relationCandidates(state, 'event', event.id, { includeLinked: true })
    .filter(({ type, item }) => type !== 'discover' || !wikiIds.has(item.id));
}

export function initWorkshopEventActions(app, render) {
  const drafts = new Map();
  const openDocuments = new Map();
  let drag;
  let highlight;
  let ordering = false;
  let orderMessage = '';
  let orderError = false;
  let nextCreated;

  function keyFor(form) {
    if (form.matches(editor)) return 'editor:' + form.closest('[data-event-detail]').dataset.eventDetail;
    if (form.dataset.eventCopy) return 'copy:' + form.dataset.eventCopy;
    return 'create:' + form.dataset.eventCreate;
  }

  function remember(form) {
    form.dataset.eventRevision ||= form.dataset.eventEditorBaseline || String(studioStore.state.revision);
    drafts.set(keyFor(form), form);
  }

  function discard(form) {
    drafts.delete(keyFor(form));
    delete form.dataset.eventRevision;
  }

  function canReplace(form) {
    if (form.inert) return false;
    return !form.hasAttribute('data-event-revision') || window.confirm('放弃当前尚未保存的修改？');
  }

  function updateWikiFields(form, item) {
    const host = form.querySelector('[data-event-wiki-options]');
    if (host) host.innerHTML = item ? wikiOptions(item) : '';
  }

  function mountResourceInput(form, kind, event, preselectedAsset = '') {
    const target = form.querySelector('[data-event-resource-fields]');
    target.innerHTML = resourceInputFields(kind);
    const host = target.querySelector('[data-event-resource-search]');
    if (host) {
      host.innerHTML = '<label>搜索资源<input type="search" data-event-resource-query placeholder="搜索名称或标签"></label>' +
        select('resourceTarget', '资源', [['', '请选择']]);
      const picker = control(form, 'resourceTarget');
      const rows = candidateRows(studioStore.state, event, kind);
      const filter = () => {
        const old = picker.value;
        const term = host.querySelector('[data-event-resource-query]').value.trim().toLocaleLowerCase();
        const options = rows.filter(({ item }) => [contentTitle(item), ...(item.topics ?? []), ...(item.tags ?? [])]
          .join(' ').toLocaleLowerCase().includes(term));
        picker.replaceChildren(new Option(options.length ? '请选择' : '没有匹配的资源', ''), ...options.map(({ type, item }) =>
          new Option(contentTitle(item), JSON.stringify([type, item.id]))));
        if ([...picker.options].some(row => row.value === old)) picker.value = old;
        else updateWikiFields(form);
      };
      host.querySelector('input').addEventListener('input', filter);
      picker.addEventListener('change', () => {
        updateWikiFields(form, kind === 'wiki' && rows.find(({ item }) => JSON.stringify(['discover', item.id]) === picker.value)?.item);
      });
      filter();
    }
    if (kind === 'asset') {
      const state = studioStore.state;
      const ids = new Set([...(event.assetIds ?? []), event.coverAssetId,
        ...state.sessions.filter(row => row.ownerType === 'event' && row.ownerId === event.id && !row.workshopArchivedAt)
          .flatMap(row => { const version = currentVersion(row); return [...(version.assetIds ?? []), version.coverAssetId]; }),
        ...(event.workshopResources ?? []).map(row => row.assetId)]);
      control(form, 'existingAsset').insertAdjacentHTML('beforeend', state.assets.filter(row => ids.has(row.id))
        .map(row => option(row.id, row.name, row.id === preselectedAsset)).join(''));
    }
  }

  function setEditor(form, area, editId = '', afterId = '', mode = '', assetId = '') {
    const event = getEvent(form.closest('[data-event-detail]').dataset.eventDetail);
    const state = studioStore.state;
    const session = state.sessions.find(row => row.ownerType === 'event' && row.ownerId === event.id && row.id === editId);
    const resource = editId && eventResources(state, event).find(row => row.key === editId);
    const legacy = Object.hasOwn(legacyFields, editId) && legacyFields[editId];
    const fields = form.querySelector('[data-event-fields]');
    form.dataset.eventEditId = editId;
    form.dataset.eventEditorMode = mode;
    form.dataset.eventEditorBaseline = String(state.revision);
    form.dataset.eventArea = area;
    form.eventPastedFiles = [];
    control(form, 'area').value = area;
    control(form, 'area').disabled = Boolean(editId || mode);
    form.querySelector('[data-event-edit-label]').textContent = editId === 'metadata' ? '基础信息' :
      currentVersion(session)?.title || resource?.title || legacy?.[1] || (mode === 'reuse' ? '复用环节' : '');
    if (editId === 'metadata') fields.innerHTML = metadataFields(state, event);
    else if (legacy) fields.innerHTML = textArea('body', legacy[1], event[legacy[0]]);
    else if (mode === 'reuse') {
      const rows = state.events.filter(row => row.id !== event.id).flatMap(other =>
        activeFlow(state, other.id).map(session => [session.id, other.title + ' · ' + currentVersion(session).title]));
      fields.innerHTML = select('reuseId', '来源环节', [['', rows.length ? '请选择' : '其他 Event 暂无环节'], ...rows], '', 'required') +
        '<label class="work-check"><input name="reuseResources" type="checkbox" checked>复制关联资源</label>';
    } else if (area === 'resources' && !session) {
      fields.innerHTML = resource ? resourceFields(state, event, resource) : resourcePicker(false) + flowAssignment(state, event) +
        '<details><summary>添加资源文档</summary><button type="button" class="text-button" data-event-resource-document>写资源文档</button></details>';
      if (mode === 'document') fields.innerHTML = documentFields(state, event, area);
      if (assetId) {
        control(form, 'kind').value = 'asset';
        mountResourceInput(form, 'asset', event, assetId);
      }
    } else {
      fields.innerHTML = documentFields(state, event, area, session, afterId);
      const picker = fields.querySelector('[data-event-resource-picker]');
      if (picker) picker.innerHTML = resourcePicker(true);
    }
    status(form, '');
  }

  function revealEditor(form, area, id, after, mode, assetId) {
    if (!canReplace(form)) return;
    discard(form);
    setEditor(form, area, id, after, mode, assetId);
    form.scrollIntoView({ block: 'nearest' });
    (form.querySelector('[data-event-fields] :is(input:not([type=checkbox]), select, textarea, button)') ??
      control(form, 'area')).focus({ preventScroll: true });
  }

  function mount(route) {
    const orderStatus = app.querySelector('[data-order-status]');
    if (orderStatus) {
      orderStatus.textContent = orderMessage;
      orderStatus.classList.toggle('work-error', orderError);
    }
    const candidates = [...app.querySelectorAll(formSelector)];
    if (route.type === 'event') {
      const copy = drafts.get('copy:' + route.event.id);
      if (copy) app.querySelector('[data-event-copy-slot]').append(copy);
      for (const node of app.querySelectorAll('[data-event-document]')) {
        const open = openDocuments.get(route.event.id);
        if (open?.has(node.dataset.eventDocument)) node.open = open.get(node.dataset.eventDocument);
        node.addEventListener('toggle', () => {
          if (!node.isConnected) return;
          if (!openDocuments.has(route.event.id)) openDocuments.set(route.event.id, new Map());
          openDocuments.get(route.event.id).set(node.dataset.eventDocument, node.open);
        });
      }
    }
    for (const form of candidates) {
      const draft = drafts.get(keyFor(form));
      if (draft && draft !== form) {
        form.replaceWith(draft);
        if (draft.matches(creation)) app.querySelector('[data-event-new]')?.setAttribute('aria-expanded', 'true');
        if (!draft.inert && Number(draft.dataset.eventRevision) !== studioStore.state.revision) {
          status(draft, baselineError().message, true, true);
        }
      } else if (form.matches(editor)) setEditor(form, control(form, 'area').value);
    }
    if (route.type === 'event' && route.event.id === nextCreated) {
      nextCreated = undefined;
      status(app.querySelector(editor), savedMessage());
    }
  }

  async function submit(form) {
    if (form.inert) return;
    const route = readRoute(location.hash);
    const address = location.hash;
    const data = new FormData(form);
    const area = value(data, 'area') || control(form, 'area')?.value;
    const editId = form.dataset.eventEditId;
    const mode = form.dataset.eventEditorMode;
    const resourceKind = value(data, 'kind');
    const visibleFlowResources = [...form.querySelectorAll('[name="flowResource"]')].map(input => input.value);
    orderMessage = '';
    orderError = false;
    const sortStatus = app.querySelector('[data-order-status]');
    if (sortStatus) sortStatus.textContent = '';
    remember(form);
    form.inert = true;
    status(form, studioSync.mode === 'cloud' ? '正在同步到云端…' : '正在保存…');
    try {
      if (Number(form.dataset.eventRevision) !== studioStore.state.revision) throw baselineError();
      const files = await Promise.all([...data.getAll('attachments'), ...(form.eventPastedFiles ?? [])].map(file => fileInput(file)));
      const [cover, resourceFile] = await Promise.all([fileInput(data.get('cover'), true), fileInput(data.get('resourceFile'))]);
      const release = await beginStudioEdit();
      let result;
      try {
        if (Number(form.dataset.eventRevision) !== studioStore.state.revision) throw baselineError();
        result = await studioStore.change(state => {
          if (form.matches(creation)) {
            const input = { title: value(data, 'title'), tagIds: tags(state, data), projectId: form.dataset.eventCreate };
            if (!form.dataset.eventCopy) return saveEvent(state, input);
            const source = objectFor(state, 'event', form.dataset.eventCopy);
            if (!source) throw new Error('来源 Event 已不可用。');
            return duplicateEvent(state, source, input, {
              flow: data.has('copyFlow'), resources: data.has('copyResources'), planning: data.has('copyPlanning'),
            });
          }
          const event = objectFor(state, 'event', route.event.id);
          if (!event) throw new Error('Event 已不可用。');
          if (editId === 'metadata') {
            saveMetadata(state, event, data, cover);
            return 'metadata';
          }
          if (Object.hasOwn(legacyFields, editId)) {
            saveEvent(state, { id: event.id, title: event.title, [legacyFields[editId][0]]: String(data.get('body') ?? '') });
            return editId;
          }
          if (mode === 'reuse') {
            const source = state.sessions.find(row => row.ownerType === 'event' && row.ownerId !== event.id &&
              row.id === value(data, 'reuseId') && !row.workshopArchivedAt);
            if (!source) throw new Error('来源环节已不可用。');
            return copyEventFlow(state, event, source, undefined, data.has('reuseResources')).id;
          }
          const entry = area === 'resources' && eventResources(state, event).find(row => row.key === editId);
          if (entry) {
            editEventResource(state, event, editId, { role: value(data, 'role'), note: value(data, 'note'),
              quantity: value(data, 'quantity'), flowIds: data.getAll('flowId'), mode: value(data, 'mode'), versionId: value(data, 'versionId') });
            return editId;
          }
          if (area === 'resources' && !editId && mode !== 'document') {
            const input = readResource(data, resourceFile);
            if (!input) throw new Error('请选择资源类型。');
            const row = addEventResource(state, event, input, value(data, 'flowId'));
            return eventResources(state, event).find(entry => entry.row === row).key;
          }
          const session = editId && state.sessions.find(row => row.id === editId && row.ownerId === event.id && row.ownerType === 'event');
          if (editId && !session) throw new Error('内容已不可用。');
          const version = currentVersion(session);
          const section = session?.section || value(data, 'section') || initialSections[area];
          const body = String(data.get('body') ?? '');
          const assetIds = [...data.getAll('retainAsset'), ...files.filter(Boolean).map(file => addAsset(state, file))];
          const title = value(data, 'title') || body.trim().split(/\r?\n/, 1)[0].slice(0, 70);
          if (area === 'flow' && !title) throw new Error('请输入环节名称。');
          if (!title && !assetIds.length) throw new Error('请输入标题、正文或添加文件。');
          const details = area === 'flow' ? { workshopMinutes: value(data, 'minutes') === '' ? undefined : Number(value(data, 'minutes')),
            workshopPrompts: value(data, 'prompts'), workshopNotes: value(data, 'notes') } : undefined;
          const saved = saveEventDocument(state, event.id, { id: session?.id, section,
            title: title || eventSections[section], body, assetIds, details,
            sourceInfo: data.has('sourceInfo') ? value(data, 'sourceInfo') : version?.sourceInfo,
            sourceUrl: data.has('sourceUrl') ? value(data, 'sourceUrl') : version?.sourceUrl }, value(data, 'after'));
          if (area === 'flow') {
            setFlowResources(state, event, saved.id, data.getAll('flowResource'), visibleFlowResources);
            if (resourceKind) addEventResource(state, event, readResource(data, resourceFile), saved.id);
          }
          return saved.id;
        });
      } finally {
        release();
      }
      discard(form);
      if (location.hash !== address) return;
      if (form.matches(creation)) {
        nextCreated = result.id;
        location.hash = objectHref('event', result);
        return;
      }
      finish(result, area);
    } catch (error) {
      const conflict = syncConflict(error);
      status(form, conflict ? baselineError().message : error.message || '保存失败。', true, conflict);
    } finally {
      form.inert = false;
    }
  }

  function finish(id, area) {
    orderMessage = '';
    render();
    const form = app.querySelector(editor);
    if (!form) return;
    if (!form.hasAttribute('data-event-revision') && area) setEditor(form, area);
    if (!form.hasAttribute('data-event-revision')) status(form, savedMessage());
    const target = [...app.querySelectorAll('[data-event-saved]')].find(node => node.dataset.eventSaved === id);
    if (target) {
      const details = target.querySelector('[data-event-document]');
      if (details) details.open = true;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'nearest' });
    }
  }

  async function quickChange(update, focus) {
    if (ordering) return;
    ordering = true;
    const address = location.hash;
    const revision = studioStore.state.revision;
    const surface = app.querySelector('main');
    surface.setAttribute('aria-busy', 'true');
    const node = app.querySelector('[data-order-status]');
    if (node) {
      node.textContent = studioSync.mode === 'cloud' ? '正在同步到云端…' : '正在保存…';
      node.classList.remove('work-error');
    }
    try {
      const release = await beginStudioEdit();
      let id;
      try {
        if (revision !== studioStore.state.revision) throw baselineError();
        id = await studioStore.change(update);
      } finally {
        release();
      }
      orderMessage = savedMessage();
      orderError = false;
      if (location.hash !== address) return;
      if (id) finish(id, 'flow');
      else {
        render();
        focus?.();
      }
    } catch (error) {
      orderMessage = error.message;
      orderError = true;
      if (location.hash === address && node) {
        node.textContent = orderMessage;
        node.classList.add('work-error');
      }
    } finally {
      surface.removeAttribute('aria-busy');
      ordering = false;
    }
  }

  function move(data) {
    const eventId = app.querySelector('[data-event-detail]')?.dataset.eventDetail;
    void quickChange(state => {
      moveWorkshopItem(state, { ...data, eventId, projectOrder: data.kind === 'project' ? legacyProjectOrder(state.projects) : [] });
    }, () => {
      const item = [...app.querySelectorAll('[data-order-item]')].find(row =>
        row.dataset.orderItem === data.kind && row.dataset.id === data.id);
      (item?.querySelector('button[data-order-move]:not(:disabled)') ?? item?.querySelector('a'))?.focus({ preventScroll: true });
    });
  }

  app.addEventListener('submit', event => {
    if (!event.target.matches(formSelector)) return;
    event.preventDefault();
    void submit(event.target);
  });

  app.addEventListener('input', event => {
    const form = event.target.closest(formSelector);
    if (form && event.target.name !== 'area') {
      remember(form);
      if (Number(form.dataset.eventRevision) === studioStore.state.revision &&
        !form.querySelector('[data-event-save-status]').classList.contains('work-error')) status(form, '草稿未提交');
    }
  });

  app.addEventListener('change', event => {
    const node = event.target;
    if (node.matches('[data-event-move-project]')) {
      const item = getEvent(node.dataset.id);
      const projectId = node.value;
      node.value = item.projectId || '';
      if (projectId !== node.value) move({ kind: 'group-event', id: item.id, projectId });
      return;
    }
    const form = node.closest(editor);
    if (!form) return;
    const current = getEvent(form.closest('[data-event-detail]').dataset.eventDetail);
    if (node.name === 'area') {
      const next = node.value;
      const previous = form.dataset.eventArea;
      if (!canReplace(form)) node.value = previous;
      else {
        discard(form);
        setEditor(form, next);
      }
    }
    if (node.matches('[data-event-resource-kind]')) mountResourceInput(form, node.value, current);
    if (node.name === 'mode') {
      const version = control(form, 'versionId');
      if (version) version.disabled = node.value !== 'pinned_version';
    }
  });

  function addPastedFiles(form, files) {
    if (!files.length || form.inert || !control(form, 'attachments')) return false;
    form.eventPastedFiles = [...(form.eventPastedFiles ?? []), ...files];
    const label = form.querySelector('[data-event-files]');
    label.textContent = '已添加：' + form.eventPastedFiles.map(file => file.name).join('、');
    label.hidden = false;
    remember(form);
    status(form, '草稿未提交');
    return true;
  }

  app.addEventListener('paste', event => {
    const form = event.target.closest(editor);
    if (form && addPastedFiles(form, [...(event.clipboardData?.files ?? [])]) && !event.clipboardData.getData('text/plain')) {
      event.preventDefault();
    }
  });

  app.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    const data = button.dataset;
    const form = app.querySelector(editor);
    if (Object.hasOwn(data, 'eventNew')) {
      const create = app.querySelector(creation);
      if (!create) return;
      create.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      control(create, 'title').focus();
    } else if (Object.hasOwn(data, 'eventNewClose')) {
      const create = button.closest(creation);
      if (!canReplace(create)) return;
      discard(create);
      if (create.dataset.eventCopy) create.remove();
      else {
        create.reset();
        create.hidden = true;
        status(create, '');
        app.querySelector('[data-event-new]')?.setAttribute('aria-expanded', 'false');
        app.querySelector('[data-event-new]')?.focus();
      }
    } else if (Object.hasOwn(data, 'eventSearchToggle')) {
      const search = app.querySelector('[data-event-search]');
      search.hidden = !search.hidden;
      button.setAttribute('aria-expanded', String(!search.hidden));
      if (!search.hidden) search.elements.q.focus();
    } else if (Object.hasOwn(data, 'orderMove')) {
      move({ kind: data.orderKind, id: data.id, target: data.orderMove, after: Object.hasOwn(data, 'orderAfter'), projectId: data.group });
    } else if (Object.hasOwn(data, 'eventImportOrder')) {
      void quickChange(state => {
        orderedProjects(state.projects, legacyProjectOrder(state.projects)).forEach((project, index) => { project.workshopOrder = index; });
      });
    } else if (form && data.eventTarget) {
      revealEditor(form, data.eventTarget, data.eventEdit, data.eventAfter, '', data.eventAsset);
    } else if (form && Object.hasOwn(data, 'eventEditorReset')) {
      revealEditor(form, 'overview');
    } else if (form && Object.hasOwn(data, 'eventResourceDocument')) {
      revealEditor(form, 'resources', '', '', 'document');
    } else if (form && Object.hasOwn(data, 'eventReuseFlow')) {
      revealEditor(form, 'flow', '', '', 'reuse');
    } else if (form && Object.hasOwn(data, 'eventDuplicate')) {
      const slot = app.querySelector('[data-event-copy-slot]');
      if (!slot.firstElementChild) {
        const current = getEvent(form.closest('[data-event-detail]').dataset.eventDetail);
        slot.innerHTML = creationForm(studioStore.state, { projectId: current.projectId || '', source: current });
        remember(slot.firstElementChild);
      }
      control(slot.firstElementChild, 'title').focus();
      button.closest('.workshop-menu').open = false;
    } else if (Object.hasOwn(data, 'eventRebase')) {
      const draft = button.closest(formSelector);
      const address = location.hash;
      button.disabled = true;
      await refreshStudioSync();
      if (Number(draft.dataset.eventRevision) !== studioStore.state.revision) {
        draft.dataset.eventRevision = String(studioStore.state.revision);
        status(draft, '已载入最新预览。请核对内容后再保存草稿。');
      } else status(draft, '草稿已保留，可以重试保存。');
      if (location.hash === address) render();
      button.disabled = false;
    } else if (form && (data.eventCopyFlow || data.eventRemoveFlow || data.eventRestoreFlow || data.eventRemoveResource)) {
      const eventId = form.closest('[data-event-detail]').dataset.eventDetail;
      if (data.eventRemoveFlow && !window.confirm('删除此环节？可以从已删除环节恢复正文，资源会保留在 Event 中。')) return;
      if (data.eventRemoveResource && !window.confirm('移除此 Event 的资源关联？')) return;
      void quickChange(state => {
        const current = objectFor(state, 'event', eventId);
        if (data.eventRemoveResource) return removeEventResource(state, current, data.eventRemoveResource);
        if (data.eventRemoveFlow) return archiveEventFlow(state, current, data.eventRemoveFlow);
        const session = state.sessions.find(row => row.ownerType === 'event' && row.ownerId === eventId &&
          row.id === (data.eventCopyFlow || data.eventRestoreFlow));
        if (!session) throw new Error('环节已不可用。');
        if (data.eventRestoreFlow) {
          delete session.workshopArchivedAt;
          return session.id;
        }
        return copyEventFlow(state, current, session, session.id).id;
      });
    }
  });

  app.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      const form = event.target.closest(formSelector);
      if (form) {
        event.preventDefault();
        form.requestSubmit();
      }
    }
  });

  function clearDrop() {
    if (highlight) delete highlight.node.dataset.eventDrop;
    highlight = undefined;
  }

  app.addEventListener('dragstart', event => {
    const handle = event.target.closest('[data-order-drag]');
    if (!handle || !event.dataTransfer || ordering) return;
    drag = { kind: handle.dataset.orderKind, id: handle.dataset.id, node: handle.closest('[data-order-item]') };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', drag.id);
    drag.node.dataset.eventDragging = '';
  });

  app.addEventListener('dragover', event => {
    if (!drag) {
      if (event.target.closest(editor) && event.dataTransfer?.types.includes('Files')) event.preventDefault();
      return;
    }
    const item = event.target.closest('[data-order-item="' + drag.kind + '"]');
    const group = drag.kind === 'group-event' ? event.target.closest('[data-event-panel]') : null;
    const node = item ?? group;
    clearDrop();
    if (!node || node === drag.node) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = node.getBoundingClientRect();
    const grid = item && item.parentElement.classList.contains('gallery-grid');
    const after = grid ? event.clientX >= rect.left + rect.width / 2 : event.clientY >= rect.top + rect.height / 2;
    node.dataset.eventDrop = item ? after ? 'after' : 'before' : 'group';
    highlight = { node, target: item?.dataset.id, projectId: group?.dataset.eventPanel, after };
  });

  function endDrag() {
    if (drag) delete drag.node.dataset.eventDragging;
    drag = undefined;
    clearDrop();
  }

  app.addEventListener('drop', event => {
    if (!drag) {
      const form = event.target.closest(editor);
      if (form && event.dataTransfer?.types.includes('Files')) {
        event.preventDefault();
        addPastedFiles(form, [...event.dataTransfer.files]);
      }
      return;
    }
    if (!highlight || !highlight.node.contains(event.target)) return;
    event.preventDefault();
    const { kind, id } = drag;
    const { target, after, projectId } = highlight;
    endDrag();
    move({ kind, id, target, after, projectId });
  });

  app.addEventListener('dragend', endDrag);
  return mount;
}
