import { expect, test } from '@playwright/test';
import { dismissGuidance, env, login, requireCredentials } from './helpers.js';

test('OKR column labels remain visible while the grid scrolls vertically', async ({ page }, testInfo) => {
  requireCredentials(
    env.e2eEmail,
    env.e2ePassword,
    'SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD or smoke admin credentials',
  );

  await page.setViewportSize({ width: 1280, height: 650 });
  await login(page, env.e2eEmail, env.e2ePassword);
  await page.goto('/?page=okr', { waitUntil: 'domcontentloaded' });
  await dismissGuidance(page);

  const delayedGuide = page.getByRole('button', { name: 'Dismiss OKR guide' });
  if (await delayedGuide.isVisible({ timeout: 2000 }).catch(() => false)) {
    await delayedGuide.click();
  }

  const scroller = page.locator('.okr-grid-scroll');
  const firstHeader = page.locator('.okr-grid thead th').first();
  await expect(scroller).toBeVisible();
  await expect(firstHeader).toBeVisible();
  await expect.poll(() => scroller.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);

  const before = await firstHeader.boundingBox();
  await scroller.evaluate(element => {
    element.scrollTop = Math.min(500, element.scrollHeight - element.clientHeight);
  });
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const after = await firstHeader.boundingBox();

  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('okr-sticky-header.png') });
});
