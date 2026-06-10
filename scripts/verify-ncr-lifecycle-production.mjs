import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const loadEnvFile = (filename) => {
  const path = resolve(root, filename);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [rawKey, ...rest] = trimmed.split('=');
    const key = rawKey.trim();
    const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '').replace(/\\n/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
};

for (const filename of ['.env.release.local', '.env.local', '.vercel/.env.production.local', '.env.production.local']) {
  loadEnvFile(filename);
}

const baseUrl = process.env.SANDPRO_SMOKE_BASE_URL || 'https://objectivetracker.net';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceKey || !anonKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY for NCR production verification.');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const token = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const reportNumber = `QA-NCR-LIFE-${token}`;
const qaEmail = `qa+ncr-lifecycle-${token}@objectivetracker.net`;
const qaPassword = `${randomBytes(16).toString('base64url')}Aa1!`;
const evidenceDir = resolve(root, 'docs/evidence/ncr-lifecycle');
const evidencePath = resolve(evidenceDir, `ncr-evidence-${token}.txt`);
const screenshotPath = resolve(evidenceDir, `ncr-lifecycle-proof-${token}.png`);
const failureScreenshotPath = resolve(evidenceDir, `ncr-lifecycle-failure-${token}.png`);

let browser;
let context;
let page;
let qaUserId;
let reportId;
let storagePaths = [];

const wait = (ms) => new Promise(resolveDelay => setTimeout(resolveDelay, ms));

const cleanup = async () => {
  try {
    if (storagePaths.length) {
      await admin.storage.from('ncr-files').remove(storagePaths);
    }
    if (reportId) {
      await admin.from('ncr_reports').delete().eq('id', reportId);
    }
    await admin.from('ncr_reports').delete().eq('report_number', reportNumber);
    if (qaUserId) {
      await admin.from('profiles').delete().eq('id', qaUserId);
      await admin.auth.admin.deleteUser(qaUserId).catch(() => {});
    }
    if (existsSync(evidencePath)) rmSync(evidencePath);
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
};

const assertOk = (condition, message) => {
  if (!condition) throw new Error(message);
};

const firstVisible = async (locators) => {
  for (const locator of locators) {
    if (await locator.isVisible({ timeout: 1500 }).catch(() => false)) return locator;
  }
  return null;
};

try {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidencePath, `Temporary SandPro NCR evidence for ${reportNumber}\n`, 'utf8');

  const { data: qaUser, error: qaUserError } = await admin.auth.admin.createUser({
    email: qaEmail,
    password: qaPassword,
    email_confirm: true,
    user_metadata: {
      name: 'NCR Lifecycle QA',
      initials: 'NQ',
      title: 'NCR Release Validator',
      department: 'Quality',
      role: 'executive',
      color: '#ff7f02',
      must_change_password: false,
    },
  });
  if (qaUserError) throw new Error(`Could not create QA user: ${qaUserError.message}`);
  qaUserId = qaUser.user.id;

  await admin.from('profiles').upsert({
    id: qaUserId,
    name: 'NCR Lifecycle QA',
    initials: 'NQ',
    email: qaEmail,
    title: 'NCR Release Validator',
    department: 'Quality',
    role: 'executive',
    color: '#ff7f02',
  });

  const { data: qaProfile } = await admin.from('profiles').select('id,role').eq('id', qaUserId).maybeSingle();
  assertOk(qaProfile?.role === 'executive', 'Temporary NCR QA profile was not created as executive.');
  const { data: authData, error: signInError } = await authClient.auth.signInWithPassword({
    email: qaEmail,
    password: qaPassword,
  });
  if (signInError) throw new Error(`Could not create QA browser session: ${signInError.message}`);
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const authStorageKey = `sb-${projectRef}-auth-token`;

  const { data: people = [], error: peopleError } = await admin
    .from('profiles')
    .select('id,name,email,role')
    .order('name');
  if (peopleError) throw new Error(`Could not load profiles: ${peopleError.message}`);
  const owner = people.find(person => person.id === qaUserId) || people[0];
  assertOk(owner?.id, 'No profile available to assign NCR ownership.');

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
  });
  await context.addInitScript(([key, session]) => {
    window.localStorage.setItem(key, JSON.stringify(session));
  }, [authStorageKey, authData.session]);
  page = await context.newPage();

  await page.goto(`/?page=ncr&qa=${token}`);
  const ncrHeading = page.getByRole('heading', { name: 'NCR Tracker' });
  try {
    await ncrHeading.waitFor({ state: 'visible', timeout: 60000 });
  } catch {
    await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
    throw new Error(`Authenticated app shell did not reach the NCR page. Failure screenshot: ${failureScreenshotPath}`);
  }

  for (const selector of ['.brief-close', '.new-feature-close', '.feature-help-close']) {
    const button = page.locator(selector).first();
    if (await button.isVisible({ timeout: 1000 }).catch(() => false)) await button.click({ force: true });
  }

  await page.getByRole('heading', { name: 'NCR Tracker' }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /New NCR/i }).click();
  const createModal = page.locator('.modal-content').filter({ hasText: 'Create NCR' });
  await createModal.waitFor({ timeout: 10000 });

  await createModal.locator('label:has-text("Report Number") input').fill(reportNumber);
  await createModal.locator('label:has-text("Observer") input').fill('Production NCR QA');
  await createModal.locator('label:has-text("Author") input').fill('Production NCR QA');
  await createModal.locator('label:has-text("Primary Group") select').selectOption('Quality');
  await createModal.locator('label:has-text("Type of Event") select').selectOption('Equipment Failure');
  await createModal.locator('label:has-text("Criticality") select').selectOption('Critical');
  await createModal.locator('label:has-text("Lifecycle Stage") select').selectOption('containment_required');
  await createModal.locator('label:has-text("NCR Owner") select').selectOption(owner.id);
  await createModal.locator('label:has-text("Reviewer") select').selectOption(owner.id);
  await createModal.locator('label:has-text("Verifier") select').selectOption(owner.id);
  await createModal.locator('label:has-text("Operator Location") input').fill('QA Yard');
  await createModal.locator('label:has-text("Worksite Area") select').selectOption('Shop');
  await createModal.locator('label:has-text("Internal / External") select').selectOption('Internal');
  await createModal.locator('label:has-text("NPT") select').selectOption('No');
  await createModal.locator('label:has-text("Estimated Cost") input').fill('1250');
  await createModal.locator('label:has-text("Time Frame for Action") select').selectOption('7 days');
  await createModal.locator('label:has-text("Follow-Up Count") input').fill('2');
  await createModal.locator('label:has-text("Follow-Up Due Date") input').fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
  await createModal.locator('label:has-text("Root Cause Codes") select').selectOption('Faulty Equipment');
  await createModal.locator('label:has-text("Affected Product") input').fill('Bridge plug QA lot');
  await createModal.locator('label:has-text("Affected Equipment") input').fill('QA inspection gauge');
  await createModal.locator('label:has-text("Affected Job") input').fill('QA job NCR baseline');
  await createModal.locator('label:has-text("Disposition") select').selectOption('Hold');
  await createModal.locator('.ncr-checkbox-cloud').filter({ hasText: 'Affected Departments' }).locator('label:has-text("Quality") input').check();
  await createModal.locator('label:has-text("Event Description") textarea').fill('Temporary production validation of the upgraded NCR lifecycle workflow.');
  await createModal.locator('label:has-text("Immediate quarantine") input[type="checkbox"]').check();
  await createModal.locator('label:has-text("Containment Summary") textarea').fill('Temporary NCR lot was placed on hold pending verifier review.');
  await createModal.locator('label:has-text("Disposition Notes") textarea').fill('Hold disposition selected for temporary production QA evidence.');
  await createModal.locator('label:has-text("Root Cause Analysis") textarea').fill('Temporary QA root cause for lifecycle verification.');
  await createModal.locator('label:has-text("Immediate Action") textarea').fill('Contain and hold temporary QA lot.');
  await createModal.locator('label:has-text("Permanent Action") textarea').fill('Create native NCR action item, attach evidence, and verify effectiveness before closure.');
  await createModal.locator('label:has-text("Effectiveness Verification") textarea').fill('Verifier reviewed evidence and confirmed this temporary NCR workflow prevents premature closeout.');
  await createModal.getByRole('button', { name: /^Create NCR$/i }).click();
  await page.getByText(`NCR #${reportNumber} created`).waitFor({ timeout: 15000 });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data } = await admin.from('ncr_reports').select('id').eq('report_number', reportNumber).maybeSingle();
    if (data?.id) {
      reportId = data.id;
      break;
    }
    await wait(500);
  }
  assertOk(reportId, 'Created NCR was not found in production database.');

  await page.goto(`/?page=ncr&qa=${token}&created=${reportId}`);
  await page.getByRole('heading', { name: 'NCR Tracker' }).waitFor({ state: 'visible', timeout: 30000 });
  for (const selector of ['.brief-close', '.new-feature-close', '.feature-help-close']) {
    const button = page.locator(selector).first();
    if (await button.isVisible({ timeout: 750 }).catch(() => false)) await button.click({ force: true });
  }
  await page.locator('.ncr-toolbar select').first().selectOption('all');
  await page.getByPlaceholder('Search NCRs...').fill(reportNumber);
  try {
    await page.locator('.ncr-detail-panel').getByText(reportNumber).waitFor({ timeout: 30000 });
  } catch {
    await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
    const bodyText = await page.locator('body').innerText().catch(() => '');
    throw new Error(`Created NCR did not appear in the rendered list after reload. Failure screenshot: ${failureScreenshotPath}. Body excerpt: ${bodyText.slice(0, 500)}`);
  }

  const actionSection = page.locator('.ncr-section').filter({ hasText: 'Native NCR Action Items' });
  await actionSection.scrollIntoViewIfNeeded();
  await actionSection.locator('.ncr-action-create input[placeholder="Corrective action item..."]').fill('Verify supplier paperwork and quarantine release evidence');
  await actionSection.locator('.ncr-action-create select').selectOption(owner.id);
  await actionSection.locator('.ncr-action-create input[type="date"]').fill(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
  await actionSection.getByRole('button', { name: /Add action/i }).click();
  const actionRow = actionSection.locator('.ncr-action-row').filter({ hasText: 'Verify supplier paperwork' });
  try {
    await actionRow.waitFor({ timeout: 15000 });
  } catch {
    await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
    const bodyText = await page.locator('body').innerText().catch(() => '');
    throw new Error(`NCR action item did not render after add. Failure screenshot: ${failureScreenshotPath}. Body excerpt: ${bodyText.slice(0, 700)}`);
  }
  const actionStatusSelect = actionRow.locator('select').first();
  let actionSelectReady = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    actionSelectReady = await actionStatusSelect.isEnabled().catch(() => false);
    if (actionSelectReady) break;
    await wait(250);
  }
  assertOk(actionSelectReady, 'NCR action status control did not become enabled after save.');
  await actionStatusSelect.selectOption('complete');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { count } = await admin
      .from('ncr_action_items')
      .select('id', { count: 'exact', head: true })
      .eq('ncr_id', reportId)
      .eq('status', 'complete');
    if ((count || 0) >= 1) break;
    await wait(500);
  }

  await page.getByLabel('evidence').setInputFiles(evidencePath);
  await page.locator('.ncr-evidence-list').getByText(`ncr-evidence-${token}.txt`).waitFor({ timeout: 20000 });

  await page.locator('.ncr-section').filter({ hasText: 'Effectiveness Verification' }).locator('textarea').fill('Production QA confirmed verifier, evidence, native action item, audit trail, and closure approval are all present.');
  await page.keyboard.press('Tab');
  await wait(1000);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data } = await admin
      .from('ncr_reports')
      .select('effectiveness_summary')
      .eq('id', reportId)
      .maybeSingle();
    if (data?.effectiveness_summary?.includes('Production QA confirmed')) break;
    await wait(500);
  }
  let signatureSection = page.locator('.ncr-section').filter({ hasText: 'Signatures / Approvals' });
  await signatureSection.locator('select').first().selectOption('department_manager');
  await signatureSection.locator('input[placeholder="Typed signature name"]').fill('Production NCR QA Department Manager');
  await signatureSection.getByRole('button', { name: /Capture signoff/i }).click();
  await signatureSection.locator('.ncr-signature-row').filter({ hasText: 'Department manager signoff' }).waitFor({ timeout: 15000 });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { count } = await admin
      .from('ncr_signatures')
      .select('id', { count: 'exact', head: true })
      .eq('ncr_id', reportId)
      .eq('role', 'department_manager');
    if ((count || 0) >= 1) break;
    await wait(500);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'NCR Tracker' }).waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.ncr-toolbar select').first().selectOption('all');
  await page.getByPlaceholder('Search NCRs...').fill(reportNumber);
  await page.locator('.ncr-detail-panel').getByText(reportNumber).waitFor({ timeout: 30000 });
  signatureSection = page.locator('.ncr-section').filter({ hasText: 'Signatures / Approvals' });
  await signatureSection.scrollIntoViewIfNeeded();
  await signatureSection.locator('select').first().waitFor({ state: 'visible', timeout: 30000 });
  await signatureSection.locator('select').first().selectOption('executive');
  await signatureSection.locator('input[placeholder="Typed signature name"]').fill('Production NCR QA Senior Management');
  await signatureSection.getByRole('button', { name: /Capture signoff/i }).click();
  let savedSignatureRoles = new Set();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data = [] } = await admin
      .from('ncr_signatures')
      .select('role')
      .eq('ncr_id', reportId)
      .in('role', ['department_manager', 'executive']);
    savedSignatureRoles = new Set(data.map(signature => signature.role));
    if (savedSignatureRoles.has('department_manager') && savedSignatureRoles.has('executive')) break;
    await wait(500);
  }
  assertOk(savedSignatureRoles.has('department_manager') && savedSignatureRoles.has('executive'), `Department manager/executive signatures were not both saved. Roles: ${JSON.stringify([...savedSignatureRoles])}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'NCR Tracker' }).waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.ncr-toolbar select').first().selectOption('all');
  await page.getByPlaceholder('Search NCRs...').fill(reportNumber);
  await page.locator('.ncr-detail-panel').getByText(reportNumber).waitFor({ timeout: 30000 });
  await page.locator('.ncr-action-row').filter({ hasText: 'Verify supplier paperwork' }).waitFor({ timeout: 30000 });
  await page.locator('.ncr-signature-row').filter({ hasText: 'Department manager signoff' }).waitFor({ state: 'attached', timeout: 30000 });
  await page.locator('.ncr-signature-row').filter({ hasText: 'Senior management agreement' }).waitFor({ state: 'attached', timeout: 30000 });
  await page.getByRole('button', { name: /Approve closure/i }).click();

  let closureState = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data } = await admin
      .from('ncr_reports')
      .select('closed,status,lifecycle_stage,closure_approved_at,verifier_id,effectiveness_summary')
      .eq('id', reportId)
      .maybeSingle();
    closureState = data;
    if (data?.closed && data.lifecycle_stage === 'closed') break;
    await wait(500);
  }
  if (!closureState?.closed || closureState?.lifecycle_stage !== 'closed') {
    await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => {});
    const bodyText = await page.locator('body').innerText().catch(() => '');
    throw new Error(`NCR did not close after approval. Last state: ${JSON.stringify(closureState)}. Failure screenshot: ${failureScreenshotPath}. Body excerpt: ${bodyText.slice(0, 900)}`);
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'NCR Tracker' }).waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.ncr-toolbar select').first().selectOption('all');
  await page.getByPlaceholder('Search NCRs...').fill(reportNumber);
  await page.locator('.ncr-detail-panel').getByText(reportNumber).waitFor({ timeout: 30000 });
  await page.locator('.ncr-detail-head').getByText('Closed').waitFor({ timeout: 10000 });
  const pdfButton = await firstVisible([
    page.getByRole('button', { name: /Detail PDF packet/i }),
    page.locator('.ncr-actions').getByText(/Detail PDF packet/i),
  ]);
  assertOk(pdfButton, 'Detail PDF packet control was not visible.');

  await page.getByRole('button', { name: /^Analytics$/i }).click();
  await page.getByRole('heading', { name: 'NCR Analytics for Tim' }).waitFor({ timeout: 15000 });
  await page.getByText('KPA baseline reports matched').waitFor({ timeout: 15000 });
  await page.getByText('Common Issue Trend Explorer').waitFor({ timeout: 15000 });
  await page.getByText('Subgrouped by Operator').waitFor({ timeout: 15000 });
  await page.getByText('Operator x Failure Group').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /Export issue CSV/i }).waitFor({ timeout: 10000 });
  await page.locator('.ncr-issue-search label').filter({ hasText: 'Issue / equipment / process' }).locator('input').fill('QA inspection gauge');
  for (const label of ['Individual', 'Trend', 'Map', 'Observer', 'Employee', 'Worksite/Area', 'Operator and Location', 'Date and Time Event', 'Internal/External', 'Type of Event', 'Non-Productive Time', 'NPT Amount']) {
    await page.getByText(label, { exact: true }).first().waitFor({ timeout: 10000 });
  }
  await page.getByRole('button', { name: /Individual CSV/i }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /^Tracker$/i }).click();
  await page.locator('.ncr-detail-panel').getByText(reportNumber).waitFor({ timeout: 15000 });

  await page.addStyleTag({
    content: `
      .ncr-workspace { align-items: flex-start !important; }
      .ncr-detail-panel { max-height: none !important; overflow: visible !important; }
      .main-content { overflow: visible !important; }
    `,
  });
  await page.locator('.ncr-detail-panel').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const [{ data: report }, { count: actionCount }, { data: attachments = [] }, { count: auditCount }, { count: signatureCount }] = await Promise.all([
    admin
      .from('ncr_reports')
      .select('closed,status,lifecycle_stage,owner_id,reviewer_id,verifier_id,closure_approved_at,containment_required,affected_product,affected_equipment,affected_job,disposition,effectiveness_summary,recurrence_prevented,repeat_issue,worksite_area,event_types,criticality,estimated_cost,root_cause_codes,source_system,canonical_failure_code,normalized_failure_summary')
      .eq('id', reportId)
      .maybeSingle(),
    admin.from('ncr_action_items').select('id', { count: 'exact', head: true }).eq('ncr_id', reportId),
    admin.from('ncr_attachments').select('id,storage_path,name').eq('ncr_id', reportId),
    admin.from('ncr_audit_events').select('id', { count: 'exact', head: true }).eq('ncr_id', reportId),
    admin.from('ncr_signatures').select('id', { count: 'exact', head: true }).eq('ncr_id', reportId),
  ]);
  storagePaths = attachments.map(file => file.storage_path).filter(Boolean);

  assertOk(report?.closed === true, 'NCR did not close.');
  assertOk(report?.status === 'closed', 'NCR broad status did not become closed.');
  assertOk(report?.lifecycle_stage === 'closed', 'NCR lifecycle stage did not become closed.');
  assertOk(Boolean(report?.closure_approved_at), 'NCR closure approval timestamp missing.');
  assertOk(Boolean(report?.verifier_id), 'NCR verifier missing.');
  assertOk(Boolean(report?.effectiveness_summary), 'NCR effectiveness summary missing.');
  assertOk(report?.containment_required === true, 'NCR containment flag missing.');
  assertOk(report?.affected_product === 'Bridge plug QA lot', 'NCR affected product missing.');
  assertOk(report?.disposition === 'Hold', 'NCR disposition missing.');
  assertOk(report?.worksite_area === 'Shop', 'KPA worksite/area field did not save.');
  assertOk(report?.criticality === 'Critical', 'KPA criticality field did not save.');
  assertOk(report?.root_cause_codes === 'Faulty Equipment', 'KPA root cause code did not save.');
  assertOk(Number(report?.estimated_cost) === 1250, 'KPA estimated cost did not save.');
  assertOk(Boolean(report?.normalized_failure_summary), 'NCR failure taxonomy summary missing.');
  assertOk((actionCount || 0) >= 1, 'Native NCR action item was not saved.');
  assertOk((attachments.length || 0) >= 1, 'NCR evidence attachment was not saved.');
  assertOk((signatureCount || 0) >= 2, 'NCR department manager and executive signatures were not both saved.');
  assertOk((auditCount || 0) >= 4, 'NCR audit trail did not capture enough events.');

  await cleanup();

  const [{ count: reportLeft }, { count: actionLeft }, { count: attachmentLeft }, { count: auditLeft }, { count: signatureLeft }, { count: profileLeft }] = await Promise.all([
    admin.from('ncr_reports').select('id', { count: 'exact', head: true }).eq('report_number', reportNumber),
    admin.from('ncr_action_items').select('id', { count: 'exact', head: true }).eq('ncr_id', reportId),
    admin.from('ncr_attachments').select('id', { count: 'exact', head: true }).eq('ncr_id', reportId),
    admin.from('ncr_audit_events').select('id', { count: 'exact', head: true }).eq('ncr_id', reportId),
    admin.from('ncr_signatures').select('id', { count: 'exact', head: true }).eq('ncr_id', reportId),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('id', qaUserId),
  ]);

  assertOk(reportLeft === 0, 'Cleanup left the temporary NCR report behind.');
  assertOk(actionLeft === 0, 'Cleanup left temporary NCR action items behind.');
  assertOk(attachmentLeft === 0, 'Cleanup left temporary NCR attachments behind.');
  assertOk(auditLeft === 0, 'Cleanup left temporary NCR audit rows behind.');
  assertOk(signatureLeft === 0, 'Cleanup left temporary NCR signatures behind.');
  assertOk(profileLeft === 0, 'Cleanup left temporary NCR QA profile behind.');

  console.log('ok NCR lifecycle production workflow verified');
  console.log(`ok proof screenshot: ${screenshotPath}`);
  console.log('ok cleanup: 0 temp NCR reports, actions, attachments, audit rows, profiles');
} catch (error) {
  console.error(`x NCR lifecycle production verification failed: ${error.message}`);
  await cleanup();
  process.exit(1);
}
