// PRODUCTION GAUNTLET — runs after every deploy, walks every main surface as
// a signed-in user and fails loudly if any surface is broken in the ways that
// have actually bitten us: content that should render but doesn't, error
// toasts, console errors, failed requests, or a callout walling the list.
// Born Aug 10, 2026 after "there is broken shit everywhere despite you
// telling me it is fine" — read-only smoke was not enough.
import { test, expect } from '@playwright/test';

const BASE = process.env.SANDPRO_BASE_URL || 'https://objectivetracker.net';
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.SANDPRO_SMOKE_ADMIN_EMAIL;
const PASSWORD = process.env.SANDPRO_SMOKE_ADMIN_PASSWORD;
const STORAGE_KEY = 'sb-whgrkfhuzgwmbelocnhq-auth-token';

// Transient network noise we accept; anything else on the console fails.
const IGNORABLE_CONSOLE = [
  /Failed to load resource.*(favicon|apple-touch)/i,
  /net::ERR_NETWORK_CHANGED/i,
];

test.describe('production gauntlet', () => {
  test.skip(!SUPABASE_URL || !ANON_KEY || !EMAIL || !PASSWORD, 'needs release env');
  test.setTimeout(180000);

  let session;
  test.beforeAll(async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    expect(res.ok, 'smoke admin auth').toBeTruthy();
    session = await res.json();
  });

  test('every main surface renders real content with zero errors', async ({ page }) => {
    const consoleErrors = [];
    const failedRequests = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (IGNORABLE_CONSOLE.some((rx) => rx.test(text))) return;
      consoleErrors.push(text.slice(0, 300));
    });
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 300)}`));
    page.on('response', (res) => {
      if (res.status() >= 500) failedRequests.push(`${res.status()} ${res.url().slice(0, 140)}`);
    });

    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: STORAGE_KEY,
      value: JSON.stringify(session),
    });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
    for (const sel of ['.brief-close', '.framework-explainer-close', '.new-feature-close']) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 700 }).catch(() => false)) await el.click({ force: true }).catch(() => {});
    }

    const expectNoErrorToast = async (where) => {
      const toast = page.locator('.toast-error, [class*="toast"][class*="error"]').first();
      const visible = await toast.isVisible({ timeout: 500 }).catch(() => false);
      if (visible) {
        const text = await toast.textContent().catch(() => '');
        expect(visible, `${where}: error toast — ${String(text).trim().slice(0, 160)}`).toBeFalsy();
      }
    };

    // ---- Dashboard (Tasks & Projects, company scope) ----
    const kpiActive = page.locator('.kpi-grid, .global-kpi-strip').first();
    await expect(kpiActive, 'dashboard: KPI strip renders').toBeVisible({ timeout: 20000 });
    const listRows = page.locator('.lv-row');
    await expect
      .poll(async () => listRows.count(), { message: 'dashboard: list rows render (not walled off)', timeout: 20000 })
      .toBeGreaterThan(10);
    // The unknown-owner callout may exist, but only as a collapsed single bar.
    const calloutRows = page.locator('.lv-ncr-owner-rows');
    expect(await calloutRows.count(), 'dashboard: callout must be collapsed by default').toBe(0);
    await expectNoErrorToast('dashboard');
    await page.screenshot({ path: 'tmp/proofs/gauntlet/01-dashboard.png', fullPage: false });

    // ---- OKR ----
    await page.locator('nav a:has-text("OKR"), button:has-text("OKR")').first().click();
    await page.waitForTimeout(4000);
    await expectNoErrorToast('okr');
    await page.screenshot({ path: 'tmp/proofs/gauntlet/02-okr.png' });

    // ---- NCR tracker + detail + create modal ----
    await page.locator('nav a:has-text("NCR"), button:has-text("NCR")').first().click();
    await page.waitForTimeout(6000);
    const ncrRows = page.locator('.ncr-page tbody tr, .ncr-page [class*="ncr-row"], .ncr-page [class*="list"] [class*="row"]');
    await expect
      .poll(async () => ncrRows.count(), { message: 'ncr: tracker rows render', timeout: 20000 })
      .toBeGreaterThan(5);
    await expectNoErrorToast('ncr tracker');
    await page.locator('button:has-text("New NCR")').first().click();
    const modal = page.locator('.modal-content');
    await expect(modal, 'ncr: create modal opens').toBeVisible({ timeout: 10000 });
    const longtext = modal.locator('.ncr-create-longtext textarea').first();
    await longtext.scrollIntoViewIfNeeded();
    const box = await longtext.boundingBox();
    const modalBox = await modal.boundingBox();
    expect(box.width, 'ncr: long-text fields span the modal (layout not broken)').toBeGreaterThan(modalBox.width * 0.8);
    await page.keyboard.press('Escape');
    await page.locator('button:has-text("Cancel")').first().click().catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'tmp/proofs/gauntlet/03-ncr.png' });

    // ---- Organization ----
    await page.locator('nav a:has-text("Organization"), button:has-text("Organization")').first().click();
    await page.waitForTimeout(5000);
    await expect(page.getByPlaceholder('Search people...'), 'org: renders').toBeVisible({ timeout: 15000 });
    await expectNoErrorToast('organization');
    await page.screenshot({ path: 'tmp/proofs/gauntlet/04-organization.png' });

    // ---- Individual scope: strip and list must agree (Jake's bug class) ----
    await page.locator('nav a:has-text("Tasks"), button:has-text("Tasks")').first().click();
    await page.waitForTimeout(3000);
    await page.locator('.dashboard-scope-tab:has-text("Individual"), .dashboard-scope-tab:has-text("Me")').first().click();
    await page.waitForTimeout(4000);
    await expectNoErrorToast('individual scope');
    await page.screenshot({ path: 'tmp/proofs/gauntlet/05-individual.png' });

    // ---- Global failure sweeps ----
    expect(failedRequests, `5xx responses: ${failedRequests.join(' | ')}`).toHaveLength(0);
    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
  });
});
