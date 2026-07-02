# SandPro OMP Agent Repo Map

Use this file to orient a new agent before they touch SandPro OMP. It answers the basic handoff questions: where the repo is, where production is, where the important code lives, and which local files already carry project context.

## One-Screen Answer

- Correct local repo: `/Users/andrewemmel/Documents/New project/sandpro-omp`
- GitHub remote: `https://github.com/andrewemmelparttimepro-ux/sandpro-omp.git`
- Branch at handoff time: `main`, tracking `origin/main`
- Production app: `https://objectivetracker.net`
- Vercel app host also exists, but `vercel.json` redirects `sandpro-omp.vercel.app` and `www.objectivetracker.net` to `https://objectivetracker.net`
- Stack: Vite, React 19, Supabase, Vercel serverless functions, Playwright, Node test runner
- Main app shell: `src/App.jsx`
- Main page file: `src/pages.jsx`
- Supabase data hook: `src/hooks/useSupabase.js`
- Supabase client: `src/lib/supabase.js`
- Supabase migrations/schema: `supabase/`
- Vercel API routes: `api/`
- Tests: `tests/`
- Existing agent operating contract: `AGENT.md`

Important: `/Users/andrewemmel/Documents/New project` is also a Git repo and contains multiple projects. For SandPro OMP, work from the nested repo root above, not the parent workspace root.

## First Commands For A New Agent

```bash
cd "/Users/andrewemmel/Documents/New project/sandpro-omp"
git status --short --branch
git remote -v
npm install
npm run dev
```

Vite normally serves locally at `http://localhost:5173` unless the port is already taken.

Do not print or paste secrets from `.env.local`, `.env.release.local`, `.vercel/.env.production.local`, or `.vercel/.env.preview.local`. The app expects at least:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Release and production smoke scripts may require additional Vercel, Supabase, push, email, or agent env vars. `tests/env-loader.js` loads local env files for tests.

## Current Working Tree Warning

At the time this repo map was written, the SandPro tree was already dirty. Do not reset it, clean it, or assume every changed file is yours.

Tracked files already modified:

- `src/App.jsx`
- `src/components.jsx`
- `src/hooks/useSupabase.js`
- `src/okrFramework.js`
- `src/ompFramework.js`
- `tests/unit/okr-framework.test.mjs`

There are also many untracked docs, reports, evidence folders, handoff files, scripts, and migrations. Always run `git status --short --branch` before editing and preserve unrelated changes.

## Live App Routes

Routing is query-param based in `src/App.jsx`.

- Dashboard: `https://objectivetracker.net`
- Alternative dashboard: `https://objectivetracker.net?dashboard=alternative`
- Objectives: `https://objectivetracker.net?page=objectives`
- KPI: `https://objectivetracker.net?page=kpi`
- Fix-It Feed: `https://objectivetracker.net?page=fixit`
- NCR: `https://objectivetracker.net?page=ncr`
- Organization: `https://objectivetracker.net?page=organization`

The page ids are declared in `src/App.jsx` as:

```js
["dashboard", "objectives", "kpi", "fixit", "ncr", "organization"]
```

## Source Tree Map

### App Entry And Shell

- `src/main.jsx`
  - React entry point.

- `src/App.jsx`
  - Top-level auth, routing, navigation, notification panel, feature announcements, modal wiring, push events, and page composition.
  - Calls the main hooks from `src/hooks/useSupabase.js`.
  - Defines page ids and query-param routing.
  - Owns navigation items and the Objectives/NCR subnav relationship.

- `src/index.css`
  - Main application styling.

- `public/`
  - PWA manifest, favicons, icons, brand assets, and service worker.

- `dist/`
  - Built output. Treat as generated unless a deployment/debugging task explicitly targets it.

### Main Pages

Most user-facing screens live in one large file: `src/pages.jsx`.

Current exported page/component landmarks:

- `DashboardPage` near line 757
- `ObjectivesPage` near line 1098
- `KpiPage` near line 2386
- `FixItFeedPage` near line 2833
- `NcrPage` near line 4360
- `OrgPage` near line 7040
- `AdminSidebar` near line 8608

This file contains a lot of product behavior. Search before editing:

```bash
rg -n "export const .*Page|NcrPage|FixItFeedPage|DashboardPage|ObjectivesPage|AdminSidebar" src/pages.jsx
```

### Shared Components And Objective UI

- `src/components.jsx`
  - Shared objective card/detail/edit UI and cross-page components.
  - Important for objective create/edit behavior, progress display, owner/member display, and framework fields.

- `src/AltNotesPopup.jsx`
  - Alternative dashboard notes UI.

- `src/glossary.jsx` and `src/glossaryData.js`
  - Glossary/help surfaces.

### Supabase Data Layer

- `src/lib/supabase.js`
  - Creates the Supabase client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

- `src/hooks/useSupabase.js`
  - Main data and mutation layer. This is the first file to inspect for real database behavior.
  - Exports these major hooks:
    - `usePushNotifications`
    - `useAuth`
    - `useProfiles`
    - `useAlternativeDashboard`
    - `useAltNotes`
    - `useKpis`
    - `useObjectives`
    - `useNcrReports`
    - `useFixItFeed`
    - `useNotifications`

Important table families touched by this hook:

- Auth/profile: `profiles`
- Objectives: `objectives`, `messages`, `subtasks`, `objective_updates`, `files`, `objective_members`, `objective_metric_checkins`, `objective_agent_runs`, `objective_workflow_steps`
- OKR projects: `okr_projects`, `okr_project_kr_links`, `okr_assessment_artifacts`, `okr_project_signatures`, `okr_project_attachments`, `okr_project_audit_events`
- KPI: `kpi_definitions`, `kpi_datapoints`, `kpi_objective_links`, `kpi_checkins`, `kpi_alert_events`, `kpi_import_batches`
- NCR: `ncr_reports`, `ncr_action_items`, `ncr_attachments`, `ncr_audit_events`, `ncr_signatures`, `ncr_import_batches`
- Fix-It: `fix_it_posts`, `fix_it_comments`, `fix_it_attachments`
- Notifications: `notifications`
- Alternative dashboard: `alt_dashboard_preferences`, `alt_dashboard_presence`, `alt_dashboard_note_folders`, `alt_dashboard_notes`, `alt_dashboard_note_attachments`

Important storage buckets referenced in code:

- `profile-avatars`
- `objective-files`
- `okr-project-files`
- `ncr-files`
- `fix-it-files`
- the alternative-notes bucket exported from `src/altNotes.js`

### Product Logic And Domain Files

- `src/data.js`
  - General seed/options data, department exports, and framework data imports.

- `src/ompFramework.js`
  - OMP Framework Rev 1 source of truth.
  - Defines the 4 top-level classification types: Task, Project, OKR, NCR.
  - Defines the 5 framework departments: Automation, Wellhead, Flowback, CP Warehouse, Business Team.
  - Defines department classes, field matrix, legacy department remap, and OKR group to department mapping.

- `src/data/okr2026Consolidated.json`
  - Machine-generated 2026 OKR workbook data.

- `src/data/okr2026Consolidated.js`
  - Wrapper/helpers for the 2026 OKR JSON, including company/group OKRs and flattening helpers.

- `scripts/gen-okr-2026.py`
  - Regenerates the 2026 OKR JSON from the workbook.

- `src/okrFramework.js`
  - OKR/project classification, current period, progress computation, metric progress, framework normalization, project gate blockers, tree building, and scorecard rows.
  - The current OMP data-to-display lane has focused on `getObjectiveProgress`.

- `src/ompPermissions.js`
  - Permission contract for framework/objective editing.
  - Current admin roles are `executive` and `manager`.

- `src/kpiSystem.js`
  - KPI status, target formatting, trend/stale logic, department scorecards, NCR KPI summary, operating KPI building, KPI alerts, CSV parsing, and KPI/objective link scoring.

- `src/ncrImport.js`
  - NCR/KPA import parsing and spreadsheet normalization.
  - Inspect this before changing import behavior.

- `src/altDashboard.js`
  - Alternative dashboard mode, preferences, presence, and guided interaction logic.

- `src/altNotes.js`
  - Alternative dashboard note model and bucket/constants.

- `src/analytics.js`
  - Analytics helpers.

- `src/mentions.js`
  - Mention parsing/notification helpers.

## Serverless API Routes

Vercel API routes live under `api/`.

- `api/_shared/`
  - Shared email, push, Supabase admin, and objective starter helpers.

- `api/admin/`
  - User admin endpoints: invite, update, delete.

- `api/agent/objective-starter.js`
  - Agent/objective starter endpoint.

- `api/cron/daily-digest.js`
  - Weekday daily digest cron.

- `api/cron/reminders.js`
  - Daily reminders cron.

- `api/fixit/push-event.js`
  - Fix-It push notification endpoint.

- `api/messages/translate.js`
  - Message translation endpoint.

- `api/ncr/analytics-ai.js`
  - NCR analytics AI endpoint.

- `api/notifications/send-event.js`
  - Notification event endpoint.

- `api/push/`
  - Push public key, subscribe, unsubscribe endpoints.

`vercel.json` defines the cron schedules:

- `/api/cron/daily-digest`: `0 13 * * 1-5`
- `/api/cron/reminders`: `0 14 * * *`

## Supabase Files

- `supabase/config.toml`
  - Local Supabase project config.

- `supabase/migration.sql`
  - Earlier/main schema migration.

- `supabase/release_ready_migration.sql`
  - Large additive release-readiness migration. Includes profiles avatar support, objective framework fields, KPI tables, workflow steps, and other release-era tables.

- `supabase/okr_framework_migration.sql`
  - OMP/OKR framework migration work.

- `supabase/seed.sql`
  - Seed data.

- `supabase/seed-users.mjs`
  - User seeding helper.

The local Supabase CLI temp directory exists at `supabase/.temp/`. Treat it as local metadata, not source of truth.

## Existing Handoff And Context Files

Read these before broad OMP work:

- `AGENT.md`
  - Fix-It Feed operating contract. Important when the task involves active Fix-It cards, proof, validation, comments, or archiving rules.

- `AGENT-HANDOFF-OMP-FRAMEWORK-AND-OKRS.md`
  - Detailed OMP Framework Rev 1 and 2026 OKR handoff. Includes source docs, encoded framework spec, open Tim/Jake decisions, and warnings about department migration.

- `docs/OMP-DATA-TO-DISPLAY-BRIDGE-PLAN.md`
  - Current bridge-plan context for where data comes from, how it is treated, and how it is displayed.

- `docs/meeting-briefs/jake-framework-okr-crosswalk-2026-06-23.md`
  - Crosswalk between Jake/stakeholder framing and the framework/OKR implementation.

- `docs/meeting-briefs/jake-meeting-decision-questions-2026-06-24.md`
  - Stakeholder decision questions.

- `docs/meeting-briefs/jake-meeting-decision-questions-2026-06-24.html`
  - HTML version of the decision questions.

- `docs/OMP-DECISIONS-NEEDED.pdf`
  - PDF decision artifact.

- `docs/SandPro_OMP_Update_Brief_Jake.pdf`
  - Stakeholder update brief.

- `docs/OMP__2nd_meeting__Notifications_&_Tracker_Summary.txt`
  - Meeting summary source.

- `docs/OMP__2nd_meeting__Notifications_&_Tracker_Transcript.txt`
  - Meeting transcript source.

- `docs/release-protocol.md`
  - Release process notes.

- `docs/release-matrix.md`
  - Release matrix notes.

- `docs/fix-it-agent-handoff.md`
  - Older/narrower Fix-It handoff.

Original OMP framework workbook references were previously handled from:

```text
~/Downloads/ompframeworkokrsreferencedocuments/
```

Expected files in that folder, if still present:

- `OMP_FRAME_WORK_R1.xlsx`
- `2026 All Group OKRs_ Consolidated_4.8.26.xlsx`

## NPM Scripts

Common local commands:

```bash
npm run lint
npm run build
npm run test:unit
npm run test:e2e
```

Useful focused OMP/KPI framework check:

```bash
node --test tests/unit/okr-framework.test.mjs tests/unit/kpi-system.test.mjs tests/unit/release-readiness.test.mjs tests/unit/omp-permissions.test.mjs
```

Release and production-oriented commands from `package.json`:

```bash
npm run test:schema
npm run test:auth-redirects
npm run test:a11y
npm run test:pwa
npm run test:mobile
npm run release:preflight
npm run smoke:prod
npm run deploy:prod
npm run release:verify
```

Only run production smoke/deploy commands when the task actually calls for production validation or deployment and the required env is present.

## Fix-It Feed Rules

If the work starts from a Fix-It card, read `AGENT.md` first.

Short version:

- Classify the card before editing.
- Only work clear, safe, mapped SandPro issues.
- Validate live before marking complete.
- Attach proof for validation.
- Do not archive cards unless Andrew explicitly asks.
- Keep public Fix-It comments customer-facing. Do not post internal audit logs, command output, long blocker analysis, or proof inventories as comments.

## OMP Framework Lane Rules

For framework, OKR, KPI, or data-to-display work, start from the source-doc and data-contract question:

1. Where does the data come from?
2. How is it treated in code/database?
3. How is it displayed to the operator or stakeholder?

Current durable OMP concepts:

- The app already has the core building blocks: departments, objectives, OKRs/KRs, projects, metrics, KPI tab, NCRs, scorecards, operating health, and Fix-It.
- The hard part is not "does a feature exist"; it is whether workbook/transcript/source data, Supabase rows, computed values, and UI labels all agree.
- The framework departments are Automation, Wellhead, Flowback, CP Warehouse, and Business Team.
- The 17 OKR groups are finer-grained and should be treated as sub-tags under the 5-department framework unless stakeholders decide otherwise.
- Derived progress should be computed and source-labeled; truly manual progress should remain editable only where allowed.
- Human decisions still matter for legacy objective migration, progress semantics, KPI thresholds, group-to-department mapping, admin scope, and picture retention on re-import.

## Git Notes

Recent local commits at handoff time:

```text
ba93867 Add NCR tracker export and priority KPA refresh
784527b Allow NCR filtering by multiple groups
d2fab5a Fix NCR KPA import preview parsing
b5314f6 feat: ship SandPro OMP framework updates
ed1fd6f fix: hide empty org chart span markers
```

Before committing, inspect the diff carefully:

```bash
git status --short --branch
git diff -- src/App.jsx src/components.jsx src/hooks/useSupabase.js src/okrFramework.js src/ompFramework.js tests/unit/okr-framework.test.mjs
git diff --stat
```

Do not include unrelated docs/evidence/generated files unless the task calls for them.

## Fast Search Recipes

```bash
rg -n "getObjectiveProgress|derived progress|manual progress" src tests
rg -n "OMP_DEPARTMENTS|OMP_FIELD_MATRIX|LEGACY_DEPARTMENT_REMAP|OKR_GROUP_TO_DEPARTMENT" src tests
rg -n "ncr|NCR|KPA|importReports|Export visible list" src tests docs
rg -n "fix_it|FixItFeedPage|validationProof|agent_done" src api tests AGENT.md
rg -n "kpi_definitions|buildOperatingKpis|buildDepartmentScorecard|KpiPage" src tests supabase
```

## Agent Stop Conditions

Stop and report instead of guessing when:

- The target task cannot be mapped to SandPro OMP.
- The change would require destructive database migration or production data mutation.
- The Fix-It item is already validated with proof and has no newer human reopen/report activity.
- Stakeholder decisions are missing for taxonomy, owners, migration, permissions, progress, KPI thresholds, or export semantics.
- Production validation requires credentials or browser/session access you do not have.

