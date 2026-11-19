// Work only with the existing public projection. Never publish another Event
// or infer that a future, closed or cancelled event has already taken place.
export function archivePosters(events, { now = new Date() } = {}) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return events.filter(event => !event.recruiting && !event.cancelled &&
    (event.ended || event.demo || (/^\d{4}-\d{2}-\d{2}$/.test(event.date) && event.date < today)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(a.id).localeCompare(String(b.id)));
}

// Bounded, reversible scroll motion. The centre column travels in the opposite
// direction; no timers, looping posters or scroll-velocity accumulation.
export function galleryOffsets(progress, mobile = false) {
  const p = Math.max(0, Math.min(1, progress));
  return (mobile ? [-48, 34] : [-88, 62, -42]).map(distance => distance * (p - .5));
}

export function stackDepth(distance, travel) {
  const progress = Math.max(0, Math.min(1, distance / Math.max(1, travel)));
  return { scale: 1 - progress * .045, y: -progress * 8, shadow: .025 + progress * .035 };
}
