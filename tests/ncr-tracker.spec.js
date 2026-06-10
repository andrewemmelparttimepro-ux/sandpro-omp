import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { dismissDailyBrief, dismissGuidance, env, login, requireCredentials } from './helpers.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const admin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

test.describe('NCR tracker', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    test.skip(!env.allowMutation, 'Set SANDPRO_E2E_ALLOW_MUTATION=1 for isolated NCR workflow checks.');
    test.skip(!admin, 'Set SUPABASE_SERVICE_ROLE_KEY for isolated NCR workflow checks.');
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL and SANDPRO_E2E_PASSWORD');
    await login(page, env.e2eEmail, env.e2ePassword);
  });

  test('creates an NCR from the production UI form', async ({ page }) => {
    const reportNumber = `QA-FORM-${Date.now()}`;
    let ncrId;

    try {
      await page.getByRole('link', { name: /NCR/i }).click();
      await dismissGuidance(page);
      await expect(page.getByRole('heading', { name: 'NCR Tracker' })).toBeVisible();
      await expect(page.getByRole('button', { name: /New NCR/i })).toBeVisible();

      await page.getByRole('button', { name: /New NCR/i }).click();
      await expect(page.locator('.card-header').filter({ hasText: 'Create NCR' })).toBeVisible();
      await page.locator('label:has-text("Report Number") input').fill(reportNumber);
      await page.locator('label:has-text("Observer") input').fill('Production QA');
      await page.locator('label:has-text("Author") input').fill('Production QA');
      await page.locator('label:has-text("Group") input').fill('Quality Control');
      await page.locator('label:has-text("Event Type") input').fill('Process Loss');
      await page.locator('label:has-text("Criticality") select').selectOption('Critical');
      await page.locator('label:has-text("Follow-Up Count") input').fill('1');
      await page.locator('label:has-text("Follow-Up Due Date") input').fill(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
      await page.locator('label:has-text("Event Description") textarea').fill('Temporary NCR UI creation validation event.');
      await page.locator('label:has-text("Root Cause Analysis") select').selectOption('Process Gap');
      await page.locator('label:has-text("Immediate Action") textarea').fill('Contain temporary test record.');
      await page.locator('label:has-text("Permanent Action") textarea').fill('Remove temporary record after validation.');
      await page.getByRole('button', { name: /^Create NCR$/i }).click();
      await expect(page.getByText(`NCR #${reportNumber} created`)).toBeVisible();

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const { data } = await admin
          .from('ncr_reports')
          .select('id,status,closed,severity,event_description,department_group')
          .eq('report_number', reportNumber)
          .single();
        if (data?.id) {
          ncrId = data.id;
          expect(data.status).toBe('open');
          expect(data.closed).toBe(false);
          expect(data.severity).toBe('Critical');
          expect(data.department_group).toBe('Quality Control');
          expect(data.event_description).toContain('Temporary NCR UI creation validation event.');
          break;
        }
        await page.waitForTimeout(500);
      }
      expect(ncrId).toBeTruthy();

      await page.getByPlaceholder('Search NCRs...').fill(reportNumber);
      await expect(page.getByText(`#${reportNumber}`, { exact: true })).toBeVisible();
      const detailPanel = page.locator('.ncr-detail-panel');
      await expect(detailPanel.getByText(`NCR #${reportNumber}`)).toBeVisible();
      await expect(detailPanel.getByText('Temporary NCR UI creation validation event.')).toBeVisible();
    } finally {
      if (ncrId) await admin.from('ncr_reports').delete().eq('id', ncrId);
      await admin.from('ncr_reports').delete().eq('report_number', reportNumber);
    }
  });

  test('creates an objective from an NCR and closes a report', async ({ page }) => {
    const stamp = Date.now();
    const closeReportNumber = `QA-CLOSE-${stamp}`;
    const objectiveReportNumber = `QA-OBJ-${stamp}`;
    let closeNcrId;
    let objectiveNcrId;
    let objectiveId;

    try {
      const baseReport = {
        report_date: new Date().toISOString().slice(0, 10),
        observer: 'Production QA',
        follow_up_count: 2,
        follow_up_details: 'Assign owners and verify corrective action before closure.',
        follow_up_due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        worksite_area: 'QA Rig',
        operator_location: 'QA Operator - Test Yard',
        internal_external: 'Internal',
        event_type: 'Process Loss',
        non_productive_time: 'No',
        author: 'Production QA',
        personnel_involved: 'QA Validator',
        event_description: 'Temporary NCR browser validation event.',
        severity: 'Critical',
        root_cause_codes: 'Process',
        root_cause_analysis: 'Temporary QA root cause.',
        immediate_action: 'Contain test record.',
        permanent_action: 'Create linked objective and clean up.',
        affected_departments: 'Quality',
        department_group: 'Quality Control',
        long_term_follow_up: 'Remove temporary record after test.',
        action_effective: 'Pending',
        status: 'open',
        closed: false,
      };
      const { data: reports, error: insertError } = await admin
        .from('ncr_reports')
        .insert([
          { ...baseReport, report_number: closeReportNumber },
          { ...baseReport, report_number: objectiveReportNumber },
        ])
        .select('id,report_number');
      expect(insertError).toBeFalsy();
      closeNcrId = reports.find(report => report.report_number === closeReportNumber).id;
      objectiveNcrId = reports.find(report => report.report_number === objectiveReportNumber).id;

      await page.reload();
      await dismissDailyBrief(page);
      await page.getByRole('link', { name: /NCR/i }).click();
      await dismissGuidance(page);
      await expect(page.getByPlaceholder('Search NCRs...')).toBeVisible();
      await page.getByPlaceholder('Search NCRs...').fill(closeReportNumber);
      await expect(page.getByText(`#${closeReportNumber}`, { exact: true })).toBeVisible();
      const detailPanel = page.locator('.ncr-detail-panel');
      await expect(detailPanel.getByText(`NCR #${closeReportNumber}`)).toBeVisible();
      await expect(detailPanel.getByText('Temporary NCR browser validation event.')).toBeVisible();
      await page.getByRole('button', { name: /Mark closed/i }).click();
      let closedReport;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const { data } = await admin
          .from('ncr_reports')
          .select('closed,status')
          .eq('id', closeNcrId)
          .single();
        closedReport = data;
        if (closedReport?.closed) break;
        await page.waitForTimeout(500);
      }
      expect(closedReport.closed).toBe(true);
      expect(closedReport.status).toBe('closed');

      await page.getByPlaceholder('Search NCRs...').fill(objectiveReportNumber);
      await expect(page.getByText(`#${objectiveReportNumber}`, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: /Create objective/i }).click();
      await expect(page.getByText(`Objective created for NCR #${objectiveReportNumber}`)).toBeVisible();

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const { data: updated } = await admin
          .from('ncr_reports')
          .select('linked_objective_id,status')
          .eq('id', objectiveNcrId)
          .single();
        if (updated?.linked_objective_id) {
          objectiveId = updated.linked_objective_id;
          expect(updated.status).toBe('in_progress');
          break;
        }
        await page.waitForTimeout(500);
      }
      expect(objectiveId).toBeTruthy();

      const { data: objective, error: objectiveError } = await admin
        .from('objectives')
        .select('id,title,description,department,status')
        .eq('id', objectiveId)
        .single();
      expect(objectiveError).toBeFalsy();
      expect(objective.title).toContain(`NCR #${objectiveReportNumber}`);
      expect(objective.description).toContain('Temporary NCR browser validation event.');
      expect(objective.department).toBe('Quality Control');
    } finally {
      if (objectiveId) await admin.from('objectives').delete().eq('id', objectiveId);
      if (closeNcrId) await admin.from('ncr_reports').delete().eq('id', closeNcrId);
      if (objectiveNcrId) await admin.from('ncr_reports').delete().eq('id', objectiveNcrId);
    }
  });
});
