export function shufflePosters(events, random = Math.random) {
  const rows = [...events];
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows;
}

// A visit gets a random arrangement; polling and opening a poster keep its place.
let signature;
let order = [];
export function archivePosters(events) {
  const next = JSON.stringify(events.map(event => event.id).sort());
  if (next !== signature) {
    signature = next;
    order = shufflePosters(events).map(event => event.id);
  }
  const byId = new Map(events.map(event => [event.id, event]));
  return order.map(id => byId.get(id));
}
