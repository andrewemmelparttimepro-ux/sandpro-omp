import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { env, login, navItem, requireCredentials } from './helpers.js';

test.describe('Fix-It Feed verification workflow', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!env.allowMutation, 'Set SANDPRO_E2E_ALLOW_MUTATION=1 to run Fix-It workflow checks.');
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL and SANDPRO_E2E_PASSWORD');
    await login(page, env.e2eEmail, env.e2ePassword);
  });

  test('fixed items show validation proof before human archive', async ({ page }) => {
    const body = `Fix-It QA Archive Workflow ${Date.now()}`;
    const proofPath = join(tmpdir(), `sandpro-validation-proof-${Date.now()}.png`);
    writeFileSync(proofPath, Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    ));

    await navItem(page, 'Fix-It Feed').click();
    await page.getByRole('tab', { name: /Active/i }).click();
    await page.getByPlaceholder('Flag something to fix, clarify, or improve...').fill(body);
    await page.getByRole('button', { name: /^Post$/ }).click();

    const card = page.locator('.fixit-post').filter({ hasText: body }).first();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /I'm on it/i }).click();
    await expect(card).toContainText(/is on it|You're on it/);

    await card.getByRole('button', { name: /Mark fixed/i }).click();
    await expect(card).toContainText(/Fixed by/);
    await expect(card).toContainText(/validation complete/);
    await expect(card.getByRole('button', { name: /^archive$/i })).toBeVisible();
    await expect(card.getByRole('button', { name: /Mark tested done/i })).toHaveCount(0);

    await card.getByRole('button', { name: /validation complete/i }).click();
    await expect(page.getByText('Validation proof')).toBeVisible();
    await expect(page.getByText(/Proof screenshot missing/i)).toBeVisible();
    await page.locator('.validation-proof-modal input[type="file"]').setInputFiles(proofPath);
    if (await page.locator('.validation-proof-frame img').count() === 0) {
      await card.getByRole('button', { name: /validation complete/i }).click();
    }
    await expect(page.locator('.validation-proof-frame img')).toBeVisible();
    await page.getByTitle('Close validation proof').click();
    await expect(card.locator('.fixit-validation-pill.missing-proof')).toHaveCount(0);

    await card.getByRole('button', { name: /^archive$/i }).click();
    await page.getByRole('tab', { name: /Active/i }).click();
    await expect(page.locator('.fixit-post').filter({ hasText: body })).toHaveCount(0);

    await page.getByRole('tab', { name: /Archive/i }).click();
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Human reviewed/);

    await card.getByRole('button', { name: /Reopen/i }).click();
    await expect(page.getByRole('tab', { name: /Active/i })).toHaveAttribute('aria-selected', 'true');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Open');

    await card.getByTitle('Delete item').click();
    await expect(page.locator('.fixit-post').filter({ hasText: body })).toHaveCount(0);
  });
});
