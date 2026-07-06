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

    await page.goto('/?page=okr', { waitUntil: 'domcontentloaded' });
    await dismissGuidance(page);
    await expect(page).toHaveURL(/page=okr/);
    await expect(page.getByRole('heading', { name: 'OKR' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Presentation view' })).toBeVisible();
    await expect(page.locator('.global-kpi-strip')).toBeVisible();

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
    await wizard.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByRole('button', { name: /Create Task/i })).toBeVisible();
    await assertNoMobileCrop(page, 'mobile create wizard');
    await page.getByLabel('Close').click();

    await page.locator('.mobile-new-fab').click();
    await page.getByRole('button', { name: 'NCR', exact: true }).click();
    await expect(page).toHaveURL(/page=ncr/);
    await expect(page.getByRole('heading', { name: 'NCR Tracker' })).toBeVisible();
  });
});
