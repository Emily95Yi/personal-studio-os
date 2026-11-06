import { escapeHtml as esc } from './html.js';

function sharedEdges(before, after) {
  let head = 0;
  let tail = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;
  while (tail < before.length - head && tail < after.length - head &&
    before[before.length - tail - 1] === after[after.length - tail - 1]) tail += 1;
  return { head, tail };
}

function compareMiddle(before, after, rows) {
  const width = after.length + 1;
  const size = (before.length + 1) * width;
  if (size > 250_000) {
    for (const line of before) rows.push({ kind: 'removed', line });
    for (const line of after) rows.push({ kind: 'added', line });
    return;
  }
  const lengths = new Uint32Array(size);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      const index = i * width + j;
      lengths[index] = before[i] === after[j] ? 1 + lengths[index + width + 1] :
        Math.max(lengths[index + width], lengths[index + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      rows.push({ kind: 'same', line: before[i] });
      i += 1;
      j += 1;
    } else if (j >= after.length || (i < before.length && lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])) {
      rows.push({ kind: 'removed', line: before[i++] });
    } else {
      rows.push({ kind: 'added', line: after[j++] });
    }
  }
}

export function compareLines(previous = '', current = '') {
  const lines = value => value ? value.replace(/\r\n?/g, '\n').split('\n') : [];
  const before = lines(previous);
  const after = lines(current);
  const { head, tail } = sharedEdges(before, after);
  const rows = before.slice(0, head).map(line => ({ kind: 'same', line }));
  compareMiddle(before.slice(head, before.length - tail), after.slice(head, after.length - tail), rows);
  for (const line of before.slice(before.length - tail)) rows.push({ kind: 'same', line });

  const grouped = [];
  let removed = [];
  let added = [];
  function flush() {
    const paired = Math.min(removed.length, added.length);
    for (let i = 0; i < paired; i += 1) grouped.push({ kind: 'modified', before: removed[i], after: added[i] });
    for (const line of removed.slice(paired)) grouped.push({ kind: 'removed', line });
    for (const line of added.slice(paired)) grouped.push({ kind: 'added', line });
    removed = [];
    added = [];
  }
  for (const row of rows) {
    if (row.kind === 'same') {
      flush();
      grouped.push(row);
    } else {
      (row.kind === 'removed' ? removed : added).push(row.line);
    }
  }
  flush();
  return grouped;
}

function modified(before, after) {
  const oldChars = [...before];
  const newChars = [...after];
  const { head, tail } = sharedEdges(oldChars, newChars);
  const mark = (chars, tag) => esc(chars.slice(0, head).join('')) + '<' + tag + '>' +
    esc(chars.slice(head, chars.length - tail).join('')) + '</' + tag + '>' + esc(chars.slice(chars.length - tail).join(''));
  return '<div aria-label="修改前"><span aria-hidden="true">−</span>' + mark(oldChars, 'del') +
    '</div><div aria-label="修改后"><span aria-hidden="true">+</span>' + mark(newChars, 'ins') + '</div>';
}

export function reviewChanges(item, from, to) {
  const versions = [...(item.revisions ?? []), item];
  const before = versions[from];
  const after = versions[to];
  if (!before || !after || from === to) return '<p class="work-meta">请选择两个不同的版本。</p>';
  const fields = [['title', '标题'], ['summary', '摘要'], ['body', '正文']];
  const sections = fields.flatMap(([key, title]) => {
    const changes = compareLines(before[key] ?? '', after[key] ?? '');
    if (changes.every(row => row.kind === 'same')) return [];
    return ['<section class="sb-diff-section"><h3>' + title + '</h3><div class="sb-diff-lines">' +
      changes.map(row => '<div class="sb-diff-' + row.kind + '">' +
        (row.kind === 'modified' ? modified(row.before, row.after) :
          '<span aria-hidden="true">' + (row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : '') + '</span>' +
          (row.kind === 'added' ? '<ins>' + esc(row.line) + '</ins>' :
            row.kind === 'removed' ? '<del>' + esc(row.line) + '</del>' : esc(row.line))) + '</div>').join('') + '</div></section>'];
  });
  return sections.join('') || '<p class="work-meta">这两个版本的标题、摘要和正文相同。</p>';
}
