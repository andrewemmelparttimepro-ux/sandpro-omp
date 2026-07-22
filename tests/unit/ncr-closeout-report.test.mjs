import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/routes/NcrPage.jsx', import.meta.url), 'utf8');

test('manager NCR workspace exposes Tim-style closeout report mode', () => {
  assert.match(source, /id: 'closeout',[\s\S]*label: 'Closeout Report'/);
  assert.match(source, /Work directly from the report/);
  assert.match(source, /Review the KPA-style list, enter missing closeout data, complete actions and signoffs, then close the NCR from the same row/);
});

test('closeout report maps the source workbook fields into one editable row', () => {
  for (const label of [
    'Report date',
    'Event date + time',
    'Observer',
    'Author',
    'Worksite / area',
    'Operator + location',
    'Internal / external',
    'Criticality',
    'Event type',
    'Primary group affected',
    'Event description',
    'Follow-up details',
    'Root cause code',
    'Root cause analysis',
    'Immediate corrective / preventative action',
    'Permanent corrective action',
    'Action worked?',
    'Effectiveness verification',
  ]) {
    assert.match(source, new RegExp(label.replace(/[?+]/g, '\\$&')));
  }
});

test('closeout report preserves action, effectiveness, ownership and signoff gates', () => {
  assert.match(source, /getNcrClosureBlockers/);
  assert.match(source, /openActions\.length > 0/);
  assert.match(source, /Action is marked not effective/);
  assert.match(source, /Department manager signoff is required/);
  assert.match(source, /Senior management review and agreement is required/);
  assert.match(source, /canManagerSign = \['manager', 'executive'\]/);
  assert.match(source, /canExecutiveSign = currentUser\?\.role === 'executive'/);
});

test('row closure is disabled until edits are saved and all blockers pass', () => {
  assert.match(source, /disabled=\{dirty \|\| previewBlockers\.length > 0 \|\| Boolean\(pending\)\}/);
  assert.match(source, /Save this row before approving closure/);
  assert.match(source, /Closure approved from NCR Closeout Report after all gates passed/);
  assert.match(source, /status: 'closed',[\s\S]*lifecycleStage: 'closed'/);
});

test('corrective actions can be completed from the report row', () => {
  assert.match(source, /onUpdateActionItem\(action\.id, \{ status: 'complete' \}, currentUser\.id\)/);
  assert.match(source, /Mark complete/);
});
