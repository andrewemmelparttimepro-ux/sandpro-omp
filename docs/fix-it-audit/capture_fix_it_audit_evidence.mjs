import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import process from 'node:process';

const root = resolve(process.cwd());
const outDir = resolve(root, 'docs/fix-it-audit');
const evidenceDir = join(outDir, 'evidence');
const baseUrl = process.env.SANDPRO_BASE_URL || 'https://objectivetracker.net';
const objectivePrefix = 'Fix-It Audit Objective';
const ncrPrefix = 'QA-FIXIT';

mkdirSync(evidenceDir, { recursive: true });

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

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const safeSlug = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 80);

const screenshot = async (target, name, options = {}) => {
  const path = join(evidenceDir, `${name}.png`);
  await target.screenshot({ path, ...options });
  return path;
};

const countRows = async (table, apply) => {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  query = apply(query);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
};

const deleteGeneratedObjectives = async () => {
  const { data: objectives = [] } = await supabase
    .from('objectives')
    .select('id,title')
    .ilike('title', `${objectivePrefix}%`);
  for (const objective of objectives) {
    await supabase.from('objectives').delete().eq('id', objective.id);
  }
};

const deleteGeneratedNcrs = async () => {
  await supabase.from('ncr_reports').delete().ilike('report_number', `${ncrPrefix}%`);
};

const createQaUser = async ({ name, initials, title, role = 'executive' }) => {
  const token = `fixit-audit-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const email = `qa+${token}@objectivetracker.net`;
  const password = `${randomBytes(16).toString('base64url')}Aa1!`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      initials,
      title,
      department: 'Admin',
      role,
      color: role === 'executive' ? '#ff7f02' : '#3B82F6',
      must_change_password: false,
    },
  });
  if (error) throw new Error(`Could not create QA user ${name}: ${error.message}`);

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id,role')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profile) {
      if (profile.role !== role) {
        await supabase.from('profiles').update({ role }).eq('id', data.user.id);
      }
      return { id: data.user.id, email, password, name, role };
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 500));
  }
  throw new Error(`QA profile was not created for ${name}.`);
};

const deleteQaUser = async (user) => {
  if (!user?.id) return;
  await supabase.from('profiles').delete().eq('id', user.id);
  await supabase.auth.admin.deleteUser(user.id);
};

const login = async (page, user) => {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('you@sandpro.com').fill(user.email);
  await page.getByPlaceholder('Min 6 characters').fill(user.password);
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).waitFor({ timeout: 20000 });
  await dismissOverlays(page);
};

const dismissOverlays = async (page) => {
  for (let i = 0; i < 4; i += 1) {
    await page.locator('.brief-close').click({ force: true, timeout: 1000 }).catch(() => {});
    await page.locator('.new-feature-close').click({ force: true, timeout: 1000 }).catch(() => {});
    const help = page.locator('.feature-help-close').first();
    if (await help.isVisible({ timeout: 500 }).catch(() => false)) {
      await help.click({ force: true }).catch(() => {});
    }
  }
};

const nav = async (page, name) => {
  await page.getByRole('link', { name, exact: true }).click();
  await dismissOverlays(page);
};

const freezeInventory = async () => {
  const { data: posts, error } = await supabase
    .from('fix_it_posts')
    .select('id,body,status,created_at,updated_at,created_by,claimed_by,fix_it_attachments(id,name,type,size,mime_type,storage_path)')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const profileIds = [...new Set((posts || []).flatMap(post => [post.created_by, post.claimed_by]).filter(Boolean))];
  const { data: profiles = [] } = profileIds.length
    ? await supabase.from('profiles').select('id,name,email,role,title').in('id', profileIds)
    : { data: [] };
  const profilesById = Object.fromEntries(profiles.map(profile => [profile.id, profile]));
  const inventory = (posts || []).map((post, index) => ({
    index: index + 1,
    id: post.id,
    body: post.body || '',
    status: post.status || 'open',
    createdAt: post.created_at,
    updatedAt: post.updated_at,
    createdBy: post.created_by,
    claimedBy: post.claimed_by,
    author: profilesById[post.created_by] || null,
    claimedUser: profilesById[post.claimed_by] || null,
    attachments: post.fix_it_attachments || [],
  }));
  writeFileSync(join(outDir, 'fix_it_inventory.json'), JSON.stringify(inventory, null, 2));
  return inventory;
};

const createTempNcr = async () => {
  const reportNumber = `${ncrPrefix}-${Date.now()}`;
  const { data, error } = await supabase.from('ncr_reports').insert({
    report_number: reportNumber,
    report_date: new Date().toISOString().slice(0, 10),
    observer: 'Fix-It Audit QA',
    follow_up_count: 1,
    follow_up_details: 'Temporary audit proof record.',
    follow_up_due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    worksite_area: 'Audit Yard',
    operator_location: 'Audit Operator',
    internal_external: 'Internal',
    event_type: 'Process Loss',
    non_productive_time: 'No',
    author: 'Fix-It Audit QA',
    personnel_involved: 'QA Validator',
    event_description: 'Temporary NCR proof for Fix-It audit report.',
    severity: 'Medium',
    root_cause_codes: 'Process',
    root_cause_analysis: 'Temporary audit root cause.',
    immediate_action: 'Contain temporary test.',
    permanent_action: 'Delete after audit.',
    affected_departments: 'Quality',
    department_group: 'Quality Control',
    long_term_follow_up: 'None after cleanup.',
    action_effective: 'Pending',
    status: 'open',
    closed: false,
  }).select('id,report_number').single();
  if (error) throw error;
  return data;
};

const runBrowserEvidence = async (inventory, users) => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  const evidence = {};
  const title = `${objectivePrefix} ${Date.now()}`;
  const due = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const ncr = await createTempNcr();

  try {
    await login(page, users.executive);

    await nav(page, 'Fix-It Feed');
    await screenshot(page, 'fixit-board-full', { fullPage: true });
    const posts = page.locator('.fixit-post');
    const livePostCount = await posts.count();
    for (let i = 0; i < Math.min(inventory.length, livePostCount); i += 1) {
      const post = posts.nth(i);
      await post.scrollIntoViewIfNeeded();
      evidence[inventory[i].id] = {
        boardImage: await screenshot(post, `item-${String(i + 1).padStart(2, '0')}-${safeSlug(inventory[i].id)}`),
      };
    }
    evidence.fixitComposer = await screenshot(page.locator('.fixit-composer'), 'proof-fixit-composer');

    await nav(page, 'Dashboard');
    evidence.dashboard = await screenshot(page, 'proof-dashboard-kpi-cards', { fullPage: true });

    await nav(page, 'Objectives');
    await page.getByLabel('Sort objectives').selectOption('newest');
    evidence.objectivesToolbar = await screenshot(page, 'proof-objectives-toolbar-sort-filters', { fullPage: true });

    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sandpro-objective-form-draft-')) localStorage.removeItem(key);
      }
    });
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByPlaceholder('What needs to be done?').fill(`${objectivePrefix} Draft Proof`);
    await page.getByPlaceholder('Add details... use @ to mention teammates').fill('Draft proof with @Fix');
    await page.locator('.mention-menu').waitFor({ timeout: 10000 });
    evidence.objectiveDraftMention = await screenshot(page, 'proof-objective-draft-mention-autosave', { fullPage: true });
    await page.getByLabel('Close objective form').click();

    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByPlaceholder('What needs to be done?').fill(title);
    const description = page.getByPlaceholder('Add details... use @ to mention teammates');
    await description.fill('Audit objective mentions @Fix');
    await page.locator('.mention-option').filter({ hasText: users.mention.name }).first().click();
    await page.locator('input[type="date"]').fill(due);
    await page.getByRole('button', { name: /Create Objective|Delegate Objective/i }).click();
    await page.getByText(/Objective created|Objective delegated/i).waitFor({ timeout: 20000 });

    await nav(page, 'Objectives');
    await page.getByPlaceholder('Search objectives...').fill(title);
    const row = page.locator('tbody tr').filter({ hasText: title }).first();
    await row.waitFor({ timeout: 20000 });
    await row.getByLabel(`Change status for ${title}`).selectOption('on_track');
    await page.waitForTimeout(800);
    evidence.objectiveRow = await screenshot(row, 'proof-objective-row-inline-status-tag-unread');

    await row.getByRole('button', { name: `Open objective: ${title}` }).click();
    await page.getByRole('button', { name: 'Access', exact: true }).click();
    evidence.objectiveAccess = await screenshot(page.locator('.modal-content'), 'proof-objective-access-assigned-member');

    await page.getByRole('button', { name: 'Messages', exact: true }).click();
    const composer = page.locator('textarea[placeholder^="Type a message"]');
    await composer.fill('Long audit message line 1\nline 2 proves composer growth and @Fix');
    await page.locator('.mention-option').filter({ hasText: users.mention.name }).first().click();
    await composer.pressSequentially(' please review this audit proof');
    await page.getByTitle('Send message').click();
    await page.getByText('please review this audit proof').waitFor({ timeout: 20000 });
    await page.getByTitle('Edit message').first().click();
    evidence.objectiveMessages = await screenshot(page.locator('.modal-content'), 'proof-objective-messages-mention-edit-grow');
    await page.getByRole('button', { name: 'Close objective' }).click();
    await page.locator('.modal-overlay').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});

    const mentionContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const mentionPage = await mentionContext.newPage();
    await login(mentionPage, users.mention);
    await nav(mentionPage, 'Objectives');
    await mentionPage.getByPlaceholder('Search objectives...').fill(title);
    const mentionRow = mentionPage.locator('tbody tr').filter({ hasText: title }).first();
    await mentionRow.waitFor({ timeout: 20000 });
    evidence.objectiveUnreadRow = await screenshot(mentionRow, 'proof-objective-row-unread-message-count');
    await mentionRow.getByRole('button', { name: `Open objective: ${title}` }).click();
    await mentionPage.getByRole('button', { name: 'Messages', exact: true }).click();
    evidence.objectiveUnreadModal = await screenshot(mentionPage.locator('.modal-content'), 'proof-objective-message-unread-strip');
    await mentionContext.close();

    await nav(page, 'Organization');
    evidence.orgChart = await screenshot(page, 'proof-org-chart-tree-add-export-delete', { fullPage: true });

    await page.getByTitle('Open Admin').click();
    await page.getByText('Admin Panel').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    evidence.adminExport = await screenshot(page, 'proof-admin-export-filters-no-objective-id', { fullPage: true });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    evidence.adminSettings = await screenshot(page, 'proof-admin-settings-permissions-notifications', { fullPage: true });

    await nav(page, 'NCR');
    await page.getByPlaceholder('Search NCRs...').fill(ncr.report_number);
    await page.getByText(`#${ncr.report_number}`, { exact: true }).waitFor({ timeout: 20000 });
    evidence.ncr = await screenshot(page, 'proof-ncr-tracker-create-objective-close', { fullPage: true });

    const contributorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const contributorPage = await contributorContext.newPage();
    await login(contributorPage, users.contributor);
    await nav(contributorPage, 'Fix-It Feed');
    evidence.contributorFixItAccess = await screenshot(contributorPage, 'proof-contributor-fixit-access', { fullPage: true });
    await contributorContext.close();

    writeFileSync(join(outDir, 'evidence_manifest.json'), JSON.stringify({
      capturedAt: new Date().toISOString(),
      baseUrl,
      tempObjectiveTitle: title,
      tempNcrReportNumber: ncr.report_number,
      evidence,
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
    await deleteGeneratedObjectives();
    await deleteGeneratedNcrs();
  }
};

const main = async () => {
  await deleteGeneratedObjectives();
  await deleteGeneratedNcrs();
  const inventory = await freezeInventory();
  const users = {
    executive: await createQaUser({ name: 'FixIt Audit QA', initials: 'FQ', title: 'Audit Validator', role: 'executive' }),
    mention: await createQaUser({ name: 'FixIt Mention QA', initials: 'FM', title: 'Audit Mention Receiver', role: 'manager' }),
    contributor: await createQaUser({ name: 'FixIt Contributor QA', initials: 'FC', title: 'Audit Contributor', role: 'contributor' }),
  };
  let cleanup;
  try {
    await runBrowserEvidence(inventory, users);
  } finally {
    await deleteGeneratedObjectives();
    await deleteGeneratedNcrs();
    await Promise.all(Object.values(users).map(deleteQaUser));
    const { data: allUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    cleanup = {
      qaProfiles: await countRows('profiles', query => query.ilike('email', 'qa+fixit-audit-%@objectivetracker.net')),
      qaObjectives: await countRows('objectives', query => query.ilike('title', `${objectivePrefix}%`)),
      qaNcrReports: await countRows('ncr_reports', query => query.ilike('report_number', `${ncrPrefix}%`)),
      qaAuthUsers: (allUsers?.users || []).filter(user => user.email?.startsWith('qa+fixit-audit-') && user.email.endsWith('@objectivetracker.net')).length,
    };
    writeFileSync(join(outDir, 'cleanup_result.json'), JSON.stringify(cleanup, null, 2));
  }
  console.log(JSON.stringify({ inventoryCount: inventory.length, cleanup }, null, 2));
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
