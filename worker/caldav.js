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

function ownsEvent(ics, id) {
  const component = new ICAL.Component(ICAL.parse(ics));
  if (component.name !== 'vcalendar' || component.getAllSubcomponents('vevent').length !== 1) return false;
  const event = component.getFirstSubcomponent('vevent');
  if (!event || event.hasProperty('rrule') || event.hasProperty('recurrence-id') || event.hasProperty('rdate') ||
      event.hasProperty('attendee') || event.hasProperty('organizer')) return false;
  const marker = 'YiStudio-Event-ID: ' + id;
  return event.getFirstPropertyValue('uid') === studioUid(id) &&
    String(event.getFirstPropertyValue('description') ?? '').split(/\r?\n/).includes(marker);
}

export function newCalDavClient(credentials, send = fetch) {
  const basic = btoa(String.fromCharCode(...new TextEncoder().encode(credentials.email + ':' + credentials.password)));

  async function request(input, method, body, headers = {}, discovery = false) {
    let url = appleUrl(input);
    for (let hop = 0; hop < 4; hop++) {
      const response = await send(url.href, {
        method, body, redirect: 'manual', signal: AbortSignal.timeout(7000), cache: 'no-store',
        headers: {
          Authorization: 'Basic ' + basic,
          ...(body && !headers['Content-Type'] ? { 'Content-Type': 'application/xml; charset=utf-8' } : {}),
          ...headers,
        },
      });
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
    if (result.response.status !== 207 || Number(result.response.headers.get('Content-Length')) > MAX_XML) {
      await result.response.body?.cancel();
      throw new Error('CalDAV query failed');
    }
    const items = rows(await readText(result.response.body, MAX_XML));
    if (items.some(row => row.status && !okStatus(row.status))) throw new Error('Incomplete CalDAV result');
    return { url: result.url, items };
  }

  async function find(url, fields, depth = '0') {
    return report(url, 'PROPFIND', envelope('propfind', '<D:prop>' + fields + '</D:prop>'), depth, true);
  }

  async function discover() {
    const root = await find(BASE, '<D:current-user-principal/>');
    const principal = value(prop(root.items[0], DAV, 'current-user-principal'), DAV, 'href');
    if (!principal) throw new Error('Missing CalDAV principal');
    const user = await find(appleUrl(principal, root.url).href, '<C:calendar-home-set/>');
    const home = value(prop(user.items[0], CAL, 'calendar-home-set'), DAV, 'href');
    if (!home) throw new Error('Missing calendar home');
    const list = await find(appleUrl(home, user.url).href,
      '<D:resourcetype/><D:displayname/><D:current-user-privilege-set/>', '1');
    return list.items.filter(row => row.href && supportedEventCalendar(row)).slice(0, 60).map(row => {
      const url = appleUrl(row.href, list.url);
      if (!url.pathname.endsWith('/')) url.pathname += '/';
      return { href: url.href, name: (prop(row, DAV, 'displayname')?.text.trim() || '未命名日历').slice(0, 120),
        writable: writePrivilege(row) };
    });
  }

  async function query(collection, window, uid) {
    const [start, end] = uid ? [] : timeRange(window);
    const range = uid ? '<C:prop-filter name="UID"><C:text-match collation="i;octet">' +
      xmlEscape(uid) + '</C:text-match></C:prop-filter>' :
      '<C:time-range start="' + start + '" end="' + end + '"/>';
    const payload = '<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">' +
      '<D:prop><D:getetag/><C:calendar-data/></D:prop><C:filter><C:comp-filter name="VCALENDAR">' +
      '<C:comp-filter name="VEVENT">' + range + '</C:comp-filter></C:comp-filter></C:filter></C:calendar-query>';
    const result = await report(collection, 'REPORT', payload, '1');
    if (result.items.length > 1000) throw new Error('Too many CalDAV resources');
    return result.items.map(row => {
      const data = prop(row, CAL, 'calendar-data')?.text;
      if (!data || !row.href) throw new Error('Incomplete calendar data');
      return { href: collectionResource(collection, row.href).href, ics: data, etag: prop(row, DAV, 'getetag')?.text.trim() };
    });
  }

  async function getOwned(collection, href, id) {
    const { response } = await request(collectionResource(collection, href).href, 'GET');
    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel();
      return null;
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error('Could not read iCloud event');
    }
    const ics = await readText(response.body, MAX_ICS);
    return { href, ics, owned: ownsEvent(ics, id), etag: response.headers.get('ETag') };
  }

  async function locate(collection, event, knownHref) {
    const direct = knownHref || collectionResource(collection, event.id + '.ics').href;
    const resource = await getOwned(collection, direct, event.id);
    if (resource) return resource;
    const candidates = await query(collection, null, studioUid(event.id));
    if (candidates.length > 1) return { owned: false };
    if (!candidates.length) return null;
    // A UID match must also retain the Studio marker and be a single event.
    const match = await getOwned(collection, candidates[0].href, event.id);
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

  async function remove(collection, resource) {
    if (!resource.owned || !resource.etag || !/^"[^"\r\n]+"$/.test(resource.etag)) return 'changed';
    const { response } = await request(collectionResource(collection, resource.href).href,
      'DELETE', undefined, { 'If-Match': resource.etag });
    await response.body?.cancel();
    if ([200, 204, 404, 410].includes(response.status)) return 'deleted';
    if (response.status === 412) return 'changed';
    throw new Error('iCloud deletion failed');
  }

  async function read(collection, window) {
    return (await query(collection, window)).flatMap(resource => parseIcs(resource.ics, window));
  }

  return { discover, locate, create, remove, read };
}
