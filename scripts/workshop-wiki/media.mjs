import { identity, legacyId, string } from './archive.mjs';

const assetIdFor = url => url?.startsWith('asset://') ? url.slice(8) : null;

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(([, key, double, single, bare]) => [key.toLowerCase(), double ?? single ?? bare]));
}

function inlineImages(body, format) {
  if (format === 'html') {
    return [...body.matchAll(/<img\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)].map(match => {
      const attrs = attributes(match[0]);
      return { offset: match.index, reference: match[0], url: attrs.src ?? null, alt: attrs.alt ?? null };
    });
  }
  if (format !== 'markdown') return [];
  const images = [];
  const definitions = new Map();
  const pendingReferences = [];
  let fence;
  let offset = 0;
  for (const line of body.split(/(?<=\n)|(?<=\r)(?!\n)/)) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line);
    if (fence) {
      if (delimiter?.[1][0] === fence[0] && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = undefined;
    } else if (delimiter) {
      fence = delimiter[1];
    } else if (!/^(?: {4}|\t)/.test(line)) {
      const definition = /^ {0,3}\[([^\]]+)\]:[ \t]*(?:<([^>]+)>|(\S+))/.exec(line);
      if (definition) {
        const key = definition[1].trim().toLowerCase().replace(/\s+/g, ' ');
        if (!definitions.has(key)) definitions.set(key, definition[2] ?? definition[3]);
      } else {
        // The old editor emits asset:// image links. Also recognize external images and HTML img.
        const tokens = /\\[!<>\x60]|`+[^`\r\n]*?`+|!\[((?:\\.|[^\]\\])*)\]\([ \t]*(?:<([^<>\r\n]*)>|((?:\([^()\r\n]*\)|[^()\s])*))(?:[ \t]+(?:"[^"]*"|'[^']*'))?[ \t]*\)|!\[((?:\\.|[^\]\\])*)\](?:\[([^\]\r\n]*)\])?|<img\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
        for (const match of line.matchAll(tokens)) {
          const [reference, alt, angle, bare, label, id] = match;
          const position = offset + match.index;
          if (alt !== undefined) images.push({ offset: position, reference, alt, url: angle ?? bare });
          else if (label !== undefined) {
            pendingReferences.push({ offset: position, reference, alt: label,
              label: (id || label).trim().toLowerCase().replace(/\s+/g, ' ') });
          } else if (reference[0] === '<') {
            const attrs = attributes(reference);
            images.push({ offset: position, reference, url: attrs.src ?? null, alt: attrs.alt ?? null });
          }
        }
      }
    }
    offset += line.length;
  }
  for (const { label, ...image } of pendingReferences) images.push({ ...image, url: definitions.get(label) ?? null });
  return images.sort((a, b) => a.offset - b.offset);
}

export function mediaFor(record, bodies, assets) {
  const parentId = record.legacyRef.id;
  const assetIds = Array.isArray(record.value.assetIds) ? record.value.assetIds : [];
  const direct = new Set([record.value.assetId, record.value.coverAssetId, ...assetIds]);
  const rows = assets.filter(asset => {
    const owner = asset.value.knowledgeDocumentId ?? (record.legacyRef.store === 'resources' ? asset.value.resourceId : null);
    return (parentId != null && owner === parentId) || (asset.value.id != null && direct.has(asset.value.id));
  });
  const byId = new Map(assets.map(asset => [asset.value.id, asset]));
  const slots = [];
  const used = new Set();
  function add({ placement, bodyField, offset = null, reference = null, url = null, alt = null, id = null, asset, anchor }) {
    const value = asset?.value;
    const key = JSON.stringify([record.legacyRef.key, placement, bodyField, offset, id, anchor]);
    const mime = string(value?.mimeType) ?? string(value?.blob?.type) ?? /^data:([^;,]+)/i.exec(url ?? '')?.[1] ?? null;
    const declaredOrder = Number.isInteger(value?.order) ? value.order : null;
    slots.push({
      mediaSlotId: identity({ ...record.legacyRef, key }, 'media'), legacyMediaId: legacyId(id), legacyParentId: parentId,
      placement, anchor, bodyField, offset, length: reference?.length ?? null, reference: /^data:/i.test(url ?? '') ? null : reference,
      sourceUrl: /^data:/i.test(url ?? '') ? null : url, order: placement === 'inline' ?
        slots.filter(slot => slot.bodyField === bodyField && slot.placement === 'inline').length + 1 : declaredOrder,
      mime, name: string(value?.fileName) ?? string(value?.blob?.name), caption: string(value?.caption), alt,
      status: 'pending_upload', targetFileId: null, assetPointer: asset?.pointer ?? null,
    });
  }
  for (const body of bodies) {
    for (const { offset, reference, url, alt } of inlineImages(body.raw, body.format)) {
      const id = assetIdFor(url);
      if (id) used.add(id);
      const line = body.raw.slice(0, offset).split(/\r\n|\r|\n/).length;
      add({ placement: 'inline', bodyField: body.field, offset, reference, url, alt, id, asset: byId.get(id),
        anchor: body.field + ':line=' + line + ':utf16=' + offset });
    }
  }
  for (const asset of rows) {
    const id = asset.value.id;
    if (used.has(id) && record.value.coverAssetId !== id) continue;
    add({ placement: record.value.coverAssetId === id ? 'cover' : 'attachment', bodyField: null, id, asset, anchor: null });
  }
  for (const id of direct) {
    if (id == null || byId.has(id) || used.has(id)) continue;
    add({ placement: record.value.coverAssetId === id ? 'cover' : 'attachment', bodyField: null, id, anchor: null });
  }
  for (const field of ['coverUrl', 'imageUrl']) {
    if (typeof record.value[field] === 'string' && record.value[field]) {
      add({ placement: 'cover', bodyField: field, anchor: field, url: record.value[field] });
    }
  }
  if (record.legacyRef.store === 'resources' && record.value.type === 'image' && typeof record.value.url === 'string') {
    add({ placement: 'attachment', bodyField: 'url', anchor: 'url', url: record.value.url });
  }
  return slots;
}
