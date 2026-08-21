import { expect, test } from '@playwright/test';
import { dismissGuidance, env, login, openObjectivesPage, requireCredentials } from './helpers.js';

test('tagged teammates are a compact disclosure on desktop', async ({ page }) => {
  requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD or Jake credentials');
  await page.setViewportSize({ width: 1009, height: 590 });
  await login(page, env.e2eEmail, env.e2ePassword);
  await dismissGuidance(page);
  await openObjectivesPage(page);

  const taggedRow = page.locator('.objectives-table tbody tr').filter({ has: page.locator('.objective-tag-stack') }).first();
  test.skip(await taggedRow.count() === 0, 'No tagged objective is available in this environment.');
  await taggedRow.getByRole('button', { name: /^Open objective:/ }).click();

  const header = page.locator('.objective-detail-header');
  const summary = page.locator('.tagged-people-summary');
  const content = page.locator('.tagged-people-content');
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await expect(content).toBeHidden();
  await page.waitForTimeout(300);
  const collapsedHeader = await header.boundingBox();

  await summary.click();
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await expect(content).toBeVisible();
  await page.waitForTimeout(300);
  const expandedHeader = await header.boundingBox();
  expect(Math.abs((expandedHeader?.height || 0) - (collapsedHeader?.height || 0))).toBeLessThan(2);

  await summary.click();
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await expect(content).toBeHidden();
});
