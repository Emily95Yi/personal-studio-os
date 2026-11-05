const MAX_FEED_BYTES = 1024 * 1024;

// A narrowly scoped Apple host and published-calendar path. Rebuild the URL after validation.
export function normalizeSource(input) {
  if (typeof input !== 'string' || input.length > 512) return null;
  const match = /^\s*(?:https|webcal):\/\/((?:p\d{1,4}-)?caldav\.icloud\.com)(\/published\/2\/[A-Za-z0-9_-]{16,320})\s*$/i.exec(input);
  return match ? 'https://' + match[1].toLowerCase() + match[2] : null;
}

export async function readText(body, limit) {
  if (!body) throw new Error('Missing body');
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      total += value.byteLength;
      if (total > limit) throw new Error('Body too large');
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function fetchIcs(source, request = fetch) {
  const url = normalizeSource(source);
  if (!url) throw new Error('Invalid source');
  const response = await request(url, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(9000),
    headers: { Accept: 'text/calendar, application/octet-stream;q=0.5' },
    cache: 'no-store',
  });
  if (response.status !== 200 || Number(response.headers.get('Content-Length')) > MAX_FEED_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Source unavailable');
  }
  return readText(response.body, MAX_FEED_BYTES);
}

const encode = new TextEncoder();

async function encryptionKey(secret) {
  const bytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error('Invalid calendar key');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sealSource(secret, owner, source) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(secret);
  const data = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encode.encode(owner) }, key, encode.encode(source)));
  return btoa(String.fromCharCode(...iv, ...data));
}

export async function openSource(secret, owner, value) {
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const key = await encryptionKey(secret);
  const data = await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: encode.encode(owner),
  }, key, bytes.subarray(12));
  return new TextDecoder().decode(data);
}
