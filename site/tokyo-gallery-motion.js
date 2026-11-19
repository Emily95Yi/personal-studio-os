import { galleryLayout, galleryLoopStep, galleryMotion } from './tokyo-gallery.js';

export function mountPosterGallery(gallery, { signal, reduced, isLocked }) {
  if (!gallery) return { sync() {}, pauseFor() {}, dispose() {} };
  const originals = [...gallery.querySelectorAll('.tk-gallery-item')];
  const mobile = window.matchMedia('(max-width: 639px)');
  let states = [], visible = false, disposed = false, frame = 0, layoutFrame = 0, measureFrame = 0, lastTick = 0, size = '';
  const stateFor = node => node && states.find(state => state.column.contains(node));
  const canPlay = () => visible && !disposed && !reduced.matches && !isLocked() && document.visibilityState === 'visible';

  function sync() {
    const playing = canPlay() && states.some(state => state.max > 1 && !state.manual && !state.focused && !state.pointerDown);
    if (playing && !frame) frame = requestAnimationFrame(tick);
    if (!playing) { cancelAnimationFrame(frame); frame = 0; lastTick = 0; }
  }
  function pause(state) {
    if (!state || disposed || reduced.matches) return;
    state.manual = true;
    state.column.classList.add('is-manual');
    clearTimeout(state.resumeTimer);
    if (!state.pointerDown && !state.focused) state.resumeTimer = setTimeout(() => {
      if (disposed) return;
      state.manual = false;
      state.column.classList.remove('is-manual');
      sync();
    }, state.motion?.idleMs ?? 10_000);
    sync();
  }
  function move(state, delta) {
    const step = galleryLoopStep(state.position, delta, state.max, state.stride);
    const active = document.activeElement;
    let movedFocus = false;
    for (let index = 0; index < Math.abs(step.rotate); index++) {
      const item = step.rotate > 0 ? state.track.firstElementChild : state.track.lastElementChild;
      movedFocus ||= item.contains(active);
      if (step.rotate > 0) state.track.append(item);
      else state.track.prepend(item);
    }
    state.column.scrollTop = step.position;
    state.position = step.position; // Retain subpixel motion instead of accumulating native rounding.
    if (movedFocus) active.focus({ preventScroll: true });
  }
  function tick(now) {
    frame = 0;
    if (!canPlay()) { lastTick = 0; return; }
    const seconds = lastTick ? Math.min((now - lastTick) / 1000, .05) : 0;
    lastTick = now;
    for (const state of states) if (state.max > 1 && !state.manual && !state.focused && !state.pointerDown) {
      move(state, state.motion.scrollSign * state.motion.speed * seconds);
    }
    sync();
  }
  function finishPointer(event) {
    for (const state of states) if (state.pointerId === event.pointerId) {
      state.pointerDown = false;
      state.pointerId = null;
      state.column.classList.remove('is-dragging');
      pause(state);
    }
  }
  function bindColumn(state) {
    const { column } = state;
    column.addEventListener('pointerdown', event => {
      if (event.button !== 0 || reduced.matches) return;
      state.pointerDown = true;
      state.focused = false;
      state.pointerId = event.pointerId;
      state.pointerType = event.pointerType;
      state.startY = state.lastY = event.clientY;
      state.suppressClick = false;
      pause(state);
    }, { passive: true, signal });
    column.addEventListener('pointermove', event => {
      if (!state.pointerDown || state.pointerType !== 'mouse' || event.pointerId !== state.pointerId) return;
      if (!state.suppressClick && Math.abs(event.clientY - state.startY) < 6) return;
      state.suppressClick = true;
      column.setPointerCapture(event.pointerId);
      column.classList.add('is-dragging');
      event.preventDefault();
      move(state, state.lastY - event.clientY);
      state.lastY = event.clientY;
      pause(state);
    }, { passive: false, signal });
    column.addEventListener('wheel', () => { state.focused = false; pause(state); }, { passive: true, signal });
    column.addEventListener('keydown', event => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) pause(state);
    }, { signal });
    column.addEventListener('scroll', () => {
      if (disposed || reduced.matches || state.max < 1) return;
      const delta = column.scrollTop - state.position;
      if (Math.abs(delta) < (state.manual ? .25 : 1)) return; // Ignore native rounding of our own scrolls.
      if (state.manual) pause(state);
      move(state, delta);
    }, { passive: true, signal });
    column.addEventListener('focusin', event => {
      state.focused = event.target.matches(':focus-visible');
      if (state.focused) pause(state);
    }, { signal });
    column.addEventListener('focusout', () => queueMicrotask(() => {
      if (disposed) return;
      state.focused = column.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
      if (!state.focused && state.manual) pause(state);
      sync();
    }), { signal });
    column.addEventListener('click', event => {
      if (state.suppressClick) { event.preventDefault(); event.stopPropagation(); state.suppressClick = false; }
      else { if (event.detail) state.focused = false; pause(state); }
    }, { capture: true, signal });
  }
  function arrange() {
    const active = gallery.contains(document.activeElement) ? document.activeElement : null;
    states.forEach(state => clearTimeout(state.resumeTimer));
    cancelAnimationFrame(frame); frame = 0; lastTick = 0;
    states = Array.from({ length: mobile.matches ? 2 : 3 }, (_, index) => {
      const column = document.createElement('div'), track = document.createElement('div');
      column.className = 'tk-gallery-column';
      column.setAttribute('role', 'group');
      column.setAttribute('aria-label', '第' + (index + 1) + '列活动海报，可上下滑动浏览');
      column.tabIndex = reduced.matches ? -1 : 0;
      track.className = 'tk-gallery-track'; track.setAttribute('role', 'presentation');
      column.append(track);
      const state = { column, track, index, max: 0, stride: 0, position: 0, manual: false, focused: false, pointerDown: false, resumeTimer: 0 };
      bindColumn(state);
      return state;
    });
    originals.forEach((item, index) => states[index % states.length].track.append(item));
    states.forEach(state => {
      if (!state.track.children.length) { state.column.tabIndex = -1; state.column.setAttribute('aria-hidden', 'true'); }
    });
    gallery.replaceChildren(...states.map(state => state.column));
    size = '';
    scheduleLayout();
    active?.focus({ preventScroll: true });
  }
  function scheduleLayout() {
    if (disposed || layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      if (reduced.matches) { sync(); return; }
      const gap = parseFloat(getComputedStyle(gallery).columnGap) || 0;
      const rowGap = parseFloat(getComputedStyle(states[0].track).rowGap) || 0;
      const layout = galleryLayout(gallery.parentElement.clientWidth, window.innerHeight, mobile.matches, gap, rowGap);
      const signature = [layout.width.toFixed(2), layout.height.toFixed(2), rowGap, states.length].join(':');
      if (signature === size) return;
      size = signature;
      gallery.style.setProperty('--tk-gallery-width', layout.width + 'px');
      gallery.style.setProperty('--tk-gallery-height', layout.height + 'px');
      cancelAnimationFrame(measureFrame);
      measureFrame = requestAnimationFrame(() => {
        measureFrame = 0;
        states.forEach(state => {
          const oldStride = state.stride;
          const oldPosition = state.position;
          state.stride = state.track.firstElementChild ? state.track.firstElementChild.getBoundingClientRect().height + rowGap : layout.stride;
          state.max = Math.max(0, state.track.scrollHeight - state.column.clientHeight);
          state.motion = galleryMotion(state.stride, state.index);
          if (!oldStride && state.max > 1) state.track.prepend(state.track.lastElementChild);
          state.column.scrollTop = state.max > 1 ? Math.min(state.max, oldStride ? oldPosition / oldStride * state.stride : state.stride) : 0;
          state.position = state.column.scrollTop;
        });
        lastTick = 0;
        sync();
      });
    });
  }
  const visibilityObserver = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, { rootMargin: '40px 0px' });
  const resizeObserver = new ResizeObserver(scheduleLayout);
  visibilityObserver.observe(gallery);
  resizeObserver.observe(gallery); resizeObserver.observe(gallery.parentElement);
  mobile.addEventListener('change', arrange, { signal });
  reduced.addEventListener('change', arrange, { signal });
  window.addEventListener('resize', scheduleLayout, { passive: true, signal });
  window.addEventListener('pointerup', finishPointer, { signal });
  window.addEventListener('pointercancel', finishPointer, { signal });
  window.addEventListener('blur', () => states.forEach(state => {
    if (state.pointerDown) { state.pointerDown = false; state.pointerId = null; state.column.classList.remove('is-dragging'); pause(state); }
  }), { signal });
  document.addEventListener('visibilitychange', sync, { signal });
  arrange();
  return {
    sync,
    pauseFor(node) { pause(stateFor(node)); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame); cancelAnimationFrame(layoutFrame); cancelAnimationFrame(measureFrame);
      states.forEach(state => clearTimeout(state.resumeTimer));
      visibilityObserver.disconnect(); resizeObserver.disconnect();
    },
  };
}
