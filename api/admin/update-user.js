import { getAuthedProfile, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';

const VALID_ROLES = new Set(['executive', 'manager', 'contributor']);
const ORG_EDITOR_EMAILS = new Set(['mjimenez@sandpro.com', 'tdibben@sandpro.com']);
const PERMISSION_ADMIN_EMAILS = new Set(['jfeil@sandpro.com', 'tdibben@sandpro.com', 'andrew@ndai.pro']);

const initialsFor = (name = '') => name
  .split(/\s+/)
  .filter(Boolean)
  .map(part => part[0])
  .join('')
  .toUpperCase()
  .slice(0, 2) || 'SP';

const canManageOrgChart = (profile) => (
  ['executive', 'manager'].includes(profile?.role) ||
  ORG_EDITOR_EMAILS.has((profile?.email || '').toLowerCase()) ||
  PERMISSION_ADMIN_EMAILS.has((profile?.email || '').toLowerCase())
);

const canManagePermissions = (profile) => (
  profile?.role === 'executive' ||
  PERMISSION_ADMIN_EMAILS.has((profile?.email || '').toLowerCase())
);

const normalizedBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
};

const wouldCreateCycle = (profiles, userId, reportsTo) => {
  let cursor = reportsTo;
  const byId = new Map((profiles || []).map(profile => [profile.id, profile]));
  const seen = new Set();
  while (cursor) {
    if (cursor === userId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.reports_to || null;
  }
  return false;
};

const buildOrgChartNote = (existing, patch, changedByProfile) => {
  const changes = [];
  if ((existing.name || '') !== (patch.name || '')) changes.push(`name: ${existing.name || 'blank'} -> ${patch.name || 'blank'}`);
  if ((existing.title || '') !== (patch.title || '')) changes.push(`title: ${existing.title || 'blank'} -> ${patch.title || 'blank'}`);
  if ((existing.department || '') !== (patch.department || '')) changes.push(`department: ${existing.department || 'blank'} -> ${patch.department || 'blank'}`);
  if ((existing.reports_to || null) !== (patch.reports_to || null)) changes.push('reports_to changed');
  if ((existing.role || '') !== (patch.role || '')) changes.push(`role: ${existing.role || 'blank'} -> ${patch.role || 'blank'}`);
  if ((existing.color || '') !== (patch.color || '')) changes.push('color changed');
  if (changes.length === 0) return '';
  return `${changedByProfile?.name || changedByProfile?.email || 'Unknown user'} updated ${existing.name || 'user'} (${changes.join('; ')})`;
};

export default async function handler(req, res) {
  if (!['POST', 'PATCH'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  try {
    const body = normalizedBody(req.body);
    const auth = await getAuthedProfile(req, body.accessToken);
    if (auth.error) return json(res, 401, { error: auth.error });
    if (!canManageOrgChart(auth.profile)) return json(res, 403, { error: 'You do not have permission to edit the org chart.' });

    const { userId, name, title = '', department = '', reportsTo = null, role, color } = body;
    if (!userId || !name?.trim()) return json(res, 400, { error: 'userId and name are required.' });
    if (reportsTo && reportsTo === userId) return json(res, 400, { error: 'A person cannot report to themselves.' });
    if (role && !VALID_ROLES.has(role)) return json(res, 400, { error: 'Invalid role.' });
    if (role && !canManagePermissions(auth.profile)) return json(res, 403, { error: 'Only platform administrators can change platform roles.' });

    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (existingError || !existing) return json(res, 404, { error: 'User not found.' });

    const { data: profiles = [], error: profilesError } = await supabase
      .from('profiles')
      .select('id,reports_to');
    if (profilesError) return json(res, 500, { error: 'Could not validate org chart.' });
    if (wouldCreateCycle(profiles, userId, reportsTo || null)) return json(res, 400, { error: 'That reporting line would create an org chart loop.' });

    const nextRole = role || existing.role;
    const patch = {
      name: name.trim(),
      initials: initialsFor(name),
      title: title.trim(),
      department: department.trim(),
      role: nextRole,
      reports_to: reportsTo || null,
      color: color || existing.color || '#ff7f02',
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select()
      .single();
    if (error) return json(res, 400, { error: error.message });

    const note = buildOrgChartNote(existing, patch, auth.profile);
    if (note) {
      const { error: auditError } = await supabase.from('org_chart_updates').insert({
        changed_user_id: userId,
        changed_by: auth.profile.id,
        note,
        old_value: JSON.stringify({
          name: existing.name || '',
          title: existing.title || '',
          department: existing.department || '',
          reports_to: existing.reports_to || null,
          role: existing.role || '',
          color: existing.color || '',
        }),
        new_value: JSON.stringify({
          name: patch.name || '',
          title: patch.title || '',
          department: patch.department || '',
          reports_to: patch.reports_to || null,
          role: patch.role || '',
          color: patch.color || '',
        }),
      });
      if (auditError) console.warn('[admin/update-user] org chart audit skipped:', auditError.message);
    }

    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...(existing.raw_user_meta_data || {}),
        name: patch.name,
        initials: patch.initials,
        title: patch.title,
        department: patch.department,
        role: patch.role,
      },
    }).catch(() => {});

    return json(res, 200, { profile: data });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Could not update user.' });
  }
}
