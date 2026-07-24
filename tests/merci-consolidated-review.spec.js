import { expect, test } from '@playwright/test';
import { assertNoMobileCrop, dismissGuidance, env, login, requireCredentials } from './helpers.js';

test.describe('Merci consolidated review', () => {
  test.beforeEach(async ({ page }) => {
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD or smoke admin credentials');
    await login(page, env.e2eEmail, env.e2ePassword);
    await dismissGuidance(page);
  });

  test('home KPIs filter the visible list and non-home overview banners stay removed', async ({ page }, testInfo) => {
    await expect(page.locator('.global-kpi-strip')).toBeVisible();
    await expect(page.locator('.framework-dashboard-strip')).toHaveCount(0);
    await expect(page.getByText('Needs A Supporting Tag', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Needs Your Acknowledgement', { exact: true })).toHaveCount(0);

    await page.locator('.kpi-card').filter({ hasText: 'Active' }).first().click();
    await expect(page).not.toHaveURL(/page=objectives/);
    await expect(page.locator('.dashboard-page .lv-card')).toBeVisible();
    if (testInfo.project.name === 'mobile-chrome') {
      const cardWidths = await page.locator('.global-kpi-strip .kpi-grid > *').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().width));
      expect(cardWidths).toHaveLength(4);
      expect(Math.min(...cardWidths)).toBeGreaterThanOrEqual(280);
      await expect(page.locator('.global-kpi-strip .global-kpi-collapse-cluster')).toBeHidden();
    }
    await page.screenshot({ path: testInfo.outputPath('tasks-projects.png'), fullPage: true });

    await page.goto('/?page=okr', { waitUntil: 'domcontentloaded' });
    await dismissGuidance(page);
    await expect(page.locator('.global-kpi-strip')).toHaveCount(0);

    if (testInfo.project.name === 'mobile-chrome') {
      await expect(page.locator('.okr-mobile-sections')).toBeVisible();
      await expect(page.locator('.okr-mobile-section-head').first()).toBeVisible();
      await assertNoMobileCrop(page);
    } else {
      await expect(page.locator('.okr-group-row').first()).toBeVisible();
      const nameColumn = page.locator('.okr-grid tbody tr:not(.okr-group-row) .okr-name-col').first();
      const before = await nameColumn.boundingBox();
      await page.locator('.okr-grid-scroll').evaluate(element => { element.scrollLeft = 900; });
      const after = await nameColumn.boundingBox();
      expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(2);
      await page.locator('.okr-group-row button').first().click();
      await expect(page.locator('.okr-group-row button').first()).toHaveAttribute('aria-expanded', 'false');
    }

    await page.screenshot({ path: testInfo.outputPath('okr.png'), fullPage: true });
  });
});
