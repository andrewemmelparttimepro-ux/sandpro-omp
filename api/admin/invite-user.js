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

    const { email, name, title = '', department = '', role = 'contributor', reportsTo = null, tempPassword } = req.body || {};
    if (!email || !name || !tempPassword) return json(res, 400, { error: 'email, name, and tempPassword are required.' });
    if (tempPassword.length < 8) return json(res, 400, { error: 'Temporary password must be at least 8 characters.' });
    if (!['executive', 'manager', 'contributor'].includes(role)) return json(res, 400, { error: 'Invalid role.' });
    if (!canAssignRole(auth.profile, role)) return json(res, 403, { error: 'Only platform administrators can add manager/executive users.' });

    const supabase = getSupabaseAdmin();
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
      reports_to: reportsTo || null,
    };
    await supabase.from('profiles').upsert({ id: data.user.id, email, ...profilePatch });

    return json(res, 200, { id: data.user.id, email, mustChangePassword: true });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Could not invite user.' });
  }
}
