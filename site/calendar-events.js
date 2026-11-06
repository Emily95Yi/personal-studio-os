import { addDays, dateKey, parseDate } from './calendar.js';

const tokyo = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
const timeLabel = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const tokyoMoment = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const maxLaunchLength = 6000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const shortcutChannel = 'yistudio-shortcut-results';
export const shortcutAttemptKey = 'yistudio-shortcut-attempt';
export const shortcutReceiptKey = 'yistudio-shortcut-receipt';

export function readShortcutResult(params) {
  if (params.get('status') !== 'success') return null;
  const eventId = params.get('event');
  const attempt = params.get('attempt');
  const result = params.get('result');
  if (!uuid.test(eventId ?? '') || !uuid.test(attempt ?? '') || !['added', 'existing'].includes(result)) return null;
  return { eventId, attempt, result };
}

export function eventStatusLabel(event) {
  if (event.syncMode === 'caldav' || event.sourceGroup === 'A') {
    const state = event.caldav?.state;
    const reason = event.caldav?.reason;
    if (state === 'added' || (!state && !event.syncMode)) return 'Synced';
    if (state === 'delete_queued') return 'Pending · 等待删除';
    if (state === 'queued' || !state) return 'Pending · 等待同步';
    return {
      conflict: 'Conflict · 时间重叠',
      cancelled: 'Pending · 已中止',
      moved_to_b: 'Conflict · 日程已在 B',
      remote_changed: 'Conflict · 两端都有修改',
      remote_deleted: 'Conflict · Apple 端已删除',
      delete_changed: 'Conflict · Apple 端有更新',
      unsupported_remote: 'Conflict · Apple 版本无法安全修改',
      apple_unauthorized: 'Error · Apple 授权失效',
      connection_error: 'Error · 暂时无法同步',
    }[reason] ?? 'Error · 同步失败';
  }
  if (['synced', 'sync_error'].includes(event.status)) return eventStatus[event.status];
  if (event.deviceResult === 'added') return '已添加 · 待 iCloud 核对';
  if (event.deviceResult === 'existing') return '已存在 · 待 iCloud 核对';
  return eventStatus[event.status];
}

export const eventStatus = {
  draft: '待确认', confirmed: '已确认', export_pending: '待加入 Apple 日历',
  export_launched: '已请求打开快捷指令 · 待核对', synced: '已匹配 iCloud', sync_error: '需要核对',
};

export function eventTimes(allDay, start, end) {
  if (allDay) {
    if (!parseDate(start) || !parseDate(end) || end <= start) return null;
    return { start, end, allDay: true };
  }
  const valid = value => tokyoMoment.test(value) && parseDate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value + '+09:00'));
  if (!valid(start) || !valid(end) || Date.parse(end + '+09:00') <= Date.parse(start + '+09:00')) return null;
  return {
    start: new Date(start + '+09:00').toISOString(),
    end: new Date(end + '+09:00').toISOString(),
    allDay: false,
  };
}

export function daySpan(event) {
  if (event.allDay) return { dayStart: event.start, dayEnd: event.end };
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  return {
    dayStart: tokyo.format(start),
    dayEnd: dateKey(addDays(parseDate(tokyo.format(Math.max(start, end - 1))), 1)),
  };
}

export function eventTimeLabel(event) {
  const { dayStart, dayEnd } = event.dayStart ? event : daySpan(event);
  const finalDay = dateKey(addDays(parseDate(dayEnd), -1));
  if (event.allDay) return dayStart === finalDay ? '全天' : '全天 · ' + dayStart + ' 至 ' + finalDay;
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (tokyo.format(start) === tokyo.format(end)) return timeLabel.format(start) + '–' + timeLabel.format(end);
  return tokyo.format(start) + ' ' + timeLabel.format(start) + ' → ' + tokyo.format(end) + ' ' + timeLabel.format(end);
}

export function eventDateTimeLabel(event) {
  const { dayStart } = event.dayStart ? event : daySpan(event);
  const time = eventTimeLabel(event);
  return time.startsWith(dayStart) ? time : dayStart + ' · ' + time;
}

function marker(id) { return 'YiStudio-Event-ID: ' + id; }

export function exportPayload(event) {
  return {
    eventId: event.id, title: event.title, start: event.start, end: event.end,
    allDay: event.allDay, timeZone: event.timeZone, location: event.location,
    notes: [event.notes, marker(event.id)].filter(Boolean).join('\n'),
    ...(event.targetCalendar ? { targetCalendar: event.targetCalendar } : {}),
  };
}

export function shortcutUrl(event, origin, attempt = crypto.randomUUID()) {
  const payload = encodeURIComponent(JSON.stringify(exportPayload(event)));
  const url = 'shortcuts://x-callback-url/run-shortcut?name=YiStudioAddEvent&input=text&text=' + payload;
  const callbacks = ['success', 'cancel', 'error'].map(status => '&x-' + status + '=' +
    encodeURIComponent(origin + '/apple-shortcut-return.html?status=' + status +
      (status === 'success' ? '&event=' + encodeURIComponent(event.id) + '&attempt=' + attempt : ''))).join('');
  return url.length + callbacks.length <= maxLaunchLength ? url + callbacks : null;
}

const icsText = value => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[,;]/g, '\\$&');
const icsDate = value => value.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const uid = event => event.id + '@yi-studio';

function fold(line) {
  const encoder = new TextEncoder();
  let bytes = 0;
  let output = '';
  for (const char of line) {
    const size = encoder.encode(char).byteLength;
    if (bytes + size > 75) {
      output += '\r\n ';
      bytes = 1;
    }
    output += char;
    bytes += size;
  }
  return output;
}

export function eventIcs(event, now = new Date()) {
  const value = exportPayload(event);
  const key = event.allDay ? ';VALUE=DATE' : '';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//YiStudio//Calendar//EN', 'BEGIN:VEVENT',
    'UID:' + uid(event), 'DTSTAMP:' + icsDate(now.toISOString()),
    'DTSTART' + key + ':' + icsDate(value.start), 'DTEND' + key + ':' + icsDate(value.end),
    'SUMMARY:' + icsText(value.title), 'LOCATION:' + icsText(value.location), 'DESCRIPTION:' + icsText(value.notes),
    'END:VEVENT', 'END:VCALENDAR', '',
  ].map(fold).join('\r\n');
}

function sameTime(a, b) {
  if (a.allDay !== b.allDay) return false;
  return a.allDay ? a.start === b.start && a.end === b.end :
    Date.parse(a.start) === Date.parse(b.start) && Date.parse(a.end) === Date.parse(b.end);
}

export function combineEvents(local, imported) {
  const consumed = new Set();
  const studio = local.map(event => {
    const matches = imported.filter(row => row.marker ? row.marker === event.id : row.uid === uid(event));
    if (matches.length === 1 && sameTime(event, matches[0])) {
      consumed.add(matches[0].id);
      const { uid: appleUid, sourceGroup, sourceLabel } = matches[0];
      return { ...event, ...daySpan(event), source: 'studio', status: 'synced', appleUid, sourceGroup, sourceLabel };
    }
    return { ...event, ...daySpan(event), source: 'studio', status: matches.length ? 'sync_error' : event.status,
      mismatch: matches.length > 0 };
  });
  return [...studio, ...imported.filter(row => !consumed.has(row.id))];
}
