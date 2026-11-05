import ICAL from 'ical.js';
import { Temporal } from '@js-temporal/polyfill';

const TOKYO = 'Asia/Tokyo';
const MAX_STEPS = 35_000;
const MAX_EVENTS = 2_000;
const offsetDay = (date, days) => Temporal.PlainDate.from(date).add({ days }).toString();

export function windowFor(now = Date.now()) {
  const day = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(TOKYO).toPlainDate();
  return { start: day.subtract({ days: 90 }).toString(), end: day.add({ days: 367 }).toString() };
}

function instant(time, tzid) {
  if (time.zone !== ICAL.Timezone.localTimezone) return Temporal.Instant.fromEpochMilliseconds(time.toUnixTime() * 1000);
  return Temporal.PlainDateTime.from(time.toString()).toZonedDateTime(tzid || TOKYO).toInstant();
}

function key(time, tzid) {
  return time.isDate ? time.toString() : instant(time, tzid).toString();
}

function revision(component) {
  return [Number(component.getFirstPropertyValue('sequence') ?? 0), String(component.getFirstPropertyValue('dtstamp') ?? '')];
}

function keepNewest(map, id, item) {
  const previous = map.get(id);
  const [sequence, stamp] = revision(item.component);
  const [oldSequence, oldStamp] = previous ? revision(previous.component) : [-1, ''];
  if (sequence > oldSequence || (sequence === oldSequence && stamp >= oldStamp)) map.set(id, item);
}

const propertyZone = (component, field) => component.getFirstProperty(field)?.getParameter('tzid');
const canceled = component => String(component.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED';

// Cap feed complexity before expansion, including VTIMEZONE rules.
function checkRules(component) {
  for (const property of component.getAllProperties('rrule')) {
    const rule = property.getFirstValue();
    if (!['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(rule.freq) ||
        rule.interval < 1 || rule.interval > 366 || Object.values(rule.parts).some(values => values.length > 60)) {
      throw new Error('Unsupported recurrence density');
    }
  }
  for (const child of component.getAllSubcomponents()) checkRules(child);
}

export function parseIcs(ics, window) {
  if (!/^BEGIN:VCALENDAR\r?$/im.test(ics)) throw new Error('Invalid iCalendar');
  const calendar = new ICAL.Component(ICAL.parse(ics));
  if (calendar.name !== 'vcalendar') throw new Error('Invalid calendar component');
  const components = calendar.getAllSubcomponents('vevent');
  if (components.length > MAX_EVENTS) throw new Error('Too many event definitions');
  checkRules(calendar);

  const groups = new Map();
  const rows = new Map();
  const windowEnd = Temporal.PlainDate.from(window.end).toZonedDateTime(TOKYO).toInstant();
  const windowStart = Temporal.PlainDate.from(window.start).toZonedDateTime(TOKYO).toInstant();
  let steps = 0;

  for (const component of components) {
    const event = new ICAL.Event(component, { exceptions: [], strictExceptions: true });
    const uid = event.uid;
    if (typeof uid !== 'string' || !uid || uid.length > 512) continue;
    const group = groups.get(uid) ?? { masters: new Map(), exceptions: new Map() };
    groups.set(uid, group);
    if (event.recurrenceId) {
      const tzid = propertyZone(component, 'recurrence-id');
      keepNewest(group.exceptions, key(event.recurrenceId, tzid), event);
    } else keepNewest(group.masters, uid, event);
  }

  function append(uid, recurrence, item, startDate, endDate, fallbackZone) {
    if (canceled(item.component) || !startDate || !endDate) return;
    const allDay = startDate.isDate;
    const startZone = propertyZone(item.component, 'dtstart') || fallbackZone;
    const endZone = propertyZone(item.component, 'dtend') || startZone;
    let start, end, dayStart, dayEnd;
    if (allDay) {
      start = dayStart = startDate.toString();
      end = endDate.toString();
      if (end <= start) end = offsetDay(start, 1);
      dayEnd = end;
    } else {
      const first = instant(startDate, startZone);
      let last = instant(endDate, endZone);
      if (Temporal.Instant.compare(last, first) < 0) last = first;
      if (Temporal.Instant.compare(first, windowEnd) >= 0 || Temporal.Instant.compare(last, windowStart) < 0) return;
      start = first.toString();
      end = last.toString();
      dayStart = first.toZonedDateTimeISO(TOKYO).toPlainDate().toString();
      const finalInstant = Temporal.Instant.compare(last, first) > 0 ? last.subtract({ nanoseconds: 1 }) : first;
      dayEnd = offsetDay(finalInstant.toZonedDateTimeISO(TOKYO).toPlainDate().toString(), 1);
    }
    if (dayStart >= window.end || dayEnd <= window.start) return;
    const id = JSON.stringify([uid, recurrence]);
    const description = String(item.description ?? '');
    // Only the marker is needed for matching. Do not put private notes in the projection.
    const marker = /^YiStudio-Event-ID:\s*([\da-f-]{36})[ \t]*$/im.exec(description)?.[1]?.toLowerCase();
    rows.set(id, {
      id, uid, recurrence, source: 'icloud', marker,
      title: String(item.summary || '无标题日程').slice(0, 300),
      location: String(item.location ?? '').slice(0, 300),
      start, end, dayStart, dayEnd, allDay,
      timeZone: allDay ? undefined : startZone || (startDate.zone.tzid === 'floating' ? TOKYO : startDate.zone.tzid),
    });
    if (rows.size > MAX_EVENTS) throw new Error('Too many event instances');
  }

  for (const [uid, group] of groups) {
    const master = group.masters.get(uid);
    if (master && canceled(master.component)) continue;
    const zone = master ? propertyZone(master.component, 'dtstart') : undefined;
    if (master?.startDate) {
      if (!master.isRecurring()) append(uid, '', master, master.startDate, master.endDate, zone);
      else {
        for (const exception of group.exceptions.values()) {
          if (exception.startDate && exception.modifiesFuture()) master.relateException(exception);
        }
        const iterator = master.iterator();
        const iterationEnd = offsetDay(window.end, 2);
        // Explicit overrides are also processed separately so moved instances can enter the window.
        const excluded = new Set(master.component.getAllProperties('exdate').flatMap(property =>
          property.getValues().map(value => key(value, property.getParameter('tzid') || zone))));
        for (let occurrence = iterator.next(); occurrence; occurrence = iterator.next()) {
          if (++steps > MAX_STEPS) throw new Error('Recurrence budget exceeded');
          if (occurrence.toString().slice(0, 10) > iterationEnd) break;
          const recurrence = key(occurrence, zone);
          if (excluded.has(recurrence) || group.exceptions.has(recurrence)) continue;
          const { item, startDate, endDate } = master.getOccurrenceDetails(occurrence);
          append(uid, recurrence, item, startDate, endDate, zone);
        }
      }
    }
    for (const [recurrence, item] of group.exceptions) {
      if (!canceled(item.component) && item.startDate) append(uid, recurrence, item, item.startDate, item.endDate, zone);
    }
  }
  return [...rows.values()].sort((a, b) => a.start.localeCompare(b.start));
}
