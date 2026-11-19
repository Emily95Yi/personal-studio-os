import { escapeHtml as esc } from './html.js';
import { publicHref } from './pages.js';
import { publicRepository } from './repository.js';
import { exhibitionEvents } from './tokyo-demo.js';
import { publicPosterSync } from './public-posters.js';
import { archivePosters } from './tokyo-gallery.js';
import { tokyoExperienceView } from './tokyo-experiences.js';

// Editable brand copy. Contact stays an explicit placeholder until a real URL exists.
export const tokyoCopy = {
  title: '一期一会inTokyo', chinese: '一期一会', english: 'inTokyo',
  subtitle: '相遇・链接・流动・回声・探索・多元', contactUrl: '',
};

const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const mark = '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 2v36M2 20h36M7.3 7.3l25.4 25.4M7.3 32.7 32.7 7.3"/><circle cx="20" cy="20" r="12"/></svg>';
const xiaohongshu = '<svg class="tk-xiaohongshu" viewBox="0 0 56 28" aria-hidden="true"><rect x="1" y="1" width="54" height="26" rx="8"/><text x="28" y="18.5" text-anchor="middle">小红书</text></svg>';

export function tokyoNavigation(pageId = 'home') {
  return '<a class="tk-brand-logo" href="' + publicHref('yiqiyihui') + '" aria-label="一期一会 inTokyo 首页">' +
    '<img src="./tokyo-orbit-logo.svg" width="48" height="48" alt="" aria-hidden="true"></a>' +
    '<nav class="tk-nav" aria-label="一期一会导航" data-tk-nav>' +
    '<a aria-label="活动" href="' + publicHref('yiqiyihui', 'activities') + '"' + (pageId === 'home' ? ' data-tk-scroll="events"' : '') +
    '><span class="tk-nav-mask"><span data-label="活动">活动</span></span></a>' +
    '<a aria-label="手记" href="' + publicHref('yiqiyihui', 'stories') + '"><span class="tk-nav-mask"><span data-label="手记">手记</span></span></a>' +
    '<a aria-label="互动" href="' + publicHref('yiqiyihui', 'interactions') + '"><span class="tk-nav-mask"><span data-label="互动">互动</span></span></a>' +
    '</nav>';
}

function hero() {
  return '<section class="tk-hero" aria-labelledby="tk-title"><canvas class="tk-liquid" data-tk-liquid aria-hidden="true"></canvas>' +
    '<div class="tk-hero-grain" aria-hidden="true"></div>' +
    '<div class="tk-title-wrap"><h1 id="tk-title" aria-label="' + esc(tokyoCopy.title) + '">' +
    '<span class="tk-title-cn" aria-hidden="true">' + [...tokyoCopy.chinese].map(char =>
      '<span>' + esc(char) + '</span>').join('') + '</span>' +
    '<span class="tk-title-en" aria-hidden="true">' + esc(tokyoCopy.english) + '</span></h1>' +
    '<p class="tk-subtitle">' + esc(tokyoCopy.subtitle) + '</p></div>' +
    '<div class="tk-hero-bottom">' +
    '<a class="tk-scroll" href="' + publicHref('yiqiyihui', 'activities') + '" data-tk-scroll="events"><span>SCROLL TO EXPLORE</span>' + arrow +
    '</a><span class="tk-hero-index" aria-hidden="true">01 — ∞</span></div></section>';
}

export function tokyoEventInfo(event, { focus = false } = {}) {
  // Poster-only Events never expose private Workshop descriptions. The existing
  // projection already includes the public title/date; use only those fields.
  if (event.posterOnly) return '<div class="tk-poster-info"><h2 class="tk-poster-title"' +
    (focus ? ' id="tk-focus-title"' : '') + '>' + esc(event.title) + '</h2>' +
    (event.date ? '<p class="tk-event-meta"><time datetime="' + esc(event.date) + '">' + esc(event.date) + '</time></p>' : '') +
    (event.description ? '<p class="tk-event-description">' + esc(event.description) + '</p>' : '') + '</div>';
  return '<div class="tk-event-info' + (focus ? ' tk-focus-info' : ' tk-reveal') + '">' +
    '<p class="tk-eyebrow tk-event-state' + (event.recruiting ? ' is-open' : '') + '"><span></span>' +
    (event.demo ? 'DEMO / 演示海报' : event.recruiting ? '正在募集中 · JOIN US' : event.cancelled ? '活动已取消' : '一期一会 · ENCOUNTER') + '</p>' +
    '<h2' + (focus ? ' id="tk-focus-title"' : '') + '>' + esc(event.title) + '</h2>' +
    ([event.date, event.time, event.location].some(Boolean) ? '<p class="tk-event-meta">' +
      [event.date, event.time, event.location].filter(Boolean).map(value => '<span>' + esc(value) + '</span>').join('') + '</p>' : '') +
    (event.description ? '<p class="tk-event-description">' + esc(event.description) + '</p>' : '') +
    (event.registrationUrl ? '<a class="tk-text-link" href="' + esc(event.registrationUrl) +
      '" target="_blank" rel="noopener noreferrer">查看活动 / 报名' + arrow + '</a>' : '') + '</div>';
}

function poster(event, featured = false) {
  return '<button type="button" class="tk-poster' + (featured ? ' tk-featured-poster' : '') + '" data-tk-poster="' +
    esc(event.id) + '" aria-label="查看活动：' + esc(event.title) + '" aria-haspopup="dialog">' +
    (event.poster ? '<img src="' + esc(event.poster) + '" alt="' + esc(event.title) + (event.demo ? ' 演示海报' : ' 活动海报') + '" ' +
      (event.width && event.height ? 'width="' + event.width + '" height="' + event.height + '" ' : '') +
      (featured ? 'fetchpriority="high"' : 'loading="lazy"') + ' decoding="async" referrerpolicy="no-referrer">' :
      '<span class="tk-poster-pending"><span>海报待补</span><strong>' + esc(event.title) + '</strong></span>') +
    '<span class="tk-poster-open" aria-hidden="true">' + arrow + '</span></button>';
}

function exhibition(events, { home = false } = {}) {
  const open = events.filter(event => event.recruiting);
  const [featured] = open;
  const past = home ? archivePosters(events) : events.filter(event => !event.recruiting);
  const gallery = (rows, label) => '<div class="tk-mosaic" aria-label="' + label + '海报">' + rows.map(event =>
    '<div class="tk-mosaic-item tk-reveal">' + poster(event) + '</div>').join('') + '</div>';
  const notice = publicPosterSync.status === 'loading' ? '<p role="status">正在加载活动海报…</p>' :
    publicPosterSync.status === 'error' ? '<p role="alert">' + esc(publicPosterSync.message) +
      '</p><button type="button" class="tk-text-link" data-public-posters-retry>重新加载海报</button>' : '';
  const archiveGallery = home ? '<div class="tk-gallery" data-tk-gallery role="list" aria-label="已结束的公开活动，按日期从新到旧">' +
    past.map((event, index) => '<div class="tk-gallery-item" role="listitem" aria-posinset="' + (index + 1) +
      '" aria-setsize="' + past.length + '">' + poster(event) + '</div>').join('') + '</div>' : gallery(past, '往期活动');
  return '<section class="tk-exhibition" id="tk-events" aria-label="活动海报">' +
    '<section class="tk-recruitment" aria-label="募集中活动">' +
    (featured ? (notice ? '<div class="tk-poster-notice">' + notice + '</div>' : '') +
      '<div class="tk-section-caption tk-reveal"><span>募集中</span><span></span></div>' +
      '<div class="tk-featured' + (featured.posterOnly ? ' tk-poster-only' : '') + '"><div class="tk-featured-art tk-reveal">' +
      poster(featured, true) + '</div>' + (featured.posterOnly ? '' : tokyoEventInfo(featured)) + '</div>' +
      (open.length > 1 ? gallery(open.slice(1), '募集中活动') : '') :
      '<div class="tk-empty-recruitment">' + (notice || '<p>暂无募集中活动，敬请期待后续活动</p>') + '</div>') + '</section>' +
    (past.length ? '<section class="tk-archive" aria-labelledby="tk-archive-title"><div class="tk-gallery-heading tk-reveal">' +
      '<h2 id="tk-archive-title">' + (home ? '往期回顾' : '往期活动') + '</h2>' +
      (past.some(event => event.demo) ? '<span class="tk-gallery-count">DEMO GALLERY / 演示海报</span>' : '') +
      '</div>' + archiveGallery + '</section>' :
      (!notice ? '<div class="tk-empty-archive"><p>' + (!events.length ? '暂无公开海报' : '往期回顾，等待下一次相遇') + '</p></div>' : '')) + '</section>';
}

function footer() {
  return '<footer class="tk-footer"><a href="' + publicHref('yiqiyihui') + '" aria-label="一期一会首页"><strong>一期一会<span>inTokyo</span></strong></a>' +
    '<span>此时，此地。<br>一期一会。</span>' + (tokyoCopy.contactUrl ? '<a class="tk-keep-contact" href="' + esc(tokyoCopy.contactUrl) +
    '" target="_blank" rel="noopener noreferrer" aria-label="小红书活动账号">' + xiaohongshu + '</a>' :
    '<button class="tk-keep-contact" type="button" data-tk-contact aria-label="小红书活动账号">' + xiaohongshu + '</button>') +
    '<div class="tk-footer-bottom"><button type="button" data-tk-top>BACK TO TOP ↑</button></div></footer>';
}

function dialogs() {
  return '<dialog class="tk-focus" aria-labelledby="tk-focus-title" data-tk-focus><button class="tk-focus-close" type="button" data-tk-close aria-label="关闭活动详情">' +
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>' +
    '<div class="tk-focus-layout"><div class="tk-focus-art" data-tk-focus-art></div><div data-tk-focus-info></div></div>' +
    '<span class="tk-focus-hint">向下轻扫海报 / ESC 关闭</span></dialog>' +
    '<dialog class="tk-contact" aria-labelledby="tk-contact-title" data-tk-contact-dialog><button type="button" data-tk-contact-close aria-label="关闭联系信息">×</button>' +
    xiaohongshu + '<h2 id="tk-contact-title">在小红书，再相遇。</h2><p>活动账号链接将在这里补充。</p></dialog>';
}

export function tokyoView({ pageId = 'home', page, showDemo = false } = {}) {
  const events = exhibitionEvents(publicRepository.activities(), { showDemo });
  const exhibitionPage = ['home', 'activities'].includes(pageId);
  return '<div class="tk-shell' + (pageId !== 'home' ? ' tk-inner-page' : '') + '" data-tk-root>' +
    tokyoNavigation(pageId) + '<div class="tk-scene">' +
    (pageId === 'home' ? hero() : '') +
    (exhibitionPage ? exhibition(events, { home: pageId === 'home' }) : '<section class="tk-about"><p class="tk-eyebrow">' + (pageId === 'stories' ? 'JOURNAL' : pageId === 'interactions' ? 'PLAY & EXPLORE' : '') + '</p><h1>' +
      (pageId === 'about' ? '一期一会。<br>每一次，只有一次。' : esc(page?.label ?? '一期一会')) + '</h1><p>' +
      esc(pageId === 'about' ? '东京线下活动与公开内容。' : page?.description ?? page?.empty ?? '') + '</p>' +
      '<span class="tk-empty-note">' + esc(pageId === 'about' ? '品牌介绍待发布。' : page?.empty ?? '') + '</span><a class="tk-text-link" href="' +
      publicHref('yiqiyihui') + '">回到首页' + arrow + '</a></section>') +
    (pageId === 'home' ? tokyoExperienceView() : '') + footer() + '</div>' + dialogs() + '</div>';
}
