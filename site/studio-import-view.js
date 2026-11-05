import { escapeHtml as esc } from './html.js';
import { studioStore } from './studio-data.js';
import { importMigration, mapLegacyArchive, maxTransferBytes, previewMigration, rawFormat, studioExport } from './studio-migration.js';
import { testArchive, testMapping } from './studio-fixture.js';

const labels = { projects: 'Project', events: 'Event', content: 'Discover', sessions: '文档', relations: '关联', assets: '附件' };

export function studioImportView() {
  return '<section class="work-reading"><div class="section-heading work-heading"><h2>导入</h2><div class="work-actions">' +
    '<button class="action-button secondary" type="button" data-import-fixture>预览测试数据</button>' +
    '<button class="action-button secondary" type="button" data-export-studio>导出 Studio</button></div></div>' +
    '<form class="work-import-form" data-studio-import><label>迁移包 / 原始导出<input type="file" name="archive" accept=".json,application/json" required></label>' +
    '<label>映射文件（原始导出时）<input type="file" name="mapping" accept=".json,application/json"></label>' +
    '<button class="action-button" type="submit">预览</button></form>' +
    '<p class="work-error" role="alert" hidden data-import-error></p><div aria-live="polite" data-import-preview></div></section>';
}

async function readJson(file) {
  if (!file?.name || file.size > maxTransferBytes) throw new Error('请选择 50 MB 以内的 JSON 文件。');
  try { return JSON.parse(await file.text()); }
  catch { throw new Error('无法读取 JSON 文件。'); }
}

function downloadJson(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function summary({ counts, additions, conflicts, retained, integrity }) {
  const items = (rows, title, entry) => rows.length ? '<details><summary>' + title + ' (' + rows.length + ')</summary><ul>' +
    rows.map(row => '<li>' + esc(entry(row)) + '</li>').join('') + '</ul></details>' : '';
  return '<div class="work-import-result"><h3>导入预览</h3><table><thead><tr><th scope="col">类型</th>' +
    '<th scope="col">新增</th><th scope="col">重复</th><th scope="col">冲突</th></tr></thead><tbody>' +
    Object.entries(counts).map(([key, { added, duplicate, conflict }]) => '<tr><th scope="row">' + labels[key] +
      '</th><td>' + added + '</td><td>' + duplicate + '</td><td>' + conflict + '</td></tr>').join('') +
    '</tbody></table>' + (conflicts.length ? '<p class="work-error">请处理冲突后重新预览。</p>' :
      '<p class="work-meta">导入后 · 图片附件 ' + integrity.images + ' · 封面 / 海报 ' + integrity.covers +
      ' · 版本 ' + integrity.versions + ' · 关联 ' + integrity.relations + '</p>') +
    items(additions, '待导入', row => labels[row.collection] + ' · ' + row.label) +
    items(conflicts, '冲突', row => labels[row.collection] + ' · ' + row.label) +
    items(retained, '保留在原始导出', row => row.store + ' · ' + JSON.stringify(row.key) + ' · ' + row.reason) +
    (retained.length ? '<button class="action-button secondary" type="button" data-export-retained>下载保留清单</button>' : '') +
    (additions.length && !conflicts.length ? '<button class="action-button" type="button" data-confirm-import>确认导入</button>' : '') +
    '</div>';
}

export function initStudioImport(app) {
  let pending;
  let sequence = 0;
  const surface = () => app.querySelector('[data-studio-import]');
  const errorBox = () => app.querySelector('[data-import-error]');
  const output = () => app.querySelector('[data-import-preview]');
  const reset = () => {
    pending = undefined;
    sequence += 1;
    errorBox().hidden = true;
    output().replaceChildren();
    return sequence;
  };
  const showError = error => {
    if (!surface()) return;
    errorBox().textContent = error.message;
    errorBox().hidden = false;
  };
  function preview(transfer, retained, form, ticket) {
    if (form !== surface() || ticket !== sequence) return;
    const plan = previewMigration(studioStore.state, transfer, retained);
    pending = { form, transfer, retained, revision: studioStore.state.revision };
    output().innerHTML = summary(plan);
  }

  app.addEventListener('change', event => {
    if (event.target.form?.matches('[data-studio-import]')) reset();
  });
  app.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('[data-studio-import]')) return;
    event.preventDefault();
    const ticket = reset();
    try {
      const data = new FormData(form);
      const archive = await readJson(data.get('archive'));
      const { transfer, retained } = archive.format === rawFormat
        ? mapLegacyArchive(archive, await readJson(data.get('mapping'))) : { transfer: archive, retained: [] };
      preview(transfer, retained, form, ticket);
    } catch (error) { if (form === surface() && ticket === sequence) showError(error); }
  });
  app.addEventListener('click', async event => {
    const button = event.target.closest('button');
    const form = surface();
    if (!button || !form) return;
    if (button.hasAttribute('data-import-fixture')) {
      const ticket = reset();
      try {
        const { transfer, retained } = mapLegacyArchive(testArchive, testMapping);
        preview(transfer, retained, form, ticket);
      } catch (error) { showError(error); }
    }
    if (button.hasAttribute('data-export-studio')) downloadJson(studioExport(studioStore.state), 'studio-export.json');
    if (button.hasAttribute('data-export-retained') && pending?.form === form) {
      downloadJson(pending.retained, 'studio-retained.json');
    }
    if (!button.hasAttribute('data-confirm-import') || pending?.form !== form) return;
    const { transfer, revision, retained } = pending;
    const ticket = sequence;
    button.disabled = true;
    try {
      const plan = await studioStore.change(state => importMigration(state, transfer, revision, retained));
      if (surface() === form && ticket === sequence) {
        reset();
        output().textContent = '已导入 ' + plan.additions.length + ' 条记录。';
      }
    } catch (error) {
      if (surface() === form && ticket === sequence) showError(error);
    }
  });
}
