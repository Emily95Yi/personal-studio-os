import assert from 'node:assert/strict';
import test from 'node:test';
import { dateKey, inQuotaPeriod, parseDate } from '../site/calendar.js';
import { plannerRepository } from '../site/repository.js';
import { validSnapshot } from '../worker/planner.js';

test('daily quota cycles use the original Tokyo date and advance across calendar boundaries', () => {
  const plan = { period: 'day', periodDays: 3, periodStart: '2026-12-30' };
  const today = parseDate('2027-01-02');
  const contains = day => inQuotaPeriod(day, plan, today);
  assert.equal(contains('2027-01-01'), false);
  assert.equal(contains('2027-01-02'), true);
  assert.equal(contains('2027-01-04'), true);
  assert.equal(contains('2027-01-05'), false);
  assert.equal(inQuotaPeriod('2026-12-29', plan, parseDate('2026-12-30')), false);
  assert.equal(inQuotaPeriod('2027-01-02', { ...plan, periodDays: Number.MAX_SAFE_INTEGER }, today), true);
  assert.equal(inQuotaPeriod('2027-01-01', { period: 'month' }, today), true);
  assert.equal(inQuotaPeriod('2027-01-01', { period: 'day' }, today), false);
});

test('planner snapshots retain Inbox sources and validate flexible day counts', () => {
  const inboxId = crypto.randomUUID();
  const plan = plannerRepository.savePlan({ title: 'Quota', kind: 'quota', period: 'day', periodDays: 1200, target: 3, inboxId });
  assert.equal(plan.periodStart, dateKey());
  assert.equal(plan.inboxId, inboxId);
  assert.ok(plannerRepository.savePlan({ title: 'Repeat', kind: 'recurring', period: 'day', interval: 1500 }));
  const snapshot = plannerRepository.snapshot();
  const quota = snapshot.plans.find(row => row.id === plan.id);
  quota.periodStart = '2026-01-01';
  assert.ok(validSnapshot(snapshot));
  plannerRepository.restore(snapshot);
  const edited = plannerRepository.savePlan({ ...plan, title: 'New name' });
  assert.equal(edited.periodStart, '2026-01-01');
  assert.equal(edited.inboxId, inboxId);
  quota.periodDays = 1.5;
  assert.equal(validSnapshot(snapshot), false);
});
