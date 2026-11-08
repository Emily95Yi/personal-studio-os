import { api, captureMessage, installTargets } from './capture-client.js';

const form = document.querySelector('form');
const { type, mode, file, sourceUrl, originalText, userNote, target } = form.elements;
const targets = form.querySelector('[data-capture-target]');
const noteField = form.querySelector('[data-note]');
const submit = form.querySelector('button');
const cancel = form.querySelector('[data-cancel]');
const progress = form.querySelector('progress');
const notice = form.querySelector('[data-notice]');
let uploadId;
let key = crypto.randomUUID();
let controller;
let options;

function update() {
  const attach = type.value === 'attachment';
  form.querySelector('[data-file]').hidden = !attach;
  form.querySelector('[data-text]').hidden = type.value !== 'text';
  sourceUrl.required = type.value === 'url';
  sourceUrl.disabled = attach;
  form.querySelector('[data-url]').hidden = attach;
  originalText.required = type.value === 'text';
  file.required = attach;
  targets.hidden = mode.value !== 'organize';
  noteField.hidden = targets.hidden;
  if (!targets.hidden && !options) {
    options = api('/options').then(data => installTargets(targets, data.modules)).catch(error => {
      options = undefined;
      notice.textContent = error.message;
    });
  }
}
type.onchange = update;
mode.onchange = update;
file.onchange = () => {
  if (uploadId) void api('/uploads/' + uploadId, { method: 'DELETE' }).catch(() => {});
  uploadId = undefined;
  key = crypto.randomUUID();
};
update();

async function upload(selected, signal) {
  uploadId ??= crypto.randomUUID();
  progress.hidden = false;
  cancel.hidden = false;
  progress.value = 0;
  const opened = await api('/uploads', {
    method: 'POST', value: { id: uploadId, filename: selected.name, size: selected.size, mime: selected.type }, signal,
  });
  if (!opened.ready) {
    for (let offset = 0; offset < selected.size; offset += opened.chunkBytes) {
      const part = 1 + offset / opened.chunkBytes;
      const blob = selected.slice(offset, offset + opened.chunkBytes);
      for (let attempt = 1; ; attempt++) {
        try {
          await api('/uploads/' + uploadId + '/' + part, { method: 'PUT', data: blob, signal });
          break;
        } catch (error) {
          if (signal.aborted || attempt === 3 || (error.status && error.status < 500)) throw error;
          notice.textContent = '正在重试分片 ' + part + '…';
        }
      }
      progress.value = Math.min(selected.size, offset + blob.size) / selected.size;
      notice.textContent = '已上传 ' + Math.round(progress.value * 100) + '%';
    }
  }
  const completed = await api('/uploads/' + uploadId + '/complete', { method: 'POST', signal });
  progress.value = 1;
  cancel.hidden = true;
  return { type: opened.type, duplicateFile: completed.duplicateFile };
}

cancel.onclick = () => controller?.abort();
form.onsubmit = async event => {
  event.preventDefault();
  const selectedTarget = mode.value === 'organize' ? target.value : '';
  if (mode.value === 'organize' && !selectedTarget) {
    notice.textContent = '请选择分类。';
    return;
  }
  if (controller) return;
  controller = new AbortController();
  const selected = file.files[0];
  const value = {
    requestKey: key, type: type.value,
    sourceUrl: type.value === 'attachment' ? '' : sourceUrl.value,
    originalText: type.value === 'text' ? originalText.value : '',
    userNote: selectedTarget ? userNote.value : '',
    target: selectedTarget,
  };
  const inputs = [...form.querySelectorAll('input, textarea, select, button:not([data-cancel])')].filter(input => !input.disabled);
  inputs.forEach(input => { input.disabled = true; });
  notice.textContent = '正在保存…';
  try {
    let duplicateFile = false;
    if (value.type === 'attachment') {
      const uploaded = await upload(selected, controller.signal);
      value.type = uploaded.type;
      duplicateFile = uploaded.duplicateFile;
      value.attachmentId = uploadId;
    }
    const result = await api('', { method: 'POST', value });
    notice.textContent = result.duplicate ? '已存在，保留原有记录。' : result.classificationError
      ? '已保存到 Inbox。分类未完成。' + captureMessage(result.classificationError)
      : result.status === 'organized' ? '已存入奕 Studio · 已分类' : '已存入奕 Studio · Inbox';
    if (duplicateFile) notice.textContent += ' 检测到相同文件，本次作为独立收藏保存。';
    form.reset();
    uploadId = undefined;
    key = crypto.randomUUID();
  } catch (error) {
    if (controller.signal.aborted) {
      const id = uploadId;
      uploadId = undefined;
      key = crypto.randomUUID();
      if (id) void api('/uploads/' + id, { method: 'DELETE' }).catch(() => {});
      notice.textContent = '已取消上传。';
    } else {
      if (error.message === captureMessage('upload_not_found')) uploadId = undefined;
      notice.textContent = error.status ? error.message : '保存暂未确认。请保留当前内容并重试。';
    }
  } finally {
    controller = undefined;
    cancel.hidden = true;
    inputs.forEach(input => { input.disabled = false; });
    update();
  }
};
