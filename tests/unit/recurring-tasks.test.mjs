import assert from 'node:assert/strict';
import test from 'node:test';
import { getRecurrenceInterval, getNextRecurringDueDate, getRecurrenceLabel, getMissedCycleLabel } from '../../src/data.js';

test('cadence and missed-cycle labels track the recurrence note', () => {
  assert.equal(getRecurrenceLabel('x [Recurring — every week]'), 'Weekly');
  assert.equal(getMissedCycleLabel('x [Recurring — every week]'), 'MISSED WEEK');
  assert.equal(getRecurrenceLabel('x [Recurring — every semi annual]'), 'Semi-annual');
  assert.equal(getMissedCycleLabel('x [Recurring — every annual]'), 'MISSED CYCLE');
  assert.equal(getRecurrenceLabel('plain task'), null);
  assert.equal(getMissedCycleLabel('plain task'), null);
});

test('recurrence note parses exactly as the wizard writes it', () => {
  assert.equal(getRecurrenceInterval('Notes after our meeting [Recurring — every week]'), 'week');
  assert.equal(getRecurrenceInterval('[Recurring — every semi annual]'), 'semi annual');
  assert.equal(getRecurrenceInterval('[Recurring - every month]'), 'month', 'hyphen variant tolerated');
  assert.equal(getRecurrenceInterval('Just a normal task about recurring revenue'), null);
  assert.equal(getRecurrenceInterval(''), null);
  assert.equal(getRecurrenceInterval(null), null);
});

test('weekly roll keeps the weekday anchor and lands strictly in the future', () => {
  // Andrew's card: due Tue 8/4, completed Thu 8/6 → next Tue 8/11.
  assert.equal(getNextRecurringDueDate('2026-08-04', 'week', '2026-08-06'), '2026-08-11');
  // Missed five weeks: still lands on the anchor weekday, first future slot.
  assert.equal(getNextRecurringDueDate('2026-07-07', 'week', '2026-08-06'), '2026-08-11');
  // Completed on the due date itself → next week, not today.
  assert.equal(getNextRecurringDueDate('2026-08-06', 'week', '2026-08-06'), '2026-08-13');
});

test('longer intervals advance by calendar units', () => {
  assert.equal(getNextRecurringDueDate('2026-07-31', 'month', '2026-08-06'), '2026-08-31');
  assert.equal(getNextRecurringDueDate('2026-05-01', 'quarter', '2026-08-06'), '2026-11-01');
  assert.equal(getNextRecurringDueDate('2026-02-01', 'semi annual', '2026-08-06'), '2027-02-01');
  assert.equal(getNextRecurringDueDate('2025-08-06', 'annual', '2026-08-06'), '2027-08-06');
});

test('no due date rolls from today; no interval yields null', () => {
  assert.equal(getNextRecurringDueDate(null, 'week', '2026-08-06'), '2026-08-13');
  assert.equal(getNextRecurringDueDate('2026-08-04', null), null);
});

test('raw Postgres timestamptz due dates roll correctly (the 8/6 NaN bug)', () => {
  assert.equal(getNextRecurringDueDate('2026-08-04 00:00:00+00', 'week', '2026-08-06'), '2026-08-11');
  assert.equal(getNextRecurringDueDate('2026-08-04T00:00:00.000Z', 'week', '2026-08-06'), '2026-08-11');
  assert.equal(getNextRecurringDueDate('garbage', 'week', '2026-08-06'), '2026-08-13', 'unparseable rolls from today');
});
