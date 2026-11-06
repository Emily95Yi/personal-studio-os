// Real Apple acceptance with isolated in-memory data and a loopback-only UI.
// Never import a production snapshot or use production calendar names here.
import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { createHandler } from '../worker/index.js';

const [testA = 'YiStudio CalDAV Test A', testB = 'YiStudio CalDAV Test B'] = process.argv.slice(2);
if (!testA.trim() || !testB.trim() || testA === testB) throw new Error('Select two different dedicated iCloud test calendars');
const root = new URL('../', import.meta.url);
const sqlite = new DatabaseSync(':memory:');
for (const name of (await readdir(new URL('migrations/', root))).filter(name => name.endsWith('.sql')).sort()) {
  sqlite.exec(await readFile(new URL('migrations/' + name, root), 'utf8'));
}
const DB = {
  prepare(sql) {
    return { bind: (...args) => ({
      first: async () => sqlite.prepare(sql).get(...args),
      all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      run: async () => ({ meta: sqlite.prepare(sql).run(...args) }),
    }) };
  },
  async batch(statements) { return Promise.all(statements.map(statement => statement.run())); },
};
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', json: 'application/json' };
const env = {
  DB, CALDAV_ENABLED: 'true', ACCESS_TEAM: 'acceptance.cloudflareaccess.com', ACCESS_AUD: 'local-acceptance',
  CALDAV_TEST_CALENDAR: testA, CALDAV_TEST_READ_CALENDAR: testB,
  CALDAV_ENCRYPTION_KEY: randomBytes(32).toString('base64'), ICAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  ASSETS: {
    async fetch(request) {
      const path = new URL(request.url).pathname === '/' ? '/index.html' : new URL(request.url).pathname;
      if (!/^\/[\w./-]+$/.test(path) || path.includes('..')) return new Response('Not found', { status: 404 });
      try {
        return new Response(await readFile(new URL('site' + path, root)), {
          headers: { 'Content-Type': types[path.split('.').at(-1)] ?? 'application/octet-stream' },
        });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    },
  },
};
const handler = createHandler(() => 'isolated-acceptance');
const server = createServer(async (incoming, outgoing) => {
  const host = new URL(localOrigin).host;
  if (incoming.headers.host !== host) { outgoing.writeHead(403).end(); return; }
  try {
    const hasBody = !['GET', 'HEAD'].includes(incoming.method);
    if (!incoming.url.startsWith('/') || incoming.url.startsWith('//')) { outgoing.writeHead(403).end(); return; }
    const headers = new Headers(incoming.headers);
    if (headers.get('Origin') === localOrigin) headers.set('Origin', env.STUDIO_ORIGIN);
    const request = new Request(new URL(incoming.url, env.STUDIO_ORIGIN), {
      method: incoming.method, headers,
      ...(hasBody ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}),
    });
    const response = await handler(request, env, { waitUntil(job) { void job.catch(() => {}); } });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch {
    outgoing.writeHead(500).end();
  }
});
let localOrigin;
server.listen(0, '127.0.0.1', () => {
  localOrigin = 'http://127.0.0.1:' + server.address().port;
  env.STUDIO_ORIGIN = 'https://calendar-acceptance.invalid';
  // createHandler keeps the HTTPS origin guard in production. The loopback bridge
  // provides the corresponding synthetic HTTPS origin to the Worker below.
  console.log(localOrigin + '/#/settings');
});
