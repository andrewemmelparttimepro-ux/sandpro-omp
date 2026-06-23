import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMP_PASSWORD_ENV = 'SANDPRO_ONBOARD_TEMP_PASSWORD';
const REPORT_DIR = 'docs/onboarding';
const SANDPRO_DOMAIN = 'sandpro.com';
const PUBLIC_EMAIL_PAGES = [
  'https://sandpro.com/team/',
  'https://sandpro.com/',
  'https://sandpro.com/cp-warehouse-app/',
];

export const loadEnvFiles = (cwd = process.cwd(), files = [
  '.env.release.local',
  '.env.local',
  '.vercel/.env.production.local',
  '.env.production.local',
]) => {
  for (const filename of files) {
    const path = resolve(cwd, filename);
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

export const normalizeEmail = (email = '') => String(email).trim().toLowerCase();
export const isSandproEmail = (email = '') => normalizeEmail(email).endsWith(`@${SANDPRO_DOMAIN}`);

export const initialsFor = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'SP';
  return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase();
};

const slugPart = (value = '') => String(value)
  .trim()
  .toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9-]+/g, '')
  .replace(/-+/g, '-');

export const inferSandproEmail = (name = '') => {
  const parts = String(name).trim().split(/\s+/).map(slugPart).filter(Boolean);
  if (parts.length < 2) return '';
  return `${parts[0][0]}${parts.slice(1).join('')}@${SANDPRO_DOMAIN}`;
};

export const roleFromTitle = (title = '') => {
  const value = String(title).toLowerCase();
  if (/\b(ceo|president|vice president|vp|chief)\b/.test(value)) return 'executive';
  if (/\b(manager|director|lead|supervisor)\b/.test(value)) return 'manager';
  return 'contributor';
};

export const shouldResetAuthUser = (authUser = {}) => {
  const mustChange = authUser?.user_metadata?.must_change_password === true;
  return !authUser?.last_sign_in_at || mustChange;
};

export const resetReasonForAuthUser = (authUser = {}) => {
  if (!authUser?.last_sign_in_at) return 'no_prior_sign_in';
  if (authUser?.user_metadata?.must_change_password === true) return 'still_must_change_password';
  return '';
};

export const redactPerson = (person = {}) => ({
  name: person.name || '',
  email: normalizeEmail(person.email),
  title: person.title || '',
  department: person.department || '',
  role: person.role || 'contributor',
  reason: person.reason || undefined,
  emailSource: person.emailSource || undefined,
  lastSignInAt: person.lastSignInAt || undefined,
});

export const extractEmails = (text = '') => (
  String(text).match(/[A-Z0-9._%+-]+@sandpro\.com/gi) || []
).map(normalizeEmail);

export const collectPublicSandproEmails = async ({ fetchImpl = fetch, pages = PUBLIC_EMAIL_PAGES, timeoutMs = 6000 } = {}) => {
  const emails = new Set();
  const errors = [];
  for (const url of pages) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      const text = await response.text();
      for (const email of extractEmails(text)) emails.add(email);
    } catch (error) {
      errors.push({ url, error: error.message || 'fetch_failed' });
    } finally {
      clearTimeout(timeout);
    }
  }
  return { emails, errors };
};

export const buildEmployeeRoster = ({ profiles = [], placeholders = [], publicEmails = new Set(), allowInference = true } = {}) => {
  const skipped = [];
  const missingEmails = [];
  const inferredEmails = [];
  const byEmail = new Map();

  for (const profile of profiles) {
    const email = normalizeEmail(profile.email);
    if (!isSandproEmail(email)) {
      skipped.push({ name: profile.name || '', email, reason: 'non_sandpro_account' });
      continue;
    }
    byEmail.set(email, {
      source: 'profile',
      id: profile.id,
      name: profile.name || '',
      email,
      emailSource: publicEmails.has(email) ? 'production_profile_public_verified' : 'production_profile',
      title: profile.title || '',
      department: profile.department || '',
      role: profile.role || roleFromTitle(profile.title),
      reports_to: profile.reports_to || null,
      color: profile.color || '#ff7f02',
    });
  }

  for (const placeholder of placeholders) {
    const inferred = allowInference ? inferSandproEmail(placeholder.name) : '';
    if (!inferred) {
      missingEmails.push({ name: placeholder.name || '', title: placeholder.title || '', department: placeholder.department || '', reason: 'no_email_available' });
      continue;
    }
    if (byEmail.has(inferred)) continue;
    const emailSource = publicEmails.has(inferred) ? 'sandpro_public' : 'inferred_pattern';
    if (emailSource === 'inferred_pattern') {
      inferredEmails.push({ name: placeholder.name || '', email: inferred, title: placeholder.title || '', department: placeholder.department || '' });
    }
    byEmail.set(inferred, {
      source: 'placeholder',
      id: placeholder.id,
      name: placeholder.name || '',
      email: inferred,
      emailSource,
      title: placeholder.title || '',
      department: placeholder.department || '',
      role: roleFromTitle(placeholder.title),
      reports_to: placeholder.reports_to || null,
      color: placeholder.color || '#ff7f02',
    });
  }

  return {
    roster: [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name)),
    skipped,
    missingEmails,
    inferredEmails,
  };
};

const listAllAuthUsers = async (supabase) => {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  return users;
};

const profilePatchFor = (employee, userId) => ({
  id: userId,
  email: normalizeEmail(employee.email),
  name: employee.name.trim(),
  initials: initialsFor(employee.name),
  title: employee.title || '',
  department: employee.department || '',
  role: employee.role || 'contributor',
  reports_to: employee.reports_to || null,
  color: employee.color || '#ff7f02',
});

const metadataFor = (employee, authUser = {}) => ({
  ...(authUser.user_metadata || {}),
  name: employee.name.trim(),
  initials: initialsFor(employee.name),
  title: employee.title || '',
  department: employee.department || '',
  role: employee.role || 'contributor',
  color: employee.color || '#ff7f02',
  must_change_password: true,
});

const writeReport = (report, cwd = process.cwd()) => {
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const mode = report.apply ? 'apply' : 'dry-run';
  const dir = resolve(cwd, REPORT_DIR);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `sandpro-org-onboarding-${stamp}-${mode}.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
};

export const buildSummary = (report) => ({
  mode: report.apply ? 'apply' : 'dry-run',
  targetEmployees: report.targetEmployees.length,
  created: report.created.length,
  reset: report.reset.length,
  preservedActive: report.preservedActive.length,
  inferredEmails: report.inferredEmails.length,
  missingEmails: report.missingEmails.length,
  skipped: report.skipped.length,
  errors: report.errors.length,
});

export const runOnboarding = async ({
  supabase,
  apply = false,
  tempPassword = '',
  fetchImpl = fetch,
  cwd = process.cwd(),
} = {}) => {
  if (!supabase) throw new Error('Supabase admin client is required.');
  if (apply && !tempPassword) throw new Error(`${TEMP_PASSWORD_ENV} is required when using --apply.`);

  const generatedAt = new Date().toISOString();
  const [
    { data: profiles = [], error: profilesError },
    { data: placeholders = [], error: placeholdersError },
    authUsers,
    publicEmailResult,
  ] = await Promise.all([
    supabase.from('profiles').select('id,name,email,title,department,role,reports_to,color').order('name'),
    supabase.from('org_chart_placeholders').select('id,name,title,department,reports_to,color').order('name'),
    listAllAuthUsers(supabase),
    collectPublicSandproEmails({ fetchImpl }),
  ]);

  if (profilesError) throw profilesError;
  if (placeholdersError) throw placeholdersError;

  const { roster, skipped, missingEmails, inferredEmails } = buildEmployeeRoster({
    profiles,
    placeholders,
    publicEmails: publicEmailResult.emails,
    allowInference: true,
  });
  const authByEmail = new Map(authUsers.map(user => [normalizeEmail(user.email), user]));

  const report = {
    generatedAt,
    apply,
    scope: 'real_sandpro_org_chart_employees',
    targetEmployees: roster.map(redactPerson),
    publicEmailFetchErrors: publicEmailResult.errors,
    created: [],
    reset: [],
    preservedActive: [],
    skipped,
    inferredEmails,
    missingEmails,
    errors: [],
  };

  for (const employee of roster) {
    const authUser = authByEmail.get(normalizeEmail(employee.email));
    try {
      if (!authUser) {
        report.created.push(redactPerson({ ...employee, reason: 'missing_auth_user' }));
        if (apply) {
          const { data, error } = await supabase.auth.admin.createUser({
            email: employee.email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: metadataFor(employee),
          });
          if (error) throw error;
          const { error: upsertError } = await supabase.from('profiles').upsert(profilePatchFor(employee, data.user.id));
          if (upsertError) throw upsertError;
        }
        continue;
      }

      if (shouldResetAuthUser(authUser)) {
        const reason = resetReasonForAuthUser(authUser);
        report.reset.push(redactPerson({
          ...employee,
          reason,
          lastSignInAt: authUser.last_sign_in_at || undefined,
        }));
        if (apply) {
          const { error: authError } = await supabase.auth.admin.updateUserById(authUser.id, {
            password: tempPassword,
            email_confirm: true,
            user_metadata: metadataFor(employee, authUser),
          });
          if (authError) throw authError;
          const { error: upsertError } = await supabase.from('profiles').upsert(profilePatchFor(employee, authUser.id));
          if (upsertError) throw upsertError;
        }
        continue;
      }

      report.preservedActive.push(redactPerson({
        ...employee,
        reason: 'active_prior_sign_in',
        lastSignInAt: authUser.last_sign_in_at || undefined,
      }));
    } catch (error) {
      report.errors.push({
        name: employee.name,
        email: employee.email,
        error: error.message || 'onboarding_failed',
      });
    }
  }

  const reportPath = writeReport(report, cwd);
  return { report, reportPath, summary: buildSummary(report) };
};

const main = async () => {
  loadEnvFiles();
  const apply = process.argv.includes('--apply');
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { reportPath, summary } = await runOnboarding({
    supabase,
    apply,
    tempPassword: process.env[TEMP_PASSWORD_ENV] || '',
  });

  console.log(JSON.stringify({ summary, reportPath }, null, 2));
  if (!apply) console.log('Dry-run only. Re-run with --apply and SANDPRO_ONBOARD_TEMP_PASSWORD set to make changes.');
  if (summary.errors > 0 || summary.missingEmails > 0) process.exitCode = 1;
};

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
