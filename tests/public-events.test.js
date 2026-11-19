import assert from 'node:assert/strict';
import test from 'node:test';
import { eventPoster, isPublicEvent, publicEvents } from '../site/public-event-data.js';
import { emptyStudio, studioStore, saveEvent } from '../site/studio-data.js';
import { saveMetadata } from '../site/workshop-event-actions.js';
import { eventDetail } from '../site/workshop-event-view.js';
import { studioExport } from '../site/studio-migration.js';
import { tokyoView } from '../site/tokyo-view.js';
import { demoPosters, exhibitionEvents } from '../site/tokyo-demo.js';
import { publicRepository } from '../site/repository.js';
import { readRoute } from '../site/pages.js';
import { SaxesParser } from 'saxes';

const now = new Date('2026-11-18T16:00:00Z'); // Nov 19 in Tokyo
const event = (id, extra = {}) => ({ id, title: id, date: '2026-12-01', visibility: 'public', status: 'planned', ...extra });

test('Workshop metadata publishes a poster to its selected section, persists, and can withdraw it', () => {
  const state = emptyStudio();
  const original = saveEvent(state, { title: '测试海报', description: '私有说明', body: '主持稿' });
  const form = new FormData();
  form.set('title', original.title); form.set('posterUrl', 'https://example.com/poster.png');
  form.set('status', 'draft'); form.set('tokyoPosterStatus', 'recruiting');
  const open = saveMetadata(state, original, form);
  assert.equal(open.status, 'recruiting');
  const [publicPoster] = publicEvents(state);
  assert.equal(publicPoster.recruiting, true);
  assert.equal(publicPoster.posterOnly, true);
  assert.equal(publicPoster.description, '');
  assert.equal(studioExport(state).events[0].tokyoPosterStatus, 'recruiting');
  form.set('tokyoPosterStatus', 'ended');
  form.set('status', open.status);
  const ended = saveMetadata(state, open, form);
  assert.equal(publicEvents(state)[0].ended, true);
  assert.equal(publicEvents(state)[0].recruiting, false);
  form.set('tokyoPosterStatus', '');
  form.set('status', ended.status);
  saveMetadata(state, ended, form);
  assert.deepEqual(publicEvents(state), []);
});

test('linked posters require an uploaded image or poster URL; Event editor starts hidden', () => {
  const state = emptyStudio();
  const row = saveEvent(state, { title: '无海报', status: 'completed', tokyoPosterStatus: 'ended' });
  assert.deepEqual(publicEvents(state), []);
  const before = studioStore.state;
  try {
    studioStore.receiveCloud(state, 0);
    assert.match(eventDetail({ event: row, params: new URLSearchParams() }), /data-event-editor hidden/);
  } finally { studioStore.receiveCloud(before, before.revision); }
});

test('public projection excludes drafts, private previews, withdrawn and other brands', () => {
  for (const row of [event('draft', { status: 'draft' }), event('private', { visibility: 'private' }),
    event('private-status', { status: 'private' }), event('archived-status', { status: 'archived' }),
    event('unlisted', { visibility: 'unlisted' }), event('deleted', { deletedAt: '2026-01-01' }),
    event('archived', { archivedAt: '2026-01-01' }), event('other', { brandId: 'other' }),
    event('withdrawn', { publication: { status: 'withdrawn' } }),
    { id: 'preview', workshopPublication: { preview: { title: 'PRIVATE PREVIEW' } } },
    { id: 'unspecified', status: 'completed' }]) assert.equal(isPublicEvent(row), false, row.id);
  assert.equal(isPublicEvent(event('public')), true);
  assert.equal(isPublicEvent({ id: 'published', publication: { status: 'published' } }), true);
  assert.equal(isPublicEvent({ id: 'legacy-published', workshopPublication: { status: 'published' } }), true);
});

test('only actually open recruitment sorts first; dates use Tokyo and expired states do not recruit', () => {
  const rows = publicEvents({ events: [
    event('planned', { date: '2027-01-01' }), event('open', { status: 'recruiting' }),
    event('expired', { status: 'recruiting', date: '2026-11-18' }),
    event('closed', { recruitmentStatus: 'open', registrationClosesAt: '2026-11-18T15:00:00Z' }),
    event('cancelled', { status: 'cancelled', recruitmentStatus: 'open', registrationUrl: 'https://example.com' }),
    event('today', { date: '2026-11-19', recruitmentStatus: 'open' }),
  ] }, { now });
  assert.deepEqual(rows.map(row => row.id), ['open', 'today', 'planned', 'cancelled', 'closed', 'expired']);
  assert.deepEqual(rows.filter(row => row.recruiting).map(row => row.id), ['open', 'today']);
  assert.equal(rows.find(row => row.id === 'cancelled').registrationUrl, '');
});

test('projection is read-only and whitelists public copy, images and real safe registration URLs', () => {
  const state = { events: [event('public', { publicDescription: '公开简介', description: '私有长说明',
    body: 'private body', attendeeCount: 20, facilitatorNotes: 'private note',
    posterUrl: 'javascript:alert(1)', coverUrl: 'https://example.com/cover.jpg', registrationUrl: 'javascript:alert(1)' })] };
  const before = structuredClone(state);
  const [row] = publicEvents(state, { now });
  assert.equal(row.description, '公开简介');
  assert.equal(row.poster, 'https://example.com/cover.jpg');
  assert.equal(row.registrationUrl, '');
  assert.equal('body' in row, false);
  assert.equal('facilitatorNotes' in row, false);
  assert.equal('attendeeCount' in row, false);
  assert.deepEqual(state, before);
  assert.equal(eventPoster({ coverAssetId: 'a' }, [{ id: 'a', mime: 'image/png', data: 'iVBORw0KGgo=' }]), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(eventPoster({ coverAssetId: 'a' }, [{ id: 'a', mime: 'image/svg+xml', data: 'c3Zn' }]), '');
});

test('empty homepage has labelled placeholders and no fabricated event, open status or registration', () => {
  const before = studioStore.state;
  try {
    studioStore.receiveCloud(emptyStudio(), 0);
    const html = tokyoView({ showDemo: false });
    assert.match(html, /一期一会inTokyo/);
    assert.match(html, /相遇・链接・流动・回声・探索・多元/);
    assert.match(html, /暂无公开海报/);
    assert.doesNotMatch(html, /data-tk-poster=/);
    assert.doesNotMatch(html, /正在募集中/);
    assert.doesNotMatch(html, /查看活动 \/ 报名/);
  } finally { studioStore.receiveCloud(before, before.revision); }
});

test('featured event belongs to the same gallery and occurs once; markup escapes public copy', () => {
  const before = studioStore.state;
  try {
    studioStore.receiveCloud({ ...emptyStudio(), events: [event('one', { title: '<script>alert(1)</script>', date: '2099-01-01' }),
      event('two', { date: '2098-01-01' })] }, 0);
    const html = tokyoView();
    assert.equal((html.match(/data-tk-poster="one"/g) ?? []).length, 1);
    assert.equal((html.match(/data-tk-poster="two"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /style="/); // Compatible with the existing strict Worker CSP.
    assert.match(html, /&lt;script&gt;/);
  } finally { studioStore.receiveCloud(before, before.revision); }
});

test('demo posters are isolated presentation data and real public events take precedence', () => {
  const before = studioStore.state;
  try {
    studioStore.receiveCloud(emptyStudio(), 0);
    const snapshot = structuredClone(studioStore.state);
    const html = tokyoView({ showDemo: true });
    assert.equal((html.match(/data-tk-poster=/g) ?? []).length, 8);
    assert.match(html, /DEMO GALLERY/);
    assert.doesNotMatch(html, /正在募集中|查看活动 \/ 报名/);
    assert.deepEqual(publicRepository.activities(), []);
    assert.deepEqual(studioStore.state, snapshot);
    assert.equal(demoPosters.every(p => p.demo && !p.recruiting && !p.registrationUrl), true);
    for (const poster of demoPosters) new SaxesParser().write(decodeURIComponent(poster.poster.split(',')[1])).close();
    const real = [{ id: 'real' }];
    assert.equal(exhibitionEvents(real), real);
    assert.deepEqual(exhibitionEvents([], { showDemo: false }), []);
    for (const page of ['stories', 'interactions']) {
      assert.equal(readRoute('#/public/yiqiyihui/' + page).type, 'public');
    }
  } finally { studioStore.receiveCloud(before, before.revision); }
});
