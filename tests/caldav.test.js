import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { appleUrl, newCalDavClient } from '../worker/caldav.js';
import { createCalDavService, overlaps } from '../worker/caldav-sync.js';
import { createHandler } from '../worker/index.js';
import { getSource, saveSource } from '../worker/feed.js';
import { eventTimes } from '../site/calendar-events.js';
import { dateKey } from '../site/calendar.js';
import { plannerRepository } from '../site/repository.js';

const apple = 'https://p42-caldav.icloud.com';
const collection = apple + '/100/calendars/studio/';
const xml = rows => new Response('<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
  rows.join('') + '</d:multistatus>', { status: 207 });
const property = (href, props) => '<d:response><d:href>' + href + '</d:href><d:propstat><d:prop>' +
  props + '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>';
const fakeCreds = { email: 'test@example.invalid', password: 'test-test-test-test' };

function appleFixture() {
  const events = new Map();
  const calls = [];
  const send = async (url, request) => {
    calls.push({ url, method: request.method, headers: request.headers });
    assert.equal(request.redirect, 'manual');
    assert.ok(request.headers.Authorization.startsWith('Basic '));
    if (request.method === 'PROPFIND') {
      if (url === 'https://caldav.icloud.com/') return Response.redirect(apple + '/', 302);
      if (url === apple + '/') return xml([property('/', '<d:current-user-principal><d:href>/100/principal/</d:href></d:current-user-principal>')]);
      if (url === apple + '/100/principal/') return xml([
        property('/100/principal/', '<c:calendar-home-set><d:href>/100/calendars/</d:href></c:calendar-home-set>'),
      ]);
      return xml([
        property('/100/calendars/studio/', '<d:resourcetype><c:calendar/></d:resourcetype><d:displayname>Studio Fixture</d:displayname>' +
          '<d:current-user-privilege-set><d:privilege><d:write/></d:privilege></d:current-user-privilege-set>'),
        property('/100/calendars/read-only/', '<d:resourcetype><c:calendar/></d:resourcetype><d:displayname>Read only</d:displayname>' +
          '<d:current-user-privilege-set><d:privilege><d:read/></d:privilege></d:current-user-privilege-set>'),
      ]);
    }
    if (request.method === 'REPORT') {
      const uid = /<C:text-match[^>]*>([^<]+)<\/C:text-match>/.exec(request.body)?.[1];
      return xml([...events].filter(([, row]) => !uid || row.ics.includes('UID:' + uid + '\r\n')).map(([href, row]) =>
        property(new URL(href).pathname, '<d:getetag>' + row.etag +
          '</d:getetag><c:calendar-data><![CDATA[' + row.ics + ']]></c:calendar-data>')));
    }
    const row = events.get(url);
    if (request.method === 'PUT') {
      assert.equal(request.headers['If-None-Match'], '*');
      if (row) return new Response(null, { status: 412 });
      events.set(url, { ics: request.body, etag: '"1"' });
      return new Response(null, { status: 201 });
    }
    if (!row) return new Response(null, { status: 404 });
    if (request.method === 'DELETE') {
      if (request.headers['If-Match'] !== row.etag) return new Response(null, { status: 412 });
      events.delete(url);
      return new Response(null, { status: 204 });
    }
    return new Response(row.ics, { headers: { ETag: row.etag } });
  };
  return { events, calls, send };
}

function sqliteAdapter(sqlite) {
  return {
    prepare(sql) {
      return { bind: (...args) => ({
        first: async () => sqlite.prepare(sql).get(...args),
        all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
        run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
      }) };
    },
  };
}

test('CalDAV discovery keeps authentication on Apple, and rejects non-Apple redirects and XML DTDs', async () => {
  const fixture = appleFixture();
  const calendars = await newCalDavClient(fakeCreds, fixture.send).discover();
  assert.deepEqual(calendars.map(row => [row.name, row.writable]), [['Studio Fixture', true], ['Read only', false]]);
  assert.throws(() => appleUrl('https://caldav.icloud.com.attacker.invalid/'));
  assert.throws(() => appleUrl('https://example.invalid@caldav.icloud.com/'));
  let redirects = 0;
  await assert.rejects(newCalDavClient(fakeCreds, async () => {
    redirects++;
    return Response.redirect('https://127.0.0.1');
  }).discover());
  assert.equal(redirects, 1);
  await assert.rejects(newCalDavClient(fakeCreds, async () => new Response(
    '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///local">]><x>&e;</x>', { status: 207 })).discover());
  const time = eventTimes(false, '2027-01-01T09:00', '2027-01-01T10:00');
  assert.equal(overlaps(time, eventTimes(false, '2027-01-01T10:00', '2027-01-01T11:00')), false);
  assert.equal(overlaps(time, { ...time, busy: false }), false);
  assert.equal(overlaps(time, { allDay: true, start: '2027-01-01', end: '2027-01-02' }), true);
});

test('private API queues, blocks overlapping calendars, retries, detects external deletion, and deletes with ETag', async () => {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0001_private_calendar.sql', '0002_caldav.sql']) {
    sqlite.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  }
  const env = {
    DB: sqliteAdapter(sqlite), CALDAV_ENABLED: 'true',
    CALDAV_ENCRYPTION_KEY: btoa('k'.repeat(32)), ICAL_ENCRYPTION_KEY: btoa('i'.repeat(32)),
    ACCESS_TEAM: 'fixture.cloudflareaccess.com', ACCESS_AUD: 'fixture', STUDIO_ORIGIN: 'https://studio.example.invalid',
  };
  const { send, events, calls } = appleFixture();
  const day = dateKey();
  const instant = value => new Date(day + 'T' + value + '+09:00').toISOString().replace(/[-:]/g, '').replace('.000', '');
  const secondary = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:daily-fixture',
    'DTSTART:' + instant('09:00'), 'DTEND:' + instant('10:00'), 'SUMMARY:Daily Fixture',
    'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
  const source = 'https://p1-caldav.icloud.com/published/2/fixture-not-real-abcdefghijkl';
  await saveSource(env, 'alice', source);
  let feedFails = false;
  const service = createCalDavService({
    provider: creds => newCalDavClient(creds, send),
    download: async url => {
      assert.equal(url, source);
      if (feedFails) throw new Error('Offline fixture');
      return secondary;
    },
  });
  const fetch = createHandler(request => request.headers.get('X-Test-Owner'), service);
  const jobs = [];
  const ctx = { waitUntil(job) { jobs.push(job); } };
  const flush = async () => { while (jobs.length) await Promise.all(jobs.splice(0)); };
  const request = async (path, method = 'GET', body, owner = 'alice', runtime = env) => {
    const response = await fetch(new Request(runtime.STUDIO_ORIGIN + '/api/' + path, {
      method, headers: {
        Origin: runtime.STUDIO_ORIGIN, 'X-Studio-Request': '1', 'X-Test-Owner': owner,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      }, body: body && JSON.stringify(body),
    }), runtime, ctx);
    return { status: response.status, ...(await response.json()) };
  };
  const prefix = 'calendar/caldav';
  const current = async id => (await service.view(env, 'alice')).statuses.find(row => row.id === id);
  const expire = () => sqlite.exec('UPDATE caldav_connections SET cache_at = 0, refresh_after = 0');
  const restricted = { ...env, CALDAV_TEST_CALENDAR: 'Other fixture' };
  assert.equal((await request(prefix + '/discover', 'POST', fakeCreds, 'alice', restricted)).status, 422);
  const config = await request(prefix + '/discover', 'POST', fakeCreds);
  assert.deepEqual(config.calendars.map(row => row.name), ['Studio Fixture']);
  assert.equal(JSON.stringify(config).includes(fakeCreds.password), false);
  const calendarSelection = { id: config.calendars[0].id };
  assert.equal((await request(prefix + '/select', 'POST', calendarSelection, 'alice', restricted)).status, 400);
  const selected = await request(prefix + '/select', 'POST', calendarSelection, 'alice', { ...env, CALDAV_TEST_CALENDAR: 'Studio Fixture' });
  assert.equal(selected.configured, true);
  await flush();
  assert.equal((await request(prefix, 'GET', undefined, 'bob')).configured, false);
  assert.equal((await request(prefix, 'GET', undefined, 'alice', { ...env, CALDAV_ENCRYPTION_KEY: '' })).enabled, false);
  assert.equal((await getSource(env.DB, 'alice')).owner, 'alice');

  plannerRepository.restore(null);
  let revision = 0;
  const makeEvent = (title, start, end) => {
    const task = plannerRepository.saveTask({ title, date: day });
    return plannerRepository.confirmReview(task.id, 'calendar', {
      ...eventTimes(false, day + 'T' + start, day + 'T' + end),
      syncMode: 'caldav', location: '', notes: '', targetCalendar: '',
    }).event;
  };
  const save = async () => {
    const saved = await request('planner', 'PUT', { revision, snapshot: plannerRepository.snapshot() });
    assert.equal(saved.status, 200);
    revision = saved.revision;
    await flush();
  };
  const act = async (id, action) => {
    const row = await current(id);
    const response = await request(prefix + '/event/' + id, 'POST', { action, version: row.version });
    assert.equal(response.status, 200);
    await flush();
  };
  const first = makeEvent('First', '09:00', '10:00');
  await save();
  assert.equal((await current(first.id)).reason, 'conflict');
  assert.equal((await current(first.id)).conflicts[0].title, 'Daily Fixture');
  assert.equal(events.size, 0);
  plannerRepository.updateCalendarDraft(first.id, { ...eventTimes(false, day + 'T10:00', day + 'T11:00'), location: '', notes: '' });
  await save();
  await act(first.id, 'retry');
  assert.equal((await current(first.id)).state, 'added');
  assert.equal(events.size, 1);
  assert.equal((await request(prefix + '/event/' + first.id, 'POST', { action: 'delete', version: 0 }, 'bob')).status, 404);

  const second = makeEvent('Overlap', '10:30', '11:30');
  await save();
  assert.equal((await current(second.id)).reason, 'conflict');
  await act(second.id, 'stop');
  assert.equal((await current(second.id)).reason, 'cancelled');
  assert.equal(events.size, 1);

  const href = collection + first.id + '.ics';
  events.delete(href);
  expire();
  await request(prefix + '/refresh', 'POST');
  await flush();
  assert.equal((await current(first.id)).reason, 'removed_remotely');
  await save();
  assert.equal(events.size, 0);
  await act(first.id, 'retry');
  assert.equal((await current(first.id)).state, 'added');
  assert.equal(events.size, 1);
  events.get(href).etag = '"2"';
  await act(first.id, 'delete');
  assert.equal((await current(first.id)).reason, 'delete_changed');
  assert.equal(events.size, 1);
  await act(first.id, 'delete');
  assert.equal((await current(first.id)).state, 'deleted');
  assert.equal(events.size, 0);
  assert.ok(calls.some(call => call.method === 'DELETE' && call.headers['If-Match'] === '"2"'));

  feedFails = true;
  const third = makeEvent('Unavailable', '12:00', '13:00');
  await save();
  assert.equal((await current(third.id)).reason, 'connection_error');
  assert.equal(events.size, 0);
  assert.equal(calls.filter(call => call.method === 'PUT').length, 2);
  assert.equal((await request(prefix, 'DELETE')).configured, false);
  assert.equal(sqlite.prepare('SELECT sealed FROM caldav_connections WHERE owner = ?').get('alice').sealed, '');
  const reconfigure = await request(prefix + '/discover', 'POST', fakeCreds);
  assert.equal((await request(prefix + '/select', 'POST', { id: reconfigure.calendars[0].id })).configured, true);
  await flush();
  assert.equal((await current(first.id)).state, 'deleted');
  assert.equal(events.size, 0);
});
