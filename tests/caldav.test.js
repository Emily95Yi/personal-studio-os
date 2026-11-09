import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { appleUrl, newCalDavClient } from '../worker/caldav.js';
import { createCalDavService, overlaps } from '../worker/caldav-sync.js';
import { createHandler } from '../worker/index.js';
import { getSource, saveSource } from '../worker/feed.js';
import { eventIcs, eventTimes } from '../site/calendar-events.js';
import { dateKey } from '../site/calendar.js';
import { plannerRepository } from '../site/repository.js';

const apple = 'https://p42-caldav.icloud.com';
const collection = apple + '/100/calendars/studio/';
const privateB = apple + '/100/calendars/read-only/';
const xml = rows => new Response('<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
  rows.join('') + '</d:multistatus>', { status: 207 });
const property = (href, props) => '<d:response><d:href>' + href + '</d:href><d:propstat><d:prop>' +
  props + '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>';
const fakeCreds = { email: 'test@example.invalid', password: 'test-test-test-test' };

function appleFixture() {
  const events = new Map();
  const calls = [];
  const controls = { revoked: false, bStatus: 0, beforePut: null };
  let version = 0;
  const send = async (url, request) => {
    calls.push({ url, method: request.method, headers: request.headers });
    assert.equal(request.redirect, 'manual');
    assert.ok(request.headers.Authorization.startsWith('Basic '));
    if (controls.revoked) return new Response(null, { status: 401 });
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
      if (request.body.includes('<C:prop-filter name="UID">')) return new Response(null, { status: 412 });
      if (url === privateB && controls.bStatus) return new Response(null, { status: controls.bStatus });
      const results = [...events].filter(([href]) => href.startsWith(url)).map(([href, row]) =>
        property(new URL(href).pathname, '<d:getetag>' + row.etag +
          '</d:getetag><c:calendar-data><![CDATA[' + row.ics + ']]></c:calendar-data>'));
      if (!request.body.includes('time-range')) {
        results.unshift(property(new URL(url).pathname, '<d:resourcetype><d:collection/></d:resourcetype>'));
      }
      return xml(results);
    }
    if (request.method === 'PUT') {
      assert.ok(url.startsWith(collection));
      controls.beforePut?.(url);
      const row = events.get(url);
      if (request.headers['If-None-Match'] === '*') {
        if (row) return new Response(null, { status: 412 });
        events.set(url, { ics: request.body, etag: '"' + (++version) + '"' });
        return new Response(null, { status: 201 });
      }
      if (!row || request.headers['If-Match'] !== row.etag) return new Response(null, { status: 412 });
      events.set(url, { ics: request.body, etag: '"' + (++version) + '"' });
      return new Response(null, { status: 204 });
    }
    const row = events.get(url);
    if (!row) return new Response(null, { status: 404 });
    if (request.method === 'DELETE') {
      if (request.headers['If-Match'] !== row.etag) return new Response(null, { status: 412 });
      events.delete(url);
      return new Response(null, { status: 204 });
    }
    return new Response(row.ics, { headers: { ETag: row.etag } });
  };
  return { events, calls, send, controls };
}

function sqliteAdapter(sqlite) {
  return {
    batch: async statements => Promise.all(statements.map(statement => statement.run())),
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

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../migrations/', import.meta.url)).sort()) {
    sqlite.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  }
  return sqlite;
}

const fixtureEnv = sqlite => ({
    DB: sqliteAdapter(sqlite), CALDAV_ENABLED: 'true',
    CALDAV_ENCRYPTION_KEY: btoa('k'.repeat(32)), ICAL_ENCRYPTION_KEY: btoa('i'.repeat(32)),
    ACCESS_TEAM: 'fixture.cloudflareaccess.com', ACCESS_AUD: 'fixture', STUDIO_ORIGIN: 'https://studio.example.invalid',
});

test('planner-linked events retain overlap safety, survive Apple deletion as tombstones and delete conditionally', async () => {
  const sqlite = database();
  const env = fixtureEnv(sqlite);
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
  assert.deepEqual(config.calendars.map(row => [row.name, row.canWrite]), [['Studio Fixture', true], ['Read only', false]]);
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
  const act = async (id, action, details) => {
    const row = await current(id);
    const response = await request(prefix + '/event/' + id, 'POST', { action, version: row.version, details });
    assert.equal(response.status, 200);
    await flush();
  };
  const plan = plannerRepository.savePlan({ title: 'First', kind: 'one-off', startDate: day });
  await save();
  assert.equal(events.size, 0);
  const { event: first } = plannerRepository.confirmReminder(plan.id, day, {
    ...eventTimes(false, day + 'T09:00', day + 'T10:00'),
    syncMode: 'caldav', location: '', notes: '', targetCalendar: '',
  });
  await save();
  assert.equal((await current(first.id)).reason, 'conflict');
  assert.equal((await current(first.id)).conflicts[0].title, 'Daily Fixture');
  assert.equal(events.size, 0);
  await act(first.id, 'edit', { ...eventTimes(false, day + 'T10:00', day + 'T11:00'), title: first.title, location: '', notes: '' });
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
  const refreshed = await request(prefix + '/refresh', 'POST');
  assert.equal(refreshed.statuses.find(row => row.id === first.id).reason, 'removed_remotely');
  await flush();
  await save();
  assert.equal(events.size, 0);
  assert.equal((await request(prefix + '/event/' + first.id, 'POST', { action: 'retry', version: (await current(first.id)).version })).status, 409);
  const row = sqlite.prepare('SELECT snapshot FROM planner_states WHERE owner = ?').get('alice');
  assert.equal(JSON.parse(row.snapshot).events.find(event => event.id === first.id).taskId, first.taskId);

  const replacement = makeEvent('Other event', '12:00', '13:00');
  await save();
  const replacementHref = collection + replacement.id + '.ics';
  events.get(replacementHref).etag = '"apple-edited"';
  await act(replacement.id, 'delete');
  assert.equal((await current(replacement.id)).reason, 'delete_changed');
  assert.equal(events.size, 1);
  await act(replacement.id, 'keep_local');
  assert.equal((await current(replacement.id)).state, 'deleted');
  assert.equal(events.size, 0);
  assert.ok(calls.some(call => call.method === 'DELETE' && call.headers['If-Match'] === '"apple-edited"'));

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

test('conditional PUT keeps the original UID and merges Apple changes without overwriting concurrent drafts', async () => {
  const env = fixtureEnv(database());
  const { events, calls, send, controls } = appleFixture();
  const service = createCalDavService({ provider: creds => newCalDavClient(creds, send) });
  const owner = 'alice';
  const calendar = (await service.discover(env, owner, fakeCreds)).calendars[0];
  await service.select(env, owner, calendar.id);
  const day = dateKey();
  const timed = eventTimes(false, day + 'T09:00', day + 'T10:00');
  const id = crypto.randomUUID();
  const details = { ...timed, title: 'Studio', location: 'Room 1', notes: 'First line\nSecond line' };
  await service.create(env, owner, id, { source: 'A', details });
  await service.run(env, owner);
  const current = async () => (await service.view(env, owner)).statuses.find(row => row.id === id);
  const href = collection + id + '.ics';
  assert.equal((await current()).state, 'added');
  assert.equal((await current()).remote.start, day + 'T00:00:00Z');
  const putCount = () => calls.filter(call => call.method === 'PUT').length;
  await service.create(env, owner, id, { source: 'A', details });
  await service.run(env, owner);
  assert.equal(putCount(), 1);

  const original = await current();
  const tomorrow = new Date(Date.parse(day) + 86_400_000).toISOString().slice(0, 10);
  const appleEdit = { id, title: 'iPhone', location: 'Tokyo', notes: 'Private notes',
    start: day, end: tomorrow, allDay: true };
  events.set(href, { ics: eventIcs(appleEdit).replace(/\\nYiStudio-Event-ID:[\s\S]*?\r\nEND:VEVENT/, '\r\nEND:VEVENT'), etag: '"apple-2"' });
  await service.run(env, owner, { manual: true });
  const remote = await current();
  assert.deepEqual([remote.remote.title, remote.remote.location, remote.remote.notes, remote.remote.allDay, remote.remote.start, remote.remote.end],
    ['iPhone', 'Tokyo', 'Private notes', true, day, tomorrow]);
  assert.equal((await service.command(env, owner, id, { action: 'edit', version: original.version, details })).status, 409);
  const studioEdit = { ...remote.remote, title: 'Studio update', location: 'Shibuya', notes: 'Edited in Studio' };
  await service.command(env, owner, id, { action: 'edit', version: remote.version, details: studioEdit });
  await service.run(env, owner);
  assert.equal((await current()).remote.title, 'Studio update');
  assert.equal(events.size, 1);
  assert.match(events.get(href).ics, new RegExp('UID:' + id + '@yi-studio'));
  assert.equal(calls.filter(call => call.method === 'PUT').at(-1).headers['If-Match'], '"apple-2"');
  assert.equal(calls.some(call => call.method === 'DELETE'), false);

  const nextEdit = { ...studioEdit, title: 'Studio pending' };
  await service.command(env, owner, id, { action: 'edit', version: (await current()).version, details: nextEdit });
  // The phone writes after the Worker GET but just before its PUT.
  controls.beforePut = url => {
    events.set(url, { ics: eventIcs({ ...appleEdit, title: 'Concurrent Apple edit' }), etag: '"apple-race"' });
    controls.beforePut = null;
  };
  await service.run(env, owner);
  const conflict = await current();
  assert.equal(conflict.state, 'conflict');
  assert.equal(conflict.local.title, 'Studio pending');
  assert.equal(conflict.remote.title, 'Concurrent Apple edit');
  assert.equal(events.get(href).etag, '"apple-race"');
  await service.command(env, owner, id, { action: 'keep_local', version: conflict.version });
  await service.run(env, owner);
  assert.equal((await current()).state, 'added');
  assert.equal((await current()).remote.title, 'Studio pending');
  assert.equal(calls.filter(call => call.method === 'PUT').at(-1).headers['If-Match'], '"apple-race"');

  await service.command(env, owner, id, { action: 'edit', version: (await current()).version, details });
  events.delete(href);
  await service.run(env, owner);
  const removed = await current();
  assert.equal(removed.reason, 'remote_deleted');
  assert.equal(removed.local.title, 'Studio');
  const before = putCount();
  await service.command(env, owner, id, { action: 'accept_remote', version: removed.version });
  await service.run(env, owner, { manual: true });
  assert.equal((await current()).state, 'deleted');
  assert.equal(events.size, 0);
  assert.equal(putCount(), before);
});

test('private B uses the same authorization, retains its cache on failure and never receives writes', async () => {
  const env = fixtureEnv(database());
  const { events, calls, send, controls } = appleFixture();
  const service = createCalDavService({ provider: creds => newCalDavClient(creds, send) });
  const owner = 'alice';
  const [a, b] = (await service.discover(env, owner, fakeCreds)).calendars;
  assert.equal((await service.select(env, owner, b.id)).status, 400);
  assert.equal((await service.select(env, owner, a.id, a.id)).status, 400);
  await service.select(env, owner, a.id);
  const reused = (await service.discover(env, owner, { reuse: true })).calendars;
  const primary = reused.find(row => row.primary);
  const secondary = reused.find(row => row.name === b.name);
  await service.select(env, owner, primary.id, secondary.id);
  const day = dateKey();
  const id = crypto.randomUUID();
  const details = { id, ...eventTimes(false, day + 'T23:00', day + 'T23:45'), title: 'Private B', notes: '', location: '' };
  const bHref = privateB + id + '.ics';
  events.set(bHref, { ics: eventIcs(details), etag: '"b1"' });
  await service.run(env, owner, { manual: true });
  const valid = await service.view(env, owner);
  assert.equal(valid.secondary.events[0].title, 'Private B');
  assert.notEqual(valid.sourceId, valid.secondary.sourceId);
  assert.equal(valid.events.length, 0);
  assert.equal(valid.secondary.events[0].linkId, undefined);
  for (const action of ['edit', 'delete']) {
    assert.equal((await service.command(env, owner, id, { action, version: '"b1"', details, source: 'B' })).status, 404);
    assert.equal((await service.command(env, owner, id, { action, version: '"b1"', details, source: 'A' })).status, 404);
  }
  assert.equal((await service.create(env, owner, id, { source: 'B', details })).status, 404);

  controls.bStatus = 503;
  await service.run(env, owner, { manual: true });
  let view = await service.view(env, owner);
  assert.equal(view.stale, false);
  assert.equal(view.secondary.stale, true);
  assert.equal(view.secondary.fetchedAt, valid.secondary.fetchedAt);
  assert.deepEqual(view.secondary.events, valid.secondary.events);
  controls.bStatus = 0;
  controls.revoked = true;
  await service.run(env, owner, { manual: true });
  view = await service.view(env, owner);
  assert.equal(view.authorizationFailed, true);
  assert.equal(view.secondary.authorizationFailed, true);
  assert.deepEqual(view.secondary.events, valid.secondary.events);
  controls.revoked = false;
  events.set(bHref, { ics: eventIcs({ ...details, title: 'B updated' }), etag: '"b2"' });
  await service.run(env, owner, { manual: true });
  assert.equal((await service.view(env, owner)).secondary.events[0].title, 'B updated');
  events.delete(bHref);
  await service.run(env, owner, { manual: true });
  assert.equal((await service.view(env, owner)).secondary.events.length, 0);
  assert.equal(calls.some(call => ['PUT', 'DELETE'].includes(call.method) && call.url.startsWith(privateB)), false);
});

test('an Apple-created single event in A can be edited in place without rewriting alarms or touching B', async () => {
  const env = fixtureEnv(database());
  const { events, calls, send } = appleFixture();
  const service = createCalDavService({ provider: creds => newCalDavClient(creds, send) });
  const owner = 'alice';
  const [a, b] = (await service.discover(env, owner, fakeCreds)).calendars;
  await service.select(env, owner, a.id, b.id);
  const day = dateKey();
  const original = { id: crypto.randomUUID(), ...eventTimes(false, day + 'T16:00:15', day + 'T17:00:30'),
    title: 'From Apple', notes: '', location: '' };
  const href = collection + 'native-event.ics';
  const ics = eventIcs(original).replace(/UID:[^\r]+/, 'UID:from-apple@example.invalid')
    .replace('END:VEVENT', 'BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nDESCRIPTION:Reminder\r\nEND:VALARM\r\nEND:VEVENT');
  events.set(href, { ics, etag: '"native-1"' });
  events.set(privateB + 'same-uid.ics', { ics, etag: '"b-1"' });
  await service.run(env, owner);
  const event = (await service.view(env, owner)).events[0];
  assert.equal(event.href, undefined);
  assert.equal(event.start, day + 'T07:00:15Z');
  await service.command(env, owner, event.linkId, {
    action: 'edit', source: 'A', version: event.version, details: { ...event, location: '新宿' },
  });
  await service.run(env, owner);
  const status = (await service.view(env, owner)).statuses.find(row => row.id === event.linkId);
  assert.equal(status.state, 'added');
  assert.equal(status.remote.location, '新宿');
  assert.equal(status.remote.start, event.start);
  assert.match(events.get(href).ics, /UID:from-apple@example\.invalid/);
  assert.match(events.get(href).ics, /BEGIN:VALARM/);
  assert.equal(events.get(privateB + 'same-uid.ics').etag, '"b-1"');
  assert.deepEqual(calls.filter(call => call.method === 'PUT').map(call => [call.url, call.headers['If-Match']]), [[href, '"native-1"']]);
});

test('discovery distinguishes rejected Apple authorization from connection and response failures', async () => {
  const env = fixtureEnv(database());
  const owner = 'alice';
  for (const [respond, expected] of [
    [async () => new Response(null, { status: 401 }), 'apple_unauthorized'],
    [async () => { throw new Error('private upstream details'); }, 'apple_unreachable'],
    [async () => new Response('<invalid />', { status: 207 }), 'apple_invalid_response'],
  ]) {
    const service = createCalDavService({ provider: creds => newCalDavClient(creds, respond) });
    const result = await service.discover(env, owner, fakeCreds);
    assert.deepEqual(result, { error: expected, stage: 'principal', status: 422 });
    assert.equal(JSON.stringify(result).includes(fakeCreds.password), false);
  }
});

test('discovery skips unrelated links without sending credentials outside Apple HTTPS', async () => {
  const home = apple + '/100/calendars/';
  const calls = [];
  const found = await newCalDavClient(fakeCreds, async (url, request) => {
    calls.push(url);
    assert.match(request.headers.Authorization, /^Basic /);
    if (url === 'https://caldav.icloud.com/') return xml([
      property('/', '<d:displayname>Not the principal</d:displayname>'),
      property('/', '<d:current-user-principal><d:href>mailto:sample@example.invalid</d:href>' +
        '<d:href>' + apple + '/100/principal/</d:href></d:current-user-principal>'),
    ]);
    if (url === apple + '/100/principal/') return xml([
      property('/100/principal/', '<c:calendar-home-set><d:href>https://not-apple.invalid/home/</d:href>' +
        '<d:href>/100/calendars/</d:href></c:calendar-home-set>'),
    ]);
    assert.equal(url, home);
    const type = '<d:resourcetype><c:calendar/></d:resourcetype>';
    return xml([
      property('https://not-apple.invalid/calendar/', type),
      property('/100/calendars/selected', type + '<d:displayname>Selected</d:displayname>'),
      property('/100/calendars/selected/', type + '<d:displayname>Selected</d:displayname>'),
    ]);
  }).discover();
  assert.deepEqual(found.map(row => row.href), [home + 'selected/']);
  assert.deepEqual(calls, ['https://caldav.icloud.com/', apple + '/100/principal/', home]);
});

test('UID recovery works when iCloud rejects UID filters and Apple changes the resource URL', async () => {
  const { events, send } = appleFixture();
  const client = newCalDavClient(fakeCreds, send);
  const id = crypto.randomUUID();
  const day = dateKey();
  const fields = { id, ...eventTimes(false, day + 'T15:00', day + 'T15:30'), title: 'Moved', location: '', notes: '' };
  const moved = collection + 'apple-renamed.ics';
  events.set(moved, { ics: eventIcs(fields), etag: '"renamed"' });
  const unrelated = { ...fields, id: crypto.randomUUID(), notes: 'refers to ' + id + '@yi-studio' };
  events.set(collection + 'unrelated.ics', { ics: eventIcs(unrelated), etag: '"other"' });
  const resource = await client.locate(collection, fields);
  assert.equal(resource.href, moved);
  assert.equal(resource.etag, '"renamed"');
  events.delete(moved);
  assert.equal(await client.locate(collection, fields), null);
});
