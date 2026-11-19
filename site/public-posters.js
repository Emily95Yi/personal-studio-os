// Public views load only their whitelisted projection, never the private Studio snapshot.
export const publicPosterSync = { status: 'idle', events: null, revision: -1, local: false, message: '' };
let pending;

export function refreshPublicPosters() {
  if (publicPosterSync.local) return Promise.resolve(false);
  pending ??= (async () => {
    const before = publicPosterSync.status;
    if (publicPosterSync.events === null) publicPosterSync.status = 'loading';
    try {
      const response = await fetch('/api/studio/posters?revision=' + publicPosterSync.revision, {
        cache: 'no-store', credentials: 'same-origin', redirect: 'manual',
        headers: { 'X-Studio-Request': '1' }, signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 404) {
        publicPosterSync.local = true;
        publicPosterSync.status = 'idle';
        return true;
      }
      if (response.status === 204) {
        publicPosterSync.status = 'ready';
        publicPosterSync.message = '';
        return before !== 'ready';
      }
      if (!response.ok) throw new Error(response.status === 401 || response.type === 'opaqueredirect'
        ? '登录已过期，请重新登录后重试。' : '海报暂时加载失败，请重试。');
      const result = await response.json();
      if (!Array.isArray(result.events) || !Number.isSafeInteger(result.revision)) throw new Error('海报数据读取失败，请重试。');
      publicPosterSync.events = result.events;
      publicPosterSync.revision = result.revision;
      publicPosterSync.status = 'ready';
      publicPosterSync.message = '';
      return true;
    } catch (error) {
      publicPosterSync.status = 'error';
      publicPosterSync.message = error.name === 'TimeoutError' ? '海报加载超时，请重试。' :
        error.message === 'Failed to fetch' ? '未能连接到海报服务，请重试。' : error.message;
      return true;
    } finally { pending = undefined; }
  })();
  return pending;
}
