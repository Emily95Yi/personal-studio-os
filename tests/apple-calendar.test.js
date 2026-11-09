import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import worker from '../worker/index.js';
import { parseIcs, windowFor } from '../worker/ics.js';
import { fetchIcs, normalizeSource, openSource, sealSource } from '../worker/source.js';
import { combineEvents, eventIcs, eventStatusLabel, eventTimes, readShortcutResult, shortcutUrl } from '../site/calendar-events.js';
import { plannerRepository } from '../site/repository.js';
import { allCalendarEvents, showEvent } from '../site/apple-view.js';
import { connection } from '../site/private-api.js';
import { calendarHeaderActions, calendarRefreshAction, calendarView } from '../site/planner-view.js';

const fakeUrl = 'webcal://p1-caldav.icloud.com/published/2/fixture_not_a_real_credential';
const ics = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap(properties =>
  ['BEGIN:VEVENT', ...properties, 'END:VEVENT']), 'END:VCALENDAR', ''].join('\r\n');
const dateWindow = { start: '2026-10-30', end: '2026-11-15' };

test('projects Tokyo days, preserves recurrence IDs, removes exceptions and handles moved or canceled instances', () => {
  const feed = ics(
    ['UID:series', 'DTSTART;TZID=America/New_York:20261030T090000',
      'DTEND;TZID=America/New_York:20261030T100000', 'RRULE:FREQ=DAILY;COUNT=6',
      'EXDATE:20261031T130000Z', 'SUMMARY:Weekly fixture'],
    ['UID:series', 'RECURRENCE-ID:20261101T140000Z', 'SEQUENCE:1',
      'DTSTART;TZID=Asia/Tokyo:20261106T093000', 'DTEND;TZID=Asia/Tokyo:20261106T103000', 'SUMMARY:Moved'],
    ['UID:series', 'RECURRENCE-ID:20261102T140000Z', 'STATUS:CANCELLED'],
    ['UID:series', 'RECURRENCE-ID:20261101T140000Z', 'SEQUENCE:0',
      'DTSTART;TZID=Asia/Tokyo:20261108T093000', 'SUMMARY:Old'],
    ['UID:all-day', 'DTSTART;VALUE=DATE:20261031', 'DTEND;VALUE=DATE:20261103', 'SUMMARY:All day'],
    ['UID:overnight', 'DTSTART:20261031T140000Z', 'DTEND:20261031T170000Z', 'SUMMARY:Overnight'],
    ['UID:midnight', 'DTSTART:20261101T120000Z', 'DTEND:20261101T150000Z', 'SUMMARY:End at midnight'],
  );
  const events = parseIcs(feed, dateWindow);
  const recurring = events.filter(event => event.uid === 'series');
  assert.deepEqual(recurring.map(event => event.start), [
    '2026-10-30T13:00:00Z', '2026-11-03T14:00:00Z', '2026-11-04T14:00:00Z', '2026-11-06T00:30:00Z',
  ]);
  assert.equal(recurring.at(-1).recurrence, '2026-11-01T14:00:00Z');
  const spans = ['all-day', 'overnight', 'midnight'].map(uid => events.find(event => event.uid === uid));
  assert.deepEqual(spans.map(row => [row.dayStart, row.dayEnd]), [
    ['2026-10-31', '2026-11-03'], ['2026-10-31', '2026-11-02'], ['2026-11-01', '2026-11-02'],
  ]);
  assert.equal(parseIcs(ics(), dateWindow).length, 0);
  assert.throws(() => parseIcs('not a feed', dateWindow));
});

test('SSRF allowlist, strict redirect handling and streamed response limit', async () => {
  const suffix = '/published/2/fixture_not_a_real_credential';
  assert.equal(normalizeSource(fakeUrl), fakeUrl.replace('webcal:', 'https:'));
  for (const url of [
    'http://p1-caldav.icloud.com' + suffix, 'https://127.0.0.1' + suffix,
    'https://caldav.icloud.com.attacker.invalid' + suffix, 'https://caldav.icloud.com@attacker.invalid' + suffix,
    'https://caldav.icloud.com:443' + suffix, 'https://caldav.icloud.com' + suffix + '?q=x',
    'https://caldav.icloud.com' + suffix + '#x',
  ]) assert.equal(normalizeSource(url), null);
  await assert.rejects(fetchIcs(fakeUrl, async (_, options) => {
    assert.equal(options.redirect, 'manual');
    return Response.redirect('https://127.0.0.1');
  }));
  await assert.rejects(fetchIcs(fakeUrl, async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024 + 1));
      controller.close();
    },
  }))));
  const secret = btoa('a'.repeat(32));
  const encrypted = await sealSource(secret, 'alice', fakeUrl);
  assert.equal(await openSource(secret, 'alice', encrypted), fakeUrl);
  await assert.rejects(openSource(secret, 'bob', encrypted));
});

test('Review creates a separate event, .ics and Shortcut round-trip, exact and ambiguous match', () => {
  const plan = plannerRepository.savePlan({ title: 'Fixture rule', kind: 'one-off' });
  const task = plannerRepository.saveTask({ title: '预约, 分号; & 中文', date: '2026-11-01', planId: plan.id });
  const times = eventTimes(false, '2026-11-01T23:30', '2026-11-02T01:00');
  assert.equal(eventTimes(false, '2026-11-01T24:00', '2026-11-02T01:00'), null);
  const { review, event } = plannerRepository.confirmReview(task.id, 'calendar', {
    ...times, location: 'Fixture', notes: 'x'.repeat(150) + '\n备注', targetCalendar: 'iCloud fixture',
  });
  assert.equal(new Set([plan.id, task.id, review.id, event.id]).size, 4);
  assert.equal(event.status, 'export_pending');
  assert.equal(plannerRepository.confirmReview(task.id, 'calendar', times), null);
  const imported = parseIcs(eventIcs(event), dateWindow);
  assert.equal(imported[0].marker, event.id);
  assert.equal(imported[0].title, task.title);
  assert.equal(imported[0].dayEnd, '2026-11-03');
  assert.equal(combineEvents([event], [])[0].status, 'export_pending');
  assert.equal(combineEvents([event], imported).length, 1);
  assert.equal(combineEvents([event], imported)[0].status, 'synced');
  const ambiguous = combineEvents([event], [...imported, { ...imported[0], id: 'other' }]);
  assert.equal(ambiguous[0].status, 'sync_error');
  assert.equal(ambiguous.length, 3);
  assert.equal(combineEvents([event], [{ ...imported[0], end: '2026-11-03T01:00:00Z' }])[0].status, 'sync_error');
  const query = new URL(shortcutUrl(event, 'https://studio.example.test')).searchParams;
  const payload = JSON.parse(query.get('text'));
  assert.equal(query.get('name'), 'YiStudioAddEvent');
  assert.equal(payload.eventId, event.id);
  assert.equal(payload.targetCalendar, 'iCloud fixture');
  assert.equal(payload.start, '2026-11-01T14:30:00.000Z');
  assert.ok(query.get('x-cancel').includes('status=cancel'));
  const callback = new URL(query.get('x-success'));
  callback.searchParams.set('result', 'existing');
  const result = readShortcutResult(callback.searchParams);
  assert.equal(result.eventId, event.id);
  assert.equal(result.result, 'existing');
  plannerRepository.markEvent(event.id, 'export_launched');
  plannerRepository.markDeviceResult(event.id, result.result);
  const [reported] = combineEvents(plannerRepository.calendarEvents(), []);
  assert.match(eventStatusLabel(reported), /^已存在/);
  assert.equal(reported.status, 'export_launched');
  assert.equal(eventStatusLabel(combineEvents([reported], imported)[0]), '已匹配 iCloud');
  callback.searchParams.set('result', 'synced');
  assert.equal(readShortcutResult(callback.searchParams), null);
});

test('Worker verifies signed Access tokens, isolates source and planner, caches feed safely and replaces deleted events', async t => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_private_calendar.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      return { bind: (...args) => ({
        first: async () => sqlite.prepare(sql).get(...args),
        run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
      }) };
    },
  };
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256' };
  const env = {
    DB: db, ACCESS_TEAM: 'fixture.cloudflareaccess.com', ACCESS_AUD: 'test-audience',
    STUDIO_ORIGIN: 'https://studio.example.test', ICAL_ENCRYPTION_KEY: btoa('b'.repeat(32)),
  };
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(promise); } };
  const token = async (sub, audience = env.ACCESS_AUD) => new SignJWT({ email: sub + '@example.test', type: 'app' })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer('https://' + env.ACCESS_TEAM)
    .setAudience(audience).setSubject(sub).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const alice = await token('alice');
  const bob = await token('bob');
  const send = (path, { auth, method = 'GET', value, origin = env.STUDIO_ORIGIN } = {}) =>
    worker.fetch(new Request(env.STUDIO_ORIGIN + '/api/' + path, { method,
      headers: { Origin: origin, 'X-Studio-Request': '1',
        ...(auth ? { 'Cf-Access-Jwt-Assertion': auth } : {}),
        ...(value ? { 'Content-Type': 'application/json' } : {}) },
      body: value && JSON.stringify(value),
    }), env, ctx);

  const day = windowFor().start.replaceAll('-', '');
  let upstream = ics(['UID:fixture', 'DTSTART;VALUE=DATE:' + day, 'SUMMARY:Fixture event']);
  let appleCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url) === 'https://' + env.ACCESS_TEAM + '/cdn-cgi/access/certs') return Response.json({ keys: [jwk] });
    assert.equal(String(url), normalizeSource(fakeUrl));
    assert.equal(options.redirect, 'manual');
    appleCalls++;
    return upstream === null ? new Response('Fail', { status: 502 }) : new Response(upstream);
  });

  assert.equal((await send('calendar/feed')).status, 401);
  assert.equal((await send('calendar/caldav')).status, 401);
  assert.equal((await send('calendar/caldav/event/' + crypto.randomUUID(), { method: 'PUT', value: { source: 'A' } })).status, 401);
  const wrong = await token('alice', 'wrong');
  assert.equal((await send('calendar/feed', { auth: wrong })).status, 401);
  assert.equal((await send('calendar/caldav/refresh', { method: 'POST', auth: wrong })).status, 401);
  assert.equal((await send('calendar/feed', { auth: alice })).headers.get('cache-control'), 'private, no-store');
  const settings = { auth: alice, method: 'PUT', value: { url: fakeUrl } };
  assert.equal((await send('calendar/settings', { ...settings, origin: 'https://public.example.test' })).status, 403);
  const response = await send('calendar/settings', settings);
  assert.deepEqual(await response.json(), { configured: true });
  await Promise.all(pending.splice(0));
  assert.equal(appleCalls, 1);
  const stored = sqlite.prepare('SELECT encrypted_url FROM calendar_sources').get();
  assert.ok(!stored.encrypted_url.includes('icloud'));
  assert.deepEqual(await (await send('calendar/feed', { auth: bob })).json(), { status: 'unconfigured', events: [] });
  const cached = await (await send('calendar/refresh', { auth: alice, method: 'POST' })).json();
  assert.equal(appleCalls, 1);
  assert.equal(cached.events.length, 1);

  const expireLease = () => sqlite.exec('UPDATE calendar_sources SET refresh_after = 0');
  expireLease();
  upstream = null;
  const failed = await (await send('calendar/refresh', { auth: alice, method: 'POST' })).json();
  assert.equal(failed.status, 'stale');
  assert.equal(failed.events.length, 1);
  expireLease();
  upstream = ics();
  const cleared = await (await send('calendar/refresh', { auth: alice, method: 'POST' })).json();
  assert.equal(cleared.status, 'ready');
  assert.deepEqual(cleared.events, []);

  const planner = { auth: alice, method: 'PUT', value: { revision: 0, snapshot: plannerRepository.snapshot() } };
  assert.deepEqual(await (await send('planner', planner)).json(), { revision: 1 });
  assert.equal((await send('planner', planner)).status, 409);
  assert.deepEqual(await (await send('planner', { auth: bob })).json(), { revision: 0, snapshot: null });
  assert.equal((await send('calendar/settings', { auth: alice, method: 'DELETE' })).status, 200);
  assert.deepEqual(await (await send('calendar/feed', { auth: alice })).json(), { status: 'unconfigured', events: [] });
});

test('calendar views combine color-coded sources and omit iCloud mutation controls', t => {
  const old = { ...connection };
  t.after(() => Object.assign(connection, old));
  plannerRepository.restore(null);
  const day = '2027-01-08';
  const fields = { title: 'Apple A original', id: 'original', uid: 'same-uid', recurrence: '',
    source: 'icloud', allDay: true, start: day, end: '2027-01-09', dayStart: day, dayEnd: '2027-01-09' };
  connection.mode = 'private';
  connection.caldav = { enabled: true, configured: true, name: 'Test A', sourceId: 'source-a', statuses: [], fetchedAt: 1,
    events: [{ ...fields, linkId: crypto.randomUUID(), version: '"1"' }],
    secondary: { name: 'Test B', sourceId: 'source-b', fetchedAt: 1, events: [{ ...fields, title: 'Duplicate B' },
      { ...fields, title: 'B only', uid: 'only-b', id: 'only-b' }] },
  };
  connection.feed = { status: 'ready', events: [{ ...fields, title: 'Old public B', uid: 'old-ics' }] };
  assert.deepEqual(allCalendarEvents().map(row => row.title), ['Apple A original', 'B only']);
  assert.deepEqual(allCalendarEvents('B').map(row => row.title), ['Duplicate B', 'B only']);
  assert.notEqual(allCalendarEvents('A')[0].id, allCalendarEvents('B')[0].id);
  const params = new URLSearchParams({ source: 'B', date: day, view: 'day' });
  const html = calendarView({ params });
  assert.doesNotMatch(html, /source=B|日历来源|当天事项|Duplicate B/);
  assert.match(html, /<h2>1月<\/h2>/);
  assert.match(html, /<h2>1\.8<\/h2>/);
  assert.match(html, /data-calendar-source="A"[^]*Apple A original/);
  assert.match(html, /data-calendar-source="B"[^]*B only/);
  assert.match(html, /data-calendar-create="2027-01-08"[^>]+aria-label="新建日程或待办"/);
  assert.doesNotMatch(calendarHeaderActions(), /data-feed-refresh/);
  assert.match(calendarRefreshAction(), /data-refresh-state="success"/);
  connection.refreshing = true;
  assert.match(calendarRefreshAction(), /data-refresh-state="pending"/);
  connection.refreshing = false;
  connection.caldav.secondary.stale = true;
  assert.match(calendarRefreshAction(), /data-refresh-state="error"/);
  const body = { innerHTML: '' };
  const dialog = { dataset: {}, open: true, querySelector: () => body };
  const app = { querySelector: () => dialog, querySelectorAll: () => [] };
  showEvent(app, allCalendarEvents('A')[0]);
  assert.match(body.innerHTML, /data-caldav-edit/);
  assert.match(body.innerHTML, /data-caldav-command="delete"/);
  showEvent(app, allCalendarEvents('B')[0]);
  assert.doesNotMatch(body.innerHTML, /data-caldav-edit|data-caldav-command/);
});
