import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertNoMobileCrop, dismissGuidance, env, login, navItem, openObjectivesPage, requireCredentials, openKpiPage } from './helpers.js';

const viewports = [
  { label: 'iphone-12', width: 390, height: 844 },
  { label: 'iphone-14-pro', width: 393, height: 852 },
  { label: 'iphone-15-plus', width: 430, height: 932 },
];

const evidenceDir = resolve(process.cwd(), process.env.SANDPRO_MOBILE_EVIDENCE_DIR || 'docs/evidence/mobile-zero-day');

const resetMainScroll = async (page) => {
  await page.locator('.main-content').evaluate((element) => {
    element.scrollTop = 0;
  }).catch(() => {});
};

test.describe('mobile zero-day crop gates', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD or Jake credentials');
    mkdirSync(evidenceDir, { recursive: true });
    await login(page, env.e2eEmail, env.e2ePassword);
    await dismissGuidance(page);
  });

  for (const viewport of viewports) {
    test(`core mobile screens are not clipped at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await dismissGuidance(page);
      await expect(page.locator('.mobile-topbar')).toBeVisible({ timeout: 30_000 });
      await resetMainScroll(page);
      await assertNoMobileCrop(page, `dashboard ${viewport.label}`);
      await page.screenshot({ path: resolve(evidenceDir, `${viewport.label}-01-dashboard.png`), fullPage: true });

      await dismissGuidance(page);
      await page.getByRole('button', { name: 'New', exact: true }).or(page.locator('.mobile-new-fab')).first().click();
      await expect(page.getByRole('heading', { name: 'Create New' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Task', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Project', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'NCR', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'OKR', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Task', exact: true }).click();
      await page.getByRole('button', { name: 'Single' }).click();
      await page.getByRole('button', { name: 'Standalone' }).click();
      await page.getByPlaceholder('What needs to happen?').fill('Mobile zero-day visual check');
      await page.getByPlaceholder(/Context, details/).fill('Checking the full-screen mobile Create New wizard does not crop on iPhone widths.');
      await assertNoMobileCrop(page, `create wizard ${viewport.label}`);
      await page.screenshot({ path: resolve(evidenceDir, `${viewport.label}-02-create-wizard.png`), fullPage: true });
      await page.getByLabel('Close').click();
      await expect(page.locator('.wiz-modal')).toHaveCount(0);

      await dismissGuidance(page);
      await openObjectivesPage(page);
      await expect(page.locator('.mobile-objective-list')).toBeVisible();
      await resetMainScroll(page);
      await assertNoMobileCrop(page, `objectives list ${viewport.label}`);
      await page.screenshot({ path: resolve(evidenceDir, `${viewport.label}-03-objectives.png`), fullPage: true });

      await dismissGuidance(page);
      await openKpiPage(page);
      await expect(page.getByRole('heading', { name: /KPI Command Center/i })).toBeVisible();
      await resetMainScroll(page);
      await assertNoMobileCrop(page, `kpi ${viewport.label}`);
      await page.screenshot({ path: resolve(evidenceDir, `${viewport.label}-04-kpi.png`), fullPage: true });

      await dismissGuidance(page);
      await navItem(page, 'Fix-It Feed').click();
      await expect(page.locator('.fixit-page')).toBeVisible();
      await resetMainScroll(page);
      await assertNoMobileCrop(page, `fix-it feed ${viewport.label}`);
      await page.screenshot({ path: resolve(evidenceDir, `${viewport.label}-05-fixit.png`), fullPage: true });

      await dismissGuidance(page);
      await navItem(page, 'NCR').click();
      await expect(page.locator('.ncr-page')).toBeVisible();
      await resetMainScroll(page);
      await assertNoMobileCrop(page, `ncr ${viewport.label}`);
      await page.screenshot({ path: resolve(evidenceDir, `${viewport.label}-06-ncr.png`), fullPage: true });

      await dismissGuidance(page);
      await navItem(page, 'Organization').click();
      await expect(page.getByPlaceholder('Search people...')).toBeVisible();
      await resetMainScroll(page);
      await assertNoMobileCrop(page, `organization ${viewport.label}`);
      await page.screenshot({ path: resolve(evidenceDir, `${viewport.label}-07-organization.png`), fullPage: true });
    });
  }
});
