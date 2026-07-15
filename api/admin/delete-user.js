import { getAuthedProfile, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';

const ORG_EDITOR_EMAILS = new Set(['mjimenez@sandpro.com', 'tdibben@sandpro.com']);
const PERMISSION_ADMIN_EMAILS = new Set(['jfeil@sandpro.com', 'tdibben@sandpro.com', 'andrew@ndai.pro']);

const canManageOrgChart = (profile) => (
  ['executive', 'manager'].includes(profile?.role) ||
  ORG_EDITOR_EMAILS.has((profile?.email || '').toLowerCase()) ||
  PERMISSION_ADMIN_EMAILS.has((profile?.email || '').toLowerCase())
);

const normalizedBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
};

const countRows = async (supabase, table, column, userId) => {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, userId);
  if (error) throw error;
  return count || 0;
};

const assertNoBlockingWork = async (supabase, userId) => {
  const checks = [
    {
      label: 'objectives',
      run: async () => {
        const { count, error } = await supabase
          .from('objectives')
          .select('id', { count: 'exact', head: true })
          .or(`owner_id.eq.${userId},created_by.eq.${userId},delegated_by.eq.${userId}`);
        if (error) throw error;
        return count || 0;
      },
    },
    { label: 'subtasks', run: () => countRows(supabase, 'subtasks', 'owner_id', userId) },
    { label: 'messages', run: () => countRows(supabase, 'messages', 'user_id', userId) },
    { label: 'Fix-It Feed posts', run: () => countRows(supabase, 'fix_it_posts', 'created_by', userId) },
  ];

  const blocking = [];
  for (const check of checks) {
    const count = await check.run();
    if (count > 0) blocking.push(`${count} ${check.label}`);
  }
  if (blocking.length > 0) {
    const detail = blocking.join(', ');
    const error = new Error(`Reassign or remove linked work before deleting this employee: ${detail}.`);
    error.statusCode = 409;
    throw error;
  }
};

const updateNullableReference = async (supabase, table, column, userId) => {
  const { error } = await supabase
    .from(table)
    .update({ [column]: null })
    .eq(column, userId);
  if (error) throw error;
};

const deleteRows = async (supabase, table, column, userId) => {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq(column, userId);
  if (error) throw error;
};

const clearNonBlockingReferences = async (supabase, userId) => {
  await Promise.all([
    updateNullableReference(supabase, 'profiles', 'reports_to', userId),
    updateNullableReference(supabase, 'objective_updates', 'user_id', userId),
    updateNullableReference(supabase, 'files', 'uploaded_by', userId),
    updateNullableReference(supabase, 'objective_metric_checkins', 'created_by', userId),
    updateNullableReference(supabase, 'objective_workflow_steps', 'owner_id', userId),
    updateNullableReference(supabase, 'objective_workflow_steps', 'completed_by', userId),
    updateNullableReference(supabase, 'objective_agent_runs', 'requested_by', userId),
    updateNullableReference(supabase, 'email_delivery_log', 'user_id', userId),
    updateNullableReference(supabase, 'fix_it_posts', 'claimed_by', userId),
    updateNullableReference(supabase, 'fix_it_attachments', 'uploaded_by', userId),
    updateNullableReference(supabase, 'org_chart_updates', 'changed_by', userId),
    deleteRows(supabase, 'objective_members', 'user_id', userId),
    deleteRows(supabase, 'notification_preferences', 'user_id', userId),
    deleteRows(supabase, 'notifications', 'user_id', userId),
  ]);
};

export default async function handler(req, res) {
  if (!['DELETE', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  try {
    const body = normalizedBody(req.body);
    const auth = await getAuthedProfile(req, body.accessToken);
    if (auth.error) return json(res, 401, { error: auth.error });
    if (!canManageOrgChart(auth.profile)) return json(res, 403, { error: 'You do not have permission to delete employees.' });

    const { userId } = body;
    if (!userId) return json(res, 400, { error: 'userId is required.' });
    if (userId === auth.profile.id) return json(res, 400, { error: 'A person cannot delete themselves.' });

    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase
      .from('profiles')
      .select('id,name,email')
      .eq('id', userId)
      .single();
    if (existingError || !existing) return json(res, 404, { error: 'Employee not found.' });

    await assertNoBlockingWork(supabase, userId);
    await clearNonBlockingReferences(supabase, userId);

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
    if (authDeleteError && !/not found/i.test(authDeleteError.message || '')) throw authDeleteError;
    if (authDeleteError) {
      const { error: profileDeleteError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);
      if (profileDeleteError) throw profileDeleteError;
    }

    return json(res, 200, { deletedUser: existing });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || 'Could not delete employee.' });
  }
}
