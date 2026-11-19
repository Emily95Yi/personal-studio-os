// A read-only default view; saved manual orders and source insertion order stay intact.
export function chronologicalEvents(events, source = events) {
  const date = event => /^\d{4}-\d{2}-\d{2}$/.test(event.date?.trim() ?? '') ? event.date.trim() : '';
  const created = event => Date.parse(event.createdAt) || 0;
  const insertion = new Map(source.map((event, index) => [event.id, index]));
  return events.map((event, index) => ({ event, index: insertion.get(event.id) ?? index })).sort((a, b) =>
    date(b.event).localeCompare(date(a.event)) || created(b.event) - created(a.event) || b.index - a.index
  ).map(row => row.event);
}
