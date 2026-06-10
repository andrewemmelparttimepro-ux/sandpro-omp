import { expect, test } from '@playwright/test';
import { dismissDailyBrief, env, login, navItem } from './helpers.js';

test.describe('accessibility smoke', () => {
  test('login form has keyboard-reachable controls and accessible names', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Sign In' }).first()).toBeVisible();
    await expect(page.getByPlaceholder('you@sandpro.com')).toBeVisible();
    await expect(page.getByPlaceholder('Min 6 characters')).toBeVisible();
    await expect(page.locator('form').getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('core authenticated navigation exposes named buttons when credentials are present', async ({ page }, testInfo) => {
    test.skip(!env.e2eEmail || !env.e2ePassword, 'Set SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD to run authenticated a11y smoke.');
    await login(page, env.e2eEmail, env.e2ePassword);
    await dismissDailyBrief(page);
    for (const name of ['Dashboard', 'Objectives', 'Organization']) {
      await expect(navItem(page, name)).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /New/i })).toBeVisible();
    await navItem(page, 'Objectives').click();
    if (testInfo.project.name === 'mobile-chrome') {
      await expect(page.locator('.mobile-objective-list')).toBeVisible();
      await expect(page.getByRole('button', { name: /Filters/i })).toBeVisible();
    } else {
      await expect(page.getByTitle('List View')).toBeVisible();
      await expect(page.getByTitle('Grid View')).toBeVisible();
      await expect(page.getByTitle('Kanban View')).toBeVisible();
    }
  });
});
