import { escapeHtml as esc } from './html.js';
import { publicRepository } from './repository.js';
import { mountLiquid } from './tokyo-liquid.js';
import { tokyoEventInfo } from './tokyo-view.js';

export function mountTokyo(app) {
  const root = app.querySelector('[data-tk-root]');
  if (!root) return () => {};
  const controller = new AbortController();
  const { signal } = controller;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = root.querySelector('[data-tk-liquid]');
  const unmountLiquid = canvas ? mountLiquid(canvas) : () => {};
  const hero = root.querySelector('.tk-hero');
  const nav = root.querySelector('[data-tk-nav]');
  const scene = root.querySelector('.tk-scene');
  const dialog = root.querySelector('[data-tk-focus]');
  const art = root.querySelector('[data-tk-focus-art]');
  const info = root.querySelector('[data-tk-focus-info]');
  const contact = root.querySelector('[data-tk-contact-dialog]');
  let trigger, sourceImage, flight, closing = false, disposed = false, scrollFrame = 0, motionVersion = 0;
  let savedOverflow, savedPadding, locked = false;
  const flights = new Set();
  const images = root.querySelectorAll('.tk-poster img');
  function imageFailed(image) {
    image.hidden = true;
    image.parentElement.classList.add('tk-image-failed');
    image.parentElement.setAttribute('data-image-error', '海报暂时无法显示');
  }
  images.forEach(image => {
    image.addEventListener('error', () => imageFailed(image), { signal });
    if (image.complete && !image.naturalWidth) imageFailed(image);
  });

  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }), { threshold: .08 });
  root.querySelectorAll('.tk-reveal').forEach(node => observer.observe(node));
  root.classList.add('tk-motion-ready');

  function updateScroll() {
    scrollFrame = 0;
    const heroBottom = hero?.getBoundingClientRect().bottom ?? 0;
    if (hero) hero.style.setProperty('--tk-exit', Math.max(0, Math.min(1, 1 - heroBottom / hero.offsetHeight)));
    root.classList.toggle('tk-past-hero', heroBottom < 70);
    nav.classList.toggle('is-compact', window.scrollY > 60);
    const featured = root.querySelector('.tk-featured-art');
    if (featured && !reduced.matches) {
      const progress = Math.max(0, Math.min(1, -featured.getBoundingClientRect().top / window.innerHeight));
      featured.style.setProperty('--tk-retreat', progress);
    }
  }
  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }, { passive: true, signal });
  updateScroll();

  function lockScroll() {
    if (locked) return;
    locked = true;
    savedOverflow = document.body.style.overflow;
    savedPadding = document.body.style.paddingRight;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    if (gutter) document.body.style.paddingRight = gutter + 'px';
    document.body.style.overflow = 'hidden';
  }
  function unlockScroll() {
    if (!locked) return;
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPadding;
    locked = false;
  }
  async function sharedFlight(from, to, returning = false) {
    if (!sourceImage || sourceImage.hidden || !from.width || !to.width || reduced.matches) return;
    const image = sourceImage.cloneNode();
    image.removeAttribute('loading');
    image.removeAttribute('hidden');
    image.className = 'tk-flying-poster';
    image.style.visibility = 'visible';
    image.setAttribute('aria-hidden', 'true');
    Object.assign(image.style, { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px' });
    dialog.append(image);
    flight = image;
    const transform = 'translate(' + (from.left - to.left) + 'px,' + (from.top - to.top) + 'px) scale(' +
      from.width / to.width + ',' + from.height / to.height + ')';
    const animation = image.animate([
      { transform: transform + ' perspective(1200px) rotateY(' + (returning ? '2' : '-3') + 'deg)' },
      { transform: 'translate(0,0) scale(1) perspective(1200px) rotateY(0deg)' },
    ], { duration: returning ? 480 : 680, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
    flights.add(animation);
    await animation.finished.catch(() => {});
    flights.delete(animation);
    image.remove();
    if (flight === image) flight = undefined;
  }
  async function openPoster(button) {
    if (dialog.open || closing) return;
    const event = publicRepository.activities().find(row => row.id === button.dataset.tkPoster);
    if (!event) return;
    trigger = button;
    sourceImage = button.querySelector('img');
    const sourceRect = sourceImage?.getBoundingClientRect();
    art.innerHTML = event.poster && !sourceImage?.hidden ? '<img src="' + esc(event.poster) + '" alt="' + esc(event.title) +
      ' 活动海报" referrerpolicy="no-referrer">' : '<div class="tk-focus-pending">海报待补</div>';
    art.querySelector('img')?.addEventListener('error', event => {
      event.target.hidden = true;
      art.classList.add('tk-focus-image-failed');
    }, { signal });
    art.classList.remove('tk-focus-image-failed');
    art.style.transform = '';
    info.innerHTML = tokyoEventInfo(event, { focus: true });
    info.scrollTop = 0;
    lockScroll();
    dialog.showModal();
    dialog.classList.remove('is-closing');
    root.classList.add('tk-is-focused');
    scene.inert = true;
    const target = art.querySelector('img');
    if (target && sourceRect && !reduced.matches) {
      const version = ++motionVersion;
      target.style.visibility = 'hidden';
      sourceImage.style.visibility = 'hidden';
      await sharedFlight(sourceRect, target.getBoundingClientRect());
      if (!disposed && version === motionVersion) target.style.visibility = '';
    }
  }
  async function closePoster() {
    if (!dialog.open || closing) return;
    closing = true;
    ++motionVersion;
    flights.forEach(animation => animation.cancel());
    const target = art.querySelector('img');
    const from = target?.getBoundingClientRect();
    if (target) target.style.visibility = 'hidden';
    root.classList.remove('tk-is-focused');
    dialog.classList.add('is-closing');
    if (sourceImage && from) await sharedFlight(from, sourceImage.getBoundingClientRect(), true);
    if (disposed) return;
    dialog.close();
    if (sourceImage) sourceImage.style.visibility = '';
    scene.inert = false;
    unlockScroll();
    trigger?.focus({ preventScroll: true });
    closing = false;
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); void closePoster(); }, { signal });
  dialog.addEventListener('click', event => { if (event.target === dialog) void closePoster(); }, { signal });
  dialog.querySelector('.tk-focus-layout').addEventListener('click', event => {
    if (event.target.classList.contains('tk-focus-layout')) void closePoster();
  }, { signal });

  // Only a vertical gesture that starts on the poster can dismiss. Detail text
  // retains its own native scrolling and the underlying page keeps its position.
  let touch;
  art.addEventListener('touchstart', event => {
    if (event.touches.length === 1 && !closing) touch = { x: event.touches[0].clientX, y: event.touches[0].clientY, dy: 0 };
  }, { passive: true, signal });
  art.addEventListener('touchmove', event => {
    if (!touch || event.touches.length !== 1) return;
    const dy = event.touches[0].clientY - touch.y, dx = event.touches[0].clientX - touch.x;
    if (dy > 12 && dy > Math.abs(dx) * 1.25) {
      event.preventDefault();
      touch.dy = dy;
      art.style.transform = 'translateY(' + Math.min(dy * .5, 100) + 'px) scale(' + (1 - Math.min(dy / 3000, .05)) + ')';
    }
  }, { passive: false, signal });
  const finishTouch = () => {
    const dismiss = touch?.dy > 80;
    touch = undefined;
    if (dismiss) void closePoster();
    else art.style.transform = '';
  };
  art.addEventListener('touchend', finishTouch, { passive: true, signal });
  art.addEventListener('touchcancel', () => { touch = undefined; art.style.transform = ''; }, { passive: true, signal });

  function goTo(element) { element?.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' }); }
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-tk-poster]');
    if (button) void openPoster(button);
    if (event.target.closest('[data-tk-close]')) void closePoster();
    if (event.target.closest('[data-tk-scroll]')) { event.preventDefault(); goTo(root.querySelector('#tk-events')); }
    if (event.target.closest('[data-tk-top]')) window.scrollTo({ top: 0, behavior: reduced.matches ? 'instant' : 'smooth' });
    if (event.target.closest('[data-tk-contact]') && !contact.open) { lockScroll(); contact.showModal(); }
    if (event.target.closest('[data-tk-contact-close]')) contact.close();
  }, { signal });
  contact.addEventListener('click', event => { if (event.target === contact) contact.close(); }, { signal });
  contact.addEventListener('close', unlockScroll, { signal });
  window.addEventListener('resize', () => {
    if (dialog.open && !closing) { flights.forEach(animation => animation.finish()); art.style.transform = ''; }
  }, { passive: true, signal });
  return () => {
    disposed = true; controller.abort(); observer.disconnect(); unmountLiquid();
    cancelAnimationFrame(scrollFrame); flights.forEach(animation => animation.cancel()); flight?.remove();
    if (dialog.open) dialog.close();
    if (contact.open) contact.close();
    if (sourceImage) sourceImage.style.visibility = '';
    scene.inert = false;
    unlockScroll();
  };
}
