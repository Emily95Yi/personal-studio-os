import assert from 'node:assert/strict';
import test from 'node:test';
import { dateKey, inQuotaPeriod, parseDate, planReminderDates } from '../site/calendar.js';
import { eventTimes } from '../site/calendar-events.js';
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
  plannerRepository.restore(null);
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

test('plan reminders land on Tokyo dates, including across years and leap days', () => {
  const plan = { kind: 'recurring', period: 'day', interval: 2, startDate: '2027-12-30' };
  assert.deepEqual(planReminderDates(plan, '2028-01-01', '2028-01-06'), ['2028-01-01', '2028-01-03', '2028-01-05']);
  assert.deepEqual(planReminderDates({ ...plan, kind: 'one-off' }, '2027-12-29', '2028-01-06'), ['2027-12-30']);
  const quota = { kind: 'quota', period: 'day', periodDays: 3, startDate: '2028-02-26' };
  assert.deepEqual(planReminderDates(quota, '2028-02-28', '2028-03-03'), ['2028-02-29', '2028-03-03']);
  assert.deepEqual(planReminderDates({ ...plan, interval: Number.MAX_SAFE_INTEGER }, '2027-12-30'), ['2027-12-30']);
  assert.deepEqual(planReminderDates({ ...plan, paused: true }, '2027-12-30'), []);
});

test('a reminder only creates a separate event after confirmation and cannot be added twice', () => {
  plannerRepository.restore(null);
  const date = '2027-05-01';
  const plan = plannerRepository.savePlan({ title: 'Plan', kind: 'one-off', startDate: date, reminder: 'note' });
  assert.equal(plannerRepository.remindersBetween(date, date).length, 1);
  assert.equal(plannerRepository.snapshot().tasks.length, 0);
  assert.equal(plannerRepository.calendarEvents().length, 0);
  const details = { ...eventTimes(true, date, '2027-05-02'), location: '', notes: 'note', targetCalendar: '', syncMode: 'caldav' };
  assert.equal(plannerRepository.confirmReminder(plan.id, '2027-05-02', details), null);
  const { event } = plannerRepository.confirmReminder(plan.id, date, details);
  assert.equal(event.start, date);
  assert.equal(event.title, plan.title);
  assert.equal(plannerRepository.confirmReminder(plan.id, date, details), null);
  const snapshot = plannerRepository.snapshot();
  assert.ok(validSnapshot(snapshot));
  plannerRepository.restore(snapshot);
  assert.equal(plannerRepository.getReminder(plan.id, date).event.id, event.id);
  assert.equal(plannerRepository.tasksBetween(date, date).length, 0);
  assert.equal(plannerRepository.tasksForPlan(plan.id).length, 0);
  plannerRepository.togglePause(plan.id);
  assert.equal(plannerRepository.remindersBetween(date, date).length, 0);
  assert.equal(plannerRepository.calendarEvents().length, 1);
});
