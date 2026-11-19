async page => {
  await page.reload();
  await page.locator('[data-tk-gallery]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    window.galleryNodeChanges = 0;
    document.querySelector('[data-tk-gallery]').addEventListener('pointerdown', event => {
      window.lastPosterPointer = {target:event.target, id:event.pointerId};
    });
    window.galleryObserver = new MutationObserver(records => galleryNodeChanges += records.filter(r => r.type === 'childList').length);
    galleryObserver.observe(document.querySelector('[data-tk-gallery]'), {childList:true,subtree:true});
  });
  const box = await page.locator('.tk-gallery-column').nth(1).boundingBox();
  await page.evaluate(() => {
    window.touchQA = { frames: 0, maxGap: 0, maxJump: 0, previous: new Map(), running: true };
    const sample = () => {
      const qa = window.touchQA;
      if (!qa.running) return;
      const column = document.querySelectorAll('.tk-gallery-column')[1];
      const viewport = column.getBoundingClientRect();
      const rects = [...column.querySelectorAll('.tk-gallery-item')].map(item => {
        const rect = item.getBoundingClientRect();
        return { id: item.querySelector('button').dataset.tkPoster, top: rect.top, bottom: rect.bottom };
      });
      const visible = rects.filter(r => r.bottom > viewport.top && r.top < viewport.bottom).sort((a, b) => a.top - b.top);
      let bottom = viewport.top;
      for (const item of visible) {
        qa.maxGap = Math.max(qa.maxGap, item.top - bottom);
        const previous = qa.previous.get(item.id);
        if (previous) qa.maxJump = Math.max(qa.maxJump, Math.abs(item.top - previous.top));
        bottom = Math.max(bottom, item.bottom);
      }
      qa.maxGap = Math.max(qa.maxGap, viewport.bottom - bottom);
      qa.previous = new Map(visible.map(item => [item.id, item]));
      qa.frames++;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type,
    touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
  const x = box.x + box.width / 2;
  const pageY = await page.evaluate(() => scrollY);
  let actualTravel = 0, checkedCaptureTransfer = false;
  const rects = () => page.locator('.tk-gallery-column').nth(1).locator('.tk-gallery-item').evaluateAll(items => items.map(item => ({id:item.querySelector('button').dataset.tkPoster, y:item.getBoundingClientRect().top})));
  for (const direction of [-1, -1, -1, -1, 1, 1, 1, 1, -1, 1]) {
    const start = box.y + box.height * (direction < 0 ? .8 : .2);
    await touch('touchStart', x, start);
    for (let step = 1; step <= 18; step++) {
      const before = await rects();
      await touch('touchMove', x, start + direction * step * 18);
      await page.waitForTimeout(18);
      if (!checkedCaptureTransfer) {
        // Safari may bubble a capture-loss from the previous poster target
        // while the column still owns this ongoing touch gesture.
        await page.evaluate(() => lastPosterPointer.target.dispatchEvent(new PointerEvent('lostpointercapture', {bubbles:true,pointerId:lastPosterPointer.id})));
        checkedCaptureTransfer = true;
      }
      const after = await rects();
      const changes = before.map(b => after.find(a => a.id === b.id).y - b.y).sort((a,b)=>a-b);
      actualTravel += Math.abs(changes[3]);
    }
    await touch('touchEnd', x, 0);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(800);
  const result = await page.evaluate(() => {
    touchQA.running = false;
    return { frames: touchQA.frames, maxGap: touchQA.maxGap, maxJump: touchQA.maxJump,
      pageY: scrollY, nativeScroll: [...document.querySelectorAll('.tk-gallery-column')].map(c => c.scrollTop),
      posters: document.querySelectorAll('.tk-gallery-item').length,
      modalOpened: document.querySelector('[data-tk-focus]').open,
      touchAction: getComputedStyle(document.querySelector('.tk-gallery-column')).touchAction,
      columns: [...document.querySelectorAll('.tk-gallery-column')].map(c => ({ transform: c.firstElementChild.style.transform, manual: c.classList.contains('is-manual') })) };
  });
  await cdp.detach();
  if (result.maxGap > 7 || result.maxJump > 65 || result.pageY !== pageY || result.modalOpened || result.posters !== 12 || result.nativeScroll.some(v => v !== 0)) throw new Error(JSON.stringify(result));
  result.actualTravel = actualTravel;
  if (actualTravel < 3000) throw new Error("Touch tracking lost: " + actualTravel);
  result.nodeChanges = await page.evaluate(() => { galleryObserver.disconnect(); return galleryNodeChanges; });
  if (result.nodeChanges) throw new Error('Live image nodes were reordered');
  return result;
}
