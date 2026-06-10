import { expect, test } from '@playwright/test';
import { env, login, requireCredentials } from './helpers.js';

test.describe('SandPro Daily', () => {
  test('objective links open the live objective detail card', async ({ page }) => {
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SandPro E2E credentials');

    await login(page, env.e2eEmail, env.e2ePassword);
    await page.getByTitle('Daily Brief').click();
    await expect(page.locator('.brief-overlay')).toBeVisible();

    const objectiveLink = page.getByRole('button', { name: /^Open objective:/ }).first();
    await expect(objectiveLink).toBeVisible();
    const label = await objectiveLink.getAttribute('aria-label');
    await objectiveLink.click();

    await expect(page.locator('.brief-overlay')).toHaveCount(0);
    await expect(page.locator('.objective-detail-modal')).toBeVisible();
    await expect(page).toHaveURL(/objective=/);
    await expect(page.locator('.objective-detail-modal')).toContainText((label || '').replace(/^Open objective:\s*/, '').slice(0, 24));
  });
});
