import assert from 'node:assert/strict';
import { emptyStudio } from '../site/studio-data.js';
import { studioExport } from '../site/studio-migration.js';
import { saveBoardContent } from '../site/self-board-data.js';

const origin = 'http://127.0.0.1:4182';
const owner = 'capture-test-' + crypto.randomUUID();
async function call(path, { method = 'GET', value, data, token, as = owner, headers = {}, expect = 200 } = {}) {
  const response = await fetch(origin + '/api' + path, {
    method,
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : { 'X-Test-Owner': as, Origin: origin }),
      'X-Studio-Request': '1', ...(value === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: value === undefined ? data : JSON.stringify(value),
  });
  if (response.status !== expect) {
    assert.fail(method + ' ' + path.replace(/\?.*/, '') + ' expected ' + expect + ', got ' + response.status +
      ' ' + await response.text());
  }
  if (!response.headers.get('Content-Type')?.includes('json')) return response;
  return response.json();
}
const cap = (path, options) => call('/capture' + path, options);
const create = (value, token, expect = 201) => cap(token ? '/mobile' : '', {
  method: 'POST', value: { requestKey: crypto.randomUUID(), ...value }, token, expect,
});

const studio = emptyStudio();
studio.reflectionLabels.push({ id: 'label-one', name: '测试标签', color: 'mint' });
studio.collectionFolders.push({ id: 'folder-one', categoryId: 'default-books', title: '测试书架' });
const lease = crypto.randomUUID();
await call('/studio/lease', { method: 'POST', value: { token: lease } });
await call('/studio', { method: 'PUT', value: studioExport(studio),
  headers: { 'X-Studio-Lease': lease, 'X-Studio-Revision': '0' } });
await call('/studio/lease', { method: 'DELETE', value: { token: lease } });
const { modules } = await cap('/options');
const [reflection, collection, discover] = modules;
assert.deepEqual(modules.map(module => module.label), ['Reflections', 'Collection', 'Discover']);
assert.equal(reflection.groups[0].options[0].label, '测试标签');
assert.equal(collection.groups[0].options[0].label, '测试书架');
assert.equal(discover.groups[0].options.length, 4);
const topic = discover.groups[1].options.find(row => row.label === '待分类');
assert.ok(topic);
const addDevice = name => cap('/devices', { method: 'POST', value: { name }, expect: 201 });
const a = await addDevice('iPhone A');
const b = await addDevice('iPhone B');
assert.notEqual(a.token, b.token);
assert.equal((await cap('/mobile/options', { token: a.token })).modules.length, 3);
await cap('/mobile/items', { token: a.token, expect: 403 });
await cap('/mobile/options', { expect: 401 });

const url = 'https://example.org/saved?utm_source=test#section';
const requestKey = crypto.randomUUID();
const first = await create({ requestKey, type: 'url', sourceUrl: url, metadata: { pageTitle: 'Saved page' } }, a.token);
assert.equal(first.status, 'inbox');
const retry = await create({ requestKey, type: 'url', sourceUrl: url }, a.token, 200);
const duplicate = await create({ type: 'url', sourceUrl: 'https://example.org/saved' }, b.token, 200);
assert.equal(retry.id, first.id);
assert.equal(duplicate.id, first.id);
const folder = collection.groups[0].options[0].target;
const categorized = await create({ type: 'url', sourceUrl: 'https://example.org/collection', target: folder }, a.token);
assert.equal(categorized.status, 'organized');

const tag = reflection.groups[0].options[0].target;
const excerpts = await Promise.all(['摘录一', '摘录二'].map(originalText =>
  create({ type: 'text', originalText, userNote: '我的备注', sourceUrl: url, target: tag }, b.token)));
assert.notEqual(excerpts[0].id, excerpts[1].id);
for (const item of excerpts) {
  if (item.status === 'inbox') {
    const current = await cap('/items/' + item.id);
    await cap('/items/' + item.id, { method: 'PATCH', value: { version: current.version, target: tag } });
  }
}
const personal = await create({ type: 'text', originalText: '剪贴板内容', target: topic.target }, a.token);
assert.equal(personal.status, 'organized');
const inbox = await cap('/items');
assert.equal(inbox.inboxCount, 1);
assert.equal(inbox.items[0].title, 'Saved page');
assert.equal(inbox.items[0].sourceUrl, url);
assert.equal(inbox.items[0].normalizedUrl, 'https://example.org/saved');
assert.equal((await cap('/items?q=Saved')).total, 1);
assert.equal((await cap('/items', { as: 'another-owner' })).total, 0);

await call('/studio/lease', { method: 'POST', value: { token: lease } });
const snapshotResponse = await fetch(origin + '/api/studio', { headers: { 'X-Studio-Request': '1', 'X-Test-Owner': owner } });
const revision = snapshotResponse.headers.get('X-Studio-Revision');
const snapshot = await snapshotResponse.json();
assert.equal(snapshot.collectionItems.find(row => row.id === categorized.id).folderId, 'folder-one');
assert.equal(snapshot.explorationEntries.find(row => row.id === personal.id).body, '剪贴板内容');
assert.equal(snapshot.content.find(row => row.id === excerpts[0].id).personalNotes, '我的备注');
saveBoardContent(snapshot, { id: excerpts[0].id, body: '从原编辑器修改' });
await call('/studio', { method: 'PUT', value: studioExport(snapshot),
  headers: { 'X-Studio-Lease': lease, 'X-Studio-Revision': revision } });
await call('/studio/lease', { method: 'DELETE', value: { token: lease } });
const edited = await cap('/items/' + excerpts[0].id);
assert.equal(edited.originalText, '从原编辑器修改');
await cap('/items/' + edited.id, { method: 'PATCH', value: { version: edited.version, target: folder } });
assert.equal((await cap('/items/' + edited.id)).nativeCollection, 'collectionItems');
const bulk = await Promise.all(['手动文字一', '手动文字二'].map(originalText => create({ type: 'text', originalText })));
await cap('/items/batch', { method: 'PATCH', value: { ids: bulk.map(row => row.id), target: topic.target } });
const saved = await cap('/items/' + first.id);
await cap('/items/' + first.id, { method: 'PATCH', value: { version: saved.version, status: 'archived' } });
assert.equal((await cap('/items?status=archived')).total, 1);

const pdf = Buffer.from('%PDF-1.7\nTest fixture');
const uploadId = crypto.randomUUID();
const upload = '/mobile/uploads/single?id=' + uploadId + '&filename=' + encodeURIComponent('测试.pdf');
for (let retry = 0; retry < 2; retry++) {
  const opened = await cap(upload, { method: 'POST', data: pdf, token: b.token, expect: 201,
    headers: { 'Content-Type': 'application/octet-stream' } });
  assert.deepEqual(opened, { id: uploadId, type: 'pdf', duplicateFile: false });
}
const attached = await create({ type: 'pdf', attachmentId: uploadId }, b.token);
const anotherUpload = crypto.randomUUID();
const repeatedFile = await cap('/mobile/uploads/single?id=' + anotherUpload + '&filename=another.pdf', {
  method: 'POST', data: pdf, token: b.token, expect: 201,
});
assert.equal(repeatedFile.duplicateFile, true);
await cap('/mobile/uploads/' + anotherUpload, { method: 'DELETE', token: b.token });
const attachment = '/items/' + attached.id + '/attachment';
const downloaded = await cap(attachment);
assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf);
assert.match(downloaded.headers.get('Content-Disposition'), /^attachment; filename\*=UTF-8/);
await cap(attachment, { as: 'another-owner', expect: 404 });
const imageUpload = crypto.randomUUID();
await cap('/mobile/uploads/single?id=' + imageUpload + '&filename=test.png', {
  method: 'POST', token: b.token, data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=', 'base64'),
  expect: 201,
});
const photo = await create({ type: 'image', attachmentId: imageUpload }, b.token);
const preview = await cap('/items/' + photo.id + '/attachment?preview');
assert.equal(preview.headers.get('Content-Type'), 'image/png');

const large = crypto.randomUUID();
const size = 9 * 1024 * 1024;
const opened = await cap('/uploads', { method: 'POST', value: { id: large, size, filename: 'large.bin' }, expect: 201 });
await cap('/uploads/' + large + '/1', { method: 'PUT', data: Buffer.alloc(opened.chunkBytes) });
await cap('/uploads/' + large + '/complete', { method: 'POST', expect: 409 });
await cap('/uploads/' + large + '/1', { method: 'PUT', data: Buffer.alloc(opened.chunkBytes) });
await cap('/uploads/' + large + '/2', { method: 'PUT', data: Buffer.alloc(size - opened.chunkBytes) });
await cap('/uploads/' + large + '/complete', { method: 'POST' });
const largeFile = await create({ type: 'file', attachmentId: large });
assert.equal((await cap('/items/' + largeFile.id)).attachment.size, size);
const storage = await call('/storage');
assert.ok(storage.d1 > 0, 'D1 binding returned a measured database size');
assert.ok(storage.r2 >= size + pdf.length, 'R2 sum includes uploaded objects');
assert.ok(storage.measuredAt);
await cap('/items/' + attached.id, { method: 'DELETE' });
await cap(attachment, { expect: 404 });

await cap('/devices/' + a.id, { method: 'DELETE' });
await cap('/mobile/options', { token: a.token, expect: 401 });
assert.equal((await create({ type: 'text', originalText: 'iPhone B remains authorized' }, b.token)).status, 'inbox');
console.log('Capture acceptance passed: categories, shared Inbox, dedupe, native edits, batch, R2 files, multipart, storage, revocation.');
