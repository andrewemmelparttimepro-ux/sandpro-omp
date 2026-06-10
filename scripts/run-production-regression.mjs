import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const loadEnvFile = (filename) => {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [rawKey, ...rest] = trimmed.split('=');
    const key = rawKey.trim();
    const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '').replace(/\\n/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
};

for (const filename of ['.env.release.local', '.env.local', '.vercel/.env.production.local', '.env.production.local']) {
  loadEnvFile(filename);
}

if (process.env.SANDPRO_PROD_QA_MUTATION !== '1') {
  console.error('Set SANDPRO_PROD_QA_MUTATION=1 to run temporary production QA regression checks.');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const baseUrl = process.env.SANDPRO_BASE_URL || process.env.SANDPRO_SMOKE_BASE_URL || 'https://objectivetracker.net';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const objectivePrefixes = [
  'E2E Audit Objective',
  'Release Gate Objective',
  'Release Gate Mobile',
  'Objective Assistant E2E',
  'Mention Notification Objective',
  'Merci feedback smoke',
];
const fixItPrefixes = [
  'Fix-It QA Archive Workflow',
  'Fix-It QA Comment Thread',
];
const ncrPrefixes = [
  'QA-CLOSE-',
  'QA-OBJ-',
];

const removeGeneratedObjectives = async () => {
  for (const prefix of objectivePrefixes) {
    const { data: objectives = [], error } = await supabase
      .from('objectives')
      .select('id,title')
      .ilike('title', `${prefix}%`);

    if (error) {
      console.error(`Could not list cleanup objectives for ${prefix}: ${error.message}`);
      continue;
    }

    for (const objective of objectives) {
      const { data: files = [] } = await supabase
        .from('files')
        .select('storage_path')
        .eq('objective_id', objective.id);
      const storagePaths = files.map((file) => file.storage_path).filter(Boolean);
      if (storagePaths.length) {
        await supabase.storage.from('objective-files').remove(storagePaths);
      }
      const { error: deleteError } = await supabase
        .from('objectives')
        .delete()
        .eq('id', objective.id);
      if (deleteError) {
        console.error(`Could not delete ${objective.title}: ${deleteError.message}`);
      } else {
        console.log(`Cleaned objective: ${objective.title}`);
      }
    }
  }
};

const removeGeneratedFixItPosts = async () => {
  for (const prefix of fixItPrefixes) {
    const { data: posts = [], error } = await supabase
      .from('fix_it_posts')
      .select('id,body')
      .ilike('body', `${prefix}%`);

    if (error) {
      console.error(`Could not list cleanup Fix-It posts for ${prefix}: ${error.message}`);
      continue;
    }

    for (const post of posts) {
      const { data: files = [] } = await supabase
        .from('fix_it_attachments')
        .select('storage_path')
        .eq('post_id', post.id);
      const storagePaths = files.map((file) => file.storage_path).filter(Boolean);
      if (storagePaths.length) {
        await supabase.storage.from('fix-it-files').remove(storagePaths);
      }
      const { error: deleteError } = await supabase
        .from('fix_it_posts')
        .delete()
        .eq('id', post.id);
      if (deleteError) {
        console.error(`Could not delete Fix-It post ${post.id}: ${deleteError.message}`);
      } else {
        console.log(`Cleaned Fix-It post: ${post.body}`);
      }
    }
  }
};

const removeGeneratedNcrReports = async () => {
  for (const prefix of ncrPrefixes) {
    const { data: reports = [], error } = await supabase
      .from('ncr_reports')
      .select('id,report_number')
      .ilike('report_number', `${prefix}%`);

    if (error) {
      console.error(`Could not list cleanup NCR reports for ${prefix}: ${error.message}`);
      continue;
    }

    for (const report of reports) {
      const { error: deleteError } = await supabase
        .from('ncr_reports')
        .delete()
        .eq('id', report.id);
      if (deleteError) {
        console.error(`Could not delete NCR report ${report.report_number}: ${deleteError.message}`);
      } else {
        console.log(`Cleaned NCR report: ${report.report_number}`);
      }
    }
  }
};

const createQaUser = async ({ name = 'Production QA', initials = 'QA', title = 'Release Validator' } = {}) => {
  const token = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const email = `qa+${token}@objectivetracker.net`;
  const password = `${randomBytes(16).toString('base64url')}Aa1!`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      initials,
      title,
      department: 'Admin',
      role: 'executive',
      color: '#ff7f02',
      must_change_password: false,
    },
  });

  if (error) throw new Error(`Could not create QA user: ${error.message}`);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id,role')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profile) {
      if (profile.role !== 'executive') {
        await supabase.from('profiles').update({ role: 'executive' }).eq('id', data.user.id);
      }
      return { id: data.user.id, email, password };
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }

  throw new Error('QA profile was not created by the auth trigger.');
};

const deleteQaUser = async (user) => {
  if (!user?.id) return;
  await supabase.from('profiles').delete().eq('id', user.id);
  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) {
    console.error(`Could not delete QA user ${user.email}: ${error.message}`);
  } else {
    console.log(`Cleaned QA user: ${user.email}`);
  }
};

let qaUser;
let mentionUser;
let testStatus = 1;

try {
  await removeGeneratedObjectives();
  await removeGeneratedFixItPosts();
  await removeGeneratedNcrReports();
  await supabase.from('profiles').delete().ilike('email', 'qa+%@objectivetracker.net');
  await supabase.from('profiles').delete().ilike('email', 'merci-feedback-%@ndai.pro');
  qaUser = await createQaUser();
  mentionUser = await createQaUser({ name: 'Mention QA', initials: 'MQ', title: 'Release Notification Receiver' });
  console.log(`Created temporary QA user: ${qaUser.email}`);
  console.log(`Created temporary mention QA user: ${mentionUser.email}`);

  const specs = [
    'tests/navigation-filters.spec.js',
    'tests/mutating-workflows.spec.js',
    'tests/release-workflows.spec.js',
    'tests/mention-notifications.spec.js',
    'tests/fix-it-workflow.spec.js',
    'tests/fix-it-comments.spec.js',
    'tests/ncr-tracker.spec.js',
    'tests/auth-recovery.spec.js',
  ];
  if (process.env.SANDPRO_PROD_QA_AGENT === '1') specs.push('tests/agent-starter.spec.js');

  const result = spawnSync(
    'npx',
    [
      'playwright',
      'test',
      ...specs,
      '--project=chromium',
      '--workers=1',
    ],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        SANDPRO_BASE_URL: baseUrl,
        SANDPRO_E2E_EMAIL: qaUser.email,
        SANDPRO_E2E_PASSWORD: qaUser.password,
        SANDPRO_E2E_MENTION_EMAIL: mentionUser.email,
        SANDPRO_E2E_MENTION_PASSWORD: mentionUser.password,
        SANDPRO_E2E_MENTION_NAME: 'Mention QA',
        SANDPRO_E2E_ALLOW_MUTATION: '1',
        FORCE_COLOR: '0',
      },
    },
  );
  testStatus = result.status ?? 1;
} catch (error) {
  console.error(error.message);
} finally {
  await removeGeneratedObjectives();
  await removeGeneratedFixItPosts();
  await removeGeneratedNcrReports();
  await deleteQaUser(qaUser);
  await deleteQaUser(mentionUser);
}

process.exit(testStatus);
