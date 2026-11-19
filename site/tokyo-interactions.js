import { escapeHtml as esc } from './html.js';
import { publicRepository } from './repository.js';
import { mountLiquid } from './tokyo-liquid.js';
import { tokyoEventInfo } from './tokyo-view.js';
import { exhibitionEvents } from './tokyo-demo.js';
import { galleryLayout, galleryMotion, stackDepth } from './tokyo-gallery.js';

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
  const featured = root.querySelector('.tk-featured-art');
  const gallery = root.querySelector('[data-tk-gallery]');
  const galleryToggle = root.querySelector('[data-tk-gallery-toggle]');
  const galleryItems = [...root.querySelectorAll('.tk-gallery-item')];
  const mobileGallery = window.matchMedia('(max-width: 639px)');
  const slots = [...root.querySelectorAll('[data-tk-slot]')];
  const stack = root.querySelector('[data-tk-stack]');
  let columns = [];
  let galleryAnimations = [], galleryVisible = false, galleryPaused = false, galleryFocused = false;
  let galleryLayoutFrame = 0, galleryAnimationFrame = 0, gallerySize = '';
  let trigger, sourceImage, flight, closing = false, disposed = false, scrollFrame = 0, motionVersion = 0;
  let savedOverflow, savedPadding, savedPosition, savedTop, savedWidth, lockedY, locked = false;
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
  root.querySelectorAll('.tk-tool-media img').forEach(image => {
    const failed = () => {
      image.hidden = true;
      image.parentElement.querySelector('.tk-tool-placeholder').hidden = false;
    };
    image.addEventListener('error', failed, { signal });
    if (image.complete && !image.naturalWidth) failed();
  });

  function arrangeGallery() {
    if (!gallery) return;
    const active = gallery.contains(document.activeElement) ? document.activeElement : null;
    const count = mobileGallery.matches ? 2 : 3;
    columns = Array.from({ length: count }, () => {
      const column = document.createElement('div');
      column.className = 'tk-gallery-column';
      column.setAttribute('role', 'presentation');
      const track = document.createElement('div');
      track.className = 'tk-gallery-track';
      track.setAttribute('role', 'presentation');
      column.append(track);
      return column;
    });
    // Date-descending, row by row. Reparent the same buttons at the breakpoint:
    // no copies, new image requests, Event records or separate mobile gallery.
    galleryItems.forEach((item, index) => columns[index % count].firstElementChild.append(item));
    gallery.replaceChildren(...columns);
    active?.focus({ preventScroll: true });
    gallerySize = '';
    scheduleGalleryLayout();
  }

  function syncGalleryPlayback() {
    if (disposed) return;
    const playing = galleryVisible && !galleryPaused && !galleryFocused && !locked &&
      !reduced.matches && document.visibilityState === 'visible';
    galleryAnimations.forEach(animation => playing ? animation.play() : animation.pause());
    if (galleryToggle) {
      galleryToggle.hidden = reduced.matches || !galleryAnimations.length;
      galleryToggle.setAttribute('aria-pressed', String(galleryPaused));
      galleryToggle.setAttribute('aria-label', galleryPaused ? '播放海报自动移动' : '暂停海报自动移动');
    }
  }
  function scheduleGalleryLayout() {
    if (!gallery || galleryLayoutFrame || disposed) return;
    galleryLayoutFrame = requestAnimationFrame(() => {
      galleryLayoutFrame = 0;
      if (reduced.matches) {
        galleryAnimations.forEach(animation => animation.cancel());
        galleryAnimations = [];
        gallerySize = '';
        syncGalleryPlayback();
        return;
      }
      const style = getComputedStyle(gallery);
      const gap = parseFloat(style.columnGap) || 0;
      const rowGap = parseFloat(getComputedStyle(columns[0].firstElementChild).rowGap) || 0;
      const layout = galleryLayout(gallery.parentElement.clientWidth, window.innerHeight, mobileGallery.matches, gap, rowGap);
      const signature = [layout.width.toFixed(2), layout.height.toFixed(2), rowGap, columns.length].join(':');
      if (signature === gallerySize) return;
      gallerySize = signature;
      gallery.style.setProperty('--tk-gallery-width', layout.width + 'px');
      gallery.style.setProperty('--tk-gallery-height', layout.height + 'px');
      cancelAnimationFrame(galleryAnimationFrame);
      // Animate only after the resized geometry settles; no layout reads in an
      // animation loop. WAAPI runs the actual motion on compositor transforms.
      galleryAnimationFrame = requestAnimationFrame(() => {
        galleryAnimationFrame = 0;
        const phases = galleryAnimations.map(animation => Number(animation.currentTime ?? 0) /
          Number(animation.effect.getTiming().duration));
        galleryAnimations.forEach(animation => animation.cancel());
        galleryAnimations = [];
        const travel = columns.map(column => Math.max(0, column.firstElementChild.scrollHeight - column.clientHeight));
        columns.forEach((column, index) => {
          if (travel[index] < 1) return;
          const spec = galleryMotion(travel[index], layout.stride, index);
          const animation = column.firstElementChild.animate([
            { transform: 'translate3d(0,0,0)' },
            { transform: 'translate3d(0,-' + spec.travel + 'px,0)' },
          ], { duration: spec.duration, iterations: Infinity, direction: spec.direction, easing: 'linear', fill: 'both' });
          animation.pause();
          animation.currentTime = (phases[index] ?? 0) * spec.duration;
          galleryAnimations.push(animation);
        });
        syncGalleryPlayback();
      });
    });
  }
  const galleryObserver = new IntersectionObserver(entries => {
    galleryVisible = entries[0].isIntersecting;
    syncGalleryPlayback();
  }, { rootMargin: '40px 0px' });
  if (gallery) {
    galleryObserver.observe(gallery);
    gallery.addEventListener('focusin', event => {
      galleryFocused = event.target.matches(':focus-visible');
      syncGalleryPlayback();
      if (galleryFocused && !reduced.matches) {
        const column = event.target.closest('.tk-gallery-column');
        const item = event.target.closest('.tk-gallery-item');
        const track = column?.firstElementChild;
        const animation = galleryAnimations.find(row => row.effect.target === track);
        if (animation && item) {
          const rect = item.getBoundingClientRect(), frame = column.getBoundingClientRect();
          if (rect.top < frame.top || rect.bottom > frame.bottom) {
            const travel = track.scrollHeight - column.clientHeight;
            const progress = Math.max(0, Math.min(1, item.offsetTop / travel));
            const timing = animation.effect.getTiming();
            animation.currentTime = Number(timing.duration) * (timing.direction === 'alternate-reverse' ? 1 - progress : progress);
          }
        }
      }
    }, { signal });
    gallery.addEventListener('focusout', () => {
      queueMicrotask(() => {
        if (disposed) return;
        galleryFocused = gallery.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
        syncGalleryPlayback();
      });
    }, { signal });
    galleryToggle?.addEventListener('click', () => { galleryPaused = !galleryPaused; syncGalleryPlayback(); }, { signal });
  }
  document.addEventListener('visibilitychange', syncGalleryPlayback, { signal });

  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }), { threshold: .01, rootMargin: '0px 0px -6% 0px' });
  root.querySelectorAll('.tk-reveal').forEach(node => observer.observe(node));
  root.classList.add('tk-motion-ready');

  function updateScroll() {
    scrollFrame = 0;
    // Read all geometry before writing transforms. At most one RAF per frame;
    // neither animation creates its own scroll container or prevents scrolling.
    const viewport = window.innerHeight;
    const heroBottom = hero?.getBoundingClientRect().bottom ?? 0;
    const heroHeight = hero?.offsetHeight;
    const featuredTop = featured?.getBoundingClientRect().top;
    const slotRects = slots.map(slot => slot.getBoundingClientRect());
    const stickyTops = slots.map(slot => parseFloat(getComputedStyle(slot).top) || 0);
    if (hero) hero.style.setProperty('--tk-exit', Math.max(0, Math.min(1, 1 - heroBottom / heroHeight)));
    root.classList.toggle('tk-past-hero', heroBottom < 70);
    nav.classList.toggle('is-compact', window.scrollY > 60);
    if (featured) featured.style.setProperty('--tk-retreat', reduced.matches ? 0 : Math.max(0, Math.min(1, -featuredTop / viewport)));
    slots.forEach((slot, index) => {
      const next = slotRects[index + 1];
      const height = slotRects[index].height;
      const depth = stackDepth(next && !reduced.matches ? stickyTops[index] + height - next.top : 0, height);
      slot.style.setProperty('--tk-card-scale', depth.scale);
      slot.style.setProperty('--tk-card-y', depth.y + 'px');
      slot.style.setProperty('--tk-card-shadow', depth.shadow);
    });
  }
  function scheduleScroll() {
    if (!scrollFrame && !disposed) scrollFrame = requestAnimationFrame(updateScroll);
  }
  window.addEventListener('scroll', scheduleScroll, { passive: true, signal });
  window.addEventListener('resize', scheduleScroll, { passive: true, signal });
  reduced.addEventListener('change', () => { scheduleGalleryLayout(); scheduleScroll(); }, { signal });
  mobileGallery.addEventListener('change', arrangeGallery, { signal });
  function updateStackFit() {
    if (!stack) return;
    const viewport = window.innerHeight;
    const base = parseFloat(getComputedStyle(slots[0]).top) || 70;
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const tooTall = slots.some(slot => {
      const card = slot.firstElementChild;
      if (mobile) return card.offsetHeight + base + 36 + 20 > viewport;
      const copy = card.querySelector('.tk-tool-copy');
      const style = getComputedStyle(copy);
      const content = [...copy.children].reduce((sum, child) => sum + child.offsetHeight, 0) +
        parseFloat(style.rowGap) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      return content > Math.max(440, Math.min(570, viewport - 180));
    });
    stack.classList.toggle('is-static', tooTall);
  }
  const resizeObserver = new ResizeObserver(() => { if (!disposed) { updateStackFit(); scheduleGalleryLayout(); scheduleScroll(); } });
  if (gallery) resizeObserver.observe(gallery);
  slots.forEach(slot => resizeObserver.observe(slot));
  window.addEventListener('resize', () => { updateStackFit(); scheduleGalleryLayout(); }, { passive: true, signal });
  arrangeGallery();
  scheduleScroll();

  function lockScroll() {
    if (locked) return;
    locked = true;
    savedOverflow = document.body.style.overflow;
    savedPadding = document.body.style.paddingRight;
    savedPosition = document.body.style.position;
    savedTop = document.body.style.top;
    savedWidth = document.body.style.width;
    lockedY = window.scrollY;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    if (gutter) document.body.style.paddingRight = gutter + 'px';
    document.body.style.overflow = 'hidden';
    // Fixed-body locking also prevents Safari's background rubber-banding.
    document.body.style.position = 'fixed';
    document.body.style.top = -lockedY + 'px';
    document.body.style.width = '100%';
    syncGalleryPlayback();
  }
  function unlockScroll() {
    if (!locked) return;
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPadding;
    document.body.style.position = savedPosition;
    document.body.style.top = savedTop;
    document.body.style.width = savedWidth;
    window.scrollTo({ top: lockedY, behavior: 'instant' });
    locked = false;
    syncGalleryPlayback();
  }
  function posterRect(image) {
    const rect = image.getBoundingClientRect();
    if (getComputedStyle(image).objectFit === 'cover') return rect;
    const naturalWidth = image.naturalWidth || sourceImage?.naturalWidth;
    const naturalHeight = image.naturalHeight || sourceImage?.naturalHeight;
    if (!naturalWidth || !naturalHeight) return rect;
    const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    const width = naturalWidth * scale, height = naturalHeight * scale;
    return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height };
  }
  async function sharedFlight(from, to, returning = false) {
    if (!sourceImage || sourceImage.hidden || !from.width || !to.width || reduced.matches) return;
    const image = sourceImage.cloneNode();
    image.removeAttribute('loading');
    image.removeAttribute('hidden');
    image.className = 'tk-flying-poster';
    image.style.visibility = 'visible';
    image.setAttribute('aria-hidden', 'true');
    const cropped = getComputedStyle(sourceImage).objectFit === 'cover';
    function fullFrame(rect, crop) {
      if (!crop || !sourceImage.naturalWidth) return rect;
      const scale = Math.max(rect.width / sourceImage.naturalWidth, rect.height / sourceImage.naturalHeight);
      const width = sourceImage.naturalWidth * scale, height = sourceImage.naturalHeight * scale;
      return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height };
    }
    const start = fullFrame(from, cropped && !returning), end = fullFrame(to, cropped && returning);
    function clip(rect, full) {
      const x = Math.max(0, (rect.left - full.left) / full.width * 100);
      const y = Math.max(0, (rect.top - full.top) / full.height * 100);
      return 'inset(' + y + '% ' + x + '% ' + y + '% ' + x + '%)';
    }
    Object.assign(image.style, { left: end.left + 'px', top: end.top + 'px', width: end.width + 'px', height: end.height + 'px' });
    dialog.append(image);
    flight = image;
    const transform = 'translate3d(' + (start.left - end.left) + 'px,' + (start.top - end.top) + 'px,0) scale(' + start.width / end.width + ')';
    const animation = image.animate([
      { transform, clipPath: clip(from, start) },
      { transform: 'translate3d(0,0,0) scale(1)', clipPath: clip(to, end) },
    ], { duration: returning ? 480 : 680, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
    flights.add(animation);
    await animation.finished.catch(() => {});
    flights.delete(animation);
    image.remove();
    if (flight === image) flight = undefined;
  }
  async function openPoster(button) {
    if (dialog.open || closing) return;
    const event = exhibitionEvents(publicRepository.activities(), { showDemo: false }).find(row => row.id === button.dataset.tkPoster);
    if (!event) return;
    trigger = button;
    sourceImage = button.querySelector('img');
    const sourceRect = sourceImage && posterRect(sourceImage);
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
      await sharedFlight(sourceRect, posterRect(target));
      if (!disposed && version === motionVersion) target.style.visibility = '';
    }
  }
  async function closePoster() {
    if (!dialog.open || closing) return;
    closing = true;
    ++motionVersion;
    flights.forEach(animation => animation.cancel());
    const target = art.querySelector('img');
    const from = target && posterRect(target);
    if (target) target.style.visibility = 'hidden';
    root.classList.remove('tk-is-focused');
    dialog.classList.add('is-closing');
    if (sourceImage && from) await sharedFlight(from, posterRect(sourceImage), true);
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
  let wheelDistance = 0, wheelAt = 0;
  art.addEventListener('wheel', event => {
    if (event.ctrlKey || !dialog.open || closing || event.deltaY <= 0) { wheelDistance = 0; return; }
    event.preventDefault();
    const now = performance.now();
    if (now - wheelAt > 400) wheelDistance = 0;
    wheelAt = now;
    wheelDistance += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
    if (wheelDistance > 80) { wheelDistance = 0; void closePoster(); }
  }, { passive: false, signal });

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
    disposed = true; controller.abort(); observer.disconnect(); galleryObserver.disconnect(); resizeObserver.disconnect(); unmountLiquid();
    cancelAnimationFrame(galleryLayoutFrame); cancelAnimationFrame(galleryAnimationFrame);
    galleryAnimations.forEach(animation => animation.cancel());
    cancelAnimationFrame(scrollFrame); flights.forEach(animation => animation.cancel()); flight?.remove();
    if (dialog.open) dialog.close();
    if (contact.open) contact.close();
    if (sourceImage) sourceImage.style.visibility = '';
    scene.inert = false;
    unlockScroll();
  };
}
