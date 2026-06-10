import { expect, test } from '@playwright/test';
import { env, login, navItem, objectiveResult, openObjectiveByTitle, requireCredentials } from './helpers.js';

const mentionName = process.env.SANDPRO_E2E_MENTION_NAME || 'Mention QA';

test.describe('live mention and participant notifications', () => {
  test.beforeEach(async () => {
    test.skip(!env.allowMutation, 'Set SANDPRO_E2E_ALLOW_MUTATION=1 for isolated mention notification checks.');
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL and SANDPRO_E2E_PASSWORD');
    requireCredentials(env.e2eMentionEmail, env.e2eMentionPassword, 'SANDPRO_E2E_MENTION_EMAIL and SANDPRO_E2E_MENTION_PASSWORD');
  });

  test('objective description @mentions tag teammates, then members get comment notifications and @mentions open Messages', async ({ page, browser }) => {
    const title = `Mention Notification Objective ${Date.now()}`;
    const due = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    await login(page, env.e2eEmail, env.e2ePassword);
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByPlaceholder('What needs to be done?').fill(title);
    const description = page.getByPlaceholder('Add details... use @ to mention teammates');
    await description.fill('Please loop in @Men');
    await expect(page.locator('.mention-menu')).toBeVisible();
    await page.locator('.mention-option').filter({ hasText: mentionName }).first().click();
    await expect(description).toHaveValue(`Please loop in @${mentionName} `);
    await page.locator('input[type="date"]').fill(due);
    await page.getByRole('button', { name: /Create Objective|Delegate Objective/i }).click();
    await expect(page.getByText(/Objective created|Objective delegated/i)).toBeVisible();

    await navItem(page, 'Objectives').click();
    await page.getByPlaceholder('Search objectives...').fill(title);
    await expect(objectiveResult(page, title)).toBeVisible();
    await openObjectiveByTitle(page, title);

    await expect(page.locator('.tagged-person-chip').filter({ hasText: mentionName })).toHaveCount(1);

    await page.getByRole('button', { name: 'Messages', exact: true }).click();
    const composer = page.locator('textarea[placeholder^="Type a message"]');
    await composer.fill('Member notification smoke check');
    await page.getByTitle('Send message').click();
    await expect(page.getByText('Member notification smoke check')).toBeVisible();

    await composer.fill('@Men');
    await expect(page.locator('.mention-menu')).toBeVisible();
    await page.locator('.mention-option').filter({ hasText: mentionName }).click();
    await expect(composer).toHaveValue(`@${mentionName} `);
    await composer.pressSequentially('please review this mention');
    await page.getByTitle('Send message').click();
    await expect(page.locator('p').filter({ hasText: `@${mentionName} please review this mention` })).toBeVisible();

    const mentionContext = await browser.newContext();
    const mentionPage = await mentionContext.newPage();
    try {
      await login(mentionPage, env.e2eMentionEmail, env.e2eMentionPassword);
      await mentionPage.getByLabel('Notifications').click();
      await expect(mentionPage.getByText(new RegExp(`assigned you on objective "${title}"`))).toBeVisible();
      await expect(mentionPage.getByText(new RegExp(`mentioned you in "${title}"`))).toBeVisible();
      await expect(mentionPage.getByText(new RegExp(`commented on "${title}"`))).toBeVisible();

      await mentionPage.getByText(new RegExp(`mentioned you in "${title}"`)).click();
      await expect(mentionPage.getByRole('heading', { name: title })).toBeVisible();
      await expect(mentionPage.locator('p').filter({ hasText: `@${mentionName} please review this mention` })).toBeVisible();
    } finally {
      await mentionContext.close();
    }
  });

  test('objective tag @menus are visible from the row, modal header, and Access tab', async ({ page }) => {
    const title = `Mention Notification Objective Tag Menu ${Date.now()}`;
    const due = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const expectVisibleTagMenu = async (input) => {
      await input.fill('@Men');
      const menu = page.locator('.tag-mention-menu-portal').last();
      const option = menu.locator('.mention-option').filter({ hasText: mentionName }).first();
      await expect(menu).toBeVisible();
      await expect(option).toBeVisible();
      const inputBox = await input.boundingBox();
      const menuBox = await menu.boundingBox();
      expect(inputBox, 'tag input has a visible bounding box').toBeTruthy();
      expect(menuBox, 'tag menu has a visible bounding box').toBeTruthy();
      expect(menuBox.width).toBeGreaterThan(80);
      expect(menuBox.height).toBeGreaterThan(30);
      expect(menuBox.y).toBeGreaterThanOrEqual(0);
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.y).toBeGreaterThan(inputBox.y);
      await input.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await input.press('Backspace');
    };

    await login(page, env.e2eEmail, env.e2ePassword);
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByPlaceholder('What needs to be done?').fill(title);
    await page.locator('input[type="date"]').fill(due);
    await page.getByRole('button', { name: /Create Objective|Delegate Objective/i }).click();
    await expect(page.getByText(/Objective created|Objective delegated/i)).toBeVisible();

    await navItem(page, 'Objectives').click();
    await page.getByPlaceholder('Search objectives...').fill(title);
    const row = objectiveResult(page, title);
    await expect(row).toBeVisible();
    await expectVisibleTagMenu(row.locator('.tag-mention-input'));

    await openObjectiveByTitle(page, title);
    await page.getByRole('button', { name: /Tag someone/i }).click();
    await expectVisibleTagMenu(page.locator('.tag-picker .tag-mention-input'));

    await page.getByRole('button', { name: 'Access', exact: true }).click();
    await expectVisibleTagMenu(page.getByPlaceholder('@name to assign teammate'));

    await page.getByTitle('Delete').click();
    await page.locator('.btn-danger').filter({ hasText: /^Delete$/ }).click();
    await expect(page.getByText('Objective deleted')).toBeVisible();
  });
});
