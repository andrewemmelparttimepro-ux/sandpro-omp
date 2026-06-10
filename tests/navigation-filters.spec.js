import { expect, test } from '@playwright/test';
import { dismissDailyBrief, dismissGuidance, env, login, navItem, requireCredentials } from './helpers.js';

test.describe('navigation and filter recovery', () => {
  test.beforeEach(async ({ page }) => {
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD or Jake credentials');
    await login(page, env.e2eEmail, env.e2ePassword);
  });

  test('dashboard KPI drilldown is URL-backed, clearable, and reversible with browser back', async ({ page }) => {
    await dismissDailyBrief(page);
    await expect(page.getByLabel('Active status breakdown')).toContainText(/On Track|At Risk|Blocked|Not Started|Completed/);
    await page.getByText('Due Next 14').click();
    await expect(page).toHaveURL(/page=objectives/);
    await expect(page).toHaveURL(/due=14/);
    await expect(page.getByRole('button', { name: /Due Next 14/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /All Objectives/i })).toBeVisible();
    await dismissDailyBrief(page);

    await page.getByRole('button', { name: /All Objectives/i }).click();
    await expect(page).toHaveURL(/page=objectives/);
    await expect(page).not.toHaveURL(/due=14/);
    await expect(page.getByRole('button', { name: /Due Next 14/i })).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/due=14/);
    await expect(page.getByRole('button', { name: /Due Next 14/i })).toBeVisible();

    await page.goBack();
    await expect(navItem(page, 'Dashboard')).toHaveClass(/active/);
  });

  test('empty filtered states include a clear-filters escape hatch', async ({ page }) => {
    await navItem(page, 'Objectives').click();
    await page.getByPlaceholder('Search objectives...').fill(`no-objective-${Date.now()}`);
    await expect(page.getByText(/No objectives match/i)).toBeVisible();
    await page.getByRole('button', { name: /Clear filters/i }).click();
    await expect(page.getByPlaceholder('Search objectives...')).toHaveValue('');
    await expect(page.getByRole('button', { name: /Clear filters/i })).toHaveCount(0);
  });

  test('objective sort supports newest and oldest first', async ({ page }) => {
    await navItem(page, 'Objectives').click();
    const sort = page.getByLabel('Sort objectives');

    await sort.selectOption('newest');
    await expect(page).toHaveURL(/page=objectives/);
    await expect(page).toHaveURL(/sort=newest/);

    await sort.selectOption('oldest');
    await expect(page).toHaveURL(/sort=oldest/);
  });

  test('new objective draft survives accidental close and page reload', async ({ page }) => {
    const title = `Draft Restore ${Date.now()}`;
    const details = 'Draft details should survive closing the modal and reloading the app.';

    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sandpro-objective-form-draft-')) localStorage.removeItem(key);
      }
    });

    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByPlaceholder('What needs to be done?').fill(title);
    await page.getByPlaceholder('Add details... use @ to mention teammates').fill(details);
    await expect(page.getByText('Draft autosaved')).toBeVisible();
    await page.getByLabel('Close objective form').click();
    await expect(page.getByTestId('objective-form-modal')).toHaveCount(0);

    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect(page.getByPlaceholder('What needs to be done?')).toHaveValue(title);
    await expect(page.getByPlaceholder('Add details... use @ to mention teammates')).toHaveValue(details);
    await page.getByLabel('Close objective form').click();

    await page.reload();
    await dismissDailyBrief(page);
    await dismissGuidance(page);
    await page.locator('.brief-close').click({ force: true, timeout: 10000 }).catch(() => {});
    await expect(page.locator('.brief-overlay')).toHaveCount(0, { timeout: 10000 });
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect(page.getByPlaceholder('What needs to be done?')).toHaveValue(title);
    await expect(page.getByPlaceholder('Add details... use @ to mention teammates')).toHaveValue(details);

    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sandpro-objective-form-draft-')) localStorage.removeItem(key);
      }
    });
  });

  test('kanban honors the same filters as list and grid', async ({ page }) => {
    await navItem(page, 'Objectives').click();
    await page.getByTitle('Kanban View').click();
    await expect(page).toHaveURL(/view=kanban/);
    await page.getByRole('button', { name: /^Blocked$/i }).click();
    await expect(page).toHaveURL(/status=blocked/);
    await expect(page.locator('.kanban-column')).toHaveCount(1);
    await expect(page.locator('.kanban-column-header').getByText('Blocked')).toBeVisible();
  });
});
