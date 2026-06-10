import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { notificationAllowsEmail } from '../../api/_shared/email.js';
import { notificationAllowsPush } from '../../api/_shared/push.js';
import { canManageOrgChart, canManagePermissions } from '../../src/data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const walk = (dir) => readdirSync(join(root, dir)).flatMap((entry) => {
  const path = join(dir, entry);
  const absolute = join(root, path);
  if (statSync(absolute).isDirectory()) return walk(path);
  return [path];
});

test('release code has no browser prompt/confirm dead ends', () => {
  const source = walk('src').filter((path) => /\.(jsx?|tsx?)$/.test(path)).map(read).join('\n');
  assert.equal(/window\.prompt|prompt\(/.test(source), false);
  assert.equal(/window\.confirm|confirm\(/.test(source), false);
});

test('seed and admin scripts do not hardcode shared passwords or production project ids', () => {
  const source = ['supabase/seed-users.mjs', 'api/admin/invite-user.js'].map(read).join('\n');
  const fromCodes = (codes) => String.fromCharCode(...codes);
  const forbiddenValues = [
    fromCodes([83, 97, 110, 100, 80, 114, 111, 79, 77, 80, 50, 48, 50, 54, 33]),
    fromCodes([66, 111, 114, 101, 100, 82, 111, 111, 109, 50, 48, 50, 53, 33]),
    fromCodes([119, 104, 103, 114, 107, 102, 104, 117, 122, 103, 119, 109, 98, 101, 108, 111, 99, 110, 104, 113, 46, 115, 117, 112, 97, 98, 97, 115, 101, 46, 99, 111]),
  ];
  for (const forbidden of forbiddenValues) {
    assert.equal(source.includes(forbidden), false, `${forbidden} must not be hardcoded`);
  }
});

test('release migration contains P0/P1 persistence surfaces', () => {
  const migration = read('supabase/release_ready_migration.sql');
  for (const required of [
    'objective-files',
	    'objective_members',
	    'objective_metric_checkins',
	    'objective_workflow_steps',
    'objective_agent_runs',
    'notification_preferences',
    'email_delivery_log',
    'message_reactions',
    'objective_message_reads',
    'fix_it_posts',
    'fix_it_attachments',
    'ncr_reports',
    'ncr_import_batches',
    'ncr_signatures',
    'ncr_failure_codes',
    'org_chart_updates',
    'fix-it-files',
    'storage_path',
    'message_id',
    'agent_run_id',
    'generated_by_agent',
  ]) {
    assert.ok(migration.includes(required), `${required} missing from migration`);
  }
});

test('NCR tracker is a database-backed production page with objective handoff', () => {
  const app = read('src/App.jsx');
  const pages = read('src/pages.jsx');
  const hook = read('src/hooks/useSupabase.js');
  const migration = read('supabase/release_ready_migration.sql');
  const aiEndpoint = read('api/ncr/analytics-ai.js');

  assert.match(app, /"ncr"/);
  assert.match(app, /NCR/);
  assert.match(app, /useNcrReports/);
  assert.match(app, /handleCreateObjectiveFromNcr/);
  assert.match(app, /createNcrReport/);
  assert.match(app, /linkedObjectiveId/);
  assert.match(pages, /export const NcrPage/);
  assert.match(pages, /NCR Tracker/);
  assert.match(pages, /New NCR/);
  assert.match(pages, /Create NCR/);
  assert.match(pages, /Create objective/);
  assert.match(pages, /All Groups/);
  assert.match(pages, /Root Cause/);
  assert.match(pages, /Corrective Actions/);
  assert.match(pages, /NCR_LIFECYCLE_STAGES/);
  assert.match(pages, /Containment Required/);
  assert.match(pages, /Effectiveness Verification/);
  assert.match(pages, /Native NCR Action Items/);
  assert.match(pages, /Photos \+ Documentation/);
  assert.match(pages, /NcrEvidencePanel/);
  assert.match(pages, /NCR_DEPARTMENT_GROUPS = \['Shop', 'Service', 'CP', 'Sales', 'Automation', 'Quality', 'Safety', 'Admin'\]/);
  assert.match(pages, /NCR_QUERY_ALIASES/);
  assert.match(pages, /Exxon \/ XTO/);
  assert.match(pages, /Template CSV/);
  assert.match(pages, /sandpro_kpa_ncr_import_template\.csv/);
  assert.match(pages, /Participation Ranking/);
  assert.match(pages, /ncrView/);
  assert.match(pages, /Audit Trail/);
  assert.match(pages, /Detail PDF packet/);
  assert.match(pages, /KPA Historical Import/);
  assert.match(pages, /Upload the complete KPA Excel or CSV export whenever possible/);
  assert.match(pages, /existing report numbers are refreshed instead of duplicated/);
  assert.match(pages, /Refresh existing/);
  assert.match(pages, /KPA import complete: \$\{result\.created \|\| 0\} new, \$\{result\.refreshed \|\| 0\} refreshed/);
  assert.match(pages, /NCR Analytics/);
  assert.match(pages, /FieldKeyProvider/);
  assert.match(pages, /DefinedTerm/);
  assert.match(pages, /Common Issue Trend Explorer/);
  assert.match(pages, /valve failures/);
  assert.match(pages, /Failure Groupings/);
  assert.match(pages, /Subgrouped by Operator/);
  assert.match(pages, /Operator x Failure Group/);
  assert.match(pages, /Export issue CSV/);
  assert.match(pages, /NCR_WORKSITE_AREAS/);
  assert.match(pages, /NCR_EVENT_TYPES/);
  assert.match(pages, /NCR_CRITICALITY/);
  assert.match(pages, /PROVISIONAL_FAILURE_CODES/);
  assert.match(pages, /HRU failure/);
  assert.match(pages, /AWC valve failure/);
  assert.match(pages, /710 valve failure/);
  assert.match(pages, /Closure blockers/);
  assert.match(pages, /Signatures \/ Approvals/);
  assert.match(pages, /exportAnalyticsCsv/);
  assert.match(pages, /Analytics PDF/);
  assert.match(pages, /Individual CSV/);
  assert.match(pages, /KPA baseline reports matched/);
  assert.match(pages, /Map \/ Location/);
  assert.match(pages, /Observer/);
  assert.match(pages, /Employee/);
  assert.match(pages, /Operator and Location/);
  assert.match(pages, /Date and Time Event/);
  assert.match(pages, /Internal or External Report/);
  assert.match(pages, /Non-Productive Time Amount/);
  assert.match(pages, /sandpro_ncr_analytics\.xlsx/);
  assert.match(pages, /Ask NCR analytics/);
  assert.match(pages, /\/api\/ncr\/analytics-ai/);
  assert.match(hook, /ncr_reports/);
  assert.match(hook, /ncr_action_items/);
  assert.match(hook, /ncr_attachments/);
  assert.match(hook, /ncr_audit_events/);
  assert.match(hook, /ncr_import_batches/);
  assert.match(hook, /ncr_signatures/);
  assert.match(hook, /importReports/);
  assert.match(hook, /\.upsert\(payload, \{ onConflict: 'report_number' \}\)/);
  assert.match(hook, /let created = 0/);
  assert.match(hook, /let refreshed = 0/);
  assert.match(hook, /return \{ batchId: batch\.id, imported, created, refreshed/);
  assert.match(hook, /captureSignature/);
  assert.match(hook, /ncr-files/);
  assert.match(hook, /\.from\('ncr_reports'\)\s*\n\s*\.insert/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ncr_reports/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ncr_action_items/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ncr_attachments/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ncr_audit_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ncr_import_batches/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ncr_signatures/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ncr_failure_codes/);
  assert.match(migration, /source_raw_record/);
  assert.match(migration, /canonical_failure_code/);
  assert.match(migration, /tim_approved/);
  assert.match(migration, /NCR reports viewable by all authenticated/);
  assert.match(migration, /NCR action items viewable by all authenticated/);
  assert.match(migration, /NCR audit events viewable by all authenticated/);
  assert.match(migration, /NCR import batches viewable by all authenticated/);
  assert.match(migration, /NCR signatures viewable by all authenticated/);
  assert.match(migration, /NCR failure codes viewable by all authenticated/);
  assert.match(aiEndpoint, /OPENAI_API_KEY/);
  assert.match(aiEndpoint, /fallbackAnswer/);
  assert.match(aiEndpoint, /HRU failure/);
  assert.match(aiEndpoint, /AWC valve failure/);
  assert.match(aiEndpoint, /710 valve failure/);
});

test('Vercel cron jobs are configured for digest and reminders', () => {
  const config = JSON.parse(read('vercel.json'));
  const paths = config.crons.map((cron) => cron.path);
  assert.ok(paths.includes('/api/cron/daily-digest'));
  assert.ok(paths.includes('/api/cron/reminders'));
});

test('tag notifications follow comment and mention email preferences', () => {
  assert.equal(notificationAllowsEmail({ email_enabled: true, comment_notifications: true }, 'mention'), true);
  assert.equal(notificationAllowsEmail({ email_enabled: true, comment_notifications: false }, 'mention'), false);
});

test('Web Push is a quiet direct-work layer on top of in-app notifications', () => {
  const pkg = JSON.parse(read('package.json'));
  const migration = read('supabase/release_ready_migration.sql');
  const baseline = read('supabase/migration.sql');
  const sender = read('api/_shared/push.js');
  const endpoint = read('api/notifications/send-event.js');
  const fixItEndpoint = read('api/fixit/push-event.js');
  const hook = read('src/hooks/useSupabase.js');
  const settings = read('src/pages.jsx');
  const sw = read('public/sw.js');
  const androidSmoke = read('scripts/verify-live-android-push.mjs');

  assert.ok(pkg.dependencies['web-push']);
  for (const source of [migration, baseline]) {
    assert.match(source, /CREATE TABLE (IF NOT EXISTS )?public\.push_subscriptions/);
    assert.match(source, /CREATE TABLE (IF NOT EXISTS )?public\.push_delivery_log/);
    assert.match(source, /Users manage own push subscriptions/);
    assert.match(source, /Users view own push delivery log/);
  }
  assert.match(sender, /VAPID_PUBLIC_KEY/);
  assert.match(sender, /VAPID_PRIVATE_KEY/);
  assert.match(sender, /VAPID_SUBJECT/);
  assert.match(sender, /requireInteraction: urgent/);
  assert.match(sender, /silent: !urgent/);
  assert.match(sender, /fixit_new/);
  assert.match(sender, /fixit_agent/);
  assert.match(endpoint, /sendPushNotifications/);
  assert.match(endpoint, /notificationId/);
  assert.match(sender, /type === 'mention' \|\| type === 'comment'/);
  assert.match(fixItEndpoint, /sendPushNotifications/);
  assert.match(fixItEndpoint, /targetUserId/);
  assert.match(hook, /Notification\.requestPermission/);
  assert.match(hook, /pushManager\.subscribe/);
  assert.match(settings, /Push Notification Setup/);
  assert.match(settings, /Android: open in Chrome, Install app, then enable push from the installed app/);
  assert.match(read('src/App.jsx'), /On Android, open SandPro OMP in Chrome, install the app/);
  assert.match(androidSmoke, /android|linux arm|galaxy|sm-s|s25/i);
  assert.match(androidSmoke, /fixit_agent/);
  assert.match(androidSmoke, /cleanup verified for live Android push QA/);
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /addEventListener\('notificationclick'/);

  assert.equal(notificationAllowsPush({ push_enabled: true, comment_notifications: true }, 'mention'), true);
  assert.equal(notificationAllowsPush({ push_enabled: true, comment_notifications: true }, 'comment'), true);
  assert.equal(notificationAllowsPush({ push_enabled: true, comment_notifications: false }, 'comment'), false);
  assert.equal(notificationAllowsPush({ push_enabled: true, due_reminders: true }, 'due_soon', { priority: 'medium' }), false);
  assert.equal(notificationAllowsPush({ push_enabled: true, due_reminders: true }, 'due_soon', { priority: 'high' }), true);
  assert.equal(notificationAllowsPush({ push_enabled: true }, 'fixit_new'), true);
  assert.equal(notificationAllowsPush({ push_enabled: true }, 'fixit_agent'), true);
  assert.equal(notificationAllowsPush({ push_enabled: false, delegation_alerts: true }, 'assignment'), false);
});

test('account menu exposes standard settings and password change', () => {
  const app = read('src/App.jsx');
  const css = read('src/index.css');

  assert.match(app, /AccountSettingsModal/);
  assert.match(app, /showAccountSettings/);
  assert.match(app, /openAccountSettings/);
  assert.match(app, /aria-label="Account settings"/);
  assert.match(app, /Change password/);
  assert.match(app, /onChangePassword\(password\)/);
  assert.match(app, /updatePassword/);
  assert.match(app, /<Settings size=\{15\}/);
  assert.match(app, /onDisablePush/);
  assert.match(app, /onEnablePush/);
  assert.match(app, /Push notifications/);
  assert.match(css, /\.account-settings-modal/);
  assert.match(css, /\.user-menu-footer-actions/);
});

test('production deploy script validates schema before deploy and smokes after deploy', () => {
  const packageJson = JSON.parse(read('package.json'));
  const deploy = packageJson.scripts['deploy:prod'];
  const preflight = packageJson.scripts['release:preflight'];
  assert.ok(preflight.includes('npm run test:schema'), 'release:preflight must validate live release schema');
  assert.ok(deploy.indexOf('node scripts/require-release-env.mjs prod') < deploy.indexOf('vercel deploy'), 'production credentials must be present before deploy');
  assert.ok(deploy.indexOf('npm run release:preflight') < deploy.indexOf('vercel deploy'), 'preflight must run before deploy');
  assert.ok(deploy.includes('npm run smoke:prod'), 'production deploy must finish with read-only smoke tests');
});

test('Objective Assistant is behind the personal AI switch and server-disabled only when explicitly off', () => {
  const app = read('src/App.jsx');
  const component = read('src/components.jsx');
  const endpoint = read('api/agent/objective-starter.js');
  assert.match(app, /sandpro-ai-features-enabled-v2/);
  assert.match(app, /isPersonalAiDashboardOwner/);
  assert.match(app, /aiFeaturesAvailable \? runObjectiveStarter : null/);
  assert.match(component, /aiFeaturesEnabled = false/);
  assert.match(component, /VITE_AGENT_FEATURE_ENABLED !== "false"/);
  assert.match(endpoint, /AGENT_FEATURE_ENABLED === 'false'/);
});

test('Objective Assistant sends and accepts auth token fallback for browser-compatible requests', () => {
  const hook = read('src/hooks/useSupabase.js');
  const endpoint = read('api/agent/objective-starter.js');
  const auth = read('api/_shared/supabaseAdmin.js');
  assert.match(hook, /const getFreshSession = async/);
  assert.match(hook, /refreshSession\(\)/);
  assert.match(hook, /authorization:\s*`Bearer \$\{session\.access_token\}`/);
  assert.match(hook, /accessToken:\s*session\.access_token/);
  assert.match(hook, /Your sign-in expired/);
  assert.match(endpoint, /getAuthedProfile\(req,\s*body\.accessToken\)/);
  assert.match(auth, /fallbackToken/);
});

test('objective and workflow updates skip duplicate write-audit entries when nothing changed', () => {
  const hook = read('src/hooks/useSupabase.js');
  assert.match(hook, /const valuesEqual = \(left, right\) =>/);
  assert.match(hook, /const hasChangedFields = \(current, changes\) =>/);
  assert.match(hook, /if \(!hasChangedFields\(currentObjective, dbChanges\)\)/);
  assert.match(hook, /if \(statusChanged \|\| progressChanged\)/);
  assert.match(hook, /if \(!hasChangedFields\(currentStep, dbChanges\)\)/);
  assert.match(hook, /changes\.status === 'current' && currentStep\.status !== 'current'/);
});

test('org chart editing is available to Merci and Tim and guarded server-side', () => {
  const app = read('src/App.jsx');
  const page = read('src/pages.jsx');
  const endpoint = read('api/admin/update-user.js');
  assert.equal(canManageOrgChart({ role: 'contributor', email: 'mjimenez@sandpro.com' }), true);
  assert.equal(canManageOrgChart({ role: 'contributor', email: 'tdibben@sandpro.com' }), true);
  assert.equal(canManageOrgChart({ role: 'contributor', email: 'someone@sandpro.com' }), false);
  assert.match(app, /fetch\('\/api\/admin\/update-user'/);
  assert.match(app, /accessToken/);
  assert.match(page, /canManageOrgChart\(currentUser\)/);
  assert.match(endpoint, /ORG_EDITOR_EMAILS/);
  assert.match(endpoint, /mjimenez@sandpro\.com/);
  assert.match(endpoint, /tdibben@sandpro\.com/);
  assert.match(endpoint, /getAuthedProfile\(req,\s*body\.accessToken\)/);
  assert.match(endpoint, /Only Jake, Andrew, or executives can change platform roles/);
  assert.match(endpoint, /wouldCreateCycle/);
  assert.match(endpoint, /org_chart_updates/);
  assert.match(endpoint, /buildOrgChartNote/);
});

test('Jake and Andrew can edit user permissions from settings', () => {
  const app = read('src/App.jsx');
  const page = read('src/pages.jsx');
  const endpoint = read('api/admin/update-user.js');

  assert.equal(canManagePermissions({ role: 'contributor', email: 'jfeil@sandpro.com' }), true);
  assert.equal(canManagePermissions({ role: 'contributor', email: 'andrew@ndai.pro' }), true);
  assert.equal(canManagePermissions({ role: 'contributor', email: 'mjimenez@sandpro.com' }), false);
  assert.match(page, /User Permissions/);
  assert.match(page, /Jake and Andrew can change access level/);
  assert.match(page, /Save Permissions/);
  assert.match(page, /canManagePermissions\(currentUser\)/);
  assert.match(page, /onUpdateUser=\{onUpdateUser\}/);
  assert.match(app, /onUpdateUser=\{handleUpdateUser\}/);
  assert.match(endpoint, /PERMISSION_ADMIN_EMAILS/);
  assert.match(endpoint, /jfeil@sandpro\.com/);
  assert.match(endpoint, /andrew@ndai\.pro/);
});

test('org editors can delete employees after blocking work is cleared', () => {
  const app = read('src/App.jsx');
  const page = read('src/pages.jsx');
  const endpoint = read('api/admin/delete-user.js');
  const invite = read('api/admin/invite-user.js');

  assert.match(app, /fetch\('\/api\/admin\/delete-user'/);
  assert.match(app, /onDeleteUser=\{handleDeleteUser\}/);
  assert.match(app, /onUsersChanged=\{refetchProfiles\}/);
  assert.match(page, /Add org chart entry/);
  assert.match(page, /addEmployeeDraft/);
  assert.match(page, /fetch\('\/api\/admin\/invite-user'/);
  assert.match(page, /Delete employee/);
  assert.match(page, /deleteConfirmUser/);
  assert.match(page, /onDeleteUser\(deleteConfirmUser\.id\)/);
  assert.match(invite, /canManageOrgChart/);
  assert.match(invite, /mjimenez@sandpro\.com/);
  assert.match(endpoint, /canManageOrgChart/);
  assert.match(endpoint, /mjimenez@sandpro\.com/);
  assert.match(endpoint, /jfeil@sandpro\.com/);
  assert.match(endpoint, /A person cannot delete themselves/);
  assert.match(endpoint, /Reassign or remove linked work before deleting this employee/);
  assert.match(endpoint, /deleteUser\(userId\)/);
  assert.match(endpoint, /objective_members/);
  assert.match(endpoint, /reports_to/);
});

test('org chart supports visual group placeholders without login accounts', () => {
  const page = read('src/pages.jsx');
  const css = read('src/index.css');
  const migration = read('supabase/release_ready_migration.sql');
  const schemaCheck = read('scripts/check-release-schema.mjs');
  const placeholderSmoke = read('scripts/verify-org-placeholder-workflow.mjs');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.org_chart_placeholders/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /Org editors manage placeholders/);
  assert.match(schemaCheck, /org_chart_placeholders table/);
  assert.match(page, /orgPlaceholders/);
  assert.match(page, /orgEntries/);
  assert.match(page, /entryType: "employee"/);
  assert.match(page, /Group placeholder/);
  assert.match(page, /Visual only\. No email, password, login, mentions, notifications, or objective ownership\./);
  assert.match(page, /\.from\('org_chart_placeholders'\)\.insert/);
  assert.match(page, /\.from\('org_chart_placeholders'\)\s*\n\s*\.delete/);
  assert.match(page, /selectedUser\.isPlaceholder \? 'Visual group, no login'/);
  assert.match(page, /buildOrgChartExportHtml\(\{ profiles: orgEntries, objectives \}\)/);
  assert.match(page, /ORG_BRANCH_PALETTE/);
  assert.match(page, /getOrgBranchLeader/);
  assert.match(page, /getOrgBranchColor = \(entry, entries = \[\]\)/);
  assert.match(page, /Reporting group:/);
  assert.match(css, /\.org-person-card\.placeholder/);
  assert.match(css, /\.org-placeholder-badge/);
  assert.match(css, /\.org-branch-label/);
  assert.match(css, /\.org-mobile-branch/);
  assert.match(css, /--org-branch-rgb/);
  assert.match(placeholderSmoke, /QA Field Techs/);
  assert.match(placeholderSmoke, /without email\/password\/login fields/);
  assert.match(placeholderSmoke, /deleted cleanly/);
});

test('org chart is a draggable tree with research-backed export options for org editors', () => {
  const page = read('src/pages.jsx');
  const css = read('src/index.css');

  assert.match(page, /className="org-tree"/);
  assert.match(page, /orgZoom/);
  assert.match(page, /orgTreeOrientation/);
  assert.match(page, /setOrgTreeOrientation\("vertical"\)/);
  assert.match(page, /setOrgTreeOrientation\("wide"\)/);
  assert.match(page, /handleOrgWheel/);
  assert.match(page, /zoomOrgCanvasAt/);
  assert.match(page, /fitOrgCanvas/);
  assert.match(page, /centerOrgRoot/);
  assert.match(page, /centerSelectedOrgEntry/);
  assert.match(page, /collapsedOrgIds/);
  assert.match(page, /toggleOrgCollapse/);
  assert.match(page, /collapseAllOrgBranches/);
  assert.match(page, /expandAllOrgBranches/);
  assert.match(page, /onWheel=\{orgViewMode === "tree" \? handleOrgWheel : undefined\}/);
  assert.match(page, /org-tree-canvas-viewport/);
  assert.match(page, /org-tree-canvas/);
  assert.match(page, /className=\{`org-tree-node/);
  assert.match(page, /data-org-entry-id=\{user\.id\}/);
  assert.match(page, /Span Of Control:/);
  assert.match(page, /Avg Span Of Control:/);
  assert.match(page, /org-span-marker/);
  assert.match(page, /spanSummary\.direct > 5/);
  assert.match(page, /spanSummary\.average > 5/);
  assert.match(page, /orgTreeScrollRef/);
  assert.match(page, /scroller\.scrollLeft/);
  assert.match(page, /draggable=\{canEditOrg\}/);
  assert.match(page, /handleDragStart/);
  assert.match(page, /handleDropOnUser/);
  assert.match(page, /handleRootDrop/);
  assert.match(page, /Company root/);
  assert.match(page, /orgSaveStatus/);
  assert.match(page, /Saved\. The org chart is up to date\./);
  assert.match(page, /hasOrgEditChanges/);
  assert.match(page, /reportsTo: targetUser\?\.id \|\| null/);
  assert.match(page, /isDescendantOf/);
  assert.match(page, /getOrgReports/);
  assert.match(page, /canDropUser/);
  assert.match(page, /PDF \/ print packet/);
  assert.match(page, /PNG image/);
  assert.match(page, /SVG vector/);
  assert.match(page, /CSV roster/);
  assert.match(page, /Excel workbook/);
  assert.match(page, /buildOrgChartExportHtml/);
  assert.match(page, /buildOrgChartExportSvg/);
  assert.match(page, /buildOrgChartExportRows/);
  assert.match(page, /downloadSvgAsPng/);
  assert.match(page, /sandpro_org_chart\.png/);
  assert.match(page, /sandpro_org_chart\.svg/);
  assert.match(page, /sandpro_org_chart_roster\.csv/);
  assert.match(page, /sandpro_org_chart\.xlsx/);
  assert.match(page, /Chain Of Command/);
  assert.match(page, /Average Span Of Control/);
  assert.match(page, /Directory/);
  assert.match(page, /org-directory-view/);
  assert.match(page, /Chart view uses compact org-chart cards/);
  assert.match(page, /className=\{`org-tree-canvas-viewport \$\{orgTreeOrientation === "vertical" \? "vertical-tree" : "wide-tree"\}`\}/);
  assert.match(page, /Proof mode/);
  assert.match(page, /Wheel zooms at cursor/);
  assert.match(page, /window\.open\("", "sandpro-org-chart-export"/);
  assert.match(page, /Complete reporting tree/);
  assert.match(page, /Department roster detail/);
  assert.match(page, /Print \/ Save as PDF/);
  assert.match(page, /size: 11in 8\.5in/);
  assert.match(css, /\.org-tree/);
  assert.match(css, /\.org-tree-orientation-toggle/);
  assert.match(css, /\.org-tree-canvas\.vertical-tree/);
  assert.match(css, /\.org-tree-canvas\.vertical-tree \.org-tree-children/);
  assert.match(css, /\.org-tree-canvas-viewport/);
  assert.match(css, /\.org-tree-canvas/);
  assert.match(css, /\.org-canvas-tools/);
  assert.match(css, /\.org-navigation-strip/);
  assert.match(css, /\.org-export-menu/);
  assert.match(css, /\.org-span-legend/);
  assert.match(css, /\.org-span-control/);
  assert.match(css, /\.org-span-marker/);
  assert.match(css, /\.org-collapsed-count/);
  assert.match(css, /\.org-proof-mode/);
  assert.match(css, /\.org-directory-view/);
  assert.match(css, /cursor: grab/);
  assert.match(css, /\.org-person-card/);
  assert.match(css, /\.org-save-status/);
  assert.doesNotMatch(css, /data-print-mode="org-chart"/);
});

test('new user-facing features include dismissible help that can be reopened', () => {
  const component = read('src/components.jsx');
  const pages = read('src/pages.jsx');
  assert.match(component, /export const FeatureHelp/);
  assert.match(component, /sandpro-feature-help-/);
  assert.match(component, /HelpCircle/);
  for (const helpId of [
    'objectives-tagging-workflow',
    'org-chart-editing',
    'notification-preferences',
    'objective-workflow-tracker',
    'objective-files-preview',
    'daily-brief',
    'fix-it-feed',
  ]) {
    assert.ok(`${component}\n${pages}`.includes(helpId), `${helpId} help missing`);
  }
});

test('SandPro Daily can publish bulletin-board updates with PWA guidance', () => {
  const app = read('src/App.jsx');
  const component = read('src/components.jsx');
  const css = read('src/index.css');
  assert.match(app, /DAILY_BRIEF_STORAGE_VERSION/);
  assert.match(app, /bulletin-2026-06-01-pwa-push-tim/);
  assert.match(component, /DAILY_BULLETIN/);
  assert.match(component, /Weekend Release Bulletin/);
  assert.match(component, /Push notifications and the mobile PWA are now live/);
  assert.match(component, /Welcome Tim to the OMP team/);
  assert.match(component, /iPhone Safari/);
  assert.match(component, /Android Chrome/);
  assert.match(component, /Mobile Browser vs Installed PWA/);
  assert.match(component, /Enable push notifications/);
  assert.match(component, /Objective Links/);
  assert.match(component, /aria-label=\{`Open objective:/);
  assert.match(component, /openObjective\(obj, tab\)/);
  assert.match(component, /onOpenFilter/);
  assert.match(component, /Open active objectives/);
  assert.match(component, /Open past due objectives/);
  assert.match(component, /brief-stat-action/);
  assert.match(app, /onOpenFilter=\{\(preset\) => showObjectivesWithFilters/);
  assert.match(css, /\.brief-pwa-graphic/);
  assert.match(css, /\.brief-bulletin-card/);
  assert.match(css, /\.brief-item-action/);
  assert.match(css, /\.brief-stat-action/);
  assert.match(css, /\.brief-objective-panel/);
});

test('daily digest cron sends the SandPro Daily with clickable objective context', () => {
  const digest = read('api/cron/daily-digest.js');
  assert.match(digest, /The SandPro Daily/);
  assert.match(digest, /Open SandPro Daily/);
  assert.match(digest, /Top action items/);
  assert.match(digest, /objective_members/);
  assert.match(digest, /getScopedObjectives/);
  assert.match(digest, /getActionItems/);
  assert.doesNotMatch(digest, /if \(scoped\.length === 0\) continue/);
  assert.match(digest, /subject: 'The SandPro Daily'/);
});

test('Fix-It Feed is a first-class navigation page with file-backed persistence', () => {
  const app = read('src/App.jsx');
  const pages = read('src/pages.jsx');
  const hook = read('src/hooks/useSupabase.js');
  const migration = read('supabase/release_ready_migration.sql');

  assert.match(app, /"fixit"/);
  assert.match(app, /Fix-It Feed/);
  assert.match(app, /useFixItFeed/);
  assert.match(pages, /export const FixItFeedPage/);
  assert.match(pages, /I'm on it/);
  assert.match(pages, /Chronological beta feedback wall/);
  assert.match(hook, /fix_it_posts/);
  assert.match(hook, /fix_it_attachments/);
  assert.match(hook, /fix-it-files/);
  assert.match(hook, /reopened_by/);
  assert.match(hook, /reopen_count/);
  assert.match(pages, /Reopened from/);
  assert.match(pages, /reopenedFromStatus: post\.status/);
  assert.match(pages, /fixit-reopened-banner/);
  assert.match(pages, /fixit-post-reopened/);
  assert.match(pages, />Reopened</);
  assert.match(migration, /Fix-It posts viewable by all authenticated/);
  assert.match(migration, /reopened_from_status/);
});

test('Fix-It Feed accepts pasted clipboard attachments', () => {
  const pages = read('src/pages.jsx');
  assert.match(pages, /getClipboardFiles/);
  assert.match(pages, /nameClipboardFile/);
  assert.match(pages, /pasted-fix-it/);
  assert.match(pages, /onPaste=\{handlePaste\}/);
  assert.match(pages, /Drop or paste screenshots/);
});

test('new feature announcements point users to newly shipped tabs once', () => {
  const app = read('src/App.jsx');
  const css = read('src/index.css');

  assert.match(app, /NEW_FEATURE_ANNOUNCEMENTS/);
  assert.match(app, /fix-it-feed-v1/);
  assert.match(app, /sandpro-new-feature-seen/);
  assert.match(app, /New: Fix-It Feed/);
  assert.match(app, /Open tab/);
  assert.match(app, /nav-new-badge/);
  assert.match(css, /new-feature-popover/);
  assert.match(css, /nav-pill-feature/);
});

test('Merci feedback items are covered by durable UI paths', () => {
  const app = read('src/App.jsx');
  const component = read('src/components.jsx');
  const hook = read('src/hooks/useSupabase.js');
  const migration = read('supabase/release_ready_migration.sql');

  assert.match(component, /descriptionMentionIds/);
  assert.match(component, /placeholder="Add details\.\.\. use @ to mention teammates"/);
  assert.match(app, /assigned you on objective/);
  assert.match(component, /saveSubtaskEdit/);
  assert.match(component, /Delete Subtask/);
  assert.match(hook, /const deleteSubtask = async/);
  assert.match(hook, /is_milestone/);
  assert.match(migration, /Authenticated can delete subtasks/);
  assert.match(hook, /PASSWORD_RECOVERY/);
  assert.match(app, /Reset Your Password/);
});

test('objective progress calculation copy is professional SandPro language', () => {
  const component = read('src/components.jsx');

  assert.match(component, /Progress Calculation/);
  assert.match(component, /Average supporting work/);
  assert.match(component, /Weighted by work importance/);
  assert.match(component, /Manual leadership update/);
  assert.doesNotMatch(component, /Average child progress|Weighted child progress/);
});

test('objective tagging uses @mention entry instead of teammate dropdowns', () => {
  const component = read('src/components.jsx');
  const pages = read('src/pages.jsx');
  const app = read('src/App.jsx');

  assert.match(component, /TagMentionControl/);
  assert.match(component, /createPortal/);
  assert.match(component, /tag-mention-menu-portal/);
  assert.match(component, /placeholder="@name to tag"/);
  assert.match(component, /placeholder="@name to assign teammate"/);
  assert.match(pages, /TagMentionControl/);
  assert.match(pages, /placeholder="@name"/);
  assert.match(app, /role: 'assignee'/);
  assert.doesNotMatch(component, /<select value=\{role\}/);
  assert.doesNotMatch(component, /<option value="watcher">Watcher<\/option>/);
  assert.doesNotMatch(component, /<option value="manager">Manager<\/option>/);
  assert.doesNotMatch(component, /Choose teammate/);
  assert.doesNotMatch(pages, /Tag teammate/);
});

test('objectives list defaults to one-line titles with opt-in descriptions', () => {
  const pages = read('src/pages.jsx');
  const component = read('src/components.jsx');
  const css = read('src/index.css');

  assert.match(pages, /showListDescriptions/);
  assert.match(pages, /sandpro-objectives-show-descriptions/);
  assert.match(pages, /Show descriptions/);
  assert.match(pages, /objective-heading-control/);
  assert.match(pages, /aria-pressed=\{showListDescriptions\}/);
  assert.match(pages, /updateShowListDescriptions\(!showListDescriptions\)/);
  assert.match(pages, /showListDescriptions &&/);
  assert.match(pages, /formatObjectiveTimestamp\(obj\)/);
  assert.match(component, /formatObjectiveTimestamp\(obj\)/);
  assert.match(component, /formatObjectiveTimestamp\(localObj\)/);
  assert.match(css, /objective-title-line/);
  assert.match(css, /objective-description-line/);
  assert.match(css, /objective-timestamp-line/);
  assert.match(css, /objective-description-icon/);
  assert.match(css, /white-space: nowrap/);
});

test('dashboard KPI buckets mirror objective drill-down filters', () => {
  const app = read('src/App.jsx');
  const pages = read('src/pages.jsx');
  const component = read('src/components.jsx');
  const css = read('src/index.css');

  assert.match(pages, /label="Completed"/);
  assert.match(pages, /<KPICard bucket="state" icon=\{Target\} label="Active"/);
  assert.match(pages, /<KPICard bucket="state" icon=\{CheckCircle2\} label="Completed"/);
  assert.match(pages, /<KPICard bucket="time" icon=\{AlertTriangle\} label="Past Due"/);
  assert.match(pages, /DueHorizonStrip/);
  assert.match(pages, /dueHorizonItems/);
  assert.match(pages, /status: "completed"/);
  assert.match(pages, /gridTemplateColumns: "repeat\(4/);
  assert.match(pages, /label: "7 days"/);
  assert.match(pages, /dueWindow: item\.dueWindow, activeOnly: true/);
  assert.match(pages, /label: "Active"/);
  assert.match(pages, /OBJECTIVE_STATUS_FILTERS/);
  assert.match(pages, /OBJECTIVE_DUE_FILTERS/);
  assert.match(pages, /OBJECTIVE_SCOPE_LABELS/);
  assert.match(pages, /activeOnly && \{ key: "active", label: "Active"/);
  assert.match(pages, /objective-lens-summary/);
  assert.match(pages, /objective-lens-chip-\$\{chip\.tone\}/);
  assert.match(pages, /objective-status-filter/);
  assert.match(pages, /objective-filter-chip-\$\{chip\.key\}/);
  assert.match(pages, /Due Next 14/);
  assert.match(pages, /Due Next 28/);
  assert.match(pages, /statusBreakdown/);
  assert.match(pages, /breakdown=\{statusBreakdown/);
  assert.match(component, /kpi-status-breakdown/);
  assert.match(component, /kpi-card-\$\{bucket\}/);
  assert.match(component, /kpi-status-dot/);
  assert.match(component, /\{item\.label\}/);
  assert.match(component, /<strong>\{item\.count\}<\/strong>/);
  assert.match(css, /\.kpi-status-chip/);
  assert.match(css, /\.dashboard-scope-tabs/);
  assert.match(css, /\.kpi-card-state/);
  assert.match(css, /\.kpi-card-time/);
  assert.match(css, /\.due-horizon-card::before/);
  assert.match(css, /\.due-horizon-track/);
  assert.match(css, /\.kpi-status-dot/);
  assert.match(css, /\.objective-lens-summary/);
  assert.match(css, /\.objective-lens-chip-state/);
  assert.match(css, /\.objective-lens-chip-time/);
  assert.match(css, /\.objective-status-filter\.active/);
  assert.match(css, /\.objective-filter-chip/);
  assert.match(app, /activeOnly: Boolean\(preset\.activeOnly\) && preset\.status !== "completed"/);
});

test('objective list can sort by created date newest and oldest', () => {
  const pages = read('src/pages.jsx');
  const hook = read('src/hooks/useSupabase.js');

  assert.match(hook, /createdAt: o\.created_at/);
  assert.match(pages, /const createdTime = \(objective\) =>/);
  assert.match(pages, /sortBy === "newest"/);
  assert.match(pages, /sortBy === "oldest"/);
  assert.match(pages, /<option value="newest">Sort: Newest First<\/option>/);
  assert.match(pages, /<option value="oldest">Sort: Oldest First<\/option>/);
});

test('objective message board tracks per-user unread state', () => {
  const hook = read('src/hooks/useSupabase.js');
  const component = read('src/components.jsx');
  const pages = read('src/pages.jsx');
  const css = read('src/index.css');
  const migration = read('supabase/release_ready_migration.sql');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.objective_message_reads/);
  assert.match(hook, /objective_message_reads/);
  assert.match(hook, /markObjectiveMessagesRead/);
  assert.match(hook, /isUnread/);
  assert.match(component, /unreadMessages/);
  assert.match(component, /Unread/);
  assert.match(component, /firstUnreadMessageId/);
  assert.match(component, /New since you last checked/);
  assert.match(component, /message-read-strip/);
  assert.match(css, /\.message-unread-divider/);
  assert.match(component, /countText: unreadMessages \? `\$\{unreadMessages\} unread`/);
  assert.match(component, /autoReadKeyRef/);
  assert.match(component, /markMessagesRead\(\{ silent: true \}\)/);
  assert.match(pages, /objective-unread-line/);
  assert.match(pages, /getUnreadMessageCount/);
});

test('objective message mentions attach teammates as assigned members', () => {
  const app = read('src/App.jsx');
  const component = read('src/components.jsx');
  const mentions = read('src/mentions.js');

  assert.match(app, /getMentionedUsers\(msg\.text/);
  assert.match(app, /await addObjectiveMember\(updated\.id, \{ userId: targetId, role: 'assignee' \}\)/);
  assert.match(app, /existingMemberIds\.add\(targetId\)/);
  assert.doesNotMatch(component, /setTagText\("@"\)/);
  assert.match(component, /aria-label="Tag teammate by typing @name"/);
  assert.match(mentions, /firstNameCounts/);
  assert.match(mentions, /selectedByPicker/);
});

test('objective rows support direct inline status changes', () => {
  const app = read('src/App.jsx');
  const pages = read('src/pages.jsx');
  const css = read('src/index.css');
  const spec = read('tests/mutating-workflows.spec.js');
  const component = read('src/components.jsx');

  assert.match(app, /handleQuickStatusObjective/);
  assert.match(app, /onQuickStatus=\{handleQuickStatusObjective\}/);
  assert.match(app, /actionType: 'status_change'/);
  assert.match(app, /reopeningCompletedObjective/);
  assert.match(pages, /objective-status-select/);
  assert.match(pages, /aria-label=\{`Change status for \$\{obj\.title\}`\}/);
  assert.match(pages, /onQuickStatus\(obj, status\)/);
  assert.match(css, /\.objective-status-select/);
  assert.match(component, /Reopen objective/);
  assert.match(component, /Objective reopened as/);
  assert.match(spec, /Change status for \$\{title\}/);
  assert.match(spec, /selectOption\('on_track'\)/);
});

test('assigned objective members can reopen and update assigned objectives', () => {
  const hook = read('src/hooks/useSupabase.js');
  const migration = read('supabase/release_ready_migration.sql');
  assert.match(hook, /\.update\(dbChanges\)[\s\S]*\.select\('id'\)/);
  assert.match(hook, /You do not have permission to update this objective/);
  assert.match(migration, /Objective team can update objectives/);
  assert.match(migration, /public\.objective_members m/);
  assert.match(migration, /m\.role IN \('assignee', 'manager'\)/);
  assert.match(migration, /WITH CHECK/);
});

test('objective messages can be edited by the sender and compose areas can grow', () => {
  const app = read('src/App.jsx');
  const component = read('src/components.jsx');
  const hook = read('src/hooks/useSupabase.js');
  const migration = read('supabase/release_ready_migration.sql');
  const css = read('src/index.css');

  assert.match(hook, /const updateMessage = async/);
  assert.match(app, /onUpdateMessage=\{handleUpdateMessage\}/);
  assert.match(component, /editingMessageId/);
  assert.match(component, /Edit message/);
  assert.match(component, /message-edit-box/);
  assert.match(component, /resize: "vertical"/);
  assert.match(css, /\.message-edit-box textarea/);
  assert.match(migration, /Users can update own messages/);
});

test('objective messages support persisted work-appropriate reactions', () => {
  const app = read('src/App.jsx');
  const component = read('src/components.jsx');
  const hook = read('src/hooks/useSupabase.js');
  const migration = read('supabase/release_ready_migration.sql');
  const css = read('src/index.css');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.message_reactions/);
  assert.match(migration, /UNIQUE\(message_id, user_id\)/);
  assert.match(migration, /Users manage own message reactions/);
  assert.match(hook, /message_reactions/);
  assert.match(hook, /setMessageReaction/);
  assert.match(hook, /removeMessageReaction/);
  assert.match(component, /MESSAGE_REACTIONS/);
  assert.match(component, /Thumbs up/);
  assert.match(component, /Heard/);
  assert.match(component, /I'm on it/);
  assert.match(component, /message-reaction-menu/);
  assert.match(app, /onSetMessageReaction=\{handleSetMessageReaction\}/);
  assert.match(app, /onRemoveMessageReaction=\{handleRemoveMessageReaction\}/);
  assert.match(css, /\.message-reaction-chip/);
});

test('objective messages support polished voice notes', () => {
  const component = read('src/components.jsx');
  const hook = read('src/hooks/useSupabase.js');
  const css = read('src/index.css');

  assert.match(component, /MAX_VOICE_NOTE_SECONDS/);
  assert.match(component, /MediaRecorder/);
  assert.match(component, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(component, /VoiceNoteAttachment/);
  assert.match(component, /PendingVoiceNotePreview/);
  assert.match(component, /Record voice note/);
  assert.match(component, /Stop recording/);
  assert.match(component, /Voice note ready/);
  assert.match(component, /Send voice note/);
  assert.match(component, /Voice note discarded/);
  assert.match(component, /voice-note-/);
  assert.match(component, /onlyVoiceNote/);
  assert.match(component, /previewKind === "audio"/);
  assert.match(hook, /mime\.startsWith\('audio\/'\)/);
  assert.match(hook, /messageId: message\.id/);
  assert.match(css, /\.voice-note-card/);
  assert.match(css, /\.voice-recording-strip/);
  assert.match(css, /\.pending-voice-note/);
  assert.match(css, /\.voice-preview-panel/);
});

test('Spanish objective messages can be translated inline for English readers', () => {
  const app = read('src/App.jsx');
  const component = read('src/components.jsx');
  const css = read('src/index.css');
  const endpoint = read('api/messages/translate.js');

  assert.match(component, /isLikelySpanishText/);
  assert.match(component, /MessageTranslation/);
  assert.match(component, /Translate/);
  assert.match(component, /English translation/);
  assert.match(component, /Languages/);
  assert.match(app, /handleTranslateMessage/);
  assert.match(app, /\/api\/messages\/translate/);
  assert.match(app, /Authorization: `Bearer \$\{token\}`/);
  assert.match(endpoint, /getAuthedProfile/);
  assert.match(endpoint, /Translate Spanish workplace messages into clear, natural English/);
  assert.match(endpoint, /OPENAI_API_KEY/);
  assert.match(endpoint, /api\.mymemory\.translated\.net/);
  assert.match(endpoint, /callFallbackTranslator/);
  assert.match(css, /\.message-translate-button/);
  assert.match(css, /\.message-translation-panel/);
});

test('persistent SandPro brand mark returns users to the dashboard', () => {
  const app = read('src/App.jsx');
  const css = read('src/index.css');

  assert.match(app, /const handleHomeClick =/);
  assert.match(app, /navigatePage\("dashboard"\)/);
  assert.match(app, /setOpenCard\(null\)/);
  assert.match(app, /className="brand-home/);
  assert.match(app, /aria-label="Go to Dashboard"/);
  assert.match(app, /BRAND_LOGO_SRC/);
  assert.match(app, /\/brand\/sandpro-omp-logo\.png/);
  assert.match(app, /className="mobile-brand"/);
  assert.match(app, /mobile-brand-logo/);
  assert.match(css, /\.brand-home/);
  assert.match(css, /\.brand-logo-image/);
});

test('objective drafts survive modal closes until successfully saved', () => {
  const app = read('src/App.jsx');
  const component = read('src/components.jsx');

  assert.match(component, /sandpro-objective-form-draft/);
  assert.match(component, /savedDraft/);
  assert.match(component, /localStorage\.setItem\(formDraftKey/);
  assert.match(component, /Draft autosaved/);
  assert.match(component, /beforeunload/);
  assert.match(component, /data-testid="objective-form-modal"/);
  assert.match(component, /saved !== false && !editObj/);
  assert.match(component, /measurementCadence/);
  assert.match(component, /rollupMethod/);
  assert.match(app, /return saved/);
  assert.match(component, /writeDraft\(formDraftKey, ""\)/);
  assert.match(component, /sandpro-message-draft/);
  assert.match(component, /writeDraft\(messageDraftKey, newMessage\)/);
  assert.match(component, /writeDraft\(messageDraftKey, ""\)/);
});

test('objective delete is limited to creators and admins, not plain owners', () => {
  const app = read('src/App.jsx');
  const component = read('src/components.jsx');
  const hook = read('src/hooks/useSupabase.js');
  const migration = read('supabase/release_ready_migration.sql');

  assert.match(component, /canDeleteObjective/);
  assert.match(component, /localObj\.createdBy === currentUser\.id/);
  assert.match(component, /jfeil@sandpro\.com/);
  assert.match(app, /Only the creator or an admin can delete this objective/);
  assert.match(hook, /Only the creator or an admin can delete this objective/);
  assert.match(migration, /Objective creators and admins can delete objectives/);
  assert.match(migration, /auth\.uid\(\) = created_by/);
  assert.match(migration, /jfeil@sandpro\.com/);
  assert.doesNotMatch(migration, /Objective creators and admins can delete objectives[\s\S]*auth\.uid\(\) = owner_id/);
});

test('mention notification emails open messages and keep due dates separate', () => {
  const endpoint = read('api/notifications/send-event.js');
  const email = read('api/_shared/email.js');
  const app = read('src/App.jsx');
  const hook = read('src/hooks/useSupabase.js');

  assert.match(endpoint, /type === 'comment' \|\| type === 'mention' \? 'messages' : 'details'/);
  assert.match(endpoint, /const dueText = objective\?\.due_date \? `\\nDue:/);
  assert.match(endpoint, /detailText = ''/);
  assert.match(endpoint, /detailBody: emailDetail/);
  assert.match(email, /detailLabel = ''/);
  assert.match(email, /detailBody = ''/);
  assert.match(email, /border-left:4px solid #ff7f02/);
  assert.match(email, /white-space:pre-line/);
  assert.match(app, /detailText: messageDetail/);
  assert.match(hook, /detailText: context\.detailText/);
});

test('Fix-It Feed fixed status does not show still in-progress ownership copy', () => {
  const pages = read('src/pages.jsx');
  const css = read('src/index.css');
  const hook = read('src/hooks/useSupabase.js');
  const migration = read('supabase/release_ready_migration.sql');

  assert.match(pages, /post\.status === 'fixed' \|\| post\.status === 'agent_done'/);
  assert.match(pages, /Fixed by/);
  assert.match(pages, /validation complete/);
  assert.match(pages, /Validation proof/);
  assert.match(pages, /Back to Fix-It Feed/);
  assert.match(pages, /validation-proof-done/);
  assert.match(pages, /onUploadValidationProof/);
  assert.match(pages, /agent_done/);
  assert.match(pages, /fixit-archive-btn/);
  assert.match(pages, /fixit-validation-pill/);
  assert.match(pages, /getFixItActorName/);
  assert.match(pages, /isFixItAgentUser/);
  assert.match(pages, /view === 'archive' \? archivedPosts : activePosts/);
  assert.match(pages, /fixit-fixed-by/);
  assert.match(css, /\.fixit-tabs/);
  assert.match(css, /\.fixit-fixed-by/);
  assert.match(css, /\.fixit-validation-pill/);
  assert.match(css, /\.validation-proof-modal/);
  assert.match(css, /\.validation-proof-back/);
  assert.match(css, /100dvh !important/);
  assert.match(css, /\.fixit-archive-btn/);
  assert.match(css, /\.fixit-agent-done/);
  assert.match(css, /\.fixit-archived/);
  assert.match(hook, /agent_tested_by/);
  assert.match(hook, /validationProof/);
  assert.match(hook, /uploadValidationProof/);
  assert.match(hook, /validation_proof/);
  assert.match(hook, /human_reviewed_by/);
  assert.match(hook, /archived_at/);
  assert.match(migration, /agent_tested_by UUID/);
  assert.match(migration, /purpose TEXT NOT NULL DEFAULT 'report'/);
  assert.match(migration, /human_reviewed_by UUID/);
  assert.match(migration, /archived_at TIMESTAMPTZ/);
  assert.match(css, /\.tag-mention-menu-portal/);
});

test('Fix-It Feed supports per-item comments with file attachments', () => {
  const pages = read('src/pages.jsx');
  const css = read('src/index.css');
  const hook = read('src/hooks/useSupabase.js');
  const migration = read('supabase/release_ready_migration.sql');
  const schemaCheck = read('scripts/check-release-schema.mjs');
  const app = read('src/App.jsx');

  assert.match(pages, /FixItCommentComposer/);
  assert.match(pages, /Reply to \$\{replyName\}/);
  assert.match(pages, /Drop or paste screenshots, PDFs, Office docs, audio, or notes/);
  assert.match(pages, /post\.comments\.map/);
  assert.match(pages, /fixit-comment-agent/);
  assert.match(pages, /Agent reply/);
  assert.match(pages, /name: 'Agent'/);
  assert.match(pages, /FIX_IT_AGENT_AVATAR_URL = '\/avatars\/thrawn-agent-avatar\.png'/);
  assert.match(pages, /getFixItDisplayUser\(commenter\)/);
  assert.match(pages, /fixit-comment-composer/);
  assert.match(pages, /FIXIT_COMMON_FILE_ACCEPT/);
  assert.match(css, /\.fixit-comments/);
  assert.match(css, /\.fixit-agent-comment-badge/);
  assert.match(css, /\.fixit-comment-composer/);
  assert.match(hook, /fix_it_comments/);
  assert.match(hook, /createComment/);
  assert.match(hook, /comment_id/);
  assert.match(hook, /'comment', comment\.id/);
  assert.match(app, /createComment: createFixItComment/);
  assert.match(app, /handleCreateFixItComment/);
  assert.match(app, /Fix-It reply from/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.fix_it_comments/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS comment_id UUID/);
  assert.match(migration, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.fix_it_comments/);
  assert.match(schemaCheck, /fix_it_comments table/);
  assert.match(schemaCheck, /comment_id/);
});

test('Jake-requested production controls exist for org compact view, NCR export, and Fix-It push updates', () => {
  const app = read('src/App.jsx');
  const pages = read('src/pages.jsx');
  const css = read('src/index.css');
  const mentions = read('src/mentions.js');
  const endpoint = read('api/fixit/push-event.js');

  assert.match(pages, /orgViewMode/);
  assert.match(pages, /Compact/);
  assert.match(pages, /org-compact-view/);
  assert.match(css, /\.org-compact-row/);
  assert.match(pages, /NCR Custom Report/);
  assert.match(pages, /Export NCR CSV/);
  assert.match(pages, /filteredExportNcrs/);
  assert.match(mentions, /ALL_COMPANY_MENTION/);
  assert.match(mentions, /AllCompany/);
  assert.match(app, /handleCreateFixItPost/);
  assert.match(app, /handleUpdateFixItPostStatus/);
  assert.match(app, /fixit_new/);
  assert.match(endpoint, /fixit_agent/);
});

test('objective CSV export is filtered and excludes internal ids', () => {
  const pages = read('src/pages.jsx');

  assert.match(pages, /exportFilters/);
  assert.match(pages, /filteredExportObjectives/);
  assert.match(pages, /Objective Export Filters/);
  assert.match(pages, /\["Title", "Status", "Priority", "Owner", "Progress", "Due Date", "Department", "Next Action"\]/);
  assert.doesNotMatch(pages, /"Objective ID"/);
  assert.doesNotMatch(pages, /o\.id\]/);
});

test('owner filter keeps the signed-in user selectable even with no owned objectives', () => {
  const pages = read('src/pages.jsx');

  assert.match(pages, /const allOwners = getProfiles\(\)/);
  assert.match(pages, /a\.id === currentUser\.id/);
  assert.match(pages, /\$\{u\.name\} \(me\)/);
  assert.doesNotMatch(pages, /const allOwners = getProfiles\(\)\.filter/);
});

test('workflow status updates enforce a single current step per objective', () => {
  const hook = read('src/hooks/useSupabase.js');
  assert.match(hook, /changes\.status === 'current' && currentStep\.status !== 'current'/);
  assert.match(hook, /\.select\('objective_id,title,description,step_order,status,owner_id,due_date,completed_at,completed_by'\)/);
  assert.match(hook, /\.eq\('objective_id', objectiveId\)/);
  assert.match(hook, /\.neq\('id', id\)/);
  assert.match(hook, /\.eq\('status', 'current'\)/);
  assert.match(hook, /update\(\{ status: 'todo', completed_at: null, completed_by: null \}\)/);
});

test('Microsoft Clarity is env-gated and loaded asynchronously', () => {
  const main = read('src/main.jsx');
  const analytics = read('src/analytics.js');
  const envExample = read('.env.release.example');

  assert.match(main, /installMicrosoftClarity\(\)/);
  assert.match(analytics, /VITE_MICROSOFT_CLARITY_PROJECT_ID/);
  assert.match(analytics, /https:\/\/www\.clarity\.ms\/tag\/\$\{clarityProjectId\}/);
  assert.match(analytics, /script\.async = true/);
  assert.match(analytics, /isValidProjectId/);
  assert.match(envExample, /VITE_MICROSOFT_CLARITY_PROJECT_ID=/);
});

test('Supabase browser credentials are trimmed before client creation', () => {
  const client = read('src/lib/supabase.js');
  assert.match(client, /cleanEnvValue/);
  assert.match(client, /String\(value \|\| ''\)\.trim\(\)/);
  assert.match(client, /cleanEnvValue\(import\.meta\.env\.VITE_SUPABASE_URL\)/);
  assert.match(client, /cleanEnvValue\(import\.meta\.env\.VITE_SUPABASE_ANON_KEY\)/);
});

test('SandPro orange is centralized on the sampled brand color', () => {
  const appSource = [
    ...walk('src'),
    ...walk('api'),
    ...walk('scripts'),
    'index.html',
    'public/manifest.webmanifest',
    'supabase/migration.sql',
  ].filter(path => /\.(jsx?|css|html|json|sql|mjs)$/.test(path)).map(read).join('\n');
  const css = read('src/index.css');

  assert.match(css, /--sandpro-orange:\s*#ff7f02/);
  assert.match(css, /--sandpro-orange-rgb:\s*255,\s*127,\s*2/);
  assert.doesNotMatch(appSource, /#F97316|#EA580C|#C2410C|249,\s*115,\s*22|234,\s*88,\s*12|194,\s*65,\s*12/i);
});

test('mobile PWA rebuild has install assets, safe-area shell, and phone-native work surfaces', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  const index = read('index.html');
  const sw = read('public/sw.js');
  const favicon = read('public/favicon.svg');
  const app = read('src/App.jsx');
  const pages = read('src/pages.jsx');
  const components = read('src/components.jsx');
  const css = read('src/index.css');

  assert.equal(manifest.short_name, 'SandPro');
  assert.equal(manifest.start_url, '/?source=pwa');
  assert.equal(manifest.orientation, 'portrait-primary');
  assert.ok(manifest.icons.some(icon => icon.src === '/pwa/sandpro-omp-icon-192-v2.png' && icon.purpose.includes('maskable')));
  assert.ok(manifest.icons.some(icon => icon.src === '/pwa/sandpro-omp-icon-512-v2.png' && icon.purpose.includes('maskable')));
  assert.ok(manifest.icons.some(icon => icon.src === '/favicon-omp-v2.png' && icon.type === 'image/png'));
  assert.match(index, /viewport-fit=cover/);
  assert.match(index, /rel="icon" type="image\/png" href="\/favicon-omp-v2\.png"/);
  assert.match(index, /apple-touch-icon" href="\/pwa\/sandpro-omp-apple-touch-icon-v2\.png"/);
  assert.match(favicon, /aria-label="SandPro OMP"/);
  assert.match(favicon, /#ff7f02/);
  assert.match(favicon, /sandpro-orange/);
  assert.match(favicon, /stroke-linecap="round"/);
  assert.doesNotMatch(favicon, /863bff|vite/i);
  assert.match(sw, /\/brand\/sandpro-omp-logo\.png/);
  assert.match(sw, /\/favicon-omp-v2\.png/);
  assert.match(sw, /sandpro-omp-shell-v10/);
  assert.match(sw, /OFFLINE_HTML/);
  assert.match(sw, /supabase\.co/);
  assert.match(sw, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /addEventListener\('notificationclick'/);

  assert.match(app, /mobile-topbar/);
  assert.match(app, /mobile-new-fab/);
  assert.match(app, /mobile-user-drawer/);
  assert.match(app, /handleNotificationClick/);
  assert.match(pages, /mobile-objective-list/);
  assert.match(pages, /mobile-filter-sheet/);
  assert.match(pages, /ncr-mobile-list/);
  assert.match(pages, /org-mobile-list/);
  assert.match(components, /objective-detail-modal/);
  assert.match(components, /objective-message-composer/);
  assert.match(components, /objective-form-modal/);
  assert.match(css, /--safe-bottom: env\(safe-area-inset-bottom/);
  assert.match(css, /\.desktop-objective-views/);
  assert.match(css, /\.mobile-objective-card/);
  assert.match(css, /\.objective-message-composer/);
});

test('mobile PWA supports pull down and release to reload', () => {
  const app = read('src/App.jsx');
  const css = read('src/index.css');

  assert.match(app, /pullRefreshState/);
  assert.match(app, /touchstart/);
  assert.match(app, /touchmove/);
  assert.match(app, /pointerdown/);
  assert.match(app, /matchMedia\('\(max-width: 768px\)'\)/);
  assert.match(app, /Release to reload/);
  assert.match(app, /window\.location\.reload\(\)/);
  assert.match(app, /ref=\{mainContentRef\}/);
  assert.match(css, /\.mobile-pull-refresh/);
  assert.match(css, /overscroll-behavior-y:\s*contain/);
});
