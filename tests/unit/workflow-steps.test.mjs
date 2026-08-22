import assert from 'node:assert/strict';
import test from 'node:test';

import { insertObjectiveWorkflowStep } from '../../src/lib/workflowSteps.js';

const makeFallbackClient = ({ latestOrders, insertResults }) => {
  const inserted = [];
  let readIndex = 0;
  let insertIndex = 0;
  const client = {
    rpc: async () => ({ data: null, error: { code: 'PGRST202' } }),
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: { step_order: latestOrders[readIndex++] }, error: null }),
            }),
          }),
        }),
      }),
      insert: (payload) => {
        inserted.push(payload);
        return { select: () => ({ single: async () => insertResults[insertIndex++] }) };
      },
    }),
  };
  return { client, inserted };
};

test('workflow step uses the atomic database function when available', async () => {
  const calls = [];
  const client = {
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      return { data: [{ id: 'step-1', step_order: 40 }], error: null };
    },
  };

  const result = await insertObjectiveWorkflowStep({
    client,
    objectiveId: 'objective-1',
    step: { title: 'Inspect', stepOrder: 20 },
  });

  assert.equal(result.id, 'step-1');
  assert.equal(calls[0].name, 'add_objective_workflow_step_atomic');
  assert.equal(calls[0].payload.p_requested_order, 20);
});

test('missing RPC falls back and re-reads after a concurrent unique collision', async () => {
  const { client, inserted } = makeFallbackClient({
    latestOrders: [20, 30],
    insertResults: [
      { data: null, error: { code: '23505' } },
      { data: { id: 'step-2', step_order: 40 }, error: null },
    ],
  });

  const result = await insertObjectiveWorkflowStep({
    client,
    objectiveId: 'objective-1',
    step: { title: 'Inspect' },
  });

  assert.equal(result.id, 'step-2');
  assert.deepEqual(inserted.map((row) => row.step_order), [30, 40]);
});

test('permission and data failures are not disguised as concurrency', async () => {
  const failure = { code: '42501', message: 'not permitted' };
  const client = { rpc: async () => ({ data: null, error: failure }) };
  await assert.rejects(
    insertObjectiveWorkflowStep({ client, objectiveId: 'objective-1', step: { title: 'Inspect' } }),
    (error) => error === failure,
  );
});
