import { expect, test } from '@playwright/test';
import { assertNoMobileCrop, dismissGuidance, env, login, navItem, requireCredentials } from './helpers.js';

const oldObjectivesNav = (page) => page.getByRole('link', { name: 'Objectives', exact: true })
  .or(page.getByRole('button', { name: 'Objectives', exact: true }));

test.describe('Jake module redesign traps', () => {
  test.beforeEach(async ({ page }) => {
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD or smoke admin credentials');
    await login(page, env.e2eEmail, env.e2ePassword);
    await dismissGuidance(page);
  });

  test('module nav, global KPI strip, and OKR deep links stay wired', async ({ page }) => {
    for (const name of ['Tasks & Projects', 'OKR', 'NCR', 'Fix-It Feed', 'Organization']) {
      await expect(navItem(page, name)).toBeVisible();
    }
    await expect(oldObjectivesNav(page)).toHaveCount(0);
    await expect(page.locator('.global-kpi-strip')).toBeVisible();
    await expect(page.locator('.global-kpi-strip .kpi-grid')).toBeVisible();
    await page.getByRole('button', { name: /Hide overview/i }).click({ force: true });
    await expect(page.locator('.global-kpi-strip .kpi-grid')).toHaveCount(0);
    await expect(page.getByLabel('Collapsed KPI summary')).toBeVisible();
    await page.getByRole('button', { name: /Show overview/i }).click({ force: true });
    await expect(page.locator('.global-kpi-strip .kpi-grid')).toBeVisible();

    await page.goto('/?page=okr', { waitUntil: 'domcontentloaded' });
    await dismissGuidance(page);
    await expect(page).toHaveURL(/page=okr/);
    await expect(page.getByRole('heading', { name: 'OKR' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Presentation view' })).toBeVisible();
    await expect(page.locator('.global-kpi-strip')).toBeVisible();
    await expect(page.locator('.okr-grid thead')).toContainText('YTD AVG');
    await expect(page.locator('.okr-grid thead')).toContainText('Audit Form');
    await expect(page.locator('.okr-grid thead')).toContainText('Baseline');
    await expect(page.locator('.okr-grid thead')).toContainText('Target');
    await expect.poll(async () => page.locator('.okr-grid tbody tr').count()).toBeGreaterThan(4);
    await page.getByRole('button', { name: 'Presentation view' }).click();
    await expect(page.locator('.okr-print-summary')).toContainText(/OKR lines/);
    await expect(page.locator('#okr-print-sheet thead').first()).toContainText('YTD AVG');
    await expect(page.locator('#okr-print-sheet thead').first()).toContainText('Cadence');
    await expect.poll(async () => page.locator('#okr-print-sheet tbody tr').count()).toBeGreaterThan(4);
    await expect.poll(async () => page.locator('#okr-print-sheet .okr-print-section h3').count()).toBeGreaterThan(5);

    await navItem(page, 'Tasks & Projects').click();
    await expect(page).not.toHaveURL(/page=objectives/);
    await expect(page.locator('.dashboard-page')).toBeVisible();
  });

  test('mobile Create New wizard exposes only Task, Project, NCR and remains scrollable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissGuidance(page);

    await page.locator('.mobile-new-fab').or(page.getByRole('button', { name: 'New', exact: true })).first().click();
    const wizard = page.locator('.wiz-modal');
    await expect(page.getByRole('heading', { name: 'Create New' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Task', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Project', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'NCR', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'OKR', exact: true })).toHaveCount(0);

    const metrics = await wizard.evaluate((element) => ({
      overflowY: window.getComputedStyle(element).overflowY,
      height: element.getBoundingClientRect().height,
      viewport: window.visualViewport?.height || window.innerHeight,
    }));
    expect(metrics.overflowY).toMatch(/auto|scroll/);
    expect(metrics.height).toBeLessThanOrEqual(metrics.viewport);

    await page.getByRole('button', { name: 'Task', exact: true }).click();
    await page.getByRole('button', { name: 'Single' }).click();
    await page.getByRole('button', { name: 'Standalone' }).click();
    await page.getByPlaceholder('What needs to happen?').fill('Redesign trap task');
    await expect(wizard.getByText('Tagged teammates')).toBeVisible();
    await expect(wizard.getByPlaceholder('@name')).toBeVisible();
    await expect(wizard.getByRole('button', { name: /Add files/i })).toBeVisible();
    await assertNoMobileCrop(page, 'mobile create wizard');
    await wizard.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByRole('button', { name: /Create Task/i })).toBeVisible();
    await page.getByLabel('Close').click();

    await page.locator('.mobile-new-fab').click();
    await page.getByRole('button', { name: 'Project', exact: true }).click();
    await page.getByRole('button', { name: 'Standalone' }).click();
    await page.getByPlaceholder('What needs to happen?').fill('Project with setup tasks');
    await expect(wizard.getByText('Tasks')).toBeVisible();
    await expect(wizard.getByLabel('Project task 1 description')).toBeVisible();
    await expect(wizard.getByLabel('Assign project task 1')).toBeVisible();
    await wizard.getByLabel('Project task 1 description').fill('Kayla training materials');
    await wizard.getByRole('button', { name: /Add another task/i }).click();
    await expect(wizard.getByLabel('Project task 2 description')).toBeVisible();
    await wizard.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByRole('button', { name: /Create Project/i })).toBeVisible();
    await page.getByLabel('Close').click();

    await page.locator('.mobile-new-fab').click();
    await page.getByRole('button', { name: 'NCR', exact: true }).click();
    await expect(page).toHaveURL(/page=ncr/);
    await expect(page.getByRole('heading', { name: 'NCR Tracker' })).toBeVisible();
  });
});
