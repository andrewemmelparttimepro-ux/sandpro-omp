import { createClient } from '@supabase/supabase-js';
import readXlsxFile from 'read-excel-file/node';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const loadEnvFiles = (files = ['.env.release.local', '.env.local', '.vercel/.env.production.local', '.env.production.local']) => {
  for (const filename of files) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [rawKey, ...rest] = trimmed.split('=');
      const key = rawKey.trim();
      const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '').replace(/\\n/g, '');
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
};

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const workbookArg = args.find((arg, index) => args[index - 1] === '--workbook');
const workbookPath = resolve(workbookArg || '/Users/andrewemmel/Downloads/SandPro OMP-Org Chart 7.22.2026_Rev2.xlsx');
const normalizedName = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const initialsFor = name => String(name || '').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'SP';
const inferEmail = name => {
  const parts = String(name || '').trim().toLowerCase().split(/\s+/)
    .map(part => part.normalize('NFKD').replace(/[^\w-]/g, '').replace(/_/g, ''))
    .filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}${parts.slice(1).join('')}@sandpro.com` : '';
};
const roleFromTitle = title => {
  const value = String(title || '').toLowerCase();
  if (/\b(ceo|president|vice president|vp|chief|cto)\b/.test(value)) return 'executive';
  if (/\b(manager|director|lead|supervisor)\b/.test(value)) return 'manager';
  return 'contributor';
};
const PLATFORM_ADMIN_EMAILS = new Set(['mjimenez@sandpro.com']);
const authorizationRoleFor = (email, title) => (
  PLATFORM_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase())
    ? 'executive'
    : roleFromTitle(title)
);

const GROUP_MEMBERS = {
  dispatch: ['Dustin Saunders', 'Gershom Dingal', 'Luke Feil', 'Shawn Cockrell'],
  'field-service-managers': ['Isaac Badillo', 'Zedek Harris'],
  trainers: ['Bryce Christoffersen', 'Brad Beck'],
  'sales-team': ['John Sommerfeld', 'Jon Ostby', 'Brandon Schatz', 'Josh Pfeifer', 'Joshua Blackaby'],
  'cp-shop-leads': ['Kelby Kraft', 'Eric Macy', 'Tim Dibben'],
  'flowback-shop-leads': ['Matthew Bornschein', 'Jaelen Maslowski', 'Tim Dibben'],
  'wellhead-shop-leads': ['Thomas Goldsberry', 'Jeramiah Walls', 'Jaelen Maslowski', 'Tim Dibben'],
  'leadership-business-team': ['Jake Feil', 'Joshua Blackaby', 'Andrew Emmel', 'Tim Dibben', 'Kelby Kraft', 'Drew Anderson', 'Malcolm Blackaby', 'Mark Elliott', 'Kayla Sebastian', 'Heather Allard-Kotaska', 'Adam Allan', 'Jaelen Maslowski'],
};

const managerNames = value => String(value || '').split('/').map(name => name.trim()).filter(Boolean);

const listAuthUsers = async supabase => {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...(data?.users || []));
    if ((data?.users || []).length < 1000) break;
  }
  return users;
};

const readRoster = async () => {
  const workbook = await readXlsxFile(workbookPath, { sheet: 'Employee Database' });
  const rows = Array.isArray(workbook?.[0])
    ? workbook
    : workbook.find(sheet => sheet?.sheet === 'Employee Database')?.data || [];
  if (rows.length < 2) throw new Error('Employee Database sheet has no roster rows.');
  const headers = rows[0].map(value => normalizedName(value));
  const index = label => headers.indexOf(normalizedName(label));
  const positions = {
    name: index('Full Name'),
    title: index('Position'),
    reportsTo: index('Reports To'),
    department: index('Department/Area'),
  };
  if (Object.values(positions).some(position => position < 0)) {
    throw new Error(`Roster headers are incomplete: ${JSON.stringify(headers)}`);
  }
  return rows.slice(1).map(row => ({
    name: String(row[positions.name] || '').trim(),
    title: String(row[positions.title] || '').trim(),
    reportsToName: String(row[positions.reportsTo] || '').trim(),
    department: String(row[positions.department] || '').trim(),
  })).filter(row => row.name);
};

loadEnvFiles();
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('Supabase URL and service role key are required.');
if (!existsSync(workbookPath)) throw new Error(`Workbook not found: ${workbookPath}`);

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const roster = await readRoster();
const duplicateNames = roster.filter((row, index) => roster.findIndex(other => normalizedName(other.name) === normalizedName(row.name)) !== index);
if (duplicateNames.length) throw new Error(`Duplicate roster names: ${duplicateNames.map(row => row.name).join(', ')}`);

const [
  { data: profiles = [], error: profileError },
  authUsers,
  { data: groups = [], error: groupError },
] = await Promise.all([
  supabase.from('profiles').select('id,name,email,title,department,role,reports_to,color').order('name'),
  listAuthUsers(supabase),
  supabase.from('assignment_groups').select('id,name,slug').order('name'),
]);
if (profileError) throw profileError;
if (groupError) throw groupError;

const profilesByName = new Map(profiles.map(profile => [normalizedName(profile.name), profile]));
const authById = new Map(authUsers.map(user => [user.id, user]));
const authByEmail = new Map(authUsers.map(user => [String(user.email || '').toLowerCase(), user]));
const idByRosterName = new Map();
const report = {
  generatedAt: new Date().toISOString(),
  apply,
  workbook: basename(workbookPath),
  rosterRows: roster.length,
  created: [],
  updated: [],
  inferredIdentities: [],
  preservedCredentials: [],
  managerAssumptions: [],
  groupMemberships: [],
  extraExistingProfiles: [],
  errors: [],
};

for (const employee of roster) {
  const nameKey = normalizedName(employee.name);
  const existingProfile = profilesByName.get(nameKey);
  const existingAuth = existingProfile ? authById.get(existingProfile.id) : null;
  const email = existingProfile?.email || inferEmail(employee.name);
  if (!email) {
    report.errors.push({ name: employee.name, error: 'Could not infer email.' });
    continue;
  }
  const emailOwner = authByEmail.get(email.toLowerCase());
  if (!existingProfile && emailOwner) {
    report.errors.push({ name: employee.name, email, error: `Email already belongs to auth user ${emailOwner.id}.` });
    continue;
  }
  const role = authorizationRoleFor(email, employee.title);
  let userId = existingProfile?.id || null;
  try {
    if (!existingProfile) {
      report.created.push({ name: employee.name, email, title: employee.title, department: employee.department });
      report.inferredIdentities.push({ name: employee.name, email });
      if (!apply) userId = `dry-run:${nameKey}`;
      if (apply) {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password: randomBytes(32).toString('base64url'),
          email_confirm: true,
          user_metadata: {
            name: employee.name,
            initials: initialsFor(employee.name),
            title: employee.title,
            department: employee.department,
            role,
            must_change_password: true,
            identity_source: 'inferred_company_pattern',
            identity_status: 'needs_confirmation',
          },
        });
        if (error) throw error;
        userId = data.user.id;
        const { error: upsertError } = await supabase.from('profiles').upsert({
          id: userId,
          email,
          name: employee.name,
          initials: initialsFor(employee.name),
          title: employee.title,
          department: employee.department,
          role,
          reports_to: null,
          color: '#ff7f02',
        });
        if (upsertError) throw upsertError;
        const { error: prefsError } = await supabase.from('notification_preferences').upsert({
          user_id: userId,
          email_enabled: false,
          in_app_enabled: true,
          push_enabled: false,
          digest_frequency: 'daily',
          updated_at: new Date().toISOString(),
        });
        if (prefsError) throw prefsError;
      }
    } else {
      report.updated.push({ name: employee.name, email: existingProfile.email, title: employee.title, department: employee.department, role });
      if (existingAuth) {
        report.preservedCredentials.push({ name: employee.name, email: existingProfile.email, lastSignInAt: existingAuth.last_sign_in_at || null });
      }
      if (apply) {
        const { error: updateError } = await supabase.from('profiles').update({
          name: employee.name,
          initials: initialsFor(employee.name),
          title: employee.title,
          department: employee.department,
          role,
        }).eq('id', existingProfile.id);
        if (updateError) throw updateError;
        if (existingAuth) {
          const { error: authError } = await supabase.auth.admin.updateUserById(existingAuth.id, {
            user_metadata: {
              ...(existingAuth.user_metadata || {}),
              name: employee.name,
              initials: initialsFor(employee.name),
              title: employee.title,
              department: employee.department,
              role,
            },
          });
          if (authError) throw authError;
        }
      }
    }
    if (userId) idByRosterName.set(nameKey, userId);
    else if (existingProfile?.id) idByRosterName.set(nameKey, existingProfile.id);
    if (employee.reportsToName.includes('/')) {
      report.managerAssumptions.push({
        name: employee.name,
        workbookValue: employee.reportsToName,
        equalRankManagers: managerNames(employee.reportsToName),
      });
    }
  } catch (error) {
    report.errors.push({ name: employee.name, email, error: error.message || String(error) });
  }
}

for (const employee of roster) {
  const userId = idByRosterName.get(normalizedName(employee.name));
  if (!userId) continue;
  const employeeManagerNames = managerNames(employee.reportsToName);
  const managerIds = employeeManagerNames
    .map(name => idByRosterName.get(normalizedName(name)) || null);
  const missingManagerIndex = managerIds.findIndex(id => !id);
  if (missingManagerIndex >= 0) {
    report.errors.push({ name: employee.name, error: `Manager not found: ${employeeManagerNames[missingManagerIndex]}` });
    continue;
  }
  if (apply) {
    const { error } = await supabase.from('profiles').update({ reports_to: managerIds[0] || null }).eq('id', userId);
    if (error) report.errors.push({ name: employee.name, error: error.message });
    const { error: clearManagerError } = await supabase.from('profile_managers').delete().eq('employee_id', userId);
    if (clearManagerError) {
      report.errors.push({ name: employee.name, error: clearManagerError.message });
      continue;
    }
    if (managerIds.length > 0) {
      const { error: managerError } = await supabase.from('profile_managers').insert(
        managerIds.map(managerId => ({ employee_id: userId, manager_id: managerId, created_by: null })),
      );
      if (managerError) report.errors.push({ name: employee.name, error: managerError.message });
    }
  }
}

const groupsBySlug = new Map(groups.map(group => [group.slug, group]));
for (const [slug, names] of Object.entries(GROUP_MEMBERS)) {
  const group = groupsBySlug.get(slug);
  if (!group) {
    report.errors.push({ group: slug, error: 'Assignment group not found.' });
    continue;
  }
  if (apply) {
    const { error: clearGroupError } = await supabase
      .from('assignment_group_members')
      .delete()
      .eq('group_id', group.id);
    if (clearGroupError) {
      report.errors.push({ group: group.name, error: clearGroupError.message });
      continue;
    }
  }
  for (const name of names) {
    const userId = idByRosterName.get(normalizedName(name));
    if (!userId) {
      report.errors.push({ group: group.name, name, error: 'Roster profile not found.' });
      continue;
    }
    report.groupMemberships.push({ group: group.name, name });
    if (apply) {
      const { error } = await supabase.from('assignment_group_members').upsert({
        group_id: group.id,
        user_id: userId,
        created_by: null,
      }, { onConflict: 'group_id,user_id' });
      if (error) report.errors.push({ group: group.name, name, error: error.message });
    }
  }
}

const rosterNames = new Set(roster.map(employee => normalizedName(employee.name)));
report.extraExistingProfiles = profiles
  .filter(profile => String(profile.email || '').toLowerCase().endsWith('@sandpro.com') && !rosterNames.has(normalizedName(profile.name)))
  .map(profile => ({ name: profile.name, email: profile.email, title: profile.title }));

const outputDir = resolve(process.cwd(), 'docs/onboarding');
mkdirSync(outputDir, { recursive: true });
const stamp = report.generatedAt.replace(/[:.]/g, '-');
const outputPath = resolve(outputDir, `sandpro-roster-workbook-sync-${stamp}-${apply ? 'apply' : 'dry-run'}.json`);
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  rosterRows: report.rosterRows,
  created: report.created.length,
  updated: report.updated.length,
  inferredIdentities: report.inferredIdentities.length,
  groupMemberships: report.groupMemberships.length,
  managerAssumptions: report.managerAssumptions.length,
  extraExistingProfiles: report.extraExistingProfiles.length,
  errors: report.errors.length,
  outputPath,
}, null, 2));
if (report.errors.length) process.exitCode = 1;
