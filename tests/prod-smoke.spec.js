import { expect, test } from '@playwright/test';
import { dismissDailyBrief, dismissGuidance, env, login, navItem, requireCredentials, signOutIfPossible } from './helpers.js';

const visibleInput = (page, placeholder) => page.locator(`input[placeholder="${placeholder}"]`).filter({ visible: true }).first();

test.describe('production read-only smoke', () => {
  test('domain serves the SandPro OMP login shell over HTTPS', async ({ page }) => {
    await page.goto(env.baseUrl);
    await expect(page).toHaveTitle(/SandPro OMP/);
    await expect(page.getByText(/Objective Management Platform|Operational Management Platform/)).toBeVisible();
    await expect(page.locator('form').getByRole('button', { name: /Sign in/i })).toBeVisible();
    const swResponse = await page.request.get(`${env.baseUrl}/sw.js`);
    expect(swResponse.ok()).toBeTruthy();
    const sw = await swResponse.text();
    expect(sw).not.toContain("CACHE_NAME = 'sandpro-omp-shell-v1'");
    expect(sw).toContain("CACHE_NAME = 'sandpro-omp-shell-v10'");
  });

  test('release smoke admin can log in and reach core read-only surfaces', async ({ page }, testInfo) => {
    requireCredentials(env.smokeAdminEmail, env.smokeAdminPassword, 'SANDPRO_SMOKE_ADMIN_EMAIL and SANDPRO_SMOKE_ADMIN_PASSWORD');
    await login(page, env.smokeAdminEmail, env.smokeAdminPassword);
    await expect(navItem(page, 'Tasks & Projects')).toBeVisible();
    await dismissGuidance(page);
    await navItem(page, 'OKR').click();
    await expect(page.getByRole('button', { name: 'Presentation view' })).toBeVisible();
    await dismissGuidance(page);
    await navItem(page, 'KPI').click();
    await expect(page.getByRole('heading', { name: /KPI Command Center/i })).toBeVisible({ timeout: 45000 });
    await dismissGuidance(page);
    await navItem(page, 'Organization').click();
    await expect(visibleInput(page, 'Search people...')).toBeVisible();
    await dismissDailyBrief(page);
    if (testInfo.project.name !== 'mobile-chrome') {
      await page.getByTitle('Toggle theme').click();
      await page.getByTitle('Daily Brief').click();
      await page.keyboard.press('Escape');
      await page.getByTitle('Open Admin').click();
      await expect(page.getByText('Admin Panel')).toBeVisible();
      await signOutIfPossible(page);
    } else {
      await expect(page.getByRole('button', { name: 'User settings' })).toBeVisible();
    }
  });

  test('release smoke member credentials reach the app or the required password-change gate', async ({ page }) => {
    requireCredentials(env.smokeMemberEmail, env.smokeMemberPassword, 'SANDPRO_SMOKE_MEMBER_EMAIL and SANDPRO_SMOKE_MEMBER_PASSWORD');
    await login(page, env.smokeMemberEmail, env.smokeMemberPassword);
    await expect(navItem(page, 'Tasks & Projects')).toBeVisible();
  });
});
