import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

loadEnvFile('.env.release.local');
loadEnvFile('.env.local');
loadEnvFile('.vercel/.env.production.local');
loadEnvFile('.env.production.local');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const expectedOrigin = process.env.APP_BASE_URL || 'https://objectivetracker.net';
const checkEmail = process.env.SANDPRO_AUTH_REDIRECT_EMAIL || process.env.SANDPRO_MERCI_EMAIL || 'mjimenez@sandpro.com';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.generateLink({
  type: 'recovery',
  email: checkEmail,
});

if (error) {
  console.error(`Could not generate recovery link for auth redirect check: ${error.message}`);
  process.exit(1);
}

const actionLink = data?.properties?.action_link || data?.action_link || '';
const redirectTo = data?.properties?.redirect_to || '';

if (actionLink.includes('localhost') || redirectTo.includes('localhost')) {
  console.error(`Recovery link still points to localhost: ${redirectTo || actionLink}`);
  process.exit(1);
}

if (!actionLink.includes(encodeURIComponent(expectedOrigin)) && redirectTo !== expectedOrigin) {
  console.error(`Recovery link does not point to ${expectedOrigin}: ${redirectTo || actionLink}`);
  process.exit(1);
}

console.log(`Auth recovery redirect check passed: ${redirectTo || expectedOrigin}`);
