import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { isAuthorizedCronRequest } from '../../api/_shared/cronAuth.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('profile privilege escalation is closed at grants and RLS', () => {
  const migration = read('supabase/migrations/20260819122929_sandpro_hardening_and_fixit_retirement.sql');
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*public\.profiles FROM authenticated/);
  assert.match(migration, /GRANT UPDATE \(avatar_url\) ON TABLE public\.profiles TO authenticated/);
  assert.match(migration, /CREATE POLICY "Users can update own avatar"[\s\S]*WITH CHECK \(\(SELECT auth\.uid\(\)\) = id\)/);
  assert.doesNotMatch(migration, /GRANT UPDATE \([^)]*role/);
});

test('Fix-It history is preserved but browser, storage, and realtime access are retired', () => {
  const migration = read('supabase/migrations/20260819122929_sandpro_hardening_and_fixit_retirement.sql');
  for (const table of ['fix_it_posts', 'fix_it_comments', 'fix_it_attachments']) {
    assert.match(migration, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated`));
    assert.match(migration, new RegExp(`ALTER PUBLICATION supabase_realtime DROP TABLE public\\.${table}`));
    assert.doesNotMatch(migration, new RegExp(`(?:^|\\n)DROP TABLE(?: IF EXISTS)? public\\.${table}`));
  }
  assert.match(migration, /DROP POLICY IF EXISTS "Moderators read Fix-It file objects"/);
});

test('compute-backed APIs are rate limited and privileged AI actions are authorized', () => {
  const migration = read('supabase/migrations/20260819122929_sandpro_hardening_and_fixit_retirement.sql');
  const starter = read('api/agent/objective-starter.js');
  const translate = read('api/messages/translate.js');
  const voice = read('api/voice/transcribe.js');
  const ncr = read('api/ncr/analytics-ai.js');
  const runtime = read('api/agent/_runtime.js');
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.consume_api_rate_limit/);
  assert.match(migration, /pg_advisory_xact_lock/);
  for (const source of [starter, translate, voice, ncr, runtime]) assert.match(source, /rateLimitUser/);
  assert.match(starter, /canPrepareObjective/);
  assert.match(starter, /OBJECTIVE_ASSISTANT_PILOT_EMAILS/);
  assert.match(ncr, /\['executive', 'manager'\]/);
});

test('cron authentication accepts only a constant-time bearer match', () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'unit-test-cron-secret';
  try {
    assert.equal(isAuthorizedCronRequest({ headers: { authorization: 'Bearer unit-test-cron-secret' }, query: {} }), true);
    assert.equal(isAuthorizedCronRequest({ headers: {}, query: { secret: 'unit-test-cron-secret' } }), false);
    assert.equal(isAuthorizedCronRequest({ headers: { authorization: 'Bearer wrong' }, query: {} }), false);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
  const helper = read('api/_shared/cronAuth.js');
  assert.match(helper, /timingSafeEqual/);
});

test('browser telemetry is bounded behind a server endpoint', () => {
  const client = read('src/lib/telemetry.js');
  const endpoint = read('api/client-error.js');
  assert.match(client, /fetch\('\/api\/client-error'/);
  assert.doesNotMatch(client, /\.from\('client_errors'\)/);
  assert.match(endpoint, /scope: 'client-error'/);
  assert.match(endpoint, /user_id: null/);
  assert.match(endpoint, /Cross-site telemetry is not accepted/);
});

test('release ships browser security headers and key interaction fixes', () => {
  const vercel = read('vercel.json');
  const pages = read('src/pages.jsx');
  const dashboard = read('src/routes/DashboardPage.jsx');
  const css = read('src/index.css');
  for (const header of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
    assert.match(vercel, new RegExp(header));
  }
  assert.match(pages, /role="dialog" aria-modal="true" aria-labelledby="create-wizard-title"/);
  assert.match(pages, /event\.key === 'Escape'/);
  assert.match(pages, /previouslyFocused instanceof HTMLElement/);
  assert.match(dashboard, /className="lv-row-main"/);
  assert.match(css, /grid-template-columns: 34px auto minmax\(0, 1fr\)/);
});
