import { escapeHtml as esc } from './html.js';

export const captureTypes = { url: '🔗 链接', text: '▤ 文字', image: '▧ 图片', pdf: '▣ PDF', file: '📎 文件' };
const errors = {
  unauthorized: '请登录 Studio 或检查设备授权。',
  unavailable: '暂时无法连接 Studio，请稍后重试。',
  invalid_target: '分类已改变，请刷新后重新选择。',
  invalid_content: '请输入有效的文字或网址。',
  invalid_url: '请输入有效的 HTTP 或 HTTPS 网址。',
  invalid_text: '文字长度或格式超出允许范围。',
  native_conflict: '目标已有该网址，或此条目仍被其他内容引用。请检查原模块后重试。',
  conflict: '记录已在其他位置更新，请刷新后再试。',
  studio_editing: 'Studio 编辑器正在使用中。请结束该次编辑后再分类。',
  file_too_large: '单个附件最大 256 MiB。',
  invalid_file: '请选择非空文件，文件名最多 200 字。',
  invalid_image: '图片字节与声明的格式不符。',
  invalid_pdf: '文件缺少 PDF 格式标识。',
  upload_busy: '上传暂不可用，请稍后重试。',
  upload_not_found: '上传会话已过期，请重新选择文件。',
  upload_incomplete: '附件尚未上传完整，请重试。',
  part_changed: '所选文件与已上传的分片不同，请重新选择文件。',
  files_unavailable: 'Studio 尚未连接私有文件存储。',
  device_limit: '有效授权已达上限，请先撤销不用的设备。',
  use_native_editor: '已分类记录请在对应模块中编辑。',
};
export const captureMessage = code => errors[code] ?? errors.unavailable;

export async function api(path = '', { method = 'GET', value, data, signal } = {}) {
  const response = await fetch('/api/' + (path === 'storage' ? path : 'capture' + path), {
    method, cache: 'no-store', credentials: 'same-origin', redirect: 'error',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
    headers: { 'X-Studio-Request': '1', ...(value === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: value === undefined ? data : JSON.stringify(value),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(captureMessage(result.error));
    error.status = response.status;
    throw error;
  }
  return result;
}

export function installTargets(container, modules, selected = '') {
  const selects = Array.from(container.querySelectorAll('select'));
  const [module, group, target] = selects;
  const available = modules.filter(row => row.groups.some(group => group.options.length));
  const options = (select, rows, empty) => {
    select.replaceChildren(new Option(empty, ''), ...rows.map(([key, label]) => new Option(label, key)));
    select.disabled = rows.length === 0;
  };
  const updateTarget = () => {
    const groups = available[Number(module.value)]?.groups ?? [];
    const rows = module.value && group.value ? groups[Number(group.value)]?.options ?? [] : [];
    options(target, rows.map(row => [row.target, row.label]), '选择分类');
  };
  const updateGroup = () => {
    const groups = module.value ? available[Number(module.value)]?.groups ?? [] : [];
    options(group, groups.flatMap((row, i) => row.options.length ? [[String(i), row.label]] : []), '选择分组');
    if (group.options.length === 2) group.selectedIndex = 1;
    updateTarget();
  };
  options(module, available.map((row, i) => [String(i), row.label]), '选择模块');
  module.onchange = updateGroup;
  group.onchange = updateTarget;
  updateGroup();
  for (const [i, row] of available.entries()) {
    const j = row.groups.findIndex(group => group.options.some(option => option.target === selected));
    if (j < 0) continue;
    module.value = String(i);
    updateGroup();
    group.value = String(j);
    updateTarget();
    target.value = selected;
  }
}

export const targetFields = '<div class="capture-target" data-capture-target>' +
  '<label>模块<select aria-label="模块"></select></label>' +
  '<label>分组<select aria-label="分组"></select></label>' +
  '<label>分类<select name="target" aria-label="分类"></select></label></div>';

export function attachmentView(id, name = '下载原始附件', image = false) {
  const path = '/api/capture/items/' + encodeURIComponent(id) + '/attachment';
  return '<div class="capture-attachment">' + (image ? '<img alt="" loading="lazy" src="' + path + '?preview">' : '') +
    '<a href="' + path + '">' + esc(name) + '</a></div>';
}

export function storedCaptureAttachment(row) {
  return row.captureHasAttachment ? attachmentView(row.id) : '';
}
