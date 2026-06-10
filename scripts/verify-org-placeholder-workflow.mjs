import { createClient } from '@supabase/supabase-js';
import '../tests/env-loader.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase URL/service key for org placeholder verification.');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const token = `org-placeholder-${Date.now()}`;
let placeholderId = null;

const cleanup = async () => {
  if (placeholderId) await admin.from('org_chart_placeholders').delete().eq('id', placeholderId);
};

const fail = async (message, error) => {
  console.error(`x ${message}`);
  if (error) console.error(error.message || error);
  await cleanup();
  process.exit(1);
};

try {
  const { data: managers = [], error: managerError } = await admin
    .from('profiles')
    .select('id,name,department,role')
    .in('role', ['manager', 'executive'])
    .limit(8);
  if (managerError) await fail('could not read manager/executive profiles', managerError);
  if (managers.length < 2) await fail('need at least two org managers/executives to verify placeholder move');

  const [firstManager, secondManager] = managers;
  const { data: created, error: createError } = await admin
    .from('org_chart_placeholders')
    .insert({
      name: `QA Field Techs ${token}`,
      title: 'Group placeholder',
      department: firstManager.department || 'Operations',
      reports_to: firstManager.id,
      color: '#ff7f02',
      created_by: firstManager.id,
    })
    .select('*')
    .single();
  if (createError || !created?.id) await fail('could not create group placeholder without email/password/login fields', createError);
  placeholderId = created.id;
  if ('email' in created) await fail('placeholder row unexpectedly contains an email field');

  const { data: moved, error: moveError } = await admin
    .from('org_chart_placeholders')
    .update({
      reports_to: secondManager.id,
      department: secondManager.department || created.department,
    })
    .eq('id', placeholderId)
    .select('*')
    .single();
  if (moveError || moved?.reports_to !== secondManager.id) await fail('could not move placeholder to another reporting manager', moveError);

  await cleanup();
  const { count } = await admin
    .from('org_chart_placeholders')
    .select('id', { count: 'exact', head: true })
    .eq('id', placeholderId);
  if (count) await fail('org placeholder cleanup left QA row behind');

  console.log(`ok org placeholder workflow verified: created under ${firstManager.name}, moved to ${secondManager.name}, deleted cleanly`);
} catch (error) {
  await fail('org placeholder verification crashed', error);
}
