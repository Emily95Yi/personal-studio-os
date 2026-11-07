import { authenticate, isConfigured } from './auth.js';
import { feedView, getSource, refreshDue, refreshSource, removeSource, saveSource } from './feed.js';
import { getPlanner, savePlanner, validSnapshot } from './planner.js';
import { normalizeSource, readText } from './source.js';

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Robots-Tag': 'noindex',
};

function json(value, status = 200) {
  return Response.json(value, { status, headers: privateHeaders });
}

async function body(request, limit) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') ?? '') ||
      Number(request.headers.get('Content-Length')) > limit) return null;
  try {
    return JSON.parse(await readText(request.body, limit));
  } catch {
    return null;
  }
}

async function planner(request, env, owner) {
  if (request.method === 'GET') return json(await getPlanner(env.DB, owner));
  if (request.method !== 'PUT') return json({ error: 'method' }, 405);
  const input = await body(request, 256 * 1024);
  if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0 || !validSnapshot(input.snapshot)) {
    return json({ error: 'invalid_planner' }, 400);
  }
  const saved = await savePlanner(env.DB, owner, input.revision, input.snapshot);
  return saved ? json(saved) : json({ error: 'conflict' }, 409);
}

async function calendar(request, env, ctx, owner, path) {
  const db = env.DB;
  const method = request.method;
  if (path === '/api/calendar/settings') {
    if (method === 'GET') return json({ configured: Boolean(await getSource(db, owner)) });
    if (method === 'PUT') {
      const input = await body(request, 1024);
      const url = normalizeSource(input?.url);
      if (!url) return json({ error: 'invalid_source' }, 400);
      await saveSource(env, owner, url);
      const row = await getSource(db, owner);
      ctx.waitUntil(refreshSource(env, owner, row).catch(() => {}));
      return json({ configured: true });
    }
    if (method === 'DELETE') {
      await removeSource(db, owner);
      return json({ configured: false });
    }
    return json({ error: 'method' }, 405);
  }
  if (path !== '/api/calendar/feed' && path !== '/api/calendar/refresh') return json({ error: 'not_found' }, 404);
  const manual = path === '/api/calendar/refresh';
  if (method !== (manual ? 'POST' : 'GET')) return json({ error: 'method' }, 405);
  const row = await getSource(db, owner);
  const now = Date.now();
  if (manual && row) {
    await refreshSource(env, owner, row, now);
    return json(feedView(await getSource(db, owner), now));
  }
  if (refreshDue(row, now)) ctx.waitUntil(refreshSource(env, owner, row, now).catch(() => {}));
  return json(feedView(row, now));
}

// Dependency injection is used by isolated tests. The deployed handler always verifies Access.
export function createHandler(authorize = authenticate) {
  return async (request, env, ctx) => {
    const url = new URL(request.url);
    if (!isConfigured(env)) return json({ error: 'unavailable' }, 503);
    if (url.origin !== env.STUDIO_ORIGIN) return json({ error: 'forbidden' }, 403);
    const owner = await authorize(request, env);
    if (!owner) return json({ error: 'unauthorized' }, 401);

    if (!url.pathname.startsWith('/api/')) {
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      for (const [name, value] of Object.entries(privateHeaders)) headers.set(name, value);
      return new Response(asset.body, { status: asset.status, headers });
    }
    if (request.headers.get('X-Studio-Request') !== '1' ||
        (request.method !== 'GET' && request.headers.get('Origin') !== env.STUDIO_ORIGIN)) {
      return json({ error: 'forbidden' }, 403);
    }
    try {
      if (url.pathname === '/api/planner') return await planner(request, env, owner);
      return await calendar(request, env, ctx, owner, url.pathname);
    } catch {
      return json({ error: 'unavailable' }, 503);
    }
  };
}

export default { fetch: createHandler() };
