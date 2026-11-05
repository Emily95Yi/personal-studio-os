export function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, char => entities[char]);
}

export function safeUrl(value) {
  if (typeof value !== 'string' || /[\\\u0000-\u0020]/.test(value)) return '';
  if (/^https:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.host && !url.username && !url.password) return value;
    } catch {}
  }
  return /^\/(?!\/)|^\.\//.test(value) ? value : '';
}
