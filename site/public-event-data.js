import { safeUrl } from './html.js';

const recruitingStates = new Set(['open', 'recruiting', 'registration_open']);
const unpublishedStates = new Set(['draft', 'private', 'unpublished', 'withdrawn']);
const text = value => typeof value === 'string' ? value.trim() : '';
function explicitlyPublic(event) {
  const publication = event.publication ?? event.workshopPublication;
  return publication?.status === 'published' ||
    (event.visibility === 'public' && !unpublishedStates.has(publication?.status));
}

// Event lifecycle is authoritative. The old, duplicated publication radio is
// no longer required; an explicit hide flag remains an opt-out for a poster.
export function publicPosterState(event) {
  if (event.tokyoPosterHidden === true) return '';
  if (['completed', 'ended', 'finished', '已结束', '已完成', 'cancelled', 'canceled', '已取消'].includes(event.status)) return 'ended';
  if (['recruiting', 'open', 'registration_open', '募集中', '正在募集中'].includes(event.status)) return 'recruiting';
  return '';
}

// A private publication preview is never a publication. No Project, document,
// attendee, facilitator note or other private Workshop field crosses this boundary.
export function isPublicEvent(event, brandId = 'yiqiyihui') {
  if (!event || event.deletedAt || event.archivedAt || unpublishedStates.has(event.status) || event.status === 'archived') return false;
  if (event.brandId && ![brandId, 'tokyo'].includes(event.brandId)) return false;
  if (event.tokyoPosterHidden === true) return false;
  if (publicPosterState(event)) return Boolean(event.coverAssetId || eventPoster(event)) || explicitlyPublic(event);
  if (Object.hasOwn(event, 'tokyoPosterStatus')) return false;
  if (event.visibility && event.visibility !== 'public') return false;
  const publication = event.publication ?? event.workshopPublication;
  if (publication?.status && unpublishedStates.has(publication.status)) return false;
  return event.visibility === 'public' || publication?.status === 'published';
}

export function eventPoster(event, assets = []) {
  const asset = event.coverAssetId && assets.find(row => row.id === event.coverAssetId);
  if (asset && ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'].includes(asset.mime) &&
      typeof asset.data === 'string' && /^[A-Za-z0-9+/\s]+={0,2}$/.test(asset.data)) {
    return 'data:' + asset.mime + ';base64,' + asset.data;
  }
  return safeUrl(event.posterUrl) || safeUrl(event.coverUrl);
}

export function publicEvents(state, { brandId = 'yiqiyihui', now = new Date() } = {}) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return (state.events ?? []).filter(event => isPublicEvent(event, brandId)).map(event => {
    const cancelled = ['cancelled', 'canceled', '已取消'].includes(event.status);
    const closedAt = Date.parse(event.registrationClosesAt ?? '');
    const ended = /^\d{4}-\d{2}-\d{2}$/.test(event.date) && event.date < today;
    const posterState = publicPosterState(event);
    const posterOnly = Boolean(posterState);
    const recruiting = posterOnly ? posterState === 'recruiting' : !cancelled && !ended && !(Number.isFinite(closedAt) && closedAt <= now.getTime()) &&
      recruitingStates.has(event.recruitmentStatus ?? event.status);
    const poster = eventPoster(event, state.assets);
    // An invalid/missing private cover reference must not publish a title.
    // Missing-poster placeholders are only for already explicitly public Events.
    if (posterOnly && !poster && !explicitlyPublic(event)) return null;
    return {
      id: event.id, title: text(event.title) || '未命名活动', date: text(event.date), time: posterOnly ? '' : text(event.time),
      location: posterOnly ? '' : text(event.location), description: posterOnly ? text(event.publicDescription) : text(event.publicDescription ?? event.description ?? event.theme),
      poster, recruiting, cancelled, posterOnly, ended: posterState === 'ended',
      registrationUrl: cancelled || posterOnly ? '' : safeUrl(event.registrationUrl ?? event.signupUrl),
    };
  }).filter(Boolean).sort((a, b) => Number(b.recruiting) - Number(a.recruiting) ||
    (b.date || '').localeCompare(a.date || '') || String(a.id).localeCompare(String(b.id)));
}
