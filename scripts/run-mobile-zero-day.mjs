import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for mobile zero-day QA.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const createQaUser = async () => {
  const token = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const email = `mobile-zero-day+${token}@objectivetracker.net`;
  const password = `${randomBytes(16).toString('base64url')}Aa1!`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: 'Mobile Zero-Day QA',
      initials: 'MQ',
      title: 'Mobile Release Validator',
      department: 'Admin',
      role: 'executive',
      color: '#ff7f02',
      must_change_password: false,
    },
  });
  if (error) throw new Error(`Could not create mobile QA user: ${error.message}`);

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
  throw new Error('Mobile QA profile was not created by the auth trigger.');
};

const deleteQaUser = async (user) => {
  if (!user?.id) return;
  await supabase.from('profiles').delete().eq('id', user.id);
  const { error } = await supabase.auth.admin.deleteUser(user.id);
  if (error) console.error(`Could not delete mobile QA user ${user.email}: ${error.message}`);
};

let qaUser;
let status = 1;

try {
  qaUser = await createQaUser();
  console.log(`Created temporary mobile QA user: ${qaUser.email}`);
  const result = spawnSync(
    'npx',
    ['playwright', 'test', 'tests/mobile-crop.spec.js', '--project=mobile-chrome', '--workers=1'],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        SANDPRO_E2E_EMAIL: qaUser.email,
        SANDPRO_E2E_PASSWORD: qaUser.password,
        FORCE_COLOR: '0',
      },
    },
  );
  status = result.status ?? 1;
} catch (error) {
  console.error(error.message);
} finally {
  await deleteQaUser(qaUser);
  if (qaUser) console.log(`Cleaned temporary mobile QA user: ${qaUser.email}`);
}

process.exit(status);
