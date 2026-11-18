import { escapeHtml as esc } from './html.js';
import { href, publicHref } from './pages.js';
import { publicRepository } from './repository.js';

// Editable brand copy. Contact stays an explicit placeholder until a real URL exists.
export const tokyoCopy = {
  title: '一期一会inTokyo', chinese: '一期一会', english: 'inTokyo',
  subtitle: '[副标题占位｜Subtitle Placeholder]', contactUrl: '',
};

const arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const mark = '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M20 2v36M2 20h36M7.3 7.3l25.4 25.4M7.3 32.7 32.7 7.3"/><circle cx="20" cy="20" r="12"/></svg>';

export function tokyoNavigation(pageId = 'home') {
  return '<a class="tk-studio-link" href="' + href() + '" aria-label="返回奕 Studio">' + mark +
    '<span>奕 Studio <span aria-hidden="true">↗</span></span></a>' +
    '<nav class="tk-nav" aria-label="一期一会导航" data-tk-nav>' +
    '<a aria-label="活动" href="' + publicHref('yiqiyihui', 'activities') + '"' + (pageId === 'home' ? ' data-tk-scroll="events"' : '') +
    '><span class="tk-nav-mask"><span data-label="活动">活动</span></span><span class="tk-nav-dot" aria-hidden="true"></span></a>' +
    '<a aria-label="关于" href="' + publicHref('yiqiyihui', 'about') + '"><span class="tk-nav-mask"><span data-label="关于">关于</span></span></a>' +
    (tokyoCopy.contactUrl ? '<a href="' + esc(tokyoCopy.contactUrl) + '">联系 ↗</a>' :
      '<button aria-label="联系" type="button" data-tk-contact><span class="tk-nav-mask"><span data-label="联系">联系</span></span><span aria-hidden="true">↗</span></button>') +
    '</nav>';
}

function hero() {
  return '<section class="tk-hero" aria-labelledby="tk-title"><canvas class="tk-liquid" data-tk-liquid aria-hidden="true"></canvas>' +
    '<div class="tk-hero-grain" aria-hidden="true"></div><div class="tk-hero-topline"><span>一期一会 · ICHI-GO ICHI-E</span><span>TOKYO, JP <span class="tk-live-dot"></span></span></div>' +
    '<div class="tk-title-wrap"><h1 id="tk-title" aria-label="' + esc(tokyoCopy.title) + '">' +
    '<span class="tk-title-cn" aria-hidden="true">' + [...tokyoCopy.chinese].map(char =>
      '<span>' + esc(char) + '</span>').join('') + '</span>' +
    '<span class="tk-title-en" aria-hidden="true">' + esc(tokyoCopy.english) + '<span class="tk-title-star">' + mark + '</span></span></h1>' +
    '<p class="tk-subtitle">' + esc(tokyoCopy.subtitle) + '</p></div>' +
    '<div class="tk-hero-bottom"><span class="tk-hero-note">此时，此地。<br>每一次相遇，只有一次。</span>' +
    '<a class="tk-scroll" href="' + publicHref('yiqiyihui', 'activities') + '" data-tk-scroll="events"><span>SCROLL TO EXPLORE</span>' + arrow +
    '</a><span class="tk-hero-index" aria-hidden="true">01 — ∞</span></div></section>';
}

export function tokyoEventInfo(event, { focus = false } = {}) {
  return '<div class="tk-event-info' + (focus ? ' tk-focus-info' : ' tk-reveal') + '">' +
    '<p class="tk-eyebrow tk-event-state' + (event.recruiting ? ' is-open' : '') + '"><span></span>' +
    (event.recruiting ? '正在募集中 · JOIN US' : event.cancelled ? '活动已取消' : '一期一会 · ENCOUNTER') + '</p>' +
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
    (event.poster ? '<img src="' + esc(event.poster) + '" alt="' + esc(event.title) + ' 活动海报" ' +
      (featured ? 'fetchpriority="high"' : 'loading="lazy"') + ' decoding="async" referrerpolicy="no-referrer">' :
      '<span class="tk-poster-pending"><span>海报待补</span><strong>' + esc(event.title) + '</strong></span>') +
    '<span class="tk-poster-open" aria-hidden="true">' + arrow + '</span></button>';
}

function exhibition(events) {
  const [featured, ...remaining] = events;
  return '<section class="tk-exhibition" id="tk-events" aria-label="活动海报"><div class="tk-section-caption tk-reveal">' +
    '<span>相遇，在这里发生。</span><span>ENCOUNTERS, IN TOKYO</span></div>' +
    (featured ? '<div class="tk-featured"><div class="tk-featured-art tk-reveal">' + poster(featured, true) +
      '<span class="tk-art-caption">01 / ' + String(events.length).padStart(2, '0') + '</span></div>' + tokyoEventInfo(featured) + '</div>' :
      '<div class="tk-featured tk-empty-featured"><div class="tk-placeholder-art tk-reveal" role="img" aria-label="活动海报占位，暂无已公开活动">' +
      '<span class="tk-placeholder-label">POSTER PLACEHOLDER / 海报占位</span><div class="tk-placeholder-orbit" aria-hidden="true"></div>' +
      '<strong>下一次<br><span>相 遇</span></strong><span class="tk-placeholder-foot">一期一会 inTokyo <span>TO BE CONTINUED ↗</span></span></div>' +
      '<div class="tk-event-info tk-reveal"><p class="tk-eyebrow">THE NEXT ENCOUNTER</p><h2>下一次相遇，<br>正在酝酿。</h2>' +
      '<p class="tk-event-description">还没有已公开的活动。<br>等下一张海报，带来新的相遇。</p><p class="tk-empty-note">活动公开后，将自动出现在这里。</p></div></div>') +
    '<div class="tk-gallery-heading tk-reveal"><h2>相遇的切片<span>THE POSTER ARCHIVE</span></h2><span class="tk-gallery-count">' +
      String(events.length).padStart(2, '0') + ' ENCOUNTERS</span></div>' +
    (remaining.length ? '<div class="tk-mosaic" aria-label="更多公开活动海报">' + remaining.map((event, i) =>
      '<div class="tk-mosaic-item tk-reveal tk-mosaic-' + i % 7 + '">' + poster(event) + '</div>').join('') + '</div>' :
      '<div class="tk-empty-archive tk-reveal"><span class="tk-archive-star" aria-hidden="true">' + mark + '</span><p>' +
      (featured ? '下一张海报，下一段故事。' : '画廊留白，等待相遇。') + '</p><span>' +
      (featured ? '更多公开海报将在这里继续。' : '暂无已公开的活动海报') + '</span></div>') + '</section>';
}

function footer() {
  return '<footer class="tk-footer"><a href="' + publicHref('yiqiyihui') + '" aria-label="一期一会首页"><strong>一期一会<span>inTokyo</span></strong></a>' +
    '<span>此时，此地。<br>一期一会。</span><button type="button" data-tk-contact>保持联系 ↗</button>' +
    '<div class="tk-footer-bottom"><span>© ' + new Date().getFullYear() + ' 一期一会 inTokyo</span><button type="button" data-tk-top>BACK TO TOP ↑</button></div></footer>';
}

function dialogs() {
  return '<dialog class="tk-focus" aria-labelledby="tk-focus-title" data-tk-focus><button class="tk-focus-close" type="button" data-tk-close aria-label="关闭活动详情">' +
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg><span>关闭</span></button>' +
    '<div class="tk-focus-layout"><div class="tk-focus-art" data-tk-focus-art></div><div data-tk-focus-info></div></div>' +
    '<span class="tk-focus-hint">向下轻扫海报 / ESC 关闭</span></dialog>' +
    '<dialog class="tk-contact" aria-labelledby="tk-contact-title" data-tk-contact-dialog><button type="button" data-tk-contact-close aria-label="关闭联系信息">×</button>' +
    '<span class="tk-eyebrow">STAY IN TOUCH</span><h2 id="tk-contact-title">联系，待续。</h2><p>联系入口尚未公开。</p></dialog>';
}

export function tokyoView({ pageId = 'home', page } = {}) {
  const events = publicRepository.activities();
  const exhibitionPage = ['home', 'activities'].includes(pageId);
  return '<div class="tk-shell' + (pageId !== 'home' ? ' tk-inner-page' : '') + '" data-tk-root>' +
    tokyoNavigation(pageId) + '<div class="tk-scene">' +
    (pageId === 'home' ? hero() : '') +
    (exhibitionPage ? exhibition(events) : '<section class="tk-about"><p class="tk-eyebrow">ICHI-GO ICHI-E / TOKYO</p><h1>' +
      (pageId === 'about' ? '一期一会。<br>每一次，只有一次。' : esc(page?.label ?? '一期一会')) + '</h1><p>' +
      esc(pageId === 'about' ? '东京线下活动与公开内容。' : page?.empty ?? '') + '</p>' +
      '<span class="tk-empty-note">' + (pageId === 'about' ? '品牌介绍待发布。' : '') + '</span><a class="tk-text-link" href="' +
      publicHref('yiqiyihui') + '">回到首页' + arrow + '</a></section>') + footer() + '</div>' + dialogs() + '</div>';
}
