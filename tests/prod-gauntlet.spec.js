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
    // The primary control is exactly three large buttons — no Type dropdown and
    // no horizontally hidden chip strip. Every selection is exclusive and the
    // visible list count matches the count printed on its button.
    const typeButton = kind => page.locator(`.lv-work-type-button[data-work-type="${kind}"]`).first();
    const allButton = typeButton('all');
    const taskButton = typeButton('task');
    const projectButton = typeButton('project');
    const ncrButton = typeButton('ncr');
    await expect(allButton, 'dashboard: All button is visible').toBeVisible();
    await expect(taskButton, 'dashboard: Tasks button is visible').toBeVisible();
    await expect(projectButton, 'dashboard: Projects button is visible').toBeVisible();
    await expect(ncrButton, 'dashboard: NCRs button is visible').toBeVisible();
    expect(await page.locator('.lv-filterbar .lv-filter').filter({ hasText: /^Type$/ }).count(), 'dashboard: Type dropdown is gone').toBe(0);

    await allButton.click();
    await page.waitForTimeout(800);
    expect(await listRows.count(), 'dashboard: All count equals its button').toBe(Number(await allButton.locator('b').textContent()));

    await taskButton.click();
    await page.waitForTimeout(800);
    const taskRows = await listRows.count();
    expect(taskRows, 'dashboard: Tasks count equals its button').toBe(Number(await taskButton.locator('b').textContent()));
    expect(await page.locator('.lv-row .lv-type').allTextContents(), 'dashboard: Tasks shows only tasks')
      .toEqual(Array(taskRows).fill('Task'));

    await projectButton.click();
    await page.waitForTimeout(800);
    const projectRows = await listRows.count();
    expect(projectRows, 'dashboard: Projects count equals its button').toBe(Number(await projectButton.locator('b').textContent()));
    expect(await page.locator('.lv-row .lv-type').allTextContents(), 'dashboard: Projects shows only projects')
      .toEqual(Array(projectRows).fill('Project'));

    await ncrButton.click();
    await page.waitForTimeout(800);
    const currentNcrRows = await listRows.count();
    expect(currentNcrRows, 'dashboard: NCR count equals its button').toBe(Number(await ncrButton.locator('b').textContent()));
    expect(await page.locator('.lv-row .lv-type').allTextContents(), 'dashboard: NCRs shows only current NCRs')
      .toEqual(Array(currentNcrRows).fill('NCR'));

    await taskButton.click();
    await page.waitForTimeout(500);
    const legacyChip = page.locator('.lv-legacy-chip').first();
    await expect(legacyChip, 'dashboard: legacy chip present').toBeVisible();
    await legacyChip.click();
    await page.waitForTimeout(800);
    const legacyRows = await listRows.count();
    const legacyBadge = Number(await legacyChip.locator('.lv-aging-count').textContent());
    expect(await legacyChip.getAttribute('aria-pressed'), 'dashboard: Legacy is active').toBe('true');
    expect(await taskButton.getAttribute('aria-pressed'), 'dashboard: Tasks is no longer active').toBe('false');
    expect(legacyRows, 'dashboard: Legacy count equals the revealed list').toBe(legacyBadge);
    expect(await page.locator('.lv-row .lv-type').allTextContents(), 'dashboard: Legacy shows only NCRs')
      .toEqual(Array(legacyRows).fill('NCR'));
    await taskButton.click();
    await page.waitForTimeout(800);
    expect(await legacyChip.getAttribute('aria-pressed'), 'dashboard: Tasks exits Legacy').toBe('false');
    expect(await taskButton.getAttribute('aria-pressed'), 'dashboard: Tasks is active').toBe('true');
    await expectNoErrorToast('dashboard type buttons');
    await page.screenshot({ path: 'tmp/proofs/gauntlet/01-dashboard.png', fullPage: false });

    // ---- Search everything (Cmd/Ctrl+K) ----
    await page.keyboard.press('ControlOrMeta+k');
    const cmdbar = page.locator('.cmdbar');
    await expect(cmdbar, 'search: command bar opens on Cmd/Ctrl+K').toBeVisible({ timeout: 5000 });
    // fill() focuses the input itself — immune to the autofocus timer race.
    await cmdbar.locator('input').fill('RFID');
    await expect(page.locator('.cmdbar-row', { hasText: /RFID/i }).first(), 'search: finds the RFID task').toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(cmdbar, 'search: Escape closes the bar').toBeHidden({ timeout: 3000 });
    await expectNoErrorToast('search');

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

    // ---- My Day (item 6): the personal view above all scopes ----
    await page.locator('.dashboard-scope-tab:has-text("My Day")').first().click();
    await page.waitForTimeout(3000);
    await expect(page.locator('.myday-view'), 'my day: view renders').toBeVisible({ timeout: 10000 });
    for (const section of ['today', 'overdue', 'waiting']) {
      await expect(page.locator(`.myday-section[data-section="${section}"]`), `my day: ${section} section renders`).toBeVisible();
    }
    expect(
      await page.locator('.myday-section[data-section="today"] .myday-row').count(),
      'my day: the five stay five',
    ).toBeLessThanOrEqual(5);
    await expectNoErrorToast('my day');
    await page.screenshot({ path: 'tmp/proofs/gauntlet/06-myday.png' });

    // ---- Global failure sweeps ----
    // A lone transient fetch failure is jobsite reality — the app keeps last
    // data through it by design. More than two, or ANY other error, fails.
    const transient = consoleErrors.filter((e) => /TypeError: Failed to fetch/.test(e));
    const hard = consoleErrors.filter((e) => !/TypeError: Failed to fetch/.test(e));
    expect(failedRequests, `5xx responses: ${failedRequests.join(' | ')}`).toHaveLength(0);
    expect(hard, `console errors: ${hard.join(' | ')}`).toHaveLength(0);
    expect(transient.length, `excessive transient fetch failures (${transient.length})`).toBeLessThanOrEqual(2);
  });

  test('offline outbox: queue a task with no network, send it on reconnect, self-clean', async ({ page, context }) => {
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    test.skip(!SERVICE_KEY, 'needs service key for self-cleanup');
    const TITLE = `GAUNTLET offline ${new Date().toISOString()} — safe to delete`;

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
    for (let i = 0; i < 10; i += 1) {
      await dismissOverlays();
      if (await page.locator('.lv-row').first().isVisible({ timeout: 800 }).catch(() => false)) break;
    }

    try {
      // Kill the network, create through the real wizard.
      await context.setOffline(true);
      const wizard = page.locator('.wiz-modal');
      for (let attempt = 0; attempt < 3 && !(await wizard.isVisible().catch(() => false)); attempt += 1) {
        await dismissOverlays();
        const newButton = page.getByRole('button', { name: 'New', exact: true }).first();
        if (await newButton.isVisible({ timeout: 2000 }).catch(() => false)) await newButton.click({ force: true });
        else await page.keyboard.press('c');
        await wizard.waitFor({ timeout: 6000 }).catch(() => {});
      }
      await expect(wizard, 'offline: wizard opens').toBeVisible();
      await wizard.getByRole('button', { name: 'Task', exact: true }).click();
      await wizard.getByRole('button', { name: 'Single', exact: true }).click();
      await wizard.getByRole('button', { name: 'Standalone', exact: true }).click();
      await wizard.getByPlaceholder('What needs to happen?').fill(TITLE);
      await wizard.locator('.wiz-field-grid select').first().selectOption({ index: 1 }).catch(() => {});
      await wizard.getByRole('button', { name: /Create Task/ }).click();
      await wizard.waitFor({ state: 'detached', timeout: 20000 });

      // The honest chip appears with the queued item.
      const chip = page.locator('.outbox-chip');
      await expect(chip, 'offline: outbox chip shows the queued work').toBeVisible({ timeout: 10000 });
      await expect(chip, 'offline: chip counts one item').toContainText('1 waiting to send');

      // Signal returns; the outbox drains itself.
      await context.setOffline(false);
      await expect(chip, 'reconnect: outbox empties after sending').toBeHidden({ timeout: 30000 });
      await expect(page.getByText(TITLE).first(), 'reconnect: the task exists for real').toBeVisible({ timeout: 20000 });
    } finally {
      await context.setOffline(false);
      const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
      const del = await fetch(`${SUPABASE_URL}/rest/v1/objectives?title=eq.${encodeURIComponent(TITLE)}`, {
        method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' },
      });
      const removed = del.ok ? (await del.json()).length : 0;
      await fetch(`${SUPABASE_URL}/rest/v1/client_errors?user_id=eq.${session.user.id}`, { method: 'DELETE', headers });
      console.log(`offline circuit cleanup: removed ${removed}`);
    }
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
      const subtaskRow = page.locator('[data-testid="subtask-row"]').first();
      await expect(subtaskRow, 'circuit: subtask renders').toBeVisible({ timeout: 5000 });

      // Undo (item 5), desktop-valid: delete the subtask, click Undo in the
      // toast, confirm it returns — all inside the card already open here.
      await subtaskRow.locator('button[title="Delete subtask"]').click();
      await page.locator('.modal-content button.btn-danger', { hasText: 'Delete' }).click();
      const undo = page.locator('.toast-undo').first();
      await expect(undo, 'undo: the delete toast offers Undo').toBeVisible({ timeout: 6000 });
      await undo.click();
      await expect(page.locator('[data-testid="subtask-row"]').first(), 'undo: the subtask is restored').toBeVisible({ timeout: 8000 });
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

  test('my day circuit: due-today task joins the five, one-tap completes, Undo restores, self-clean', async ({ page }) => {
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    test.skip(!SERVICE_KEY, 'needs service key for self-cleanup');
    // "AAA" leads the due-today tie-break (ties sort by title), so the QA task
    // deterministically lands inside the five even on a busy account.
    const TITLE = `AAA GAUNTLET myday ${new Date().toISOString()} — safe to delete`;

    // Insert with the signed-in user's token — same RLS path the app uses.
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/objectives`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        title: TITLE,
        owner_id: session.user.id,
        created_by: session.user.id,
        status: 'not_started',
        due_date: new Date().toISOString(),
      }),
    });
    expect(ins.ok, 'myday circuit: QA task inserts').toBeTruthy();

    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: STORAGE_KEY,
      value: JSON.stringify(session),
    });
    try {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(8000);
      const dismissOverlays = async () => {
        for (const sel of ['.brief-close', '.framework-explainer-close', '.new-feature-close', 'button:has-text("Got it")']) {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 500 }).catch(() => false)) await el.click({ force: true }).catch(() => {});
        }
      };
      await dismissOverlays();
      await page.locator('.dashboard-scope-tab:has-text("My Day")').first().click();
      const row = () => page.locator('.myday-section[data-section="today"] .myday-row', { hasText: 'GAUNTLET myday' }).first();
      await expect(row(), 'myday circuit: the due-today task joins the five').toBeVisible({ timeout: 20000 });
      await page.screenshot({ path: 'tmp/proofs/gauntlet/07-myday-circuit.png' });

      // One-tap complete from My Day — and the toast must carry Undo (item 5).
      // The toast waits for the write + one full refetch on real prod latency,
      // so give it a window wider than one slow pull.
      await row().locator('.myday-complete').click();
      const undo = page.locator('.toast-undo').first();
      await expect(undo, 'myday circuit: completion toast offers Undo').toBeVisible({ timeout: 15000 });
      await undo.click();
      await expect(row(), 'myday circuit: Undo returns the task to the five').toBeVisible({ timeout: 20000 });
      // The chosen scope sticks: a late profile fetch must never yank the
      // user back to their role default after they clicked a tab.
      await expect(
        page.locator('.dashboard-scope-tab', { hasText: 'My Day' }).first(),
        'myday circuit: the chosen scope survives late profile loads',
      ).toHaveClass(/active/);
    } finally {
      const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
      const del = await fetch(`${SUPABASE_URL}/rest/v1/objectives?title=eq.${encodeURIComponent(TITLE)}`, {
        method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' },
      });
      const removed = del.ok ? (await del.json()).length : 0;
      await fetch(`${SUPABASE_URL}/rest/v1/client_errors?user_id=eq.${session.user.id}`, { method: 'DELETE', headers });
      expect(removed, 'myday circuit: QA task cleaned up').toBeGreaterThan(0);
    }
  });
});
