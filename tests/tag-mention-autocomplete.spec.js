import { expect, test } from '@playwright/test';
import { dismissGuidance, env, login, requireCredentials } from './helpers.js';

test.describe('Create New teammate tagging', () => {
  test.beforeEach(async ({ page }) => {
    requireCredentials(
      env.e2eEmail,
      env.e2ePassword,
      'SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD or smoke admin credentials',
    );
    await login(page, env.e2eEmail, env.e2ePassword);
    await dismissGuidance(page);
  });

  test('progressively suggests teammates after @ as each letter is typed', async ({ page }) => {
    await page.getByRole('button', { name: 'Create new' })
      .or(page.getByRole('button', { name: 'New', exact: true }))
      .first()
      .click();
    const wizard = page.locator('.wiz-modal');

    await wizard.getByRole('button', { name: 'Task', exact: true }).click();
    await wizard.getByRole('button', { name: 'Single', exact: true }).click();
    await wizard.getByRole('button', { name: 'Standalone', exact: true }).click();

    const input = wizard.getByRole('textbox', { name: 'Tag teammate by typing @name' });
    await input.fill('@');
    await expect(page.locator('.tag-mention-menu')).toBeVisible();

    for (const value of ['@T', '@Ti', '@Tim']) {
      await input.fill(value);
      await expect(page.locator('.tag-mention-menu .mention-name', { hasText: 'Tim Dibben' })).toBeVisible();
    }

    await page.locator('.tag-mention-menu .mention-option', { hasText: 'Tim Dibben' }).click();
    await expect(input).toHaveValue('@Tim Dibben ');
    await wizard.getByRole('button', { name: 'Tag', exact: true }).click();
    await expect(wizard.getByRole('button', { name: 'Remove Tim Dibben' })).toBeVisible();
  });
});
