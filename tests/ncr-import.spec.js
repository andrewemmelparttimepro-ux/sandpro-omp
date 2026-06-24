import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dismissGuidance, env, login, requireCredentials } from './helpers.js';

const closeNcrPopovers = async (page) => {
  for (let i = 0; i < 3; i += 1) {
    const closeFeatureNote = page.locator('.new-feature-close').filter({ visible: true }).first();
    if (!(await closeFeatureNote.isVisible({ timeout: 1000 }).catch(() => false))) break;
    await closeFeatureNote.click({ force: true });
  }
};

const openNcrPage = async (page) => {
  requireCredentials(env.smokeAdminEmail, env.smokeAdminPassword, 'SANDPRO_SMOKE_ADMIN_EMAIL and SANDPRO_SMOKE_ADMIN_PASSWORD');
  await login(page, env.smokeAdminEmail, env.smokeAdminPassword);
  await page.goto('/?page=ncr', { waitUntil: 'domcontentloaded' });
  await dismissGuidance(page);
  await expect(page.getByRole('heading', { name: /NCR Tracker/i })).toBeVisible({ timeout: 30000 });
  await closeNcrPopovers(page);
};

test.describe('NCR tracker presentation filters', () => {
  test('allows multiple groups to be selected together', async ({ page }) => {
    await openNcrPage(page);

    const groupFilter = page.locator('.ncr-multi-filter');
    await expect(groupFilter.locator('summary')).toContainText('All Groups');
    await groupFilter.locator('summary').click();
    const options = groupFilter.locator('.ncr-multi-filter-option');
    const optionCount = await options.count();
    test.skip(optionCount < 2, 'Need at least two NCR groups to validate multi-select.');

    const firstLabel = (await options.nth(0).locator('span').innerText()).trim();
    const secondLabel = (await options.nth(1).locator('span').innerText()).trim();
    await options.nth(0).locator('input').check();
    await options.nth(1).locator('input').check();

    await expect(groupFilter.locator('summary')).toContainText('2 groups selected');
    await expect(groupFilter.getByLabel(firstLabel)).toBeChecked();
    await expect(groupFilter.getByLabel(secondLabel)).toBeChecked();
    await expect(page.getByRole('button', { name: /Clear filters \(1\)/i })).toBeVisible();
  });

  test('previews a KPA export with metadata rows', async ({ page }) => {
    const dir = mkdtempSync(join(tmpdir(), 'sandpro-ncr-import-fixture-'));
    const uploadPath = join(dir, 'NCR Summary 6.23.2026 Close Out.csv');
    writeFileSync(uploadPath, [
      'NCR Summary 6.23.2026 Close Out',
      'Source,KPA',
      'Report Number,Event Description,Department,Date',
      '82008371,Substandard condition,Quality,2026-06-23',
      '',
    ].join('\n'));

    await openNcrPage(page);
    await page.getByRole('button', { name: /KPA Import/i }).click();
    await expect(page.getByRole('heading', { name: /KPA Historical Import/i })).toBeVisible();
    await page.locator('input[accept=".xlsx,.xls,.csv"]').setInputFiles(uploadPath);
    await expect(page.getByText(/1 preview row/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('82008371')).toBeVisible();
    await expect(page.getByText(/map is not a function/i)).toHaveCount(0);
  });
});
