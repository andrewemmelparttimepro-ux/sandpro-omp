# SandPro OMP Current-State Agent Handoff

Generated: 2026-07-01 15:17:46 CDT

This handoff is for the next agent working on SandPro OMP. It combines the repo map, current live production checks, local worktree state, active product lanes, and known traps. Treat this as an evidence-first starting point, then re-check anything you are about to change.

## 1. Correct Project And Code Location

- Project: SandPro OMP, the Objective Management Platform used at `objectivetracker.net`.
- Correct local repo: `/Users/andrewemmel/Documents/New project/sandpro-omp`
- Git remote: `https://github.com/andrewemmelparttimepro-ux/sandpro-omp.git`
- Current branch at handoff time: `main`
- Current HEAD at handoff time: `ef3350566c3d795890372fe0961b9f2fbe016fd3`
- Live production URL: `https://objectivetracker.net`
- Old/redirecting hosts: `https://sandpro-omp.vercel.app` and `https://www.objectivetracker.net` redirect to `https://objectivetracker.net`.

Do not work out of a thin/sparse checkout if production env, node modules, or Vercel linkage are missing. The full checkout above is the reliable path for schema checks, production smokes, browser validation, and Supabase service-role reads.

## 2. What This App Is

SandPro OMP is a Vite + React + Supabase + Vercel app for company objectives, OKR/OMP tracking, KPI surfaces, NCR tracking, organization management, notifications, and a proof-based Fix-It Feed. It is not just a static dashboard: it has production database state, serverless API routes, scheduled crons, browser smoke tests, and public-facing workflow rules that matter.

Primary production surfaces:

- Dashboard: `https://objectivetracker.net/`
- Alternative dashboard: `https://objectivetracker.net/?dashboard=alternative`
- Objectives: `https://objectivetracker.net/?page=objectives`
- KPI Command Center: `https://objectivetracker.net/?page=kpi`
- Fix-It Feed: `https://objectivetracker.net/?page=fixit`
- NCR: currently nested under Objectives in the local source changes; direct URL remains `https://objectivetracker.net/?page=ncr`
- Organization: `https://objectivetracker.net/?page=organization`

Unauthenticated users currently land on the auth shell with `Objective Management Platform`, `Sign In`, and `Sign Up`.

## 3. Operating Contract

Read `/Users/andrewemmel/Documents/New project/sandpro-omp/AGENT.md` before touching Fix-It work.

Key rules:

- Fix-It Feed is a proof-based closure workflow.
- Public comments are team communication, not agent audit logs.
- Do not archive Fix-It cards unless Andrew explicitly asks.
- Statuses are `open`, `in_progress`, `fixed`, `agent_done`, and `archived`.
- Validation proof lives in `fix_it_attachments` with `purpose = 'validation_proof'`; storage bucket is `fix-it-files`.
- For any Fix-It action: classify first, query live production truth, validate in browser, attach/verify proof, then report plainly.
- When the board is empty, say it is empty. Do not invent work.

## 4. Current Production State Verified On 2026-07-01

### Live web shell

`curl -L https://objectivetracker.net` returned HTTP 200 from Vercel.

Observed response metadata:

- `x-vercel-cache: HIT`
- `last-modified: Wed, 01 Jul 2026 15:54:44 GMT`
- HTML title: `SandPro OMP`
- meta description: `SandPro OMP - Enterprise Objective Management Platform for strategic alignment and execution tracking.`
- asset JS: `/assets/index-Cc9i-flP.js`
- asset CSS: `/assets/index-BnRhxHSo.css`

Playwright unauthenticated check:

- Page title: `SandPro OMP`
- Visible auth copy: `Objective Management Platform`, `Sign In`, `Sign Up`
- Inputs: `you@sandpro.com`, `Min 6 characters`
- No page errors, no console warnings/errors observed.
- No obvious mobile overflow in the unauthenticated shell.

### Production database snapshot

Snapshot time: `2026-07-01T20:14:49.487Z`

Counts observed from production Supabase:

- `profiles`: 32
- `objectives`: 91
- active objectives: 91
- completed objectives: 0
- `fix_it_posts` active/non-archived: 0
- `fix_it_posts` archived: 28
- `ncr_reports`: 354
- open NCRs: 174
- `okr_projects`: 0
- `kpi_definitions`: 0
- `kpi_datapoints`: 0
- `objective_metric_checkins`: 0
- `objective_workflow_steps`: 546
- active push subscriptions: 6

Important: a live query for `sandpro_objectives` failed because production could not find `public.sandpro_objectives` in the schema cache. Older memory/docs mention `sandpro_objectives`, but current production truth is the `objectives` table.

### Current objectives shape

Live `objectives` count is 91.

Observed objective columns include:

- `class`
- `okr_group`
- `okr_level`
- `parent_id`
- `progress`
- `rollup_method`
- `baseline_text`
- `target_text`

Observed level counts:

- `company`: 4
- `department`: 87

No live `key_result` level rows were observed in the production count at handoff time. Recent objective samples were updated around `2026-06-30T19:27:26.261411+00:00`, often with `department = Business Team`, populated `okr_group`, `rollup_method = average`, `progress = 0`, and `class = null`.

### Current NCR shape

`ncr_reports` count is 354, with 174 open.

Production `ncr_reports` does not have `group_name`. Use current columns such as:

- `department_group`
- `affected_departments`
- `affected_department_list`
- `report_number`
- `status`
- `closed`
- `linked_objective_id`
- `lifecycle_stage`
- owner/reviewer/verifier fields

Recent sample report numbers included `82008371` and `82007431`, with `department_group = Shop`, `status = in_progress`, `closed = false`, and `linked_objective_id = null`.

## 5. Verification Already Run

From `/Users/andrewemmel/Documents/New project/sandpro-omp`:

```bash
node scripts/require-release-env.mjs prod
```

Result: passed.

```bash
npm run smoke:prod
```

Result: passed, 6/6 tests in about 42.5 seconds.

Coverage observed:

- Domain login shell over HTTPS on desktop and mobile.
- Smoke admin can log in and reach core read-only surfaces on desktop and mobile.
- Smoke member credentials reach app or password-change gate on desktop and mobile.

```bash
npm run test:schema
```

Result: passed.

The schema gate confirmed release tables/buckets including profiles avatar, objective members, objective metric check-ins, KPI tables, objective workflow steps, OKR project tables, notifications, email/push tables, alternative dashboard, message reads, Fix-It, NCR, org placeholders, files/objectives/subtasks/objective_updates release columns, and storage bucket privacy/public settings.

```bash
npm run test:unit
```

Result: not clean in this handoff run. It hung and was interrupted after visible output showed 65 passed, 0 failed, 1 cancelled, with `tests/unit/release-readiness.test.mjs` cancelled because a promise resolution was still pending after the event loop resolved. Treat this as current gate noise unless your task is specifically release-readiness or the failing file.

## 6. Local Worktree State At Handoff

The worktree was already dirty before this handoff file was added. Do not revert those changes unless Andrew explicitly asks.

Tracked dirty files observed:

```text
 M src/App.jsx
 M src/components.jsx
 M src/hooks/useSupabase.js
 M src/okrFramework.js
 M src/ompFramework.js
 M tests/prod-smoke.spec.js
 M tests/unit/okr-framework.test.mjs
```

Tracked diff size observed:

```text
src/App.jsx                       | 26 ++++++++++++---
src/components.jsx                | 34 ++++++++++++++-----
src/hooks/useSupabase.js          | 39 +++++++++++++++-------
src/okrFramework.js               | 69 +++++++++++++++++++++++++++++++++++++++
src/ompFramework.js               | 43 ++++++++++++++++++++++++
tests/prod-smoke.spec.js          |  5 ++-
tests/unit/okr-framework.test.mjs | 40 +++++++++++++++++++++++
7 files changed, 232 insertions(+), 24 deletions(-)
```

There are many untracked docs, evidence files, handoff files, reports, and generated artifacts in the repo. Leave them alone unless your task explicitly concerns them.

`git log` hung in this environment even with `--no-pager`. Use `git rev-parse HEAD`, `git status`, and `git diff` as the reliable quick checks unless you have time to diagnose the log issue.

## 7. What The Current Dirty Code Appears To Be Doing

These changes were present before this handoff doc was created.

### `src/App.jsx`

- Moves NCR under Objectives in navigation.
- Adds `NAV_PARENT = { ncr: "objectives" }`.
- Adds an Objectives subnav containing `objectives` and `ncr`.
- Keeps the parent Objectives nav pill active when the current route is NCR.
- Removes NCR from top-level pages.
- Updates the NCR feature announcement nav target from `ncr` to `objectives`.

### `src/components.jsx`

- Updates `SuperCard` progress behavior so derived progress is read-only/immutable.
- Derived progress sources include metric, rollup, workflow, and source labels like `from metric`, `rolled up`, `from steps`, and `not tracked yet`.
- Manual progress remains editable.

### `src/hooks/useSupabase.js`

- Imports `getObjectiveProgress`.
- Maps newer objective fields including `class`, `okrGroup`, `auditFormUse`, `baselineText`, and `targetText`.
- Replaces older rollup calculation with `getObjectiveProgress(objective, childObjectives)`.
- Persists newer fields on objective create/update.

### `src/okrFramework.js`

- Adds `getObjectiveProgress`.
- Progress source priority appears to be:
  1. explicit manual rollup method
  2. measured OKR with numeric baseline and target
  3. child/subtask rollup
  4. workflow-step completion
  5. stored manual progress or none

### `src/ompFramework.js`

- Adds `OKR_GROUP_TO_DEPARTMENT`, `getOkrGroupDepartment`, and `UNMAPPED_OKR_GROUPS`.
- Maps 17 OKR group labels under 5 canonical departments.
- Some groups are still marked unconfirmed in code comments/data, including Dispatch, Inventory/Logistics, Field Ops, and Frac Repair.

### Tests

- `tests/prod-smoke.spec.js` now uses `dismissGuidance` after navigation steps.
- `tests/unit/okr-framework.test.mjs` adds coverage for `getObjectiveProgress`.

## 8. Source Tree Map

Important source locations:

- `/Users/andrewemmel/Documents/New project/sandpro-omp/src/App.jsx` - app shell, routing, navigation, auth shell, announcement handling.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/src/pages.jsx` - large page module for dashboard/objectives/Fix-It/NCR/org/KPI/export flows.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/src/components.jsx` - shared cards, objective UI, progress controls.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/src/hooks/useSupabase.js` - core data fetch/mutation hook and production data shaping.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/src/lib/supabase.js` - Supabase client wiring.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/src/okrFramework.js` - OKR hierarchy/progress logic.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/src/ompFramework.js` - OMP taxonomy/classes/departments/groups.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/src/ompPermissions.js` - permission model helpers.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/src/kpiSystem.js` - KPI logic.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/src/ncrImport.js` - NCR import/transformation logic.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/src/data/okr2026Consolidated.js` and `.json` - consolidated OKR source data.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/api/` - Vercel serverless routes.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/api/_shared/` - shared API helpers for email, push, objective starter, Supabase admin.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/supabase/` - migrations and release-ready schema files.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/scripts/` - release checks, seeding/import scripts, schema checks, smoke helpers, mobile QA helpers.
- `/Users/andrewemmel/Documents/New project/sandpro-omp/tests/` - Playwright and Node unit/schema tests.

Important API areas:

- `/api/admin/invite-user`
- `/api/admin/update-user`
- `/api/admin/delete-user`
- `/api/agent/objective-starter`
- `/api/cron/daily-digest`
- `/api/cron/reminders`
- `/api/fixit/push`
- `/api/ncr/analytics-ai`
- `/api/notifications`
- `/api/push/*`
- `/api/translate`

Important Vercel config:

- `/Users/andrewemmel/Documents/New project/sandpro-omp/vercel.json`
- Redirects old hosts to `objectivetracker.net`.
- Cron schedules:
  - `/api/cron/daily-digest` at `0 13 * * 1-5`
  - `/api/cron/reminders` at `0 14 * * *`

## 9. Existing Agent And Planning Docs

Start with these:

- `/Users/andrewemmel/Documents/New project/sandpro-omp/AGENT.md`
- `/Users/andrewemmel/Documents/New project/sandpro-omp/AGENT-HANDOFF-SANDPRO-OMP-REPO-MAP.md`
- `/Users/andrewemmel/Documents/New project/sandpro-omp/AGENT-HANDOFF-OMP-FRAMEWORK-AND-OKRS.md`
- `/Users/andrewemmel/Documents/New project/sandpro-omp/docs/OMP-DATA-TO-DISPLAY-BRIDGE-PLAN.md`
- `/Users/andrewemmel/Documents/New project/sandpro-omp/docs/meeting-briefs/jake-framework-okr-crosswalk-2026-06-23.md`
- `/Users/andrewemmel/Documents/New project/sandpro-omp/docs/meeting-briefs/jake-meeting-decision-questions-2026-06-24.md`
- `/Users/andrewemmel/Documents/New project/sandpro-omp/docs/okr-project-assessment-framework.md`

What they mean now:

- The repo map is still useful for orientation.
- The older OMP framework handoff is useful for stakeholder history and taxonomy intent.
- The bridge plan is the best conceptual guide for the active lane: where data comes from, how it is treated, and how it is displayed.
- Treat any older statement about `sandpro_objectives` as stale until revalidated. Current production did not have that table.

## 10. Active Product Lane

The live issue is not just visual polish. It is the data-to-display contract for the OMP/OKR system:

- What source data drives each surface?
- How is that data classified into Task, Project, OKR, NCR, department, and group?
- What hierarchy should objectives use?
- Which values are manually owned vs derived?
- How should progress be calculated and explained?
- How should NCRs connect back to objectives?
- Which views should executives, managers, and workers see?
- How should reports/exports be generated without multiplying stale one-off buttons?

The current dirty code is pushing toward:

- NCR as an Objectives sub-surface.
- Data-driven objective progress.
- A 17-group to 5-department mapping.
- More explicit OKR fields in Supabase mapping.

## 11. Current Open Gaps And Decision Points

These are the highest-risk items for the next agent:

1. Production currently has 91 objectives, but live objective hierarchy counted as 4 company rows and 87 department rows. No `key_result` rows were observed. Do not assume the intended hierarchy is fully realized.
2. `class` is currently null in recent production objective samples even though local code now maps/persists it. The Task/Project/OKR/NCR classification layer is not fully represented in live objective rows.
3. `kpi_definitions`, `kpi_datapoints`, `objective_metric_checkins`, and `okr_projects` were empty in production at handoff time. Any KPI/metric-driven UI may still be scaffold or waiting for real data.
4. `objective_workflow_steps` has 546 rows, so workflow-derived progress is likely the only real derived progress source currently populated.
5. Recent objectives sampled had `progress = 0`; verify whether this is expected start-clean behavior or a missing progress-linking issue before "fixing" it.
6. NCR production data uses fields like `department_group`, not `group_name`. The NCR taxonomy still needs reconciliation with the OMP department/group model.
7. Several group-to-department mappings in `ompFramework.js` are still marked unconfirmed. Do not present them as stakeholder-locked without confirmation.
8. The export/reporting lane has historical artifacts and likely multiple handlers/buttons in `src/pages.jsx`; verify the live surface before changing it. The strategic direction is a guided chooser, not a sprawl of one-off export buttons.
9. The Fix-It board is currently empty: 0 active, 28 archived. Do not reopen or mutate it unless a new live item appears or Andrew directs you.

## 12. Schema Traps Already Observed

Do not query these stale assumptions as if failures are product bugs:

- `public.sandpro_objectives` - not found in current production schema cache.
- `ncr_reports.group_name` - does not exist; use current NCR columns such as `department_group`.
- `objective_updates.created_by` - does not exist in the current checked query path; use actual release columns such as `user_id` and `action_type` after schema inspection.
- `email_delivery_log.type` - stale for the current query path; current production shape used `notification_type`.
- Historical traps from prior runs include stale guesses such as `profiles.full_name`, `profiles.push_enabled`, `messages.content`, and fake fields on push/Fix-It tables. Confirm columns before building broad queries.

Good rule: inspect schema or run the repo's release schema check before writing a large audit query.

## 13. Useful Commands

Run from:

```bash
cd "/Users/andrewemmel/Documents/New project/sandpro-omp"
```

Install dependencies if needed:

```bash
npm ci
```

Start local dev:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Release env check:

```bash
node scripts/require-release-env.mjs prod
```

Schema gate:

```bash
npm run test:schema
```

Unit tests:

```bash
npm run test:unit
```

Production smoke:

```bash
npm run smoke:prod
```

Push smoke:

```bash
npm run smoke:push:prod
```

Full production preflight:

```bash
npm run release:preflight
```

Production deploy:

```bash
npm run deploy:prod
```

## 14. Package Scripts Of Interest

From `package.json`, notable scripts include:

- `dev`
- `build`
- `lint`
- `preview`
- `test:e2e`
- `test:unit`
- `test:schema`
- `test:auth-redirects`
- `test:pwa`
- `test:mobile`
- `test:mobile:qa`
- `release:preflight`
- `deploy:prod`
- `smoke:prod`
- `smoke:push:prod`

Use the narrowest command that proves your change. For production workflow changes, prefer `test:schema` plus a relevant browser/smoke path.

## 15. Environment Notes

- Do not print secrets.
- The full checkout typically has the env/material needed for production checks.
- Repo helpers may load `.env.release.local`, `.env.local`, `.vercel/.env.production.local`, and `.env.production.local`.
- If Vercel production env is missing locally, the historical fallback is `vercel pull --yes --environment=production`.
- If Supabase CLI linked queries fail due to Docker/link/auth issues, use repo-native env loading plus `@supabase/supabase-js` service-role reads, or direct REST with confirmed headers.
- `CODEX_HOME` can be unset. Use absolute memory/automation paths when a workflow depends on them.

## 16. Recommended Next-Agent Workflow

1. Start in `/Users/andrewemmel/Documents/New project/sandpro-omp`.
2. Read `AGENT.md`, this handoff, `AGENT-HANDOFF-SANDPRO-OMP-REPO-MAP.md`, and `docs/OMP-DATA-TO-DISPLAY-BRIDGE-PLAN.md`.
3. Run `git status --short --branch` and inspect any dirty files before editing.
4. Confirm the target lane with the user's actual ask: Fix-It, OKR/OMP framework, NCR, KPI, export/reporting, org, or deployment.
5. If working on production behavior, query live production with confirmed columns.
6. If touching UI, validate with browser or Playwright on the relevant route.
7. If touching data mapping, update unit tests around `okrFramework.js`, `ompFramework.js`, and `useSupabase.js`.
8. If touching production release paths, run `node scripts/require-release-env.mjs prod`, `npm run test:schema`, and the relevant smoke.
9. Report exactly what changed, what was verified, and what remains blocked.

## 17. What Not To Do

- Do not treat old memory/docs as more authoritative than current production reads.
- Do not assume `sandpro_objectives` exists.
- Do not flatten the 17 groups into 5 departments without preserving group/subtag intent.
- Do not clear or rewrite owner mappings/test data without explicit authorization.
- Do not turn Fix-It comments into internal audit logs.
- Do not archive Fix-It cards unless explicitly asked.
- Do not call a unit run green if `release-readiness.test.mjs` cancels/hangs; report that accurately.
- Do not do broad visual redesign unless asked. This is an operational SaaS tool; keep UI dense, readable, and work-focused.

## 18. Current Bottom Line

Production is reachable and the authenticated production smoke passed. The release schema gate passed. The Fix-It board is empty. The active SandPro OMP risk is the OMP/OKR data contract: live production has 91 objective rows and 546 workflow steps, but metric/KPI/project tables are empty, objective `class` is not filled in recent samples, NCR taxonomy still uses legacy/current NCR columns, and the hierarchy/progress model is only partially realized in live data.

The next good agent should begin from the existing dirty OMP framework/progress/nav changes, verify whether Andrew wants implementation, cleanup, deploy, or decision support, and avoid confusing historical `sandpro_objectives` notes with today's `objectives`-table production truth.
