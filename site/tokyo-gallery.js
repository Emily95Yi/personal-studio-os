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

// Fixed directions: first/third move down; the second moves up. The logical
// track offset has the opposite sign to the visible movement of the posters.
export function galleryMotion(stride, column) {
  const speed = Math.max(1, stride / 12) * [1, .92, 1.06][column % 3];
  return { speed, scrollSign: column % 2 ? 1 : -1, direction: column % 2 ? 'up' : 'down', idleMs: 10_000 };
}

// A short, bounded glide after touch release. Integrate the decay so frame
// rate does not change the travel distance; a fast flick cannot accelerate it.
export function galleryGlide(velocity, seconds) {
  const speed = Math.max(-900, Math.min(900, velocity));
  const decay = Math.exp(-Math.max(0, seconds) / .12);
  const next = speed * decay;
  return { delta: speed * .12 * (1 - decay), velocity: Math.abs(next) < 8 ? 0 : next };
}

// Recycle only fully hidden original items. Reordering and compensating the
// transform together keep the visible posters in the same place.
export function galleryLoopStep(position, delta, max, stride) {
  if (max < 1 || stride < 1) return { position: 0, rotate: 0 };
  if (max < stride - 1) return { position: Math.max(0, Math.min(max, position + delta)), rotate: 0 };
  let next = position + delta, rotate = 0;
  if (delta > 0) while (next >= max - .25) { next -= stride; rotate++; }
  if (delta < 0) while (next <= .25) { next += stride; rotate--; }
  return { position: Math.max(0, Math.min(max, next)), rotate };
}

export function stackDepth(distance, travel) {
  const progress = Math.max(0, Math.min(1, distance / Math.max(1, travel)));
  return { scale: 1 - progress * .045, y: -progress * 8, shadow: .025 + progress * .035 };
}
