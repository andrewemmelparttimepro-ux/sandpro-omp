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

const mode = process.argv[2] || 'all';

const requiredByMode = {
  prod: [
    'SANDPRO_SMOKE_ADMIN_EMAIL',
    'SANDPRO_SMOKE_ADMIN_PASSWORD',
    'SANDPRO_SMOKE_MEMBER_EMAIL',
    'SANDPRO_SMOKE_MEMBER_PASSWORD',
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
  ],
  staging: [
    'SANDPRO_STAGING_BASE_URL',
    'SANDPRO_E2E_EMAIL',
    'SANDPRO_E2E_PASSWORD',
    'SANDPRO_E2E_ALLOW_MUTATION',
  ],
  email: [
    'RESEND_API_KEY',
    'EMAIL_FROM',
    ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
    'SUPABASE_SERVICE_ROLE_KEY',
    'CRON_SECRET',
  ],
  push: [
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
    ['SUPABASE_URL', 'VITE_SUPABASE_URL'],
    'SUPABASE_SERVICE_ROLE_KEY',
  ],
  agent: [
    'OPENAI_API_KEY',
    'AGENT_FEATURE_ENABLED',
    'AGENT_WEB_SEARCH_ENABLED',
    'VITE_AGENT_FEATURE_ENABLED',
  ],
};

const required = mode === 'all'
  ? [...requiredByMode.prod, ...requiredByMode.staging, ...requiredByMode.email]
  : requiredByMode[mode] || [];

const missing = required.filter((key) => {
  if (Array.isArray(key)) return key.every((option) => !process.env[option]);
  if (key === 'SANDPRO_E2E_ALLOW_MUTATION') return process.env[key] !== '1';
  return !process.env[key];
});

if (missing.length > 0) {
  console.error(`Missing release environment for ${mode}:`);
  for (const key of missing) {
    if (Array.isArray(key)) console.error(`- one of: ${key.join(', ')}`);
    else console.error(`- ${key}${key === 'SANDPRO_E2E_ALLOW_MUTATION' ? '=1' : ''}`);
  }
  process.exit(1);
}

console.log(`Release environment check passed for ${mode}.`);
