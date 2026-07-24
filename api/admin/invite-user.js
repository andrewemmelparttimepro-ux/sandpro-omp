import { getAuthedProfile, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';

const ORG_EDITOR_EMAILS = new Set(['mjimenez@sandpro.com', 'tdibben@sandpro.com']);
const PERMISSION_ADMIN_EMAILS = new Set(['jfeil@sandpro.com', 'tdibben@sandpro.com', 'andrew@ndai.pro']);

const canManageOrgChart = (profile) => (
  ['executive', 'manager'].includes(profile?.role) ||
  ORG_EDITOR_EMAILS.has((profile?.email || '').toLowerCase()) ||
  PERMISSION_ADMIN_EMAILS.has((profile?.email || '').toLowerCase())
);

const canAssignRole = (profile, role) => (
  role === 'contributor' ||
  profile?.role === 'executive' ||
  PERMISSION_ADMIN_EMAILS.has((profile?.email || '').toLowerCase())
);

const initialsFor = (name = '') => name
  .split(/\s+/)
  .filter(Boolean)
  .map(part => part[0])
  .join('')
  .toUpperCase()
  .slice(0, 2) || 'SP';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const auth = await getAuthedProfile(req);
    if (auth.error) return json(res, 401, { error: auth.error });
    if (!canManageOrgChart(auth.profile)) return json(res, 403, { error: 'You do not have permission to add org chart users.' });

    const { email, name, title = '', department = '', role = 'contributor', reportsTo = null, managerIds, tempPassword } = req.body || {};
    const nextManagerIds = [...new Set([
      ...(Array.isArray(managerIds) ? managerIds : []),
      ...(!Array.isArray(managerIds) && reportsTo ? [reportsTo] : []),
    ].filter(Boolean))];
    if (!email || !name || !tempPassword) return json(res, 400, { error: 'email, name, and tempPassword are required.' });
    if (tempPassword.length < 8) return json(res, 400, { error: 'Temporary password must be at least 8 characters.' });
    if (!['executive', 'manager', 'contributor'].includes(role)) return json(res, 400, { error: 'Invalid role.' });
    if (!canAssignRole(auth.profile, role)) return json(res, 403, { error: 'Only platform administrators can add manager/executive users.' });

    const supabase = getSupabaseAdmin();
    if (nextManagerIds.length > 0) {
      const { data: managers = [], error: managersError } = await supabase
        .from('profiles')
        .select('id')
        .in('id', nextManagerIds);
      if (managersError || managers.length !== nextManagerIds.length) {
        return json(res, 400, { error: 'One or more reporting managers no longer exist.' });
      }
    }
    const metadata = {
      name,
      initials: initialsFor(name),
      title,
      department,
      role,
      color: '#ff7f02',
      must_change_password: true,
    };
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (error) return json(res, error.message?.includes('registered') ? 409 : 400, { error: error.message });

    const profilePatch = {
      name,
      initials: metadata.initials,
      title,
      department,
      role,
      color: metadata.color,
      reports_to: nextManagerIds[0] || null,
    };
    const { error: profileError } = await supabase.from('profiles').upsert({ id: data.user.id, email, ...profilePatch });
    if (profileError) {
      await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
      return json(res, 400, { error: profileError.message });
    }
    if (nextManagerIds.length > 0) {
      const { error: managerError } = await supabase.from('profile_managers').insert(
        nextManagerIds.map(managerId => ({
          employee_id: data.user.id,
          manager_id: managerId,
          created_by: auth.profile.id,
        })),
      );
      if (managerError) {
        await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
        return json(res, 400, { error: managerError.message });
      }
    }

    return json(res, 200, { id: data.user.id, email, managerIds: nextManagerIds, mustChangePassword: true });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Could not invite user.' });
  }
}
