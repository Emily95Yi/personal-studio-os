const storageKey = 'yistudio-workshop-gallery';
let settings;

function preferences() {
  if (settings) return settings;
  try {
    const saved = JSON.parse(globalThis.window?.localStorage.getItem(storageKey) ?? 'null');
    settings = { layout: saved?.layout === 'columns' ? 'columns' : 'stack', order: Array.isArray(saved?.order) ? saved.order : [] };
  } catch {
    settings = { layout: 'stack', order: [] };
  }
  return settings;
}

function savePreferences(patch) {
  settings = { ...preferences(), ...patch };
  try { globalThis.window?.localStorage.setItem(storageKey, JSON.stringify(settings)); } catch {}
}

export function galleryLayout() {
  return preferences().layout;
}

export function orderedProjects(projects) {
  const byId = new Map(projects.map(project => [project.id, project]));
  const ordered = [];
  for (const id of preferences().order) {
    if (byId.has(id)) {
      ordered.push(byId.get(id));
      byId.delete(id);
    }
  }
  return [...ordered, ...byId.values()];
}

export function initWorkshopGalleryLayout(app) {
  let dragged;
  let dropTarget;

  function clearDropTarget() {
    if (dropTarget) delete dropTarget.panel.dataset.projectDrop;
    dropTarget = undefined;
  }

  function movePanel(panel, target, position, focus) {
    target.insertAdjacentElement(position === 'before' ? 'beforebegin' : 'afterend', panel);
    const board = panel.parentElement;
    const panels = [...board.children];
    savePreferences({ order: panels.map(item => item.dataset.projectPanel) });
    panels.forEach((item, index) => {
      item.querySelector('[data-project-move="earlier"]').disabled = index === 0;
      item.querySelector('[data-project-move="later"]').disabled = index === panels.length - 1;
    });
    if (focus) {
      const next = focus.disabled ? panel.querySelector('[data-project-move]:not(:disabled)') : focus;
      next?.focus({ preventScroll: true });
    }
    const title = panel.querySelector('h3').textContent;
    board.parentElement.querySelector('[data-project-order-status]').textContent =
      title + '已移至第 ' + (panels.indexOf(panel) + 1) + ' 个板块。';
  }

  app.addEventListener('click', event => {
    const layout = event.target.closest('button[data-gallery-layout]');
    if (layout) {
      const board = app.querySelector('[data-project-board]');
      board.dataset.projectBoard = layout.dataset.galleryLayout;
      savePreferences({ layout: board.dataset.projectBoard });
      for (const button of app.querySelectorAll('button[data-gallery-layout]')) {
        button.setAttribute('aria-pressed', String(button === layout));
      }
      return;
    }
    const button = event.target.closest('button[data-project-move]');
    if (!button || button.disabled) return;
    const panel = button.closest('[data-project-panel]');
    const earlier = button.dataset.projectMove === 'earlier';
    const target = earlier ? panel.previousElementSibling : panel.nextElementSibling;
    if (target) movePanel(panel, target, earlier ? 'before' : 'after', button);
  });

  app.addEventListener('dragstart', event => {
    const handle = event.target.closest('[data-project-drag]');
    if (!handle || !event.dataTransfer) return;
    dragged = handle.closest('[data-project-panel]');
    dragged.setAttribute('data-project-dragging', '');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragged.dataset.projectPanel);
    event.dataTransfer.setDragImage(handle.closest('.project-panel-header'), 16, 16);
  });

  app.addEventListener('dragover', event => {
    if (!dragged || !event.dataTransfer) return;
    const panel = event.target.closest('[data-project-panel]');
    if (!panel || panel === dragged || panel.parentElement !== dragged.parentElement) {
      clearDropTarget();
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = panel.getBoundingClientRect();
    const columns = getComputedStyle(panel.parentElement).gridTemplateColumns.split(' ').length > 1;
    const before = columns ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2;
    const position = before ? 'before' : 'after';
    if (dropTarget?.panel === panel && dropTarget.position === position) return;
    clearDropTarget();
    panel.dataset.projectDrop = position;
    dropTarget = { panel, position };
  });

  app.addEventListener('dragleave', event => {
    if (dropTarget?.panel.contains(event.target) && !dropTarget.panel.contains(event.relatedTarget)) clearDropTarget();
  });

  function endDrag() {
    dragged?.removeAttribute('data-project-dragging');
    dragged = undefined;
    clearDropTarget();
  }

  app.addEventListener('drop', event => {
    if (!dragged || !dropTarget || !dropTarget.panel.contains(event.target)) return;
    event.preventDefault();
    const panel = dragged;
    const { panel: target, position } = dropTarget;
    endDrag();
    movePanel(panel, target, position);
  });
  app.addEventListener('dragend', endDrag);
}
