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

test('due reminders persist, defer by custom days and dismiss just the pending cycle', () => {
  plannerRepository.restore(null);
  const repo = plannerRepository;
  const date = '2027-05-01';
  const plan = repo.savePlan({ title: 'Plan', kind: 'recurring', period: 'day', interval: 2, startDate: date });
  assert.deepEqual(repo.dueReminders('2027-04-30'), []);
  assert.equal(repo.dueReminders(date)[0].date, date);
  assert.equal(repo.dueReminders('2027-05-02')[0].date, date);
  assert.equal(repo.deferReminder(plan.id, date, 3, '2027-05-02'), true);
  assert.ok(validSnapshot(repo.snapshot()));
  repo.restore(repo.snapshot());
  assert.equal(repo.dueReminders('2027-05-04').length, 0);
  assert.equal(repo.dueReminders('2027-05-05')[0].date, date);
  assert.equal(repo.dismissReminder(plan.id, date, '2027-05-05'), true);
  assert.equal(repo.dueReminders('2027-05-06').length, 0);
  assert.equal(repo.dueReminders('2027-05-07')[0].date, '2027-05-07');
  assert.equal(repo.snapshot().tasks.length, 0);
  assert.equal(repo.calendarEvents().length, 0);
});

test('plan trash and task deletion preserve independent and previously linked calendar events', () => {
  plannerRepository.restore(null);
  const repo = plannerRepository;
  const date = '2027-05-01';
  const plan = repo.savePlan({ title: 'Plan', kind: 'one-off', startDate: date });
  const task = repo.saveTask({ title: 'Manual', planId: plan.id, date });
  const details = { ...eventTimes(true, date, '2027-05-02'), location: '', notes: '', targetCalendar: '', syncMode: 'caldav' };
  const { event: legacy } = repo.confirmReview(task.id, 'calendar', details);
  const independent = repo.saveCalendarEvent({ ...details, title: plan.title });
  assert.equal(independent.taskId, undefined);
  assert.equal(repo.dueReminders(date).length, 1);
  assert.equal(repo.setPlanTrashed(plan.id, true), true);
  assert.equal(repo.getPlan(plan.id), undefined);
  assert.equal(repo.trashedPlans()[0].id, plan.id);
  assert.equal(repo.listTasks().length, 0);
  assert.equal(repo.dueReminders(date).length, 0);
  assert.equal(repo.calendarEvents().length, 2);
  repo.restore(repo.snapshot());
  assert.equal(repo.setPlanTrashed(plan.id, false), true);
  assert.equal(repo.listTasks().length, 1);
  assert.equal(repo.removeTask(task.id), true);
  assert.equal(repo.calendarEvents().find(row => row.id === legacy.id).taskId, undefined);
  const replacement = repo.saveTask({ title: 'Another manual task', planId: plan.id, date });
  const { event: fromPlan } = repo.confirmReview(replacement.id, 'calendar', details);
  assert.ok(validSnapshot(repo.snapshot()));
  repo.setPlanTrashed(plan.id, true);
  repo.clearPlanTrash();
  assert.equal(repo.trashedPlans().length, 0);
  assert.equal(repo.getTask(replacement.id), undefined);
  assert.equal(repo.calendarEvents().find(row => row.id === fromPlan.id).taskId, undefined);
  assert.equal(repo.calendarEvents().length, 3);
  assert.ok(validSnapshot(repo.snapshot()));
});

test('manual tasks can be saved without dates while calendar events still require a date range', () => {
  const repo = plannerRepository;
  repo.restore(null);
  const task = repo.saveTask({ title: 'Manual', notes: '备忘\n第二行', done: false });
  assert.equal(task.date, undefined);
  assert.ok(validSnapshot(repo.snapshot()));
  repo.restore(JSON.parse(JSON.stringify(repo.snapshot())));
  assert.equal(repo.listTasks()[0].id, task.id);
  assert.equal(repo.saveTask({ id: task.id, title: 'Edited' }).notes, task.notes);
  const legacy = repo.saveTask({ title: 'Previously dated', date: '2027-03-01' });
  assert.equal(repo.saveTask({ id: legacy.id, title: 'Edited' }).date, legacy.date);
  const event = repo.saveCalendarEvent({ title: 'Appointment', ...eventTimes(true, '2027-03-01', '2027-03-02'),
    location: '', notes: '', targetCalendar: '' });
  const snapshot = repo.snapshot();
  assert.ok(validSnapshot(snapshot));
  delete snapshot.events.find(row => row.id === event.id).start;
  assert.equal(validSnapshot(snapshot), false);
});

test('converting a task creates an independent event in the same snapshot and keeps completion history', () => {
  const repo = plannerRepository;
  repo.restore(null);
  const date = '2027-03-01';
  const plan = repo.savePlan({ title: 'Plan', kind: 'one-off' });
  const task = repo.saveTask({ title: 'Manual', done: true, planId: plan.id, completedOn: date });
  const details = { title: task.title, ...eventTimes(true, date, '2027-03-02'), location: '', notes: '', targetCalendar: '' };
  assert.equal(repo.saveCalendarEvent({ ...details, title: '' }, { convertTaskId: task.id }), null);
  assert.equal(repo.listTasks().length, 1);
  const event = repo.saveCalendarEvent(details, { convertTaskId: task.id });
  assert.equal(event.taskId, undefined);
  assert.equal(repo.listTasks().length, 0);
  assert.equal(repo.completionsForPlan(plan.id).length, 1);
  assert.equal(repo.saveCalendarEvent(details, { convertTaskId: task.id }), null);
  assert.equal(repo.calendarEvents().length, 1);
  assert.ok(validSnapshot(repo.snapshot()));
});
