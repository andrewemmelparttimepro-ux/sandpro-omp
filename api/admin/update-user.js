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

const normalizeManagerIds = (managerIds, reportsTo = null) => (
  [...new Set([
    ...(Array.isArray(managerIds) ? managerIds : []),
    ...(!Array.isArray(managerIds) && reportsTo ? [reportsTo] : []),
  ].filter(Boolean))]
);

const wouldCreateCycle = (profiles, managerLinks, userId, nextManagerIds) => {
  const managersByEmployee = new Map();
  for (const profile of profiles || []) {
    if (profile.reports_to) managersByEmployee.set(profile.id, [profile.reports_to]);
  }
  for (const link of managerLinks || []) {
    managersByEmployee.set(link.employee_id, [
      ...(managersByEmployee.get(link.employee_id) || []),
      link.manager_id,
    ]);
  }
  managersByEmployee.set(userId, nextManagerIds);

  const reachesEmployee = (profileId, path = new Set()) => {
    if (profileId === userId) return true;
    if (path.has(profileId)) return false;
    const nextPath = new Set(path);
    nextPath.add(profileId);
    return [...new Set(managersByEmployee.get(profileId) || [])]
      .some(managerId => reachesEmployee(managerId, nextPath));
  };
  return nextManagerIds.some(managerId => reachesEmployee(managerId));
};

const buildOrgChartNote = (existing, patch, changedByProfile, previousManagerIds = [], nextManagerIds = []) => {
  const changes = [];
  if ((existing.name || '') !== (patch.name || '')) changes.push(`name: ${existing.name || 'blank'} -> ${patch.name || 'blank'}`);
  if ((existing.title || '') !== (patch.title || '')) changes.push(`title: ${existing.title || 'blank'} -> ${patch.title || 'blank'}`);
  if ((existing.department || '') !== (patch.department || '')) changes.push(`department: ${existing.department || 'blank'} -> ${patch.department || 'blank'}`);
  if ([...previousManagerIds].sort().join(',') !== [...nextManagerIds].sort().join(',')) changes.push('reporting managers changed');
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

    const { userId, name, title = '', department = '', reportsTo = null, managerIds, role, color } = body;
    const nextManagerIds = normalizeManagerIds(managerIds, reportsTo);
    if (!userId || !name?.trim()) return json(res, 400, { error: 'userId and name are required.' });
    if (nextManagerIds.includes(userId)) return json(res, 400, { error: 'A person cannot report to themselves.' });
    if (role && !VALID_ROLES.has(role)) return json(res, 400, { error: 'Invalid role.' });
    if (role && !canManagePermissions(auth.profile)) return json(res, 403, { error: 'Only platform administrators can change platform roles.' });

    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (existingError || !existing) return json(res, 404, { error: 'User not found.' });

    const [
      { data: profiles = [], error: profilesError },
      { data: managerLinks = [], error: managerLinksError },
    ] = await Promise.all([
      supabase.from('profiles').select('id,reports_to'),
      supabase.from('profile_managers').select('employee_id,manager_id'),
    ]);
    if (profilesError || managerLinksError) return json(res, 500, { error: 'Could not validate org chart.' });
    const profileIds = new Set(profiles.map(profile => profile.id));
    if (nextManagerIds.some(managerId => !profileIds.has(managerId))) {
      return json(res, 400, { error: 'One or more reporting managers no longer exist.' });
    }
    if (wouldCreateCycle(profiles, managerLinks, userId, nextManagerIds)) {
      return json(res, 400, { error: 'That reporting line would create an org chart loop.' });
    }
    const previousManagerIds = [...new Set([
      existing.reports_to,
      ...managerLinks.filter(link => link.employee_id === userId).map(link => link.manager_id),
    ].filter(Boolean))];

    const nextRole = role || existing.role;
    const patch = {
      name: name.trim(),
      initials: initialsFor(name),
      title: title.trim(),
      department: department.trim(),
      role: nextRole,
      reports_to: nextManagerIds[0] || null,
      color: color || existing.color || '#ff7f02',
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select()
      .single();
    if (error) return json(res, 400, { error: error.message });

    try {
      const { error: clearManagersError } = await supabase
        .from('profile_managers')
        .delete()
        .eq('employee_id', userId);
      if (clearManagersError) throw clearManagersError;
      if (nextManagerIds.length > 0) {
        const { error: managerInsertError } = await supabase.from('profile_managers').insert(
          nextManagerIds.map(managerId => ({
            employee_id: userId,
            manager_id: managerId,
            created_by: auth.profile.id,
          })),
        );
        if (managerInsertError) throw managerInsertError;
      }
    } catch (managerError) {
      await supabase.from('profiles').update({
        name: existing.name,
        initials: existing.initials,
        title: existing.title,
        department: existing.department,
        role: existing.role,
        reports_to: existing.reports_to,
        color: existing.color,
      }).eq('id', userId);
      await supabase.from('profile_managers').delete().eq('employee_id', userId);
      if (previousManagerIds.length > 0) {
        await supabase.from('profile_managers').insert(
          previousManagerIds.map(managerId => ({
            employee_id: userId,
            manager_id: managerId,
            created_by: auth.profile.id,
          })),
        );
      }
      return json(res, 400, { error: managerError.message || 'Could not update reporting managers.' });
    }

    const note = buildOrgChartNote(existing, patch, auth.profile, previousManagerIds, nextManagerIds);
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
          manager_ids: previousManagerIds,
          role: existing.role || '',
          color: existing.color || '',
        }),
        new_value: JSON.stringify({
          name: patch.name || '',
          title: patch.title || '',
          department: patch.department || '',
          reports_to: patch.reports_to || null,
          manager_ids: nextManagerIds,
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

    return json(res, 200, { profile: { ...data, manager_ids: nextManagerIds } });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Could not update user.' });
  }
}
