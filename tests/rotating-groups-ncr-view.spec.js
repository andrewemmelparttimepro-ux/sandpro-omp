import { expect, test } from '@playwright/test';
import { dismissGuidance, env, login, requireCredentials } from './helpers.js';

test.describe('rotating groups and unified NCR view', () => {
  test.beforeEach(async ({ page }) => {
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD or smoke admin credentials');
    await login(page, env.e2eEmail, env.e2ePassword);
    await dismissGuidance(page);
  });

  test('production exposes optional group assignment and admin-controlled membership', async ({ page }) => {
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('button', { name: 'Task', exact: true }).click();
    await page.getByRole('button', { name: 'Single', exact: true }).click();
    await page.getByRole('button', { name: 'Standalone', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Person', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rotating group', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Rotating group', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Dispatch', exact: true })).toBeAttached();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByTitle('Open Admin').click();
    await page.getByRole('button', { name: 'Groups', exact: true }).click();
    await expect(page.getByText('Rotating assignment groups', { exact: true })).toBeVisible();
    await expect(page.getByText('Dispatch', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Field Service Managers', { exact: true }).first()).toBeVisible();
  });

  test('NCR has one full view with no Basic or Advanced distinction', async ({ page }) => {
    await page.goto('/?page=ncr', { waitUntil: 'domcontentloaded' });
    await dismissGuidance(page);
    await expect(page.getByRole('button', { name: 'KPA Import', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Basic', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Advanced', exact: true })).toHaveCount(0);
  });
});
