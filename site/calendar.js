import { href } from './pages.js';

const dayLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
const monthLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' });

export function dateKey(date = new Date()) {
  return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}

export function parseDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key ?? '')) return null;
  const date = new Date(key + 'T12:00:00');
  return dateKey(date) === key ? date : null;
}

export function addDays(date, offset) {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
}

export function weekStart(date) {
  return addDays(date, -((date.getDay() + 6) % 7));
}

export function periodBounds(date, mode) {
  if (mode === 'month') return [
    new Date(date.getFullYear(), date.getMonth(), 1, 12),
    new Date(date.getFullYear(), date.getMonth() + 1, 0, 12),
  ];
  if (mode === 'day') return [date, date];
  const start = weekStart(date);
  return [start, addDays(start, 6)];
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
  const first = new Date(date.getFullYear(), date.getMonth() + direction, 1, 12);
  const [, last] = periodBounds(first, 'month');
  first.setDate(Math.min(date.getDate(), last.getDate()));
  return first;
}

export function formatDay(date) { return dayLabel.format(date); }

export function formatPeriod(date, mode) {
  if (mode === 'month') return monthLabel.format(date);
  const [start, end] = periodBounds(date, mode);
  return mode === 'day' ? formatDay(date) : formatDay(start) + ' 至 ' + formatDay(end);
}

export function calendarHref(date = new Date(), mode = 'month') {
  return href('calendar') + '?view=' + mode + '&date=' + dateKey(date);
}

export function calendarSelection(params) {
  const mode = params.get('view');
  return {
    mode: ['day', 'week', 'month'].includes(mode) ? mode : 'month',
    date: parseDate(params.get('date')) ?? parseDate(dateKey()),
  };
}
