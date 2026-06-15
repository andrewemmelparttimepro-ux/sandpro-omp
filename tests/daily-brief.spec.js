import { expect, test } from '@playwright/test';
import { env, login, requireCredentials } from './helpers.js';

test.describe('SandPro Daily', () => {
  test('company-wide launch is the lead story', async ({ page }) => {
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SandPro E2E credentials');

    await login(page, env.e2eEmail, env.e2ePassword);
    await page.getByTitle('Daily Brief').click();
    await expect(page.locator('.brief-overlay')).toBeVisible();

    await expect(page.locator('.brief-bulletin-headline')).toContainText('SandPro OMP goes company-wide this Wednesday');
    await expect(page.locator('.brief-byline')).toContainText('Wednesday, June 17, 2026');
    await expect(page.locator('.brief-rollout-hero')).toContainText('Company-wide');
    await expect(page.locator('.brief-rollout-hero')).toContainText('all of SandPro');

    const prominence = await page.locator('.brief-bulletin').evaluate((node) => {
      const hero = node.querySelector('.brief-rollout-hero')?.getBoundingClientRect();
      const grid = node.querySelector('.brief-bulletin-grid')?.getBoundingClientRect();
      const firstCard = node.querySelector('.brief-bulletin-card')?.getBoundingClientRect();
      return {
        heroBeforeGrid: Boolean(hero && grid && hero.top < grid.top),
        heroDominatesCard: Boolean(hero && firstCard && hero.width * hero.height > firstCard.width * firstCard.height * 1.5),
      };
    });
    expect(prominence.heroBeforeGrid).toBe(true);
    expect(prominence.heroDominatesCard).toBe(true);
  });

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
