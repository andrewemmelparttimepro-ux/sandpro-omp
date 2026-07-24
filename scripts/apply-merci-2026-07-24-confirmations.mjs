import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const listAuthUsers = async (supabase) => {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...(data?.users || []));
    if ((data?.users || []).length < 1000) return users;
  }
};

const countRows = async (supabase, table, column, userId) => {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, userId);
  if (error) throw error;
  return count || 0;
};

const collectKeithBlockingWork = async (supabase, userId) => {
  const { count: objectiveCount, error: objectiveError } = await supabase
    .from('objectives')
    .select('id', { count: 'exact', head: true })
    .or(`owner_id.eq.${userId},created_by.eq.${userId},delegated_by.eq.${userId}`);
  if (objectiveError) throw objectiveError;
  const checks = await Promise.all([
    Promise.resolve(['objectives', objectiveCount || 0]),
    countRows(supabase, 'subtasks', 'owner_id', userId).then(count => ['subtasks', count]),
    countRows(supabase, 'messages', 'user_id', userId).then(count => ['messages', count]),
    countRows(supabase, 'fix_it_posts', 'created_by', userId).then(count => ['Fix-It Feed posts', count]),
  ]);
  return Object.fromEntries(checks);
};

loadEnvFiles();
const apply = process.argv.includes('--apply');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('Supabase URL and service role key are required.');

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const generatedAt = new Date().toISOString();
const authUsers = await listAuthUsers(supabase);
const inferredUsers = authUsers.filter(user => user.user_metadata?.identity_source === 'inferred_company_pattern');
const keith = authUsers.find(user => String(user.email || '').toLowerCase() === 'kmappes@sandpro.com') || null;
const keithBlockingWork = keith ? await collectKeithBlockingWork(supabase, keith.id) : {};
const blockingKeithRows = Object.entries(keithBlockingWork).filter(([, count]) => count > 0);

const report = {
  generatedAt,
  apply,
  decisionSource: 'Merci OMP Confirmation Checklist 2026-07-24',
  identities: {
    found: inferredUsers.length,
    needsConfirmation: inferredUsers.filter(user => user.user_metadata?.identity_status === 'needs_confirmation').length,
    alreadyConfirmed: inferredUsers.filter(user => user.user_metadata?.identity_status === 'confirmed').length,
    emailPolicy: 'disabled until onboarding; daily email remains limited to Andrew, Jake, Merci, and Tim',
  },
  keith: {
    found: Boolean(keith),
    id: keith?.id || null,
    email: keith?.email || null,
    lastSignInAt: keith?.last_sign_in_at || null,
    blockingWork: keithBlockingWork,
  },
  actions: [],
  errors: [],
};

if (apply) {
  if (inferredUsers.length !== 64) {
    throw new Error(`Expected 64 inferred identities before confirmation; found ${inferredUsers.length}.`);
  }
  if (blockingKeithRows.length > 0) {
    throw new Error(`Keith still has blocking work: ${blockingKeithRows.map(([label, count]) => `${count} ${label}`).join(', ')}.`);
  }

  for (const user of inferredUsers) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata || {}),
        identity_status: 'confirmed',
        identity_confirmed_at: generatedAt,
        identity_confirmation_source: 'Merci OMP Confirmation Checklist 2026-07-24',
      },
    });
    if (error) {
      report.errors.push({ email: user.email, action: 'confirm identity', error: error.message });
      continue;
    }
    const { error: preferenceError } = await supabase.from('notification_preferences').upsert({
      user_id: user.id,
      email_enabled: false,
      in_app_enabled: true,
      push_enabled: false,
      digest_frequency: 'daily',
      updated_at: generatedAt,
    });
    if (preferenceError) {
      report.errors.push({ email: user.email, action: 'preserve pilot notification policy', error: preferenceError.message });
      continue;
    }
    report.actions.push({ email: user.email, action: 'identity confirmed; pilot email and push remain disabled until onboarding' });
  }

  if (keith) {
    const cleanupSteps = [
      supabase.from('profiles').update({ reports_to: null }).eq('reports_to', keith.id),
      supabase.from('email_delivery_log').update({ user_id: null }).eq('user_id', keith.id),
      supabase.from('push_delivery_log').update({ user_id: null }).eq('user_id', keith.id),
      supabase.from('notifications').delete().eq('user_id', keith.id),
    ];
    for (const step of cleanupSteps) {
      const { error } = await step;
      if (error) throw error;
    }
    const { error: deleteError } = await supabase.auth.admin.deleteUser(keith.id);
    if (deleteError) throw deleteError;
    report.actions.push({ email: keith.email, action: 'auth user and cascading employee profile deleted' });
  }
}

const outputDir = resolve(process.cwd(), 'docs/onboarding');
mkdirSync(outputDir, { recursive: true });
const outputPath = resolve(outputDir, `merci-final-confirmations-${generatedAt.replace(/[:.]/g, '-')}-${apply ? 'apply' : 'dry-run'}.json`);
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  inferredIdentities: report.identities.found,
  needsConfirmation: report.identities.needsConfirmation,
  keithFound: report.keith.found,
  keithBlockingWork,
  actions: report.actions.length,
  errors: report.errors.length,
  outputPath,
}, null, 2));
if (report.errors.length) process.exitCode = 1;
