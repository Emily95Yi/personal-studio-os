// Work only with the existing public projection. Never publish another Event
// or infer that a future, closed or cancelled event has already taken place.
export function archivePosters(events, { now = new Date() } = {}) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return events.filter(event => !event.recruiting && !event.cancelled &&
    (event.ended || event.demo || (/^\d{4}-\d{2}-\d{2}$/.test(event.date) && event.date < today)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(a.id).localeCompare(String(b.id)));
}

// Fit the requested rows into one screen, including the section heading/nav.
export function galleryLayout(availableWidth, viewportHeight, mobile, gap, rowGap) {
  const columns = mobile ? 2 : 3, rows = mobile ? 3 : 2;
  const budget = Math.max(120, Math.min(720, viewportHeight - 160));
  const posterHeight = (budget - rowGap * (rows - 1)) / rows;
  const width = Math.min(availableWidth, posterHeight * .75 * columns + gap * (columns - 1));
  const cardWidth = Math.max(1, (width - gap * (columns - 1)) / columns);
  const cardHeight = cardWidth * 4 / 3;
  return { columns, rows, width, height: cardHeight * rows + rowGap * (rows - 1), stride: cardHeight + rowGap };
}

// About one poster every 12 seconds. Alternate over the finite original track,
// rather than cloning posters or duplicating public Event records for a loop.
export function galleryMotion(travel, stride, column) {
  const speed = Math.max(1, stride / 12) * [1, .92, 1.06][column % 3];
  return { travel: Math.max(0, travel), duration: Math.max(1000, Math.max(0, travel) / speed * 1000),
    direction: column % 2 ? 'alternate-reverse' : 'alternate' };
}

export function stackDepth(distance, travel) {
  const progress = Math.max(0, Math.min(1, distance / Math.max(1, travel)));
  return { scale: 1 - progress * .045, y: -progress * 8, shadow: .025 + progress * .035 };
}
