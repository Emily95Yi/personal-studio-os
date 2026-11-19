import { galleryGlide, galleryLayout, galleryLoopStep, galleryMotion } from './tokyo-gallery.js';

export function mountPosterGallery(gallery, { signal, reduced, isLocked }) {
  if (!gallery) return { sync() {}, pauseFor() {}, dispose() {} };
  const originals = [...gallery.querySelectorAll('.tk-gallery-item')];
  const mobile = window.matchMedia('(max-width: 639px)');
  let states = [], visible = false, disposed = false, frame = 0, layoutFrame = 0, measureFrame = 0, lastTick = 0, size = '';
  const stateFor = node => node && states.find(state => state.column.contains(node));
  const canPlay = () => visible && !disposed && !reduced.matches && !isLocked() && document.visibilityState === 'visible';

  function sync() {
    const playing = canPlay() && states.some(state => state.max > 1 && !state.pointerDown &&
      (state.velocity || (!state.manual && !state.focused)));
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
    state.position = step.position;
    // Never write native scrollTop during a touch gesture. iOS momentum and
    // rubber-banding otherwise compete with the loop's offset compensation.
    state.track.style.transform = 'translate3d(0,' + -state.position + 'px,0)';
    if (movedFocus) active.focus({ preventScroll: true });
  }
  function tick(now) {
    frame = 0;
    if (!canPlay()) { lastTick = 0; return; }
    const seconds = lastTick ? Math.min((now - lastTick) / 1000, .05) : 0;
    lastTick = now;
    for (const state of states) if (state.max > 1 && !state.pointerDown) {
      if (state.velocity) {
        const glide = galleryGlide(state.velocity, seconds);
        state.velocity = glide.velocity;
        move(state, glide.delta);
      } else if (!state.manual && !state.focused) {
        move(state, state.motion.scrollSign * state.motion.speed * seconds);
      }
    }
    sync();
  }
  function finishPointer(event) {
    for (const state of states) if (state.pointerId === event.pointerId) {
      if (event.type !== 'pointerup' || state.pointerType === 'mouse' || !state.suppressClick ||
        event.timeStamp - state.lastTime > 80) state.velocity = 0;
      state.pointerDown = false;
      state.pointerId = null;
      state.column.classList.remove('is-dragging');
      pause(state);
      scheduleLayout();
    }
  }
  function bindColumn(state) {
    const { column } = state;
    column.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary || state.pointerDown || reduced.matches || state.max < 1) return;
      state.velocity = 0;
      state.pointerDown = true;
      state.focused = false;
      state.pointerId = event.pointerId;
      state.pointerType = event.pointerType;
      state.startY = state.lastY = event.clientY;
      state.lastTime = event.timeStamp;
      state.suppressClick = false;
      pause(state);
    }, { passive: true, signal });
    column.addEventListener('pointermove', event => {
      if (!state.pointerDown || event.pointerId !== state.pointerId) return;
      if (!state.suppressClick && Math.abs(event.clientY - state.startY) < 6) return;
      state.suppressClick = true;
      column.setPointerCapture(event.pointerId);
      column.classList.add('is-dragging');
      event.preventDefault();
      const delta = state.lastY - event.clientY;
      const elapsed = Math.max(1, event.timeStamp - state.lastTime);
      state.velocity = state.pointerType === 'mouse' ? 0 :
        state.velocity * .35 + Math.max(-900, Math.min(900, delta * 1000 / elapsed)) * .65;
      move(state, delta);
      state.lastY = event.clientY;
      state.lastTime = event.timeStamp;
      pause(state);
    }, { passive: false, signal });
    column.addEventListener('lostpointercapture', finishPointer, { signal });
    column.addEventListener('wheel', event => {
      if (reduced.matches || state.max < 1 || event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      state.velocity = 0;
      state.focused = false;
      pause(state);
      move(state, event.deltaY * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? column.clientHeight : 1));
    }, { passive: false, signal });
    column.addEventListener('keydown', event => {
      if (event.key === 'Tab' && !reduced.matches) {
        // Focus hidden originals without the browser first scrolling toward
        // their offscreen DOM positions. focusin reveals the chosen poster.
        const stops = [...gallery.querySelectorAll('.tk-gallery-column, [data-tk-poster]')].filter(node => node.tabIndex >= 0);
        const index = stops.indexOf(document.activeElement);
        const next = index >= 0 && stops[index + (event.shiftKey ? -1 : 1)];
        if (next) { event.preventDefault(); next.focus({ preventScroll: true }); }
        return;
      }
      if (reduced.matches || state.max < 1 || event.altKey || event.ctrlKey || event.metaKey) return;
      const page = column.clientHeight * .8;
      const delta = { ArrowUp: -40, ArrowDown: 40, PageUp: -page, PageDown: page,
        Home: -state.position, End: state.max - state.position }[event.key] ??
        (event.key === ' ' && event.target === column ? (event.shiftKey ? -page : page) : undefined);
      if (delta === undefined) return;
      event.preventDefault();
      state.velocity = 0;
      pause(state);
      move(state, delta);
    }, { signal });
    // A clipping scroll container contains the browser's focus scrolling.
    // It never drives the loop: all browsing uses the logical track offset.
    column.addEventListener('scroll', () => {
      if (column.scrollTop) column.scrollTop = 0;
    }, { passive: true, signal });
    column.addEventListener('focusin', event => {
      state.focused = event.target.matches(':focus-visible');
      if (state.focused) {
        state.velocity = 0;
        pause(state);
        const item = event.target.closest('.tk-gallery-item');
        if (item && !reduced.matches) {
          const top = item.offsetTop - state.position;
          if (top < 0) move(state, top);
          else if (top + item.offsetHeight > column.clientHeight) move(state, top + item.offsetHeight - column.clientHeight);
          column.scrollTop = 0;
        }
      }
    }, { signal });
    column.addEventListener('focusout', () => queueMicrotask(() => {
      if (disposed) return;
      state.focused = column.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
      if (!state.focused && state.manual) pause(state);
      sync();
    }), { signal });
    column.addEventListener('click', event => {
      if (state.suppressClick) { event.preventDefault(); event.stopPropagation(); state.suppressClick = false; }
      else { state.velocity = 0; if (event.detail) state.focused = false; pause(state); }
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
      const state = { column, track, index, max: 0, stride: 0, position: 0, velocity: 0, manual: false, focused: false, pointerDown: false, resumeTimer: 0 };
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
      // Safari's address-bar resize must not resize posters under a finger.
      if (reduced.matches || states.some(state => state.pointerDown)) { sync(); return; }
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
          state.column.classList.toggle('is-still', state.max < 1);
          if (!oldStride && state.max > 1) state.track.prepend(state.track.lastElementChild);
          state.position = state.max > 1 ? Math.min(state.max, oldStride ? oldPosition / oldStride * state.stride : state.stride) : 0;
          state.velocity = 0;
          move(state, 0);
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
    state.velocity = 0;
    if (state.pointerDown) { state.pointerDown = false; state.pointerId = null; state.column.classList.remove('is-dragging'); pause(state); }
  }), { signal });
  document.addEventListener('visibilitychange', sync, { signal });
  arrange();
  return {
    sync,
    pauseFor(node) { const state = stateFor(node); if (state) state.velocity = 0; pause(state); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame); cancelAnimationFrame(layoutFrame); cancelAnimationFrame(measureFrame);
      states.forEach(state => clearTimeout(state.resumeTimer));
      visibilityObserver.disconnect(); resizeObserver.disconnect();
    },
  };
}
