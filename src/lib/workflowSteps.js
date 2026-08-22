import { toNullableNumber } from './coerce.js';

const WORKFLOW_RPC = 'add_objective_workflow_step_atomic';
const RPC_NOT_FOUND = 'PGRST202';
const UNIQUE_VIOLATION = '23505';

const workflowPayload = (objectiveId, step, requestedOrder) => ({
  objective_id: objectiveId,
  title: step.title,
  description: step.description || '',
  step_order: requestedOrder,
  status: step.status || 'todo',
  owner_id: step.ownerId || null,
  due_date: step.dueDate || null,
});

const insertWithCollisionRetry = async ({ client, objectiveId, step, requestedOrder, attempts }) => {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data: latestStep, error: latestStepError } = await client
      .from('objective_workflow_steps')
      .select('step_order')
      .eq('objective_id', objectiveId)
      .order('step_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestStepError) throw latestStepError;

    const latestOrder = toNullableNumber(latestStep?.step_order) ?? 0;
    const stepOrder = Math.max(requestedOrder, latestOrder + 10);
    const result = await client
      .from('objective_workflow_steps')
      .insert(workflowPayload(objectiveId, step, stepOrder))
      .select()
      .single();
    if (!result.error) return result.data;
    lastError = result.error;
    if (result.error.code !== UNIQUE_VIOLATION) throw result.error;
  }
  throw lastError;
};

export const insertObjectiveWorkflowStep = async ({
  client,
  objectiveId,
  step,
  fallbackAttempts = 3,
}) => {
  const requestedOrder = toNullableNumber(step.stepOrder) ?? 0;
  const { data, error } = await client.rpc(WORKFLOW_RPC, {
    p_objective_id: objectiveId,
    p_title: step.title,
    p_description: step.description || '',
    p_requested_order: requestedOrder,
    p_status: step.status || 'todo',
    p_owner_id: step.ownerId || null,
    p_due_date: step.dueDate || null,
  });

  if (!error) return Array.isArray(data) ? data[0] : data;
  // A release may briefly reach a non-production environment before its DB
  // migration. Fail over only for PostgREST's stable missing-function code;
  // permission and data errors stay visible instead of being disguised.
  if (error.code !== RPC_NOT_FOUND) throw error;
  return insertWithCollisionRetry({
    client,
    objectiveId,
    step,
    requestedOrder,
    attempts: fallbackAttempts,
  });
};
