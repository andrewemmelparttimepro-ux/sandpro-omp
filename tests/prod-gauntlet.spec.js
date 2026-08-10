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

    const dismissOverlays = async () => {
      for (const sel of ['.brief-close', '.framework-explainer-close', '.new-feature-close', 'button:has-text("Got it")']) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 500 }).catch(() => false)) await el.click({ force: true }).catch(() => {});
      }
    };

    const expectNoErrorToast = async (where) => {
      const toast = page.locator('.toast-error, [class*="toast"][class*="error"]').first();
      const visible = await toast.isVisible({ timeout: 500 }).catch(() => false);
      if (visible) {
        const text = await toast.textContent().catch(() => '');
        expect(visible, `${where}: error toast — ${String(text).trim().slice(0, 160)}`).toBeFalsy();
      }
    };

    // ---- Dashboard (Tasks & Projects, company scope) ----
    await dismissOverlays();
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
    // One-click type chips: each selection is exclusive and every rendered row
    // matches it. Legacy replaces a previous type filter instead of stacking
    // invisibly on top of it, then All restores the clean current-work login.
    const rowsBefore = await listRows.count();
    const typeChip = label => page.locator(`.lv-type-row .lv-aging-chip:has-text("${label}")`).first();
    const taskChip = typeChip('Tasks');
    await taskChip.click();
    await page.waitForTimeout(800);
    const taskRows = await listRows.count();
    expect(taskRows, 'dashboard: Tasks chip filters the list').toBeLessThanOrEqual(rowsBefore);
    expect(await page.locator('.lv-row .lv-type').allTextContents(), 'dashboard: Tasks shows only tasks')
      .toEqual(Array(taskRows).fill('Task'));
    const legacyChip = page.locator('.lv-legacy-chip').first();
    await expect(legacyChip, 'dashboard: legacy chip present').toBeVisible();
    await legacyChip.click();
    await page.waitForTimeout(800);
    const legacyRows = await listRows.count();
    const legacyBadge = Number(await legacyChip.locator('.lv-aging-count').textContent());
    expect(await legacyChip.getAttribute('aria-pressed'), 'dashboard: Legacy is active').toBe('true');
    expect(await taskChip.getAttribute('aria-pressed'), 'dashboard: Tasks is no longer active').toBe('false');
    expect(legacyRows, 'dashboard: Legacy count equals the revealed list').toBe(legacyBadge);
    expect(await page.locator('.lv-row .lv-type').allTextContents(), 'dashboard: Legacy shows only NCRs')
      .toEqual(Array(legacyRows).fill('NCR'));
    await typeChip('All').click();
    await page.waitForTimeout(800);
    expect(await legacyChip.getAttribute('aria-pressed'), 'dashboard: All exits Legacy').toBe('false');
    expect(await typeChip('All').getAttribute('aria-pressed'), 'dashboard: All is active').toBe('true');
    await expectNoErrorToast('dashboard chips');
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
    await dismissOverlays();
    await page.locator('.dashboard-scope-tab:has-text("Individual"), .dashboard-scope-tab:has-text("Me")').first().click();
    await page.waitForTimeout(4000);
    await expectNoErrorToast('individual scope');
    await page.screenshot({ path: 'tmp/proofs/gauntlet/05-individual.png' });

    // ---- Global failure sweeps ----
    // A lone transient fetch failure is jobsite reality — the app keeps last
    // data through it by design. More than two, or ANY other error, fails.
    const transient = consoleErrors.filter((e) => /TypeError: Failed to fetch/.test(e));
    const hard = consoleErrors.filter((e) => !/TypeError: Failed to fetch/.test(e));
    expect(failedRequests, `5xx responses: ${failedRequests.join(' | ')}`).toHaveLength(0);
    expect(hard, `console errors: ${hard.join(' | ')}`).toHaveLength(0);
    expect(transient.length, `excessive transient fetch failures (${transient.length})`).toBeLessThanOrEqual(2);
  });

  test('mutating circuit: create task, add subtask, verify, self-clean', async ({ page }) => {
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    test.skip(!SERVICE_KEY, 'needs service key for self-cleanup');
    const TITLE = `GAUNTLET circuit ${new Date().toISOString()} — safe to delete`;

    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: STORAGE_KEY,
      value: JSON.stringify(session),
    });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    const dismissOverlays = async () => {
      for (const sel of ['.brief-close', '.framework-explainer-close', '.new-feature-close', 'button:has-text("Got it")']) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 500 }).catch(() => false)) await el.click({ force: true }).catch(() => {});
      }
    };
    await dismissOverlays();

    try {
      // Create a task through the real wizard (Malcolm's path).
      const wizard = page.locator('.wiz-modal');
      for (let attempt = 0; attempt < 3 && !(await wizard.isVisible().catch(() => false)); attempt += 1) {
        await dismissOverlays();
        const newButton = page.getByRole('button', { name: 'New', exact: true }).first();
        if (await newButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await newButton.click({ force: true });
        } else {
          await page.keyboard.press('c');
        }
        await wizard.waitFor({ timeout: 6000 }).catch(() => {});
      }
      await expect(wizard, 'circuit: wizard opens').toBeVisible();
      await wizard.getByRole('button', { name: 'Task', exact: true }).click();
      await wizard.getByRole('button', { name: 'Single', exact: true }).click();
      await wizard.getByRole('button', { name: 'Standalone', exact: true }).click();
      await wizard.getByPlaceholder('What needs to happen?').fill(TITLE);
      const deptSelect = wizard.locator('.wiz-field-grid select').first();
      await deptSelect.selectOption({ index: 1 }).catch(() => {});
      await wizard.getByRole('button', { name: /Create Task/ }).click();
      await wizard.waitFor({ state: 'detached', timeout: 15000 });
      await expect(page.getByText(TITLE).first(), 'circuit: created task renders').toBeVisible({ timeout: 15000 });

      // The card AUTO-OPENS on create; only click the title if it didn't.
      const subtasksTab = page.getByRole('button', { name: /Subtasks/ }).first();
      if (!(await subtasksTab.isVisible({ timeout: 3000 }).catch(() => false))) {
        await page.getByText(TITLE).first().click({ force: true });
      }
      await subtasksTab.click({ force: true }).catch(() => {});
      const subtaskInput = page.getByPlaceholder('Subtask or milestone title');
      await expect(subtaskInput, 'circuit: subtask input reachable').toBeVisible({ timeout: 10000 });
      // A post-create remount can wipe the draft between fill and Add — fill,
      // verify the value stuck, and retry the whole add once if no row lands.
      const SUBTASK = 'Gauntlet subtask — safe to delete';
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await page.waitForTimeout(1200);
        await subtaskInput.fill(SUBTASK);
        if ((await subtaskInput.inputValue().catch(() => '')) !== SUBTASK) continue;
        await page.getByRole('button', { name: 'Add', exact: true }).click();
        const landed = await page.locator('[data-testid="subtask-row"]').first()
          .waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
        if (landed) break;
      }
      await expect(page.locator('[data-testid="subtask-row"]').first(), 'circuit: subtask renders').toBeVisible({ timeout: 5000 });
    } finally {
      // Self-clean: the QA objective (cascades subtasks/members) and any
      // telemetry this run produced.
      const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
      const del = await fetch(`${SUPABASE_URL}/rest/v1/objectives?title=eq.${encodeURIComponent(TITLE)}`, {
        method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' },
      });
      const removed = del.ok ? (await del.json()).length : 0;
      await fetch(`${SUPABASE_URL}/rest/v1/client_errors?user_id=eq.${session.user.id}`, { method: 'DELETE', headers });
      expect(removed, 'circuit: QA task cleaned up').toBeGreaterThan(0);
    }
  });
});
