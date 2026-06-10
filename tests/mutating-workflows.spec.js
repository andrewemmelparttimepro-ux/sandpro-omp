import { expect, test } from '@playwright/test';
import { dismissGuidance, env, login, navItem, objectiveResult, openObjectiveByTitle, requireCredentials } from './helpers.js';

test.describe('isolated mutating workflows', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!env.allowMutation, 'Set SANDPRO_E2E_ALLOW_MUTATION=1 to run mutating checks against an isolated environment.');
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL and SANDPRO_E2E_PASSWORD');
    await login(page, env.e2eEmail, env.e2ePassword);
  });

  test('create, edit, review tabs, and delete an objective', async ({ page }) => {
    const title = `E2E Audit Objective ${Date.now()}`;
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    await dismissGuidance(page);
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('button', { name: /Create Objective|Delegate Objective/i }).click();
    await expect(page.getByText('Title is required')).toBeVisible();
    await page.getByPlaceholder('What needs to be done?').fill(title);
    await page.locator('input[type="date"]').fill(tomorrow);
    await page.getByRole('button', { name: /Create Objective|Delegate Objective/i }).click();

    await navItem(page, 'Objectives').click();
    await page.getByPlaceholder('Search objectives...').fill(title);
    await expect(objectiveResult(page, title)).toBeVisible();
    await page.getByLabel(`Change status for ${title}`).selectOption('on_track');
    await expect(page.getByText('Status updated to On Track')).toBeVisible();
    await expect(page.getByLabel(`Change status for ${title}`)).toHaveValue('on_track');
    await openObjectiveByTitle(page, title);

    for (const tab of ['Messages', 'Details', 'Subtasks', 'Metrics', 'Files', 'Activity']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await expect(page.getByRole('button', { name: tab, exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: /Access/i }).click();
    await expect(page.getByRole('button', { name: /Access/i })).toBeVisible();

    await page.getByTitle('Edit objective').click();
    await page.getByPlaceholder('Add details...').fill('Updated by isolated Playwright audit.');
    await page.getByRole('button', { name: /Save Changes/i }).click();
    await expect(page.getByText('Objective updated')).toBeVisible();

    await page.getByPlaceholder('Search objectives...').fill(title);
    await openObjectiveByTitle(page, title);
    await page.getByTitle('Delete').click();
    await page.getByText('This deletes the objective').waitFor();
    await page.locator('.btn-danger').filter({ hasText: /^Delete$/ }).click();
    await expect(page.getByText('Objective deleted')).toBeVisible();
  });
});
