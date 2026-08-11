import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { toBoolean, toNullableBoolean } from '../../src/lib/coerce.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Regression lock for the Aug 10 production incident: the NCR create form
// shipped repeatIssue: '' into boolean column repeat_issue, and Postgres
// rejected every Create NCR with `invalid input syntax for type boolean: ""`
// (Tim Dibben, Jon Ostby — caught by client_errors telemetry). `?? null`
// does NOT stop empty strings; every optional boolean must cross
// toNullableBoolean at the payload boundary.

test('toNullableBoolean coerces every UI value shape a draft can hold', () => {
  assert.equal(toNullableBoolean(''), null);
  assert.equal(toNullableBoolean('   '), null);
  assert.equal(toNullableBoolean(null), null);
  assert.equal(toNullableBoolean(undefined), null);
  assert.equal(toNullableBoolean(true), true);
  assert.equal(toNullableBoolean(false), false);
  assert.equal(toNullableBoolean('Yes'), true);
  assert.equal(toNullableBoolean('no'), false);
  assert.equal(toNullableBoolean('TRUE'), true);
  assert.equal(toNullableBoolean('0'), false);
  assert.equal(toNullableBoolean('garbage'), null);
});

test('toBoolean preserves explicit false strings for required columns', () => {
  assert.equal(toBoolean(false), false);
  assert.equal(toBoolean('false'), false);
  assert.equal(toBoolean('0'), false);
  assert.equal(toBoolean('true'), true);
  assert.equal(toBoolean(''), false);
  assert.equal(toBoolean('', true), true);
});

test('NCR payload mappers route optional booleans through toNullableBoolean', () => {
  const hooks = read('src/hooks/useSupabase.js');

  // Insert payload — the exact lines that caused the incident.
  assert.match(hooks, /recurrence_prevented: toNullableBoolean\(draft\.recurrencePrevented\)/);
  assert.match(hooks, /repeat_issue: toNullableBoolean\(draft\.repeatIssue\)/);

  // Update mapper — same hazard, same boundary.
  assert.match(hooks, /db\.recurrence_prevented = toNullableBoolean\(changes\.recurrencePrevented\)/);
  assert.match(hooks, /db\.repeat_issue = toNullableBoolean\(changes\.repeatIssue\)/);

  // The footgun itself must not come back anywhere in an NCR payload.
  assert.doesNotMatch(hooks, /recurrence_prevented: draft\.recurrencePrevented \?\? null/);
  assert.doesNotMatch(hooks, /repeat_issue: draft\.repeatIssue \?\? null/);
});

test('every boolean column of ncr_reports is coerced in the insert payload', () => {
  const hooks = read('src/hooks/useSupabase.js');
  const payloadStart = hooks.indexOf('const ncrInsertPayload');
  assert.ok(payloadStart > -1);
  const payload = hooks.slice(payloadStart, hooks.indexOf('});', payloadStart));

  // Boolean columns of public.ncr_reports. If you add one, add it here and
  // coerce it with toNullableBoolean (nullable), toBoolean (required), or an
  // explicit status comparison when the database value is derived.
  const BOOLEAN_COLUMNS = [
    'closed',
    'containment_required',
    'recurrence_prevented',
    'repeat_issue',
    'customer_approval_required',
  ];
  for (const column of BOOLEAN_COLUMNS) {
    const line = payload.split('\n').find((l) => l.trim().startsWith(`${column}:`));
    assert.ok(line, `ncrInsertPayload is missing boolean column ${column}`);
    assert.ok(
      /toNullableBoolean\(|toBoolean\(|===/.test(line),
      `${column} must be coerced (toNullableBoolean/toBoolean), got: ${line.trim()}`
    );
  }
});

test('required NCR booleans never use truthiness at a write boundary', () => {
  const hooks = read('src/hooks/useSupabase.js');
  assert.match(hooks, /containment_required: toBoolean\(draft\.containmentRequired\)/);
  assert.match(hooks, /customer_approval_required: toBoolean\(draft\.customerApprovalRequired\)/);
  assert.match(hooks, /db\.containment_required = toBoolean\(changes\.containmentRequired\)/);
  assert.match(hooks, /db\.customer_approval_required = toBoolean\(changes\.customerApprovalRequired\)/);
  assert.match(hooks, /const isClosed = toBoolean\(changes\.closed\)/);
});

test('error toasts persist long enough to read and report', () => {
  const app = read('src/App.jsx');
  assert.match(app, /entry\?\.type === 'error' \? 10000 : \(entry\?\.undo \? 10000 : 4000\)/);
});
