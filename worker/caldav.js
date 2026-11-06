import { SaxesParser } from 'saxes';
import ICAL from 'ical.js';
import { Temporal } from '@js-temporal/polyfill';
import { readText } from './source.js';
import { parseIcs } from './ics.js';
import { eventIcs } from '../site/calendar-events.js';

const DAV = 'DAV:';
const CAL = 'urn:ietf:params:xml:ns:caldav';
const BASE = 'https://caldav.icloud.com/';
const MAX_XML = 3 * 1024 * 1024;
const MAX_ICS = 128 * 1024;
const ZONE = 'Asia/Tokyo';
const xmlEscape = value => String(value).replace(/[<&>"]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' })[c]);

export function appleUrl(input, base = BASE) {
  const url = new URL(input, base);
  if (url.protocol !== 'https:' || !/^(?:p\d{1,4}-)?caldav\.icloud\.com$/.test(url.hostname) ||
      url.port || url.username || url.password || url.search || url.hash || url.href.length > 1200 ||
      /%2f|%5c|%00/i.test(url.pathname)) throw new Error('Unsafe CalDAV URL');
  return url;
}

function collectionResource(collection, input) {
  const base = appleUrl(collection);
  if (!base.pathname.endsWith('/')) throw new Error('Invalid calendar collection');
  const resource = appleUrl(input, base);
  const tail = resource.pathname.slice(base.pathname.length);
  if (resource.origin !== base.origin || !resource.pathname.startsWith(base.pathname) || !tail || tail.includes('/')) {
    throw new Error('Resource outside selected calendar');
  }
  return resource;
}

function parseXml(input) {
  const parser = new SaxesParser({ xmlns: true });
  const stack = [];
  let root;
  let count = 0;
  parser.on('doctype', () => { throw new Error('DTD is not allowed'); });
  parser.on('error', error => { throw error; });
  parser.on('opentag', tag => {
    if (++count > 30_000 || stack.length > 24) throw new Error('CalDAV XML complexity limit');
    const node = { ns: tag.uri, name: tag.local, text: '', children: [] };
    if (stack.length) stack.at(-1).children.push(node);
    else root = node;
    stack.push(node);
  });
  const append = text => { if (stack.length) stack.at(-1).text += text; };
  parser.on('text', append);
  parser.on('cdata', append);
  parser.on('closetag', () => stack.pop());
  parser.write(input).close();
  if (root?.ns !== DAV || root.name !== 'multistatus') throw new Error('Invalid DAV multistatus');
  return root;
}

const children = (node, ns, name) => node?.children.filter(child => child.ns === ns && child.name === name) ?? [];
const child = (node, ns, name) => children(node, ns, name)[0];
const value = (node, ns, name) => child(node, ns, name)?.text.trim();
const okStatus = status => /^HTTP\/\d(?:\.\d)? 2\d\d\b/.test(status ?? '');

function rows(xml) {
  return children(parseXml(xml), DAV, 'response').map(row => {
    const groups = children(row, DAV, 'propstat').filter(item => okStatus(value(item, DAV, 'status')));
    return {
      href: value(row, DAV, 'href'),
      status: value(row, DAV, 'status'),
      properties: groups.flatMap(item => child(item, DAV, 'prop')?.children ?? []),
    };
  });
}
const prop = (row, ns, name) => row?.properties.find(node => node.ns === ns && node.name === name);
const envelope = (name, inside) =>
  '<D:' + name + ' xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">' + inside + '</D:' + name + '>';

function timeRange(window) {
  return [window.start, window.end].map(day =>
    Temporal.PlainDate.from(day).toZonedDateTime(ZONE).toInstant().toString().replace(/[-:]/g, ''));
}

export function eventWindow(event) {
  if (event.allDay) return { start: event.start, end: event.end };
  const start = Temporal.Instant.from(event.start).toZonedDateTimeISO(ZONE).toPlainDate();
  const end = Temporal.Instant.from(event.end).subtract({ nanoseconds: 1 }).toZonedDateTimeISO(ZONE).toPlainDate();
  return { start: start.toString(), end: end.add({ days: 1 }).toString() };
}

function supportedEventCalendar(row) {
  const type = prop(row, DAV, 'resourcetype');
  return Boolean(child(type, CAL, 'calendar') && !child(type, CAL, 'schedule-inbox') && !child(type, CAL, 'schedule-outbox'));
}

function writePrivilege(row) {
  const list = prop(row, DAV, 'current-user-privilege-set');
  if (!list) return null;
  const names = new Set(children(list, DAV, 'privilege').flatMap(node =>
    node.children.filter(entry => entry.ns === DAV).map(entry => entry.name)));
  return names.has('all') || names.has('write') || (names.has('write-content') && names.has('bind'));
}

export const studioUid = id => id + '@yi-studio';

const strongETag = value => /^"[^"\r\n]+"$/.test(value ?? '');

function singleEvent(ics, uid) {
  const calendar = new ICAL.Component(ICAL.parse(ics));
  const events = calendar.getAllSubcomponents('vevent');
  const event = events[0];
  // A single-instance editor must not rewrite a series, invitation or mixed resource.
  if (calendar.name !== 'vcalendar' || events.length !== 1 ||
      calendar.getAllSubcomponents().some(item => !['vevent', 'vtimezone'].includes(item.name)) ||
      ['rrule', 'exrule', 'recurrence-id', 'rdate', 'exdate', 'attendee', 'organizer'].some(name => event.hasProperty(name)) ||
      (uid && event.getFirstPropertyValue('uid') !== uid)) return null;
  return { calendar, event };
}

export function scheduleFromResource(resource) {
  const parts = resource?.owned && singleEvent(resource.ics);
  const start = parts?.event?.getFirstPropertyValue('dtstart');
  if (!start) return null;
  // Use the event's own date so a move outside the display window is still reconciled.
  const date = Temporal.PlainDate.from(start.toString().slice(0, 10));
  return parseIcs(resource.ics, { start: date.subtract({ days: 2 }).toString(), end: date.add({ days: 3 }).toString() },
    { includeNotes: true })[0] ?? null;
}

function updatedIcs(resource, details) {
  const { calendar, event } = singleEvent(resource.ics);
  const replacement = new ICAL.Component(ICAL.parse(eventIcs(details))).getFirstSubcomponent('vevent');
  // Preserve UID, alarms, unknown properties, and the rest of Apple's resource.
  for (const field of ['summary', 'location', 'description', 'dtstart', 'dtend', 'dtstamp']) {
    event.removeAllProperties(field);
    if (field === 'description') {
      event.addPropertyWithValue(field, details.notes);
    } else event.addProperty(replacement.getFirstProperty(field));
  }
  event.removeAllProperties('duration');
  event.updatePropertyWithValue('sequence', Number(event.getFirstPropertyValue('sequence') ?? 0) + 1);
  event.updatePropertyWithValue('last-modified', ICAL.Time.fromJSDate(new Date(), true));
  return calendar.toString() + '\r\n';
}

export function newCalDavClient(credentials, send = fetch) {
  const basic = btoa(String.fromCharCode(...new TextEncoder().encode(credentials.email + ':' + credentials.password)));

  async function request(input, method, body, headers = {}, discovery = false) {
    let url = appleUrl(input);
    for (let hop = 0; hop < 4; hop++) {
      let response;
      try {
        response = await send(url.href, {
          method, body, redirect: 'manual', signal: AbortSignal.timeout(7000), cache: 'no-store',
          headers: {
            Authorization: 'Basic ' + basic,
            ...(body && !headers['Content-Type'] ? { 'Content-Type': 'application/xml; charset=utf-8' } : {}),
            ...headers,
          },
        });
      } catch {
        throw Object.assign(new Error('Could not reach Apple CalDAV'), { code: 'apple_unreachable' });
      }
      if (response.status < 300 || response.status >= 400) return { url, response };
      const next = response.headers.get('Location');
      await response.body?.cancel();
      if (!discovery || !next || ![301, 302, 307, 308].includes(response.status)) throw new Error('Untrusted CalDAV redirect');
      url = appleUrl(next, url);
    }
    throw new Error('Too many CalDAV redirects');
  }

  async function report(url, method, payload, depth, discovery = false) {
    const result = await request(url, method, payload, { Depth: depth }, discovery);
    if (result.response.status === 401 || result.response.status === 403) {
      await result.response.body?.cancel();
      throw Object.assign(new Error('Apple authorization failed'), { code: 'apple_unauthorized' });
    }
    if (result.response.status !== 207 || Number(result.response.headers.get('Content-Length')) > MAX_XML) {
      await result.response.body?.cancel();
      throw new Error('CalDAV query failed');
    }
    const items = rows(await readText(result.response.body, MAX_XML));
    if (items.some(row => row.status && !okStatus(row.status))) throw new Error('Incomplete CalDAV result');
    return { url: result.url, items };
  }

  async function discoveryStage(stage, action) {
    try {
      return await action();
    } catch (error) {
      throw Object.assign(error, { stage });
    }
  }

  const find = (url, fields, depth = '0') =>
    report(url, 'PROPFIND', envelope('propfind', '<D:prop>' + fields + '</D:prop>'), depth, true);

  function discoveryLink(result, ns, name) {
    // A property can contain more than one href. Follow only links within our
    // Apple HTTPS allowlist, and don't depend on the order of DAV responses.
    for (const row of result.items) {
      for (const link of children(prop(row, ns, name), DAV, 'href')) {
        const href = link.text.trim();
        if (!href) continue;
        try { return appleUrl(href, result.url).href; } catch { /* Skip unsupported hrefs. */ }
      }
    }
    throw new Error('Missing usable CalDAV discovery link');
  }

  async function discover() {
    const principal = await discoveryStage('principal', async () =>
      discoveryLink(await find(BASE, '<D:current-user-principal/>'), DAV, 'current-user-principal'));
    const home = await discoveryStage('home', async () =>
      discoveryLink(await find(principal, '<C:calendar-home-set/>'), CAL, 'calendar-home-set'));
    return discoveryStage('calendars', async () => {
      const list = await find(home, '<D:resourcetype/><D:displayname/><D:current-user-privilege-set/>', '1');
      const calendars = new Map();
      for (const row of list.items) {
        if (!row.href || !supportedEventCalendar(row)) continue;
        let url;
        try { url = appleUrl(row.href, list.url); } catch { continue; }
        if (!url.pathname.endsWith('/')) url.pathname += '/';
        calendars.set(url.href, { href: url.href,
          name: (prop(row, DAV, 'displayname')?.text.trim() || '未命名日历').slice(0, 120),
          writable: writePrivilege(row) });
        if (calendars.size >= 60) break;
      }
      return [...calendars.values()];
    });
  }

  async function query(collection, window) {
    const [start, end] = window ? timeRange(window) : [];
    const filter = window ? '<C:comp-filter name="VEVENT"><C:time-range start="' + start +
      '" end="' + end + '"/></C:comp-filter>' : '<C:comp-filter name="VEVENT"/>';
    const payload = '<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">' +
      '<D:prop><D:getetag/><C:calendar-data/></D:prop><C:filter><C:comp-filter name="VCALENDAR">' +
      filter + '</C:comp-filter></C:filter></C:calendar-query>';
    const result = await report(collection, 'REPORT', payload, '1');
    if (result.items.length > 1000) throw new Error('Too many CalDAV resources');
    return result.items.map(row => {
      const data = prop(row, CAL, 'calendar-data')?.text;
      if (!data || !row.href) throw new Error('Incomplete calendar data');
      return { href: collectionResource(collection, row.href).href, ics: data, etag: prop(row, DAV, 'getetag')?.text.trim() };
    });
  }

  async function getOwned(collection, href, uid) {
    const { response } = await request(collectionResource(collection, href).href, 'GET');
    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel();
      return null;
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw Object.assign(new Error('Could not read iCloud event'), {
        code: [401, 403].includes(response.status) ? 'apple_unauthorized' : 'connection_error',
      });
    }
    const ics = await readText(response.body, MAX_ICS);
    return { href, ics, owned: Boolean(singleEvent(ics, uid)), etag: response.headers.get('ETag') };
  }

  async function locate(collection, event, knownHref) {
    const uid = event.uid ?? studioUid(event.id);
    const direct = knownHref || collectionResource(collection, event.id + '.ics').href;
    const resource = await getOwned(collection, direct, uid);
    if (resource?.owned) return resource;
    // iCloud rejects calendar-query UID filters. Only a complete collection
    // scan can distinguish a renamed resource from a deletion.
    const candidates = (await query(collection)).filter(({ ics }) =>
      new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents('vevent')
        .some(item => item.getFirstPropertyValue('uid') === uid));
    if (candidates.length > 1) return { owned: false };
    if (!candidates.length) return resource;
    // Apple may move or rename the resource; the UID survives notes and path changes.
    const candidate = candidates[0];
    const match = await getOwned(collection, candidate.href, uid);
    return match ?? { owned: false };
  }

  async function create(collection, event) {
    const href = collectionResource(collection, event.id + '.ics').href;
    const { response } = await request(href, 'PUT', eventIcs(event), {
      'Content-Type': 'text/calendar; charset=utf-8', 'If-None-Match': '*',
    });
    await response.body?.cancel();
    if (![200, 201, 204, 412].includes(response.status)) throw new Error('iCloud write failed');
    return locate(collection, event, href);
  }

  async function update(collection, resource, event) {
    if (!resource.owned || !strongETag(resource.etag)) return { changed: true };
    const href = collectionResource(collection, resource.href).href;
    const { response } = await request(href, 'PUT', updatedIcs(resource, event), {
      'Content-Type': 'text/calendar; charset=utf-8', 'If-Match': resource.etag,
    });
    await response.body?.cancel();
    if ([404, 410, 412].includes(response.status)) return { changed: true };
    if (![200, 204].includes(response.status)) throw new Error('iCloud update failed');
    // A subsequent GET may already reflect a newer Apple edit. The caller
    // verifies the fields before treating the write as synced.
    return { resource: await locate(collection, event, href) };
  }

  async function remove(collection, resource) {
    if (!resource.owned || !strongETag(resource.etag)) return 'changed';
    const { response } = await request(collectionResource(collection, resource.href).href,
      'DELETE', undefined, { 'If-Match': resource.etag });
    await response.body?.cancel();
    if ([200, 204, 404, 410].includes(response.status)) return 'deleted';
    if (response.status === 412) return 'changed';
    throw new Error('iCloud deletion failed');
  }

  async function scan(collection, window) {
    return (await query(collection, window)).map(resource => {
      const single = singleEvent(resource.ics);
      const uid = single?.event.getFirstPropertyValue('uid');
      return { ...resource, uid, owned: Boolean(uid), events: parseIcs(resource.ics, window, { includeNotes: true }) };
    });
  }

  async function read(collection, window) {
    return (await query(collection, window)).flatMap(resource => parseIcs(resource.ics, window, { includeNotes: true }));
  }

  return { discover, locate, create, update, remove, read, scan };
}
