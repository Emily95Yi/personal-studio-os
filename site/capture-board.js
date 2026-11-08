import { escapeHtml as esc } from './html.js';
import { icon } from './icons.js';
import { api, attachmentView, captureTypes, installTargets, targetFields } from './capture-client.js';
import { boardContentHref, collectionItemAddress, explorationAddress, inboxAddress } from './pages.js';
import { studioStore } from './studio-data.js';

const timeFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' });
const time = value => value && Number.isFinite(+new Date(value)) ? timeFormat.format(new Date(value)) : '—';
const bytes = size => size >= 1e9 ? (size / 1e9).toFixed(2) + ' GB' :
  size >= 1e6 ? (size / 1e6).toFixed(2) + ' MB' : (size / 1000).toFixed(1) + ' KB';
const button = (label, attr = '') => '<button type="button" class="action-button secondary" ' + attr + '>' + label + '</button>';
const status = (element, error) => { element.textContent = error instanceof Error ? error.message : error; };
const filters = '<form class="capture-filters" data-capture-filters>' +
  '<input name="q" type="search" maxlength="150" aria-label="搜索 Inbox" placeholder="搜索标题、正文或备注">' +
  '<select name="status" aria-label="状态"><option value="inbox">待整理</option><option value="organized">已分类</option>' +
  '<option value="archived">已归档</option></select><select name="type" aria-label="内容类型"><option value="">所有类型</option>' +
  Object.entries(captureTypes).map(([key, label]) => '<option value="' + key + '">' + label + '</option>').join('') +
  '</select><select name="sort" aria-label="收藏时间排序"><option value="recent">最近收藏</option><option value="oldest">最早收藏</option>' +
  '</select><button class="action-button secondary">筛选</button></form>';

export function inboxView() {
  return '<section class="capture-inbox" data-capture-inbox aria-label="Inbox">' +
    '<details open><summary>Inbox</summary><div data-capture-recent aria-live="polite"></div></details>' +
    '<a class="header-icon capture-inbox-all" href="' + inboxAddress() + '" aria-label="查看全部收藏" title="查看全部收藏">' +
    icon('arrow', 17) + '</a></section>';
}

export function captureSettingsView() {
  return '<section class="sb-settings" data-capture-devices><h3>Capture Devices</h3>' +
    '<p class="work-meta">每台 iPhone 分别生成一份快捷指令凭证。凭证仅在创建后显示，可在这里单独撤销。</p>' +
    '<form class="capture-controls"><input required maxlength="80" name="name" aria-label="设备名称" placeholder="设备名称，例如 iPhone A">' +
    '<button class="action-button secondary">新增设备授权</button></form><div aria-live="polite" data-devices-result></div>' +
    '<div data-devices-list></div></section>' +
    '<section class="sb-settings" data-capture-storage><div class="sb-list-heading"><h3>Storage</h3>' +
    button('刷新容量', 'data-storage-refresh') + '</div><div data-storage-result aria-live="polite"></div></section>';
}

const detailForm = 'capture-detail-form';

export function captureActions() {
  const action = (label, glyph, attributes) => '<button class="header-icon capture-page-icon" aria-label="' + label +
    '" title="' + label + '" disabled ' + attributes + '>' + icon(glyph, 19) + '</button>';
  return '<div class="header-actions">' + action('保存', 'check', 'type="submit" form="' + detailForm + '" data-capture-save') +
    action('删除', 'trash', 'type="button" data-capture-delete') + '</div>';
}

export function captureView() {
  return '<section class="capture-surface"><div data-capture-body></div><p class="work-meta" role="status" data-capture-status>正在读取…</p></section>';
}

function list(rows, params) {
  return rows.length ? '<ul class="sb-rows capture-list">' + rows.map(row => '<li>' +
    (params ? '<input type="checkbox" name="selected" value="' + esc(row.id) + '" aria-label="选择 ' + esc(row.title) + '">' : '') +
    '<a href="' + esc(inboxAddress(row.id, params)) + '"><span aria-hidden="true">' +
    captureTypes[row.type].split(' ')[0] + '</span><span class="capture-title">' + esc(row.title || row.originalText?.slice(0, 80) || '未命名收藏') + '</span>' +
    '<small>' + esc(time(row.capturedAt)) + '</small></a></li>').join('') + '</ul>' :
    '<p class="work-meta">这里还没有收藏。</p>';
}

function nativeLink(row) {
  if (!row.nativeCollection || row.status !== 'organized') return '';
  const item = studioStore.state[row.nativeCollection]?.find(item => item.id === row.id && !item.deletedAt);
  const topic = item?.topicId ?? (row.nativeCollection === 'explorationEntries' ? JSON.parse(row.target)?.[2] : '');
  if (row.nativeCollection === 'content') return boardContentHref(row.id);
  if (row.nativeCollection === 'collectionItems') return collectionItemAddress(row.id);
  return topic ? explorationAddress(topic) + '?entry=' + encodeURIComponent(row.id) : '';
}

async function mountDetail(app, route, changed) {
  const { captureId: id } = route;
  const path = '/items/' + encodeURIComponent(id);
  const panel = app.querySelector('[data-capture-body]');
  const notice = app.querySelector('[data-capture-status]');
  const save = app.querySelector('[data-capture-save]');
  const remove = app.querySelector('[data-capture-delete]');
  try {
    const [row, options] = await Promise.all([api(path), api('/options')]);
    if (!panel.isConnected) return;
    const link = nativeLink(row);
    const editable = !row.nativeCollection;
    const content = [row.originalText, row.userNote].filter(Boolean).join('\n\n');
    panel.innerHTML = '<form id="' + detailForm + '" class="capture-form">' + targetFields +
      (editable ? '<label>标题<input name="title" maxlength="200" required value="' + esc(row.title) + '"></label>' +
        '<label>正文（可选）<textarea name="content" rows="8">' + esc(content) + '</textarea></label>'
        : '<h2>' + esc(row.title) + '</h2>' + (content ? '<p class="capture-text">' + esc(content) + '</p>' : '')) +
      '</form><div class="capture-details"><p class="work-meta">' + captureTypes[row.type] + ' · ' + esc(time(row.capturedAt)) +
      (row.device ? ' · ' + esc(row.device) : '') + '</p>' +
      (row.sourceUrl ? '<p><a target="_blank" rel="noreferrer" href="' + esc(row.sourceUrl) + '">' + esc(row.sourceUrl) + '</a></p>' : '') +
      (row.metadata.description ? '<p>' + esc(row.metadata.description) + '</p>' : '') +
      (row.attachment ? attachmentView(id, row.attachment.filename + ' · ' + bytes(row.attachment.size),
        /^(image\/(png|jpeg|gif|webp|avif))$/.test(row.attachment.mime)) : '') +
      (link ? '<p><a href="' + esc(link) + '">在原模块查看和编辑</a></p>' : '') + '</div>';
    const form = panel.querySelector('form');
    installTargets(form.querySelector('[data-capture-target]'), options.modules, row.target);
    status(notice, '');
    save.disabled = remove.disabled = false;
    async function write(method, value) {
      if (save.disabled) return;
      save.disabled = remove.disabled = true;
      form.inert = true;
      status(notice, method === 'DELETE' ? '正在删除…' : '正在保存…');
      try {
        await api(path, { method, value });
        await changed();
        if (panel.isConnected) location.hash = route.parent;
      } catch (error) {
        status(notice, error);
      } finally {
        save.disabled = remove.disabled = false;
        form.inert = false;
      }
    }
    form.onsubmit = event => {
      event.preventDefault();
      const data = new FormData(form);
      const target = data.get('target');
      if (!target && (!editable || form.querySelector('[data-capture-modules] [aria-pressed="true"]'))) {
        return status(notice, '请选择分类。');
      }
      const value = { version: row.version, ...(target ? { target } : {}) };
      if (editable) {
        value.title = data.get('title');
        const edited = data.get('content');
        // Keep the imported excerpt and note separate until the merged field is edited.
        if (edited !== content) {
          const asText = row.type === 'text' || row.originalText || edited.length > 12000;
          value.originalText = asText ? edited : '';
          value.userNote = asText ? '' : edited;
        }
      }
      void write('PATCH', value);
    };
    remove.onclick = () => {
      if (confirm('永久删除此收藏和它的附件？')) void write('DELETE');
    };
  } catch (error) {
    status(notice, error);
  }
}

function mountList(app, route, changed) {
  const panel = app.querySelector('[data-capture-body]');
  const notice = app.querySelector('[data-capture-status]');
  panel.innerHTML = filters + '<div data-capture-list></div><div class="capture-controls">' +
    button('上一页', 'data-capture-prev disabled') + button('下一页', 'data-capture-next disabled') + '</div>' +
    '<form class="capture-form"><p class="work-meta">每次最多选择 20 条。</p>' +
    targetFields + '<div><button class="action-button secondary" type="submit">批量分类</button></div></form>';
  const [filterForm, batch] = panel.querySelectorAll('form');
  const listPanel = panel.querySelector('[data-capture-list]');
  const prev = panel.querySelector('[data-capture-prev]');
  const next = panel.querySelector('[data-capture-next]');
  const limit = 20;
  const offset = Math.max(0, Math.min(100000, Number.parseInt(route.params.get('offset'), 10) || 0));
  for (const control of filterForm.elements) {
    if (control.name && route.params.has(control.name)) control.value = route.params.get(control.name);
  }
  const paramsAt = (start, filters = route.params) => {
    const params = new URLSearchParams(filters);
    if (start) params.set('offset', start);
    else params.delete('offset');
    return params;
  };
  const go = (start, filters) => { location.hash = inboxAddress(undefined, paramsAt(start, filters)); };
  async function load() {
    status(notice, '正在读取…');
    try {
      const params = paramsAt(offset);
      params.set('limit', limit);
      const { items, total } = await api('/items?' + params);
      if (!panel.isConnected) return;
      if (!items.length && offset > 0) return go(Math.max(0, Math.ceil(total / limit) * limit - limit));
      listPanel.innerHTML = list(items, paramsAt(offset));
      prev.disabled = offset === 0;
      next.disabled = offset + limit >= total;
      status(notice, '共 ' + total + ' 条');
    } catch (error) {
      status(notice, error);
    }
  }
  prev.onclick = () => go(Math.max(0, offset - limit));
  next.onclick = () => go(offset + limit);
  filterForm.onsubmit = event => {
    event.preventDefault();
    const filters = new URLSearchParams(new FormData(filterForm));
    if (location.hash === inboxAddress(undefined, filters)) void load();
    else go(0, filters);
  };
  batch.onsubmit = async event => {
    event.preventDefault();
    const ids = [...listPanel.querySelectorAll('input:checked')].map(input => input.value);
    const target = new FormData(batch).get('target');
    if (!ids.length || !target) return status(notice, '请选择记录和分类。');
    const submit = batch.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await api('/items/batch', { method: 'PATCH', value: { ids, target } });
      await changed();
      if (panel.isConnected) await load();
    } catch (error) {
      status(notice, error);
    } finally {
      submit.disabled = false;
    }
  };
  void api('/options').then(result => installTargets(batch.querySelector('[data-capture-target]'), result.modules))
    .catch(error => status(notice, error));
  void load();
}

function mountSettings(app) {
  const devices = app.querySelector('[data-capture-devices]');
  if (!devices) return;
  const form = devices.querySelector('form');
  const result = devices.querySelector('[data-devices-result]');
  const rows = devices.querySelector('[data-devices-list]');
  async function loadDevices() {
    try {
      const data = await api('/devices');
      rows.innerHTML = '<ul class="sb-rows">' + data.devices.map(device => {
        const active = !device.revoked_at && device.expires_at > Date.now();
        return '<li class="capture-controls"><strong>' + esc(device.name) + '</strong><small>' +
          (device.revoked_at ? '已撤销' : active ? '有效至 ' + time(device.expires_at) : '已到期') +
          ' · 最近使用 ' + time(device.used_at) + '</small>' +
          (active ? button('撤销', 'data-device-revoke="' + esc(device.id) + '"') : '') + '</li>';
      }).join('') + '</ul>';
    } catch (error) {
      status(rows, error);
    }
  }
  form.onsubmit = async event => {
    event.preventDefault();
    const submit = form.querySelector('button');
    submit.disabled = true;
    try {
      const { token, expiresAt } = await api('/devices', { method: 'POST', value: Object.fromEntries(new FormData(form)) });
      result.innerHTML = '<label>设备凭证（仅显示一次，有效至 ' + esc(time(expiresAt)) + '）' +
        '<input type="password" readonly autocomplete="off" value="' + esc(token) + '"></label>' +
        '<div class="capture-controls">' + button('复制凭证', 'data-copy') + button('显示凭证', 'data-reveal') +
        button('收起凭证', 'data-hide') + '</div><p role="status"></p>';
      result.querySelector('[data-copy]').onclick = () => {
        void navigator.clipboard.writeText(token).then(() => status(result.querySelector('p'), '已复制。'))
          .catch(() => status(result.querySelector('p'), '请显示凭证并手动复制。'));
      };
      result.querySelector('[data-reveal]').onclick = () => { result.querySelector('input').type = 'text'; };
      result.querySelector('[data-hide]').onclick = () => result.replaceChildren();
      form.reset();
      await loadDevices();
    } catch (error) {
      status(result, error);
    } finally {
      submit.disabled = false;
    }
  };
  rows.onclick = async event => {
    const action = event.target.closest('[data-device-revoke]');
    if (!action || !confirm('撤销此设备的 Capture 授权？')) return;
    action.disabled = true;
    try {
      await api('/devices/' + action.dataset.deviceRevoke, { method: 'DELETE' });
      result.replaceChildren();
      await loadDevices();
    } catch (error) {
      status(result, error);
      action.disabled = false;
    }
  };
  const storage = app.querySelector('[data-capture-storage]');
  const refresh = storage.querySelector('[data-storage-refresh]');
  const output = storage.querySelector('[data-storage-result]');
  async function loadStorage(manual) {
    refresh.disabled = true;
    status(output, '正在读取容量…');
    try {
      const usage = await api('storage', { method: manual ? 'POST' : 'GET' });
      output.innerHTML = [['D1 Database', usage.d1, 500e6, '单数据库 Free 上限参考'],
        ['R2 Object Storage', usage.r2, 10e9, 'Standard 免费用量参考，按 GB-month 计费']].map(([label, value, limit, caption]) => {
        const known = Number.isSafeInteger(value);
        const ratio = known ? 100 * value / limit : 0;
        const level = ratio >= 95 ? 'Critical' : ratio >= 85 ? 'Warning' : ratio >= 70 ? 'Notice' : 'Normal';
        const warning = { Normal: '', Notice: '用量正在增加。', Warning: '请检查大文件和存储用量。',
          Critical: '已接近或超过参考线，请检查用量及可能产生的费用。' }[level];
        return '<div class="capture-capacity" data-level="' + level + '"><h4>' + label + '</h4><p>' +
          (known ? bytes(value) + ' / ' + bytes(limit) + ' · ' + ratio.toFixed(1) + '% · ' + level : '暂不可获取') + '</p>' +
          (known ? '<progress max="100" value="' + Math.min(100, ratio) + '" aria-label="' + label + '"></progress>' : '') +
          '<small>' + caption + (warning ? ' · ' + warning : '') + '</small></div>';
      }).join('') + '<small>采集时间 ' + esc(time(usage.measuredAt)) + '</small>';
    } catch (error) {
      status(output, error);
    } finally {
      refresh.disabled = false;
    }
  }
  refresh.onclick = () => { void loadStorage(true); };
  void loadStorage(false);
  void loadDevices();
}

export function mountCaptureBoard(app, route, changed) {
  if (route.type === 'capture') {
    if (route.captureId) void mountDetail(app, route, changed);
    else mountList(app, route, changed);
    return;
  }
  mountSettings(app);
  const inbox = app.querySelector('[data-capture-inbox]');
  if (!inbox) return;
  const details = inbox.querySelector('details');
  const recent = inbox.querySelector('[data-capture-recent]');
  let query = 0;
  async function load() {
    const index = ++query;
    try {
      const { items } = await api('/items?limit=4');
      if (index !== query) return;
      recent.innerHTML = list(items);
    } catch (error) {
      if (index === query) status(recent, error);
    }
  }
  details.ontoggle = () => { if (details.open) void load(); };
  void load();
  return load;
}
