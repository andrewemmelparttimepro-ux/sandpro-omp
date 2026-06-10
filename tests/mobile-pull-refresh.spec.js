import { expect, test } from '@playwright/test';
import { dismissGuidance, env, login, navItem, requireCredentials } from './helpers.js';

test.describe('mobile pull to refresh', () => {
  test.beforeEach(async ({ page }) => {
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD');
    await page.setViewportSize({ width: 393, height: 852 });
    await login(page, env.e2eEmail, env.e2ePassword);
    await dismissGuidance(page);
  });

  test('pulling down at the top of the mobile app shows release state and reloads', async ({ page }) => {
    await navItem(page, 'Fix-It Feed').click();
    await expect(page.locator('.fixit-page')).toBeVisible();
    await page.evaluate(() => {
      const main = document.querySelector('.main-content');
      if (main) main.scrollTop = 0;
    });

    const box = await page.locator('.main-content').boundingBox();
    const x = Math.floor((box?.x || 0) + (box?.width || 393) / 2);
    const y = Math.floor((box?.y || 70) + 24);

    await page.evaluate(({ x, y }) => {
      const main = document.querySelector('.main-content');
      const dispatch = (type, clientY) => main.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      }));
      dispatch('pointerdown', y);
      dispatch('pointermove', y + 150);
    }, { x, y });

    await expect(page.locator('.mobile-pull-refresh')).toContainText('Release to reload');
    const navigation = page.waitForEvent('framenavigated', { timeout: 4000 }).catch(() => null);
    await page.evaluate(({ x, y }) => {
      const main = document.querySelector('.main-content');
      main.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y + 150,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      }));
    }, { x, y });
    expect(await navigation).not.toBeNull();
  });
});
