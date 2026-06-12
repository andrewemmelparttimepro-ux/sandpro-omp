import { expect, test } from '@playwright/test';
import { dismissDailyBrief, env, login, navItem, requireCredentials } from './helpers.js';

test.describe('OKR + project assessment framework cohesion', () => {
  test.beforeEach(async ({ page }) => {
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD');
    await login(page, env.e2eEmail, env.e2ePassword);
    await dismissDailyBrief(page);
  });

  test('dashboard framework strip opens the same Objective lens filters', async ({ page }, testInfo) => {
    await expect(page.locator('.framework-dashboard-strip')).toBeVisible();
    await page.getByRole('button', { name: /Projects in assessment/i }).click();

    await expect(page).toHaveURL(/page=objectives/);
    await expect(page).toHaveURL(/projectStage=assessment/);
    await expect(page).toHaveURL(/view=tree/);
    if (testInfo.project.name !== 'mobile-chrome') {
      await expect(page.getByText('OKR + Project Tree')).toBeVisible();
    }
  });

  test('objectives tab exposes tree view, OKR filters, and report exports', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chrome', 'Desktop toolbar tree/export controls are intentionally hidden on mobile.');
    await navItem(page, 'Objectives').click();
    await page.getByTitle('OKR Tree View').click();
    await expect(page).toHaveURL(/view=tree/);
    await expect(page.getByText('OKR + Project Tree')).toBeVisible();

    await expect(page.getByRole('button', { name: /Jake 1-pager/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Dept scorecard/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^R&D$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^PDF$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Excel$/i })).toBeVisible();

    await page.locator('select.objectives-filter-select').filter({ hasText: 'All OKR levels' }).selectOption('key_result');
    await expect(page).toHaveURL(/okrLevel=key_result/);
  });

  test('assumed classifications open a confirmed category dropdown instead of Unclassified', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-chrome', 'Desktop tree classification control is covered on desktop.');
    await navItem(page, 'Objectives').click();
    await page.getByTitle('OKR Tree View').click();
    await expect(page.getByText('OKR + Project Tree')).toBeVisible();

    const assumedChip = page.locator('.okr-classification-chip.assumed').first();
    await expect(assumedChip).toBeVisible();
    await expect(assumedChip).toContainText(/Assumed/i);
    await expect(page.locator('.okr-unclassified-chip')).toHaveCount(0);

    await assumedChip.click();
    const editor = page.locator('.okr-classification-editor').first();
    await expect(editor).toBeVisible();
    const optionLabels = await editor.locator('option').evaluateAll(options => options.map(option => option.textContent));
    expect(optionLabels.join(' ')).not.toMatch(/Unclassified/i);

    const select = editor.locator('select');
    const current = await select.inputValue();
    await select.selectOption(current === 'project' ? 'run_the_business' : 'project');
    await expect(editor.getByRole('button', { name: /Confirm classification change/i })).toBeEnabled();
    await editor.getByRole('button', { name: /Cancel classification change/i }).click();
    await expect(editor).toHaveCount(0);
  });

  test('objective create/edit form separates work classification from progress calculation', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'mobile-chrome') {
      await page.getByRole('button', { name: 'Create new objective' }).click();
    } else {
      await page.getByRole('button', { name: 'New', exact: true }).click();
    }
    await expect(page.getByText('Work Classification')).toBeVisible();
    await expect(page.getByText('Progress Calculation', { exact: true })).toBeVisible();

    await page.getByPlaceholder('What needs to be done?').fill('KR validation smoke only');
    await page.getByLabel(/Classification/i).selectOption('key_result');
    await expect(page.getByPlaceholder('Baseline')).toBeVisible();
    await expect(page.getByText(/Key Results need/i)).toHaveCount(0);
    await page.getByRole('button', { name: /Create Objective/i }).click();
    await expect(page.getByText('Key Results need a parent OKR.')).toBeVisible();
    await expect(page.getByText('Key Results need baseline, current, and target values.')).toBeVisible();
    await expect(page.getByText('Key Results need a unit.')).toBeVisible();
  });
});
