import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildFallbackStarterResult,
  buildObjectiveSnapshot,
  buildStarterPrompt,
  parseStarterOutput,
} from '../../api/_shared/objectiveStarter.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const objective = {
  id: 'obj-1',
  title: 'Engineering inputs needed for Retrievable Bridge Plug animation',
  description: 'Collect engineering inputs before Focus Digital can finish the animation.',
  status: 'not_started',
  priority: 'high',
  progress: 0,
  department: 'Engineering',
  due_date: '2026-05-19T00:00:00.000Z',
  start_date: '2026-05-18T00:00:00.000Z',
  owner_id: 'user-1',
  created_by: 'user-2',
  next_action: 'Ask engineering for source drawings.',
  blocker_flag: false,
  blocker_reason: '',
  type: 'simple',
  baseline_metric: null,
  current_metric: null,
  target_metric: null,
  metric_unit: '',
  measurement_cadence: 'monthly',
};

test('objective starter snapshot only includes allowed objective-board fields', () => {
  const snapshot = buildObjectiveSnapshot({
    objective: { ...objective, secret_token: 'do-not-include' },
    owner: { name: 'Mercileidy Jimenez', title: 'Admin Contact', department: 'Operations', email: 'private@example.com' },
    creator: { name: 'Jake Feil', title: 'CEO', email: 'private@example.com' },
    subtasks: [{ title: 'Gather drawings', owner_id: 'user-1', status: 'not_started', progress: 0, due_date: null, is_milestone: false }],
    metricCheckins: [],
    childObjectives: [],
    files: [{ id: 'file-1', name: 'private.pdf' }],
    messages: [{ id: 'msg-1', text: 'Private message text' }],
  });

  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes('secret_token'), false);
  assert.equal(serialized.includes('private@example.com'), false);
  assert.equal(serialized.includes('Private message text'), false);
  assert.equal(snapshot.activityCounts.messages, 1);
  assert.equal(snapshot.activityCounts.files, 1);
  assert.equal(snapshot.owner.name, 'Mercileidy Jimenez');
});

test('starter prompt includes the snapshot and current web-search setting', () => {
  const snapshot = buildObjectiveSnapshot({ objective, owner: null, creator: null });
  const prompt = buildStarterPrompt({ snapshot, preparedAt: '2026-05-18T18:00:00.000Z', webSearchEnabled: true });
  assert.match(prompt, /Objective Assistant/);
  assert.match(prompt, /Web search enabled: yes/);
  assert.match(prompt, /Engineering inputs needed/);
});

test('starter output parser rejects missing required sections', () => {
  assert.throws(() => parseStarterOutput(JSON.stringify({ title: 'Missing pieces' })), /missing summary/i);
  assert.throws(() => parseStarterOutput('not-json'), /unreadable/i);
});

test('starter output parser accepts valid structured output with source links', () => {
  const parsed = parseStarterOutput(JSON.stringify({
    title: 'Objective Starter Pack',
    summary: 'Engineering inputs should be gathered before animation work continues.',
    nextSteps: ['Request drawings', 'Confirm tool dimensions', 'Set review date'],
    questions: ['Who owns final technical approval?'],
    requestedInputs: ['Bridge plug drawing package'],
    risks: ['Animation may drift from actual tool behavior.'],
    sourceLinks: [{ title: 'Example source', url: 'https://example.com', note: 'Reference only.' }],
    markdown: '# Objective Starter Pack',
  }));

  assert.equal(parsed.sourceLinks[0].url, 'https://example.com');
  assert.equal(parsed.nextSteps.length, 3);
});

test('fallback starter pack creates a usable asset without model configuration', () => {
  const snapshot = buildObjectiveSnapshot({ objective, owner: { name: 'Mercileidy Jimenez', title: 'Admin Contact', department: 'Operations' }, creator: null });
  const fallback = buildFallbackStarterResult({ snapshot, preparedAt: '2026-05-19T12:00:00.000Z' });

  assert.match(fallback.title, /Objective Starter Pack/);
  assert.match(fallback.markdown, /First Next Steps/);
  assert.equal(fallback.sourceLinks.length, 0);
  assert.ok(fallback.nextSteps.length >= 3);
});

test('objective starter endpoint links generated files back to the agent run', () => {
  const endpoint = readFileSync(join(root, 'api/agent/objective-starter.js'), 'utf8');
  assert.match(endpoint, /objective_agent_runs/);
  assert.match(endpoint, /agent_run_id:\s*runId/);
  assert.match(endpoint, /generated_by_agent:\s*true/);
  assert.match(endpoint, /file_id:\s*file\.id/);
});
