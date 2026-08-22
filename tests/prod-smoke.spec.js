import { expect, test } from '@playwright/test';
import { dismissDailyBrief, dismissGuidance, env, login, navItem, openKpiPage, requireCredentials, signOutIfPossible } from './helpers.js';

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
    expect(sw).toContain("CACHE_NAME = 'sandpro-omp-shell-v13'");
  });

  test('release smoke admin can log in and reach core read-only surfaces', async ({ page }, testInfo) => {
    requireCredentials(env.smokeAdminEmail, env.smokeAdminPassword, 'SANDPRO_SMOKE_ADMIN_EMAIL and SANDPRO_SMOKE_ADMIN_PASSWORD');
    await login(page, env.smokeAdminEmail, env.smokeAdminPassword);
    // Phones navigate by the thumb bar (item 3); desktop by the top nav.
    const isMobile = testInfo.project.name === 'mobile-chrome';
    const nav = (label, short) => (isMobile
      ? page.locator('.mobile-bottom-nav').getByRole('button', { name: short })
      : navItem(page, label));
    await expect(nav('Tasks & Projects', 'Tasks')).toBeVisible();
    await dismissGuidance(page);
    await nav('OKR', 'OKR').click();
    await expect(page.getByRole('button', { name: 'Presentation view' })).toBeVisible();
    await dismissGuidance(page);
    await openKpiPage(page); // off-nav by design; still deep-linkable
    await expect(page.getByRole('heading', { name: /KPI Command Center/i })).toBeVisible({ timeout: 45000 });
    await dismissGuidance(page);
    await nav('Organization', 'Org').click();
    await expect(visibleInput(page, 'Search people...')).toBeVisible();
    await dismissDailyBrief(page);
    if (testInfo.project.name !== 'mobile-chrome') {
      await page.getByTitle('Toggle theme').click();
      const dailyBriefButton = page.getByTitle('Daily Brief');
      if (await dailyBriefButton.isVisible().catch(() => false)) {
        await dailyBriefButton.click();
        await page.keyboard.press('Escape');
      }
      await page.getByTitle('Open Admin').click();
      await expect(page.getByText('Admin Panel')).toBeVisible();
      await signOutIfPossible(page);
    } else {
      await expect(page.getByRole('button', { name: 'User settings' })).toBeVisible();
    }
  });

  test('release smoke member credentials reach the app or the required password-change gate', async ({ page }, testInfo) => {
    requireCredentials(env.smokeMemberEmail, env.smokeMemberPassword, 'SANDPRO_SMOKE_MEMBER_EMAIL and SANDPRO_SMOKE_MEMBER_PASSWORD');
    await login(page, env.smokeMemberEmail, env.smokeMemberPassword);
    const tasksNav = testInfo.project.name === 'mobile-chrome'
      ? page.locator('.mobile-bottom-nav').getByRole('button', { name: 'Tasks' })
      : navItem(page, 'Tasks & Projects');
    await expect(tasksNav).toBeVisible();
  });

  test('known NCR PDF opens from private storage with a fresh secure link', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'One desktop proof is enough for the private PDF response.');
    requireCredentials(env.smokeAdminEmail, env.smokeAdminPassword, 'SANDPRO_SMOKE_ADMIN_EMAIL and SANDPRO_SMOKE_ADMIN_PASSWORD');
    await login(page, env.smokeAdminEmail, env.smokeAdminPassword);
    await page.goto('/?page=ncr', { waitUntil: 'domcontentloaded' });
    await dismissDailyBrief(page);
    await dismissGuidance(page);

    const search = page.locator('input[placeholder="Search NCRs..."]').filter({ visible: true }).first();
    await expect(search).toBeVisible({ timeout: 45_000 });
    await search.fill('86270964');
    const reportRow = page.locator('tr').filter({ hasText: '#86270964' }).first();
    await expect(reportRow).toBeVisible();
    await reportRow.click();

    const pdfLink = page.locator('a.ncr-event-doc-file').filter({ hasText: 'KPA-NCR-86270964.pdf' }).first();
    await expect(pdfLink).toBeVisible({ timeout: 20_000 });
    // Headless Chromium keeps popup.url() at about:blank for a successful PDF
    // navigation because its PDF viewer aborts the document navigation. Prove
    // the real cross-page request and response instead of the viewer's shell.
    const signedPdfRequestPromise = page.context().waitForEvent('request', {
      predicate: request => request.method() === 'GET'
        && request.url().includes('/storage/v1/object/sign/ncr-files/')
        && request.url().includes('token='),
      timeout: 20_000,
    });
    const popupPromise = page.waitForEvent('popup');
    await pdfLink.click();
    const popup = await popupPromise;
    const signedPdfRequest = await signedPdfRequestPromise;
    const signedPdfResponse = await signedPdfRequest.response();
    expect(signedPdfResponse?.status()).toBe(200);
    expect(signedPdfResponse?.headers()['content-type']).toContain('application/pdf');
    await expect(page.getByText(/Couldn't create a secure link/i)).toHaveCount(0);
    await popup.close();
  });
});
