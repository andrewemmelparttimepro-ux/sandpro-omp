import { expect, test } from '@playwright/test';
import { dismissGuidance, env, login, navItem, openObjectivesPage } from './helpers.js';

const suppressFirstRunGuides = async (page) => {
  await page.evaluate(() => {
    const userId = Object.keys(localStorage)
      .filter(key => key.startsWith('sb-') && key.endsWith('-auth-token'))
      .map(key => {
        try {
          return JSON.parse(localStorage.getItem(key))?.user?.id || null;
        } catch {
          return null;
        }
      })
      .find(Boolean);
    if (!userId) return;
    localStorage.setItem(`sandpro-alt-dashboard-guide-seen-${userId}-alt-dashboard-2026-06-14`, '1');
    localStorage.setItem(`sandpro-framework-explainer-seen-${userId}-okr-project-framework-2026-06-11`, '1');
  });
};

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
    await suppressFirstRunGuides(page);
    await dismissGuidance(page);
    for (const name of ['Tasks & Projects', 'OKR', 'NCR', 'KPI', 'Organization']) {
      await expect(navItem(page, name)).toBeVisible();
    }
    const createButton = testInfo.project.name === 'mobile-chrome'
      ? page.getByRole('button', { name: 'Create new' })
      : page.getByRole('button', { name: 'New', exact: true });
    await expect(createButton).toBeVisible();
    await dismissGuidance(page);
    await openObjectivesPage(page);
    if (testInfo.project.name === 'mobile-chrome') {
      await expect(page.locator('.mobile-objective-list')).toBeVisible();
      await expect(page.getByRole('button', { name: /Filters/i })).toBeVisible();
    } else {
      await expect(page.getByTitle('List View')).toBeVisible();
      await expect(page.getByTitle('Grid View')).toBeVisible();
      await expect(page.getByTitle('Kanban View')).toBeVisible();
    }
    await dismissGuidance(page);
    await navItem(page, 'KPI').click();
    await expect(page.getByRole('heading', { name: /KPI Command Center/i })).toBeVisible();
  });
});
