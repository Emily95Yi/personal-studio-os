import { canEdit } from './apple-view.js';
import { categoryList, collectionCategoryLabel, entriesFor, explorationEntryTitle, foldersFor, itemsFor, topicsFor } from './board-library-data.js';
import { api as captureApi } from './capture-client.js';
import { escapeHtml as esc } from './html.js';
import { icon } from './icons.js';
import { boardContentHref, boardSections, collectionItemAddress, explorationAddress, href, inboxAddress } from './pages.js';
import { connection } from './private-api.js';
import { plannerRepository } from './repository.js';
import { boardFolderPath, boardRecords, boardSection, discoverCategory, isWorkshopWiki } from './self-board-data.js';
import { contentTitle, studioStore } from './studio-data.js';

const inboxGroup = 'Inbox';
const inboxPrefix = 'inbox-item:';
const inboxTarget = (id, title) => ({
  key: inboxPrefix + id, group: inboxGroup, title, label: title, url: inboxAddress(id),
});

export function manifestationTargets(state = studioStore.state) {
  const targets = new Map();
  const add = (key, group, url, ...path) => targets.set(key, { key, group, url, title: path.at(-1), label: path.join(' / ') });
  for (const plan of plannerRepository.listPlans()) add('plan:' + plan.id, 'Auto', href('self-board', 'auto', plan.id), plan.title);

  const wikiFolders = state.boardFolders ?? [];
  for (const record of boardRecords(state, true)) {
    const section = boardSection(record);
    const path = [];
    if (section === 'discover') {
      const category = discoverCategory(record);
      const folder = wikiFolders.find(row => row.id === record.folderId && row.category === category);
      path.push(isWorkshopWiki(record) ? 'Common Resources' : 'Resources', category, ...(folder ? boardFolderPath(wikiFolders, folder).map(row => row.title) : []));
    }
    add('content:' + record.id, boardSections[section].label, boardContentHref(record.id), ...path, contentTitle(record));
  }

  for (const topic of topicsFor(state)) {
    const url = explorationAddress(topic.id);
    const path = ['Personal Explorations', contentTitle(topic)];
    add('topic:' + topic.id, 'Discover', url, ...path);
    for (const entry of entriesFor(state, topic.id)) {
      add('entry:' + entry.id, 'Discover', url + '?' + new URLSearchParams({ entry: entry.id }), ...path, explorationEntryTitle(entry));
    }
  }

  const categories = new Map([['', '待分类'], ...categoryList(state).map(row => [row.id, collectionCategoryLabel(row)])]);
  for (const item of itemsFor(state)) {
    const path = [categories.get(item.categoryId) ?? '待分类'];
    const folder = item.folderId && foldersFor(state, item.categoryId).find(row => row.id === item.folderId);
    if (folder) path.push(folder.title);
    add('collection-item:' + item.id, 'Collections', collectionItemAddress(item.id), ...path, contentTitle(item));
  }
  return targets;
}

function savedTarget(row, targets) {
  if (!row?.source) return;
  const { source, title } = row;
  return targets.get(source) ?? (source.startsWith(inboxPrefix)
    ? inboxTarget(source.slice(inboxPrefix.length), title)
    : { key: source, group: '原关联', title, label: title + '（原内容不可用）' });
}

export function manifestationSection() {
  const rows = plannerRepository.listManifestations();
  const targets = rows.some(row => row.source) ? manifestationTargets() : new Map();
  return '<section class="auto-section" aria-labelledby="manifestations-heading"><h2 id="manifestations-heading">显化</h2>' +
    (rows.length ? '<ul class="manifestation-list">' + rows.map(row => {
      const target = savedTarget(row, targets);
      const content = !target ? '<span>' + esc(row.text) + '</span>' : target.url
        ? '<a class="return-link" href="' + esc(target.url) + '">' + esc(target.title) + '</a>'
        : '<span>' + esc(target.label) + '</span>';
      return '<li>' + content + (canEdit() ? '<button type="button" class="header-icon calendar-icon" data-manifestation-edit="' +
        esc(row.id) + '" aria-label="编辑显化" title="编辑显化">' + icon('edit', 16) + '</button>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="subtle">暂存还没有固定日期、又不想忘掉的内容。</p>') + '</section>';
}

export function manifestationDialog() {
  return `<dialog class="task-dialog manifestation-dialog" aria-labelledby="manifestation-title">
    <form data-manifestation-form>
      <div class="plan-dialog-heading"><h2 id="manifestation-title">新建显化</h2></div>
      <input type="hidden" name="id">
      <div class="segmented manifestation-kind" role="radiogroup" aria-label="内容类型">
        <label><input class="visually-hidden" type="radio" name="kind" value="text" checked><span>文字</span></label>
        <label><input class="visually-hidden" type="radio" name="kind" value="link"><span>关联</span></label>
      </div>
      <label data-manifestation-text>文字<textarea name="body" maxlength="1000" rows="4" required></textarea></label>
      <div data-manifestation-link hidden>
        <label>筛选 Self-Board<input type="search" name="query" maxlength="150" placeholder="输入栏目、文件夹或条目名称"></label>
        <label>关联条目<select name="target" disabled></select></label>
        <div class="widget-actions">
          <button type="button" class="text-action" data-manifestation-inbox ${connection.mode === 'private' ? '' : 'hidden'}>查找 Inbox 条目</button>
          <p data-manifestation-inbox-status role="status"></p>
        </div>
      </div>
      <p data-form-error role="alert" hidden></p>
      <div class="widget-actions">
        <button type="button" class="text-action" data-manifestation-remove hidden>删除</button>
        <button type="button" class="action-button secondary" data-dialog-cancel>取消</button>
        <button type="submit" class="action-button">保存</button>
      </div>
    </form>
  </dialog>`;
}

export function initManifestationActions(app, refreshFocus) {
  let targets;
  let inboxOffset;
  let inboxRequest = 0;
  let inboxResults;

  function updateTargets(form, selected = form.elements.target.value) {
    const { query, target } = form.elements;
    const groups = new Map();
    const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    for (const row of new Map([...targets, ...inboxResults]).values()) {
      const path = (row.group + ' ' + row.label).toLowerCase();
      if (row.key !== selected && !inboxResults.has(row.key) && !terms.every(term => path.includes(term))) continue;
      if (!groups.has(row.group)) {
        const group = document.createElement('optgroup');
        group.label = row.group;
        groups.set(row.group, group);
      }
      groups.get(row.group).append(new Option(row.label, row.key));
    }
    target.replaceChildren(new Option(groups.size ? '选择 Self-Board 条目' : '没有匹配的条目', ''), ...groups.values());
    target.value = selected;
    if (target.selectedIndex === -1) target.selectedIndex = 0;
  }

  function updateKind(form) {
    const { kind, body, target } = form.elements;
    const linking = kind.value === 'link';
    form.querySelector('[data-manifestation-text]').hidden = body.disabled = linking;
    form.querySelector('[data-manifestation-link]').hidden = target.disabled = !linking;
    target.required = linking;
    form.querySelector('[data-form-error]').hidden = true;
  }

  function resetInbox(form) {
    inboxRequest += 1;
    inboxOffset = 0;
    inboxResults = new Map();
    const button = form.querySelector('[data-manifestation-inbox]');
    button.disabled = false;
    button.textContent = '查找 Inbox 条目';
    form.querySelector('[data-manifestation-inbox-status]').textContent = '';
  }

  async function findInbox(form, button) {
    const request = ++inboxRequest;
    const notice = form.querySelector('[data-manifestation-inbox-status]');
    button.disabled = true;
    notice.textContent = '正在查找…';
    try {
      const params = new URLSearchParams({ q: form.elements.query.value.trim(), offset: inboxOffset, limit: 25 });
      const { items, total } = await captureApi('/items?' + params);
      if (request !== inboxRequest || !form.isConnected || !form.closest('dialog').open) return;
      for (const row of items) {
        const target = inboxTarget(row.id, row.title || '未命名收藏');
        inboxResults.set(target.key, target);
      }
      updateTargets(form);
      inboxOffset += items.length;
      button.disabled = inboxOffset >= total || !items.length;
      button.textContent = '查找更多 Inbox 条目';
      notice.textContent = total ? '已列出 ' + inboxOffset + ' / ' + total + ' 条 Inbox 结果。' : 'Inbox 没有匹配的条目。';
    } catch (error) {
      if (request !== inboxRequest || !form.isConnected || !form.closest('dialog').open) return;
      notice.textContent = error.message;
      button.disabled = false;
    }
  }

  app.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !canEdit()) return;
    if (button.matches('[data-manifestation-new], [data-manifestation-edit]')) {
      const dialog = app.querySelector('.manifestation-dialog');
      const form = dialog.querySelector('form');
      const row = plannerRepository.listManifestations().find(row => row.id === button.dataset.manifestationEdit);
      form.reset();
      resetInbox(form);
      targets = manifestationTargets();
      const target = savedTarget(row, targets);
      if (target?.url) targets.set(target.key, target);
      form.elements.id.value = row?.id ?? '';
      form.elements.kind.value = row?.source ? 'link' : 'text';
      form.elements.body.value = row?.text ?? '';
      dialog.querySelector('h2').textContent = row ? '编辑显化' : '新建显化';
      form.querySelector('[data-manifestation-remove]').hidden = !row;
      updateTargets(form, row?.source ?? '');
      updateKind(form);
      dialog.showModal();
    } else if (button.matches('[data-manifestation-remove]') && plannerRepository.removeManifestation(button.form.elements.id.value)) {
      button.closest('dialog').close();
      refreshFocus('[data-manifestation-new]');
    } else if (button.matches('[data-manifestation-inbox]')) {
      void findInbox(button.form, button);
    }
  });

  app.addEventListener('change', ({ target }) => {
    if (target.name === 'kind' && target.form?.matches('[data-manifestation-form]')) updateKind(target.form);
  });
  app.addEventListener('input', ({ target }) => {
    const form = target.form;
    if (!form?.matches('[data-manifestation-form]')) return;
    form.querySelector('[data-form-error]').hidden = true;
    if (target.name !== 'query') return;
    const selected = form.elements.target.value;
    const selectedInbox = inboxResults.get(selected);
    if (selectedInbox) targets.set(selected, selectedInbox);
    resetInbox(form);
    updateTargets(form, selected);
  });
  app.addEventListener('submit', event => {
    const form = event.target;
    if (!form.matches('[data-manifestation-form]')) return;
    event.preventDefault();
    if (!canEdit()) return;
    const { id, kind, body, target } = form.elements;
    const source = targets.get(target.value) ?? inboxResults.get(target.value);
    const fields = kind.value === 'text' ? { text: body.value } : { source: source?.key, title: source?.title.slice(0, 200) };
    const saved = plannerRepository.saveManifestation({ id: id.value || undefined, ...fields });
    if (!saved) {
      const error = form.querySelector('[data-form-error]');
      error.textContent = kind.value === 'text' && !body.value.trim() ? '请输入文字。' :
        '无法保存显化。请检查关联内容或条目数量。';
      error.hidden = false;
      return;
    }
    form.closest('dialog').close();
    refreshFocus('[data-manifestation-edit="' + saved.id + '"]');
  });
}
