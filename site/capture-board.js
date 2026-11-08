import { escapeHtml as esc } from './html.js';
import { icon } from './icons.js';
import { api, attachmentView, captureMessage, captureTypes, installTargets, targetFields } from './capture-client.js';
import { boardContentHref, collectionItemAddress, explorationAddress } from './pages.js';
import { studioStore } from './studio-data.js';

const timeFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'short' });
const time = value => value && Number.isFinite(+new Date(value)) ? timeFormat.format(new Date(value)) : '—';
const bytes = size => size >= 1e9 ? (size / 1e9).toFixed(2) + ' GB' :
  size >= 1e6 ? (size / 1e6).toFixed(2) + ' MB' : (size / 1000).toFixed(1) + ' KB';
const button = (label, attr = '') => '<button type="button" class="action-button secondary" ' + attr + '>' + label + '</button>';
const status = (element, error) => { element.textContent = error instanceof Error ? error.message : error; };
const field = (label, name, value, multiline = false) => '<label>' + label + (multiline
  ? '<textarea name="' + name + '" rows="4">' + esc(value ?? '') + '</textarea>'
  : '<input name="' + name + '" maxlength="200" required value="' + esc(value ?? '') + '">') + '</label>';
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
    '<button type="button" class="header-icon capture-inbox-all" data-capture-all aria-label="查看全部收藏" title="查看全部收藏">' +
    icon('arrow', 17) + '</button></section>';
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

function dialog(app, title) {
  const modal = document.createElement('dialog');
  modal.className = 'work-dialog capture-dialog';
  modal.innerHTML = '<div class="capture-dialog-body"><div class="sb-list-heading"><h2>' + esc(title) + '</h2>' +
    button('关闭', 'data-capture-close') + '</div><div data-capture-body></div><p role="status" data-capture-status></p></div>';
  modal.querySelector('[data-capture-close]').onclick = () => modal.close();
  modal.addEventListener('close', () => modal.remove(), { once: true });
  app.append(modal);
  modal.showModal();
  return modal;
}

function list(rows, batch = false) {
  return rows.length ? '<ul class="sb-rows capture-list">' + rows.map(row => '<li>' +
    (batch ? '<input type="checkbox" name="selected" value="' + esc(row.id) + '" aria-label="选择 ' + esc(row.title) + '">' : '') +
    '<button type="button" data-capture-detail="' + esc(row.id) + '"><span aria-hidden="true">' +
    captureTypes[row.type].split(' ')[0] + '</span><span class="capture-title">' + esc(row.title || row.originalText?.slice(0, 80) || '未命名收藏') + '</span>' +
    '<small>' + esc(time(row.capturedAt)) + '</small></button></li>').join('') + '</ul>' :
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

async function openDetail(app, id, refresh) {
  const modal = dialog(app, '收藏详情');
  const panel = modal.querySelector('[data-capture-body]');
  const notice = modal.querySelector('[data-capture-status]');
  try {
    const [row, options] = await Promise.all([api('/items/' + id), api('/options')]);
    const link = nativeLink(row);
    const editable = !row.nativeCollection;
    panel.innerHTML = '<p class="work-meta">' + captureTypes[row.type] + ' · ' + esc(time(row.capturedAt)) +
      (row.device ? ' · ' + esc(row.device) : '') + '</p>' +
      (row.sourceUrl ? '<p><a target="_blank" rel="noreferrer" href="' + esc(row.sourceUrl) + '">' + esc(row.sourceUrl) + '</a></p>' : '') +
      (row.metadata.description ? '<p>' + esc(row.metadata.description) + '</p>' : '') +
      (row.attachment ? attachmentView(id, row.attachment.filename + ' · ' + bytes(row.attachment.size),
        /^(image\/(png|jpeg|gif|webp|avif))$/.test(row.attachment.mime)) : '') +
      (link ? '<p><a href="' + esc(link) + '" data-capture-follow>在原模块查看和编辑</a></p>' : '') +
      '<form class="capture-form">' + (editable ? field('标题', 'title', row.title) +
        field('原文', 'originalText', row.originalText, true) + field('我的备注', 'userNote', row.userNote, true)
        : '<h3>' + esc(row.title) + '</h3><p class="capture-text">' + esc(row.originalText ?? '') + '</p>' +
          (row.userNote ? '<p class="capture-text"><strong>备注</strong> ' + esc(row.userNote) + '</p>' : '')) +
      targetFields + '<div class="capture-controls"><button class="action-button">' + (editable ? '保存' : '修改分类') +
      '</button>' + (row.status !== 'archived' ? button('归档', 'data-capture-status-action="archived"') :
        button('恢复到 Inbox', 'data-capture-status-action="inbox"')) +
      button('删除', 'data-capture-delete') + '</div></form>';
    const form = panel.querySelector('form');
    installTargets(form.querySelector('[data-capture-target]'), options.modules, row.target);
    panel.querySelector('[data-capture-follow]')?.addEventListener('click', () => modal.close());
    async function write(method, value) {
      const buttons = [...form.querySelectorAll('button')];
      buttons.forEach(button => { button.disabled = true; });
      try {
        await api('/items/' + id, { method, value });
        modal.close();
        refresh();
      } catch (error) {
        status(notice, error);
      } finally {
        buttons.forEach(button => { button.disabled = false; });
      }
    }
    form.onsubmit = event => {
      event.preventDefault();
      const value = Object.fromEntries(new FormData(form));
      if (!editable && !value.target) return status(notice, '请选择分类。');
      if (!value.target) delete value.target;
      void write('PATCH', { ...value, version: row.version });
    };
    form.querySelector('[data-capture-status-action]').onclick = event => {
      const value = editable ? Object.fromEntries(new FormData(form)) : {};
      delete value.target;
      void write('PATCH', { ...value, version: row.version, status: event.currentTarget.dataset.captureStatusAction });
    };
    form.querySelector('[data-capture-delete]').onclick = () => {
      if (confirm('永久删除此收藏和它的附件？')) void write('DELETE');
    };
  } catch (error) {
    status(notice, error);
  }
}

function openAll(app, onChange) {
  const modal = dialog(app, 'Inbox · 全部收藏');
  const panel = modal.querySelector('[data-capture-body]');
  const notice = modal.querySelector('[data-capture-status]');
  panel.innerHTML = filters + '<div data-capture-list></div><div class="capture-controls">' +
    button('上一页', 'data-capture-prev') + button('下一页', 'data-capture-next') + '</div>' +
    '<form class="capture-form"><p class="work-meta">每次最多选择 20 条。</p>' +
    targetFields + '<div><button class="action-button secondary">批量分类</button></div></form>';
  const [filterForm, batch] = panel.querySelectorAll('form');
  const listPanel = panel.querySelector('[data-capture-list]');
  const prev = panel.querySelector('[data-capture-prev]');
  const next = panel.querySelector('[data-capture-next]');
  let offset = 0;
  let query = 0;
  const limit = 20;
  async function load() {
    const index = ++query;
    status(notice, '正在读取…');
    try {
      const params = new URLSearchParams(new FormData(filterForm));
      params.set('offset', offset);
      params.set('limit', limit);
      const { items, total } = await api('/items?' + params);
      if (index !== query) return;
      if (!items.length && offset > 0) {
        offset = Math.max(0, offset - limit);
        void load();
        return;
      }
      listPanel.innerHTML = list(items, true);
      prev.disabled = offset === 0;
      next.disabled = offset + limit >= total;
      status(notice, '共 ' + total + ' 条');
    } catch (error) {
      if (index === query) status(notice, error);
    }
  }
  const reload = () => { void load(); onChange(); };
  listPanel.onclick = event => {
    const row = event.target.closest('[data-capture-detail]');
    if (row) void openDetail(app, row.dataset.captureDetail, reload);
  };
  prev.onclick = () => { offset = Math.max(0, offset - limit); void load(); };
  next.onclick = () => { offset += limit; void load(); };
  filterForm.onsubmit = event => { event.preventDefault(); offset = 0; void load(); };
  batch.onsubmit = async event => {
    event.preventDefault();
    const ids = [...listPanel.querySelectorAll('input:checked')].map(input => input.value);
    const target = new FormData(batch).get('target');
    if (!ids.length || !target) return status(notice, '请选择记录和分类。');
    const submit = batch.querySelector('button');
    submit.disabled = true;
    try {
      await api('/items/batch', { method: 'PATCH', value: { ids, target } });
      reload();
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

export function mountCaptureBoard(app, changed) {
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
  const reload = () => { void load(); changed(); };
  recent.onclick = event => {
    const row = event.target.closest('[data-capture-detail]');
    if (row) void openDetail(app, row.dataset.captureDetail, reload);
  };
  inbox.querySelector('[data-capture-all]').onclick = () => openAll(app, reload);
  details.ontoggle = () => { if (details.open) void load(); };
  void load();
  return load;
}
