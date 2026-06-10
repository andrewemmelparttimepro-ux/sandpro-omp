import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { dismissDailyBrief, env, login, navItem, requireCredentials, signOutIfPossible } from './helpers.js';

const evidenceDir = resolve(process.cwd(), process.env.SANDPRO_EVIDENCE_DIR || 'docs/evidence');

test.describe('release evidence capture', () => {
  test.beforeEach(async ({ page }) => {
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD or Jake credentials');
    mkdirSync(evidenceDir, { recursive: true });
    await login(page, env.e2eEmail, env.e2ePassword);
    await dismissDailyBrief(page);
  });

  test('capture desktop happy-path screenshots', async ({ page }) => {
    await page.screenshot({ path: resolve(evidenceDir, 'desktop-01-dashboard.png'), fullPage: true });

    await navItem(page, 'Objectives').click();
    await expect(page.getByPlaceholder('Search objectives...')).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDir, 'desktop-02-objectives.png'), fullPage: true });

    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await expect(page.getByRole('button', { name: 'Messages', exact: true })).toBeVisible();
      await page.screenshot({ path: resolve(evidenceDir, 'desktop-03-objective-detail.png'), fullPage: true });
      await page.getByRole('button', { name: 'Files', exact: true }).click();
      await page.screenshot({ path: resolve(evidenceDir, 'desktop-04-files.png'), fullPage: true });
      await page.keyboard.press('Escape');
    }

    await navItem(page, 'Organization').click();
    await expect(page.getByPlaceholder('Search people...')).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDir, 'desktop-05-organization.png'), fullPage: true });

    await page.getByTitle('Open Admin').click();
    await expect(page.getByText('Admin Panel')).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDir, 'desktop-06-admin.png'), fullPage: true });

    await signOutIfPossible(page);
    await page.screenshot({ path: resolve(evidenceDir, 'desktop-07-signed-out.png'), fullPage: true });
  });

  test('capture mobile happy-path screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await dismissDailyBrief(page);
    await expect(page.locator('.mobile-nav')).toBeVisible();
    await page.screenshot({ path: resolve(evidenceDir, 'mobile-01-dashboard.png'), fullPage: true });

    await navItem(page, 'Objectives').click();
    await page.screenshot({ path: resolve(evidenceDir, 'mobile-02-objectives.png'), fullPage: true });

    const firstRow = page.locator('tbody tr, .objectives-grid .card').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await page.screenshot({ path: resolve(evidenceDir, 'mobile-03-objective-detail.png'), fullPage: true });
      await page.getByRole('button', { name: /Back/i }).click();
    }
  });
});
