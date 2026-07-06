import { expect, test } from '@playwright/test';
import { dismissDailyBrief, dismissGuidance, env, login, navItem, requireCredentials, openKpiPage } from './helpers.js';

test.describe('KPI command center', () => {
  test.beforeEach(async ({ page }) => {
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD');
    await login(page, env.e2eEmail, env.e2ePassword);
    await dismissDailyBrief(page);
    await dismissGuidance(page);
  });

  test('KPI tab sits beside the Jake modules and loads the command center', async ({ page }) => {
    await expect(navItem(page, 'Tasks & Projects')).toBeVisible();
    await expect(navItem(page, 'OKR')).toBeVisible();
    await expect(navItem(page, 'NCR')).toBeVisible();
    // KPI is deliberately off-nav (Jake: the OKR page IS the KPI report)
    await expect(navItem(page, 'KPI')).toHaveCount(0);
    await openKpiPage(page);
    await expect(page).toHaveURL(/page=kpi/);
    await expect(page.getByRole('heading', { name: /KPI Command Center/i })).toBeVisible();
    await expect(page.getByText(/Company operating KPIs/i)).toBeVisible();
    await expect(page.getByText(/Department quarterly scorecard/i)).toBeVisible();
    await expect(page.getByText(/NCR quality strip/i)).toBeVisible();
    await expect(page.locator('.kpi-command-card').first()).toBeVisible();
    const valueText = (await page.locator('.kpi-command-value span').allTextContents()).join(' ');
    expect(valueText).not.toMatch(/\d(?:objectives?|projects?|KRs?|incidents?)\b/);
    await expect(page.locator('.kpi-status-pill').first()).toBeVisible();
    await expect(page.locator('.kpi-status-pill').first()).toHaveClass(/kpi-status-(red|yellow|green|gray)/);
    await page.locator('.kpi-command-card').first().click();
    await expect(page.getByText(/Detail lens/i)).toBeVisible();
    await expect(page.getByText('Definition')).toBeVisible();
    await expect(page.getByRole('button', { name: /Create objective/i })).toBeVisible();
    await expect(page.getByLabel('Manual KPI value')).toBeDisabled();
    await expect(page.getByRole('button', { name: /Save value/i })).toBeDisabled();
  });

  test('KPI filters, department coverage, and CSV preview are interactive', async ({ page }) => {
    await openKpiPage(page);
    await expect(page.getByRole('heading', { name: /KPI Command Center/i })).toBeVisible();
    await page.getByLabel('KPI source scope').selectOption('computed');
    await expect(page.locator('.kpi-command-card').first()).toBeVisible();
    await page.getByLabel('KPI period').selectOption('week');
    await expect(page.getByText(/Weekly execution lens/i)).toBeVisible();
    const departmentSelect = page.getByLabel('KPI department');
    const departments = await departmentSelect.locator('option').allTextContents();
    expect(departments).toEqual(expect.arrayContaining(['Automation', 'Wellhead', 'Flowback', 'CP Warehouse', 'Business Team']));
    await departmentSelect.selectOption('Business Team');
    const filteredScorecardRows = page.locator('.kpi-scorecard-table tbody tr');
    await expect(filteredScorecardRows).toHaveCount(1);
    await expect(filteredScorecardRows.first()).toContainText('Business Team');
    await expect(filteredScorecardRows.first()).toContainText(/No objectives yet|\d+ active/);
    await departmentSelect.selectOption('all');

    await page.locator('.kpi-import-label input').setInputFiles({
      name: 'sandpro_department_quarterly_scorecard.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([
        'Department,Objectives,Company OKRs,Department OKRs,Key Results,Average Progress,Stale KRs',
        'Business Team,10,0,0,0,92%,0',
      ].join('\n')),
    });
    await expect(page.getByText(/1 importable rows/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Import rows/i })).toBeVisible();
  });

  test('KPI page scrolls to the lower operating panels', async ({ page }) => {
    await openKpiPage(page);
    await expect(page.getByRole('heading', { name: /KPI Command Center/i })).toBeVisible();

    const mainContent = page.locator('.main-content');
    const scrollMetrics = await mainContent.evaluate((element) => ({
      overflowY: window.getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    expect(scrollMetrics.overflowY).toMatch(/auto|scroll/);
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);

    await mainContent.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByRole('heading', { name: /Action, watch, and missing data KPIs/i })).toBeVisible();
    await expect(page.getByText(/NCR quality strip/i)).toBeVisible();
  });

  test('Action Inbox help explains why the box matters to the user', async ({ page }) => {
    await openKpiPage(page);
    await expect(page.getByRole('heading', { name: /KPI Command Center/i })).toBeVisible();
    await page.locator('.main-content').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    await page.getByRole('button', { name: /Explain Action Inbox/i }).hover();
    await expect(page.getByRole('tooltip', { name: /What matters to you here/i })).toBeVisible();
    await expect(page.getByRole('tooltip')).toContainText(/not the full KPI catalog/i);
  });

  test('KPI Action Inbox cards stay readable on phone widths', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openKpiPage(page);
    await expect(page.getByRole('heading', { name: /KPI Command Center/i })).toBeVisible();

    const actionPanel = page.locator('.kpi-alert-panel');
    await actionPanel.scrollIntoViewIfNeeded();
    const firstAlert = actionPanel.locator('.kpi-alert-row').first();
    await expect(firstAlert).toBeVisible();

    const metrics = await firstAlert.evaluate((row) => {
      const styles = window.getComputedStyle(row);
      const rect = row.getBoundingClientRect();
      const content = row.querySelector('div')?.getBoundingClientRect();
      const title = row.querySelector('strong')?.getBoundingClientRect();
      const message = row.querySelector('span')?.getBoundingClientRect();
      const button = row.querySelector('button')?.getBoundingClientRect();
      return {
        flexDirection: styles.flexDirection,
        rowWidth: rect.width,
        contentWidth: content?.width || 0,
        titleWidth: title?.width || 0,
        messageWidth: message?.width || 0,
        titleBottom: title?.bottom || 0,
        messageBottom: message?.bottom || 0,
        buttonTop: button?.top || 0,
        buttonWidth: button?.width || 0,
      };
    });

    expect(metrics.flexDirection).toBe('column');
    expect(metrics.contentWidth).toBeGreaterThan(metrics.rowWidth * 0.85);
    expect(metrics.titleWidth).toBeGreaterThan(metrics.rowWidth * 0.75);
    expect(metrics.messageWidth).toBeGreaterThan(metrics.rowWidth * 0.75);
    expect(metrics.buttonTop).toBeGreaterThan(Math.max(metrics.titleBottom, metrics.messageBottom));
    expect(metrics.buttonWidth).toBeLessThanOrEqual(metrics.rowWidth);
  });

  test('red KPI can start a prefilled objective when mutation checks are enabled', async ({ page }) => {
    test.skip(!env.allowMutation, 'Set SANDPRO_E2E_ALLOW_MUTATION=1 for KPI objective creation.');
    await openKpiPage(page);
    await page.locator('.kpi-command-card').first().click();
    await page.getByRole('button', { name: /Create objective/i }).click();
    await expect(page.getByText(/Objective created from/i).or(page.getByTestId('objective-detail-modal'))).toBeVisible({ timeout: 15000 });
  });
});
