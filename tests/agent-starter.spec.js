import { expect, test } from '@playwright/test';
import { env, login, navItem, objectiveResult, openObjectiveByTitle, requireCredentials } from './helpers.js';

test.describe('Objective Assistant starter', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!env.allowMutation, 'Set SANDPRO_E2E_ALLOW_MUTATION=1 for isolated staging agent checks.');
    test.skip(!env.agentE2e, 'Set SANDPRO_AGENT_E2E=1 to run OpenAI-backed agent checks.');
    test.skip(!env.aiOwnerE2e, 'Set SANDPRO_AI_OWNER_E2E=1 and use the personal AI owner account to run this UI check.');
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL and SANDPRO_E2E_PASSWORD');
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('sandpro-ai-features-enabled-v2', '1'));
    await login(page, env.e2eEmail, env.e2ePassword);
  });

  test('manual starter pack creates an agent banner and persistent file', async ({ page }) => {
    test.setTimeout(120000);
    const title = `Objective Assistant E2E ${Date.now()}`;
    const due = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    await page.getByRole('button', { name: /New/i }).click();
    await page.getByPlaceholder('What needs to be done?').fill(title);
    await page.getByPlaceholder('Add details...').fill('Find the first steps, likely questions, and requested inputs for an objective starter pack.');
    await page.locator('input[type="date"]').fill(due);
    await page.getByRole('button', { name: /Create Objective|Delegate Objective/i }).click();
    await expect(page.getByText(/Objective created|Objective delegated/i)).toBeVisible();

    await navItem(page, 'Objectives').click();
    await page.getByPlaceholder('Search objectives...').fill(title);
    await expect(objectiveResult(page, title)).toBeVisible();
    await openObjectiveByTitle(page, title);
    await expect(page.getByText('Objective Assistant can prepare a starter pack').first()).toBeVisible();

    await page.getByRole('button', { name: /Get assistant started/i }).first().click();
    await expect(page.getByRole('button', { name: 'Preparing...' }).first()).toBeVisible();
    await expect(page.getByText('Objective Assistant got this started.')).toBeVisible({ timeout: 90000 });
    await page.getByRole('button', { name: /View starter pack/i }).click();
    await expect(page.getByRole('button', { name: /Objective Starter Pack -/ }).first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('Objective Assistant got this started.')).toBeVisible();
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    const starterPackFile = page.getByRole('button', { name: /Objective Starter Pack -/ }).first();
    await expect(starterPackFile).toBeVisible();
    await starterPackFile.click();
    await expect(page.getByText(/Prepared by Objective Assistant/i)).toBeVisible();
    await page.getByTitle('Close preview').click();

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.locator('.btn-danger').filter({ hasText: /^Delete$/ }).click();
    await expect(page.getByText('Objective deleted')).toBeVisible();
  });
});
