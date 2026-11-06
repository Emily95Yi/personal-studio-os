import { escapeHtml as esc } from './html.js';

export function studioDialog(app, title, fields, save, after, submitLabel = '保存', extraClass = '') {
  const box = document.createElement('dialog');
  box.setAttribute('aria-label', title);
  box.className = 'work-dialog ' + extraClass;
  box.innerHTML = '<form><h2>' + esc(title) + '</h2><div class="work-form-fields">' + fields +
    '</div><p class="work-error" role="alert" hidden></p><div class="work-dialog-actions">' +
    '<button class="action-button secondary" type="button" data-work-close>取消</button>' +
    '<button type="submit" class="action-button">' + submitLabel + '</button></div></form>';
  const form = box.querySelector('form');
  const submit = form.querySelector('[type="submit"]');
  box.querySelector('[data-work-close]').addEventListener('click', () => box.close());
  box.addEventListener('close', () => box.remove(), { once: true });
  box.addEventListener('cancel', event => { if (form.inert) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    const error = form.querySelector('[role="alert"]');
    error.hidden = true;
    form.inert = true;
    try {
      const result = await save(data);
      box.close();
      after(result);
    } catch (cause) {
      error.textContent = cause.message || '保存失败。';
      error.hidden = false;
    } finally {
      form.inert = false;
      if (box.open && !submit.disabled) submit.focus();
    }
  });
  app.append(box);
  box.showModal();
  return form;
}
