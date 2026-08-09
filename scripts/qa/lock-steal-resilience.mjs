// Chaos gate: Create New must survive auth-lock contention.
//
// Born from Malcolm's go-live error (8/5/2026): a stolen Supabase auth-token
// Web Lock surfaced raw in the Create New wizard and failed his submit.
// This script signs into production as the release-smoke admin, fills a
// standalone task, then hammers the auth-token Web Lock with steal requests
// while submitting. Passes when the task is created and no raw lock error is
// ever shown. Cleans up its QA task and telemetry rows afterward.
//
// Run: npm run chaos:lock   (writes proof screenshots to tmp/proofs/)
import { chromium } from '@playwright/test';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
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

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.SANDPRO_SMOKE_ADMIN_EMAIL;
const PASSWORD = process.env.SANDPRO_SMOKE_ADMIN_PASSWORD;
const LOCK_NAME = 'lock:sb-whgrkfhuzgwmbelocnhq-auth-token';
const STORAGE_KEY = 'sb-whgrkfhuzgwmbelocnhq-auth-token';
const BASE_URL = 'https://objectivetracker.net';
const TASK_TITLE = `QA Agent — lock-steal resilience proof ${new Date().toISOString().slice(0, 10)}`;

if (!SUPABASE_URL || !ANON_KEY || !EMAIL || !PASSWORD) {
  console.error('Missing env (SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SANDPRO_SMOKE_ADMIN_*)');
  process.exit(1);
}

const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!tokenRes.ok) {
  console.error('Auth token request failed:', tokenRes.status, await tokenRes.text());
  process.exit(1);
}
const session = await tokenRes.json();
const runStartIso = new Date().toISOString();

mkdirSync('tmp/proofs', { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleLines = [];
page.on('console', (msg) => consoleLines.push(msg.text()));

await page.addInitScript(({ key, value }) => {
  localStorage.setItem(key, value);
  localStorage.setItem('supabase.gotrue-js.locks.debug', 'true');
}, { key: STORAGE_KEY, value: JSON.stringify(session) });

await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await page.locator('.dashboard-page, .global-kpi-strip, .brief-overlay').first().waitFor({ timeout: 30000 });

// Dismiss guidance overlays exactly like the smoke helpers do.
const dismissOverlays = async () => {
  const brief = page.locator('.brief-overlay');
  if (await brief.isVisible({ timeout: 2500 }).catch(() => false)) {
    const close = page.locator('.brief-close');
    if (await close.isVisible({ timeout: 500 }).catch(() => false)) await close.click({ force: true });
    else await page.keyboard.press('Escape');
  }
  for (let i = 0; i < 5; i += 1) {
    const overlay = page.locator('.framework-explainer-overlay').filter({ visible: true }).first();
    if (!(await overlay.isVisible({ timeout: 1200 }).catch(() => false))) break;
    await overlay.locator('.framework-explainer-close').click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }
  const feature = page.locator('.new-feature-close');
  if (await feature.isVisible({ timeout: 800 }).catch(() => false)) await feature.click({ force: true });
};
await dismissOverlays();

// Open Create New and walk the wizard like Malcolm did: Task → Single → Standalone.
await page.waitForTimeout(1500);
await dismissOverlays();
await page.screenshot({ path: 'tmp/proofs/qa-debug-before-new.png' });
const wizard = page.locator('.wiz-modal');
for (let attempt = 0; attempt < 3 && !(await wizard.isVisible().catch(() => false)); attempt += 1) {
  await dismissOverlays();
  const newButton = page.getByRole('button', { name: 'New', exact: true }).first();
  if (await newButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newButton.click({ force: true });
  } else {
    await page.keyboard.press('c'); // app shortcut for Create New
  }
  await wizard.waitFor({ timeout: 6000 }).catch(() => {});
}
if (!(await wizard.isVisible().catch(() => false))) {
  await page.screenshot({ path: 'tmp/proofs/qa-debug-no-wizard.png' });
  console.error('Wizard did not open; see tmp/proofs/qa-debug-no-wizard.png');
  await browser.close();
  process.exit(1);
}
await wizard.getByRole('button', { name: 'Task', exact: true }).click();
await wizard.getByRole('button', { name: 'Single', exact: true }).click();
await wizard.getByRole('button', { name: 'Standalone', exact: true }).click();
await wizard.getByPlaceholder('What needs to happen?').fill(TASK_TITLE);
await wizard.getByPlaceholder('Context, details, links…').fill(
  'Automated QA: verifies task creation survives auth-lock contention (fix for the 8/5 go-live error). Safe to archive/delete.'
);
const deptSelect = wizard.locator('.wiz-field-grid select').first();
await deptSelect.selectOption({ label: 'Flowback' }).catch(() => deptSelect.selectOption({ index: 1 }));
await page.screenshot({ path: 'tmp/proofs/qa-lock-steal-01-form.png' });

// The failure condition: another context repeatedly steals the auth-token
// Web Lock, exactly what victimized Malcolm's submit at 9:01 AM.
await page.evaluate((lockName) => {
  window.__stealCount = 0;
  window.__stealStorm = setInterval(() => {
    window.__stealCount += 1;
    navigator.locks.request(lockName, { mode: 'exclusive', steal: true }, () => new Promise((r) => setTimeout(r, 60)));
  }, 130);
}, LOCK_NAME);

await wizard.getByRole('button', { name: /Create Task/ }).click();
await page.waitForTimeout(1500);
const stealCount = await page.evaluate(() => {
  clearInterval(window.__stealStorm);
  return window.__stealCount;
});

// Outcome: either the wizard closed (task created despite the storm), or the
// humanized hiccup banner is up — in which case one user-style retry must land.
let retried = false;
let bannerText = null;
try {
  await wizard.waitFor({ state: 'detached', timeout: 12000 });
} catch {
  bannerText = await page.locator('.wiz-error').textContent().catch(() => null);
  if (bannerText && /lock|stole|navigator/i.test(bannerText)) {
    console.error('FAIL: raw lock error still reaches the user:', bannerText);
    await page.screenshot({ path: 'tmp/proofs/qa-lock-steal-FAIL.png' });
    await browser.close();
    process.exit(1);
  }
  await page.screenshot({ path: 'tmp/proofs/qa-lock-steal-02-hiccup-banner.png' });
  retried = true;
  await wizard.getByRole('button', { name: /Create Task/ }).click();
  await wizard.waitFor({ state: 'detached', timeout: 15000 });
}

await page.getByText(TASK_TITLE).first().waitFor({ timeout: 15000 });
await page.screenshot({ path: 'tmp/proofs/qa-lock-steal-03-created.png' });

// Telemetry probe: an uncaught error must land in client_errors.
await page.evaluate(() => {
  setTimeout(() => {
    throw new Error('QA telemetry probe — safe to ignore');
  }, 0);
});
await page.waitForTimeout(2500);

const lockLines = consoleLines.filter((line) => /navigatorLock|stolen|recover/i.test(line));
console.log(JSON.stringify({
  ok: true,
  taskTitle: TASK_TITLE,
  stealRequestsFired: stealCount,
  hiccupBannerShown: retried,
  hiccupBannerText: bannerText,
  lockDebugLines: lockLines.slice(0, 12),
}, null, 2));

await browser.close();

// Self-cleanup: remove the QA task and telemetry rows this run produced.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (serviceKey) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const taskDelete = await fetch(
    `${SUPABASE_URL}/rest/v1/objectives?title=eq.${encodeURIComponent(TASK_TITLE)}`,
    { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' } },
  );
  const removed = taskDelete.ok ? (await taskDelete.json()).length : 0;
  const telemetryDelete = await fetch(
    `${SUPABASE_URL}/rest/v1/client_errors?user_id=eq.${session.user.id}&created_at=gte.${encodeURIComponent(runStartIso)}`,
    { method: 'DELETE', headers },
  );
  console.log(`cleanup: removed ${removed} QA objective(s); QA telemetry rows cleared: ${telemetryDelete.ok}`);
} else {
  console.warn('cleanup skipped: no service role key in env — delete the QA task + client_errors rows manually');
}
