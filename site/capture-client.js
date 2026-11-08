import { escapeHtml as esc } from './html.js';

export const captureTypes = { url: '🔗 链接', text: '▤ 文字', image: '▧ 图片', pdf: '▣ PDF', file: '📎 文件' };
const errors = {
  unauthorized: '请登录 Studio 或检查设备授权。',
  unavailable: '暂时无法连接 Studio，请稍后重试。',
  not_found: '这条收藏已不存在。',
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

export function installCaptureSelects(container, modules) {
  const [module, group, target] = container.querySelectorAll('select');
  const options = (select, rows, empty) => {
    select.replaceChildren(new Option(empty, ''), ...rows.map(([key, label]) => new Option(label, key)));
    select.disabled = rows.length === 0;
  };
  const updateTarget = () => {
    const rows = module.value && group.value ? modules[Number(module.value)].groups[Number(group.value)].options : [];
    options(target, rows.map(row => [row.target, row.label]), '选择分类');
  };
  const updateGroup = () => {
    const groups = module.value ? modules[Number(module.value)].groups : [];
    options(group, groups.flatMap((row, i) => row.options.length ? [[String(i), row.label]] : []), '选择分组');
    if (group.options.length === 2) group.selectedIndex = 1;
    updateTarget();
  };
  options(module, modules.map((row, i) => [String(i), row.label]), '选择模块');
  module.onchange = updateGroup;
  group.onchange = updateTarget;
  updateGroup();
}

export const segmentRow = (attribute, label) => '<div class="capture-segment-scroll" hidden>' +
  '<div class="segmented capture-segments" role="group" aria-label="' + esc(label) + '" ' + attribute + '></div></div>';

export function installSegments(track, choices, selected, onChange) {
  const scroll = track.parentElement;
  scroll.hidden = !choices.length;
  const buttons = choices.map(([key, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.onclick = () => {
      selected = selected === key ? '' : key;
      update();
      onChange(selected);
    };
    return button;
  });
  function update() {
    let active;
    buttons.forEach((button, i) => {
      const pressed = choices[i][0] === selected;
      button.setAttribute('aria-pressed', String(pressed));
      if (pressed) active = button;
    });
    if (!active) return;
    track.style.setProperty('--segment-x', active.offsetLeft + 'px');
    track.style.setProperty('--segment-width', active.offsetWidth + 'px');
    if (active.offsetLeft < scroll.scrollLeft || active.offsetLeft + active.offsetWidth > scroll.scrollLeft + scroll.clientWidth) {
      scroll.scrollLeft = active.offsetLeft;
    }
  }
  track.replaceChildren(...buttons);
  update();
}

export function installInboxTargets(container, modules, selected = '') {
  const moduleTrack = container.querySelector('[data-capture-modules]');
  const groupTrack = container.querySelector('[data-capture-groups]');
  const optionTrack = container.querySelector('[data-capture-options]');
  const folder = container.querySelector('select');
  const target = container.querySelector('input[name="target"]');
  const entry = modules.find(module => module.groups.some(group => group.options.some(option => option.target === selected)));
  const showOptions = (group, value) => {
    installSegments(optionTrack, (group?.options ?? []).map(option => [option.target, option.label]), value,
      value => { target.value = value; });
  };
  const showModule = (name, value = '') => {
    const groups = modules.find(module => module.label === name)?.groups ?? [];
    const active = groups.findIndex(group => group.options.some(option => option.target === value));
    folder.parentElement.hidden = true;
    folder.replaceChildren();
    target.value = value;
    if (name === 'Reflections') {
      installSegments(groupTrack, [], '', () => {});
      showOptions(groups[0], value);
      return;
    }
    const selectGroup = (key, saved = '') => {
      const group = key ? groups[Number(key)] : null;
      if (name === 'Collection') {
        const hasFolders = group?.options.length > 1;
        folder.parentElement.hidden = !hasFolders;
        folder.replaceChildren(...(hasFolders ? group.options.map(option => new Option(option.label, option.target)) : []));
        target.value = saved || group?.target || '';
        folder.value = target.value;
        folder.onchange = () => { target.value = folder.value; };
      } else {
        showOptions(group, saved);
        target.value = saved;
      }
    };
    const groupLabel = group => name === 'Discover' && group.label === 'Workshop Wiki' ? 'Wiki' :
      name === 'Discover' && group.label === 'Personal Explorations' ? 'Personal' : group.label;
    installSegments(groupTrack, groups.map((group, i) => [String(i), groupLabel(group)]),
      active < 0 ? '' : String(active), selectGroup);
    showOptions(null, '');
    selectGroup(active < 0 ? '' : String(active), value);
  };
  installSegments(moduleTrack, modules.map(module => [module.label, module.label]), entry?.label ?? '', showModule);
  showModule(entry?.label, entry ? selected : '');
}

export const targetFields = '<div class="capture-target" data-capture-target>' +
  segmentRow('data-capture-modules', '模块') + segmentRow('data-capture-groups', '分组') +
  segmentRow('data-capture-options', '分类') +
  '<label class="capture-folder" hidden>文件夹<select aria-label="文件夹"></select></label>' +
  '<input type="hidden" name="target"></div>';

export function attachmentView(id, name = '下载原始附件', image = false) {
  const path = '/api/capture/items/' + encodeURIComponent(id) + '/attachment';
  return '<div class="capture-attachment">' + (image ? '<img alt="" loading="lazy" src="' + path + '?preview">' : '') +
    '<a href="' + path + '">' + esc(name) + '</a></div>';
}

export function storedCaptureAttachment(row) {
  return row.captureHasAttachment ? attachmentView(row.id) : '';
}
