import { href } from './pages.js';

const tokyoDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const dayLabel = new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' });

// UTC dates represent civil calendar days. Only converting an instant to "today" uses Tokyo time.
export function dateKey(date) {
  if (!date) return tokyoDate.format(new Date());
  return [String(date.getUTCFullYear()).padStart(4, '0'), String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')].join('-');
}

export function todayDate(instant = new Date()) {
  return parseDate(tokyoDate.format(instant));
}

export function parseDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key ?? '')) return null;
  const date = new Date(key + 'T12:00:00Z');
  return dateKey(date) === key ? date : null;
}

export function addDays(date, offset) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + offset);
  return next;
}

export function weekStart(date) {
  return addDays(date, -((date.getUTCDay() + 6) % 7));
}

export function periodBounds(date, mode) {
  if (mode === 'month') {
    const start = new Date(date);
    start.setUTCDate(1);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    return [start, end];
  }
  if (mode === 'day') return [date, date];
  const start = weekStart(date);
  return [start, addDays(start, 6)];
}

// Compare period indexes to support long cycles without creating dates outside the calendar range.
export function inQuotaPeriod(key, plan, today = todayDate()) {
  const anchor = parseDate(plan.periodStart);
  if (plan.period !== 'day' || !anchor || !plan.periodDays) {
    const [start, end] = periodBounds(today, plan.period).map(dateKey);
    return key >= start && key <= end;
  }
  const day = parseDate(key);
  const index = value => Math.floor((value - anchor) / 86_400_000 / plan.periodDays);
  return Boolean(day && day >= anchor && today >= anchor && index(day) === index(today));
}

export function calendarDays(date, mode) {
  const [start, end] = periodBounds(date, mode);
  const first = mode === 'month' ? weekStart(start) : start;
  const last = mode === 'month' ? addDays(weekStart(end), 6) : end;
  const days = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

export function movePeriod(date, mode, direction) {
  if (mode !== 'month') return addDays(date, direction * (mode === 'week' ? 7 : 1));
  const first = new Date(date);
  first.setUTCMonth(date.getUTCMonth() + direction, 1);
  const [, last] = periodBounds(first, 'month');
  first.setUTCDate(Math.min(date.getUTCDate(), last.getUTCDate()));
  return first;
}

export function formatDay(date) { return dayLabel.format(date); }

export function calendarHref(date = todayDate(), mode = 'week', from) {
  return href('calendar') + '?view=' + mode + '&date=' + dateKey(date) +
    (['self-board', 'auto'].includes(from) ? '&from=' + from : '');
}

export function calendarSelection(params) {
  const mode = params.get('view');
  return {
    mode: ['day', 'week', 'month'].includes(mode) ? mode : 'week',
    date: parseDate(params.get('date')) ?? todayDate(),
  };
}
