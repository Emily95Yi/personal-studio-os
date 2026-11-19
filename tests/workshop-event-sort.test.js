import assert from 'node:assert/strict';
import test from 'node:test';
import { chronologicalEvents } from '../site/workshop-event-sort.js';
import { emptyStudio, studioStore } from '../site/studio-data.js';
import { workshopGallery } from '../site/workshop-view.js';
import { activitiesView } from '../site/workshop-library-view.js';

test('default Event order uses descending activity dates then newest additions, without changing saved order', () => {
  const rows = [
    { id: 'old-undated', createdAt: '2026-11-01T00:00:00Z' },
    { id: 'latest-date', date: '2026-12-01', createdAt: '2026-01-01T00:00:00Z', workshopOrder: 99 },
    { id: 'earlier-date', date: '2026-10-01', createdAt: '2026-11-20T00:00:00Z', workshopOrder: 0 },
    { id: 'new-undated', date: '', createdAt: '2026-11-20T00:00:00Z' },
    { id: 'same-stamp-later', date: ' ', createdAt: '2026-11-20T00:00:00Z' },
  ];
  const before = structuredClone(rows);
  assert.deepEqual(chronologicalEvents(rows).map(row => row.id),
    ['latest-date', 'earlier-date', 'same-stamp-later', 'new-undated', 'old-undated']);
  assert.deepEqual(rows, before);
});

test('legacy undated Events without creation timestamps fall back to reverse insertion order', () => {
  assert.deepEqual(chronologicalEvents([{id:'first'}, {id:'second'}]).map(row => row.id), ['second', 'first']);
});

test('Workshop gallery, groups and search use date order while explicit manual mode keeps saved orders', () => {
  const before = studioStore.state;
  const state = emptyStudio();
  state.events = [
    {id:'early',title:'SORT_EARLY',date:'2026-10-01',workshopOrder:0,workshopGroupOrder:0},
    {id:'late',title:'SORT_LATE',date:'2026-12-01',workshopOrder:1,workshopGroupOrder:1},
    {id:'undated',title:'SORT_UNDATED',createdAt:'2026-11-20T00:00:00Z'},
  ];
  studioStore.receiveCloud(state, state.revision);
  try {
    for (const params of [new URLSearchParams(), new URLSearchParams('view=grouped')]) {
      const html = workshopGallery({params});
      assert.ok(html.indexOf('SORT_LATE') < html.indexOf('SORT_EARLY'));
      assert.ok(html.indexOf('SORT_EARLY') < html.indexOf('SORT_UNDATED'));
    }
    const search = activitiesView({params:new URLSearchParams('q=SORT_')});
    assert.ok(search.indexOf('SORT_LATE') < search.indexOf('SORT_EARLY'));
    const manual = workshopGallery({params:new URLSearchParams('order=manual')});
    assert.ok(manual.indexOf('SORT_EARLY') < manual.indexOf('SORT_LATE'));
  } finally { studioStore.receiveCloud(before, before.revision); }
});
