import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dismissGuidance, env, login, requireCredentials } from './helpers.js';

test.describe('NCR KPA import preview', () => {
  test('previews a KPA export with metadata rows', async ({ page }) => {
    requireCredentials(env.smokeAdminEmail, env.smokeAdminPassword, 'SANDPRO_SMOKE_ADMIN_EMAIL and SANDPRO_SMOKE_ADMIN_PASSWORD');
    const dir = mkdtempSync(join(tmpdir(), 'sandpro-ncr-import-fixture-'));
    const uploadPath = join(dir, 'NCR Summary 6.23.2026 Close Out.csv');
    writeFileSync(uploadPath, [
      'NCR Summary 6.23.2026 Close Out',
      'Source,KPA',
      'Report Number,Event Description,Department,Date',
      '82008371,Substandard condition,Quality,2026-06-23',
      '',
    ].join('\n'));

    await login(page, env.smokeAdminEmail, env.smokeAdminPassword);
    await page.goto('/?page=ncr', { waitUntil: 'domcontentloaded' });
    await dismissGuidance(page);
    await expect(page.getByRole('heading', { name: /NCR Tracker/i })).toBeVisible({ timeout: 30000 });
    for (let i = 0; i < 3; i += 1) {
      const closeFeatureNote = page.locator('.new-feature-close').filter({ visible: true }).first();
      if (!(await closeFeatureNote.isVisible({ timeout: 1000 }).catch(() => false))) break;
      await closeFeatureNote.click({ force: true });
    }
    await page.getByRole('button', { name: /KPA Import/i }).click();
    await expect(page.getByRole('heading', { name: /KPA Historical Import/i })).toBeVisible();
    await page.locator('input[accept=".xlsx,.xls,.csv"]').setInputFiles(uploadPath);
    await expect(page.getByText(/1 preview row/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('82008371')).toBeVisible();
    await expect(page.getByText(/map is not a function/i)).toHaveCount(0);
  });
});
