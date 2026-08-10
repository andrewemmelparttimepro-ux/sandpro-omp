import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { toBoolean, toNullableNumber } from '../../src/lib/coerce.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Locks for the Aug 10 comprehensive stability sweep (three parallel audits:
// payload boundaries, duplicate components, blank-on-failure surfaces).

test('toNullableNumber: cleared inputs are null, never 0, never 22P02 fuel', () => {
  assert.equal(toNullableNumber(''), null);
  assert.equal(toNullableNumber(null), null);
  assert.equal(toNullableNumber(undefined), null);
  assert.equal(toNullableNumber('garbage'), null);
  assert.equal(toNullableNumber('42'), 42);
  assert.equal(toNullableNumber('$1,250.50'), 1250.5);
  assert.equal(toNullableNumber(0), 0);
  assert.equal(toNullableNumber('-3.5'), -3.5);
});

test('required booleans preserve explicit false strings', () => {
  assert.equal(toBoolean('false'), false);
  assert.equal(toBoolean('0'), false);
  assert.equal(toBoolean('true'), true);
});

test('objectives mappers coerce every typed column at the boundary', () => {
  const hooks = read('src/hooks/useSupabase.js');
  assert.match(hooks, /dbChanges\.parent_id = changes\.parentId \|\| null/);
  assert.match(hooks, /dbChanges\.start_date = changes\.startDate \|\| null/);
  assert.match(hooks, /dbChanges\.delegated_by = changes\.delegatedBy \|\| null/);
  assert.match(hooks, /dbChanges\.baseline_metric = toNullableNumber\(changes\.baselineMetric\)/);
  assert.match(hooks, /dbChanges\.target_metric = toNullableNumber\(changes\.targetMetric\)/);
  assert.match(hooks, /dbChanges\.current_metric = toNullableNumber\(changes\.currentMetric\)/);
  assert.match(hooks, /dbChanges\.okr_weight = toNullableNumber\(changes\.okrWeight\) \?\? 1/);
  assert.match(hooks, /baseline_metric: toNullableNumber\(obj\.baselineMetric\)/);
  assert.match(hooks, /progress: toNullableNumber\(obj\.progress\) \?\? 0/);
  assert.match(hooks, /acknowledged: toBoolean\(obj\.acknowledged\)/);
  assert.match(hooks, /blocker_flag: toBoolean\(obj\.blockerFlag\)/);
  assert.match(hooks, /target_value: toNullableNumber\(definition\.targetValue\)/);
});

test('NCR update mapper persists closeout fields it used to drop', () => {
  const hooks = read('src/hooks/useSupabase.js');
  assert.match(hooks, /db\.report_date = changes\.reportDate \|\| null/);
  assert.match(hooks, /db\.observer = changes\.observer \|\| ''/);
  assert.match(hooks, /db\.follow_up_details = changes\.followUpDetails \|\| ''/);
  assert.match(hooks, /db\.follow_up_count = toNullableNumber\(changes\.followUpCount\) \?\? 0/);
});

test('metric check-in requires a date and the mapper cannot receive a blank one unguarded', () => {
  const detail = read('src/objectiveDetail.jsx');
  assert.match(detail, /if \(!metricDraft\.date\) \{ addToast\(\{ type: 'error', message: 'Pick a check-in date/);
  const hooks = read('src/hooks/useSupabase.js');
  assert.match(hooks, /if \(!checkin\.date\) throw new Error\('Pick a check-in date before saving\.'\)/);
  assert.match(hooks, /const checkinValue = toNullableNumber\(checkin\.value\)/);
});

test('subtask, workflow, and project typed fields are coerced before writes', () => {
  const hooks = read('src/hooks/useSupabase.js');
  assert.match(hooks, /weight: toNullableNumber\(subtask\.weight\) \?\? 1/);
  assert.match(hooks, /is_milestone: toBoolean\(subtask\.isMilestone\)/);
  assert.match(hooks, /step_order: toNullableNumber\(step\.stepOrder\) \?\? 0/);
  assert.match(hooks, /run_the_business: toBoolean\(project\.runTheBusiness\)/);
  assert.match(hooks, /budget_estimate: toNullableNumber\(project\.budgetEstimate\)/);
  assert.match(hooks, /is_active: toBoolean\(draft\.isActive, true\)/);
  assert.match(hooks, /patch\.is_active = toBoolean\(changes\.isActive\)/);
});

test('a cleared KPI target saves as null, not silent zero', () => {
  const kpi = read('src/routes/KpiPage.jsx');
  assert.match(kpi, /targetValue: newKpiDraft\.targetValue === '' \? null : Number\(newKpiDraft\.targetValue\)/);
});

test('fetch failures keep last-known data instead of blanking', () => {
  const hooks = read('src/hooks/useSupabase.js');
  // Profile refetch failure never downgrades an already-loaded profile/role.
  assert.match(hooks, /setProfile\(prev => prev \|\| profileFromAuthUser\(authUser\)\)/);
  // Fix-It refetch failure keeps the wall.
  assert.doesNotMatch(hooks, /Error fetching Fix-It Feed', error\);\n\s*setPosts\(\[\]\)/);
  // The objectives loading flag rises for the real fetch (empty-state honesty).
  assert.match(hooks, /if \(!objectivesLoadedRef\.current\) setLoading\(true\)/);
  assert.match(hooks, /objectivesLoadedRef\.current = true/);
});

test('overlay dismissals survive blocked localStorage (no re-arm loops)', () => {
  const app = read('src/App.jsx');
  assert.match(app, /const safeStorageMemory = new Map\(\)/);
  assert.match(app, /safeStorageMemory\.set\(k, v\)/);
});

test('a stale recovery link cannot wall the app (escape hatch, recovery only)', () => {
  const app = read('src/App.jsx');
  assert.match(app, /onCancel=\{!mustChangePassword && passwordRecovery \? clearPasswordRecovery : undefined\}/);
  assert.match(app, /I didn't request a reset/);
  const hooks = read('src/hooks/useSupabase.js');
  assert.match(hooks, /clearPasswordRecovery: \(\) => setPasswordRecovery\(false\)/);
});
