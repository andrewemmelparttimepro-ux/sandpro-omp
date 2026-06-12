import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import readXlsxFile from 'read-excel-file/node';
import { dismissDailyBrief, dismissGuidance, env, login, navItem, requireCredentials } from './helpers.js';

test.describe('objectives onboarding and kanban scrolling', () => {
  test.beforeEach(async ({ page }) => {
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD or Jake credentials');
    await login(page, env.e2eEmail, env.e2ePassword);
  });

  test('first-login framework explainer shows once per user and version', async ({ page }) => {
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sandpro-framework-explainer-seen-')) localStorage.removeItem(key);
      }
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissDailyBrief(page);

    const explainer = page.getByRole('dialog', { name: /What changed in Dashboard \+ Objectives/i });
    await expect(explainer).toBeVisible({ timeout: 10000 });
    await expect(explainer).toContainText('Dashboard is now the command view');
    await expect(explainer).toContainText('Objectives is the working record');

    await explainer.getByRole('button', { name: 'Got it', exact: true }).click();
    await expect(explainer).toHaveCount(0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissDailyBrief(page);
    await expect(explainer).toHaveCount(0);
  });

  test('kanban view allows mouse-wheel scrolling through hidden objective cards', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 640 });
    await dismissGuidance(page);
    await navItem(page, 'Objectives').click();
    await page.getByTitle('Kanban View').click();
    await dismissGuidance(page);

    const shell = page.locator('.objectives-content-kanban');
    await expect(shell).toBeVisible();
    await expect(page.locator('.kanban-column')).toHaveCount(5);

    const cardHeights = await page.locator('.kanban-column-body .card').evaluateAll(cards => (
      cards.map(card => card.getBoundingClientRect().height)
    ));
    expect(Math.min(...cardHeights)).toBeGreaterThan(120);

    const scrollableBodyIndex = await page.locator('.kanban-column-body').evaluateAll(bodies => (
      bodies.findIndex(body => body.scrollHeight > body.clientHeight + 6)
    ));
    expect(scrollableBodyIndex).toBeGreaterThanOrEqual(0);

    const body = page.locator('.kanban-column-body').nth(scrollableBodyIndex);
    const box = await body.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box.x + Math.min(160, box.width / 2), box.y + Math.min(260, box.height / 2));
    await page.mouse.wheel(0, 520);

    await expect.poll(async () => body.evaluate(el => el.scrollTop), {
      message: 'The Kanban column body should scroll when the user wheels over hidden cards.',
    }).toBeGreaterThan(0);
  });

  test('OKR exports download populated usable reports', async ({ page }) => {
    await dismissGuidance(page);
    await navItem(page, 'Objectives').click();
    await page.getByTitle('OKR Tree View').click();
    await expect(page.getByText('OKR + Project Tree')).toBeVisible();

    const downloadCsv = async (buttonName, expectedFile, expectedHeader) => {
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: buttonName }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(expectedFile);
      const path = await download.path();
      const text = readFileSync(path, 'utf8');
      expect(text).toContain(expectedHeader);
      expect(text.trim().split('\n').length).toBeGreaterThan(1);
      return text;
    };

    await downloadCsv(/Jake 1-pager/i, 'sandpro_jake_weekly_okr_one_pager.csv', '"Section","Name","Owner","Status","Note"');
    await downloadCsv(/Dept scorecard/i, 'sandpro_department_quarterly_scorecard.csv', '"Department","Objectives","Company OKRs"');
    await downloadCsv(/^R&D$/i, 'sandpro_rd_pipeline.csv', '"Project","Stage","Health","Lead","Sponsor","Target Date","Next Milestone","Gate blockers"');

    const xlsxPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /^Excel$/i }).click();
    const xlsx = await xlsxPromise;
    expect(xlsx.suggestedFilename()).toBe('sandpro_okr_quarterly_scorecard.xlsx');
    const xlsxPath = await xlsx.path();
    const workbookRows = await readXlsxFile(xlsxPath);
    const workbookText = JSON.stringify(workbookRows);
    expect(workbookRows.length).toBeGreaterThan(1);
    expect(workbookText).toContain('Quarterly Scorecard');
    expect(workbookText).toContain('Project Pipeline');
    expect(workbookText).toContain('Gate blockers');

    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: /^PDF$/i }).click();
    const popup = await popupPromise;
    await expect(popup.getByRole('heading', { name: 'SandPro OMP Quarterly Scorecard' })).toBeVisible();
    await expect(popup.locator('table tbody tr').first()).toBeVisible();
    await popup.close();

    const auditButton = page.getByRole('button', { name: /Audit pack/i }).first();
    if (await auditButton.isVisible().catch(() => false)) {
      const auditPromise = page.waitForEvent('download');
      await auditButton.click();
      const audit = await auditPromise;
      expect(audit.suggestedFilename()).toMatch(/^sandpro_project_audit_.*\.csv$/);
      const auditText = readFileSync(await audit.path(), 'utf8');
      expect(auditText).toContain('"Section","Field","Value"');
      expect(auditText).toContain('"Project","Name"');
    }
  });
});
