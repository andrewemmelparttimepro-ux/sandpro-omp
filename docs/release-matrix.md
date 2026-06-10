# SandPro OMP Release Matrix

Release rule: P0 and P1 are not considered ready until `npm run release:verify` passes with staging/prod secrets present and no skipped credentialed or mutating P0/P1 tests.

## Gates

| Gate | Command | Evidence |
| --- | --- | --- |
| Static code quality | `npm run lint` | ESLint clean, including API/serverless files |
| Build | `npm run build` | Production bundle compiles |
| Static release checks | `npm run test:unit` | No prompt/confirm dead ends, no hardcoded shared passwords/project IDs, required schema and cron surfaces present |
| Email environment | `npm run test:email-env` | Resend, Supabase service role, sender, and cron secret are configured |
| Agent environment | `npm run test:agent-env` | OpenAI and Objective Assistant feature flags are configured server-side |
| Database release schema | `npm run test:schema` | Confirms release tables, columns, and private file bucket exist after migration |
| PWA | `npm run test:pwa` | Manifest, service worker versioning, network-first navigation |
| Accessibility | `npm run test:a11y` | Login and authenticated navigation smoke |
| Staging E2E | `npm run test:e2e:staging` | Mutating tests against staging only |
| Production smoke | `npm run smoke:prod` | Read-only Jake/Mercileidy login/navigation on `https://objectivetracker.net` |
| Screenshot packet | `npm run evidence:capture` | Desktop/mobile happy-path screenshots saved to `docs/evidence` |

## Required Environment

Set these as local secrets for release verification and as Vercel/Supabase secrets for runtime:

- Local setup: copy `.env.release.example` to `.env.release.local` and fill in real values. The `.local` file is ignored by git.
- Production smoke: `SANDPRO_JAKE_EMAIL`, `SANDPRO_JAKE_PASSWORD`, `SANDPRO_MERCI_EMAIL`, `SANDPRO_MERCI_PASSWORD`
- Staging mutation: `SANDPRO_STAGING_BASE_URL`, `SANDPRO_E2E_EMAIL`, `SANDPRO_E2E_PASSWORD`, `SANDPRO_E2E_ALLOW_MUTATION=1`
- Email/runtime: `RESEND_API_KEY`, `EMAIL_FROM`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
- Objective Assistant: `OPENAI_API_KEY`, `OPENAI_MODEL`, `AGENT_FEATURE_ENABLED=true`, `AGENT_WEB_SEARCH_ENABLED=true`, `SANDPRO_AGENT_E2E=1`
- Database: run `supabase/release_ready_migration.sql` against staging first, then production after staging passes.

## Jake Feedback Mapping

| # | Release item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Production demo objectives removed | Implemented | Production cleanup verified manually; staging fixtures only through env-gated seed script |
| 2 | Browser back and objective filter recovery | Implemented | `tests/navigation-filters.spec.js` |
| 3 | Dashboard KPI drilldowns | Implemented | `tests/navigation-filters.spec.js` |
| 4 | List/grid/kanban share same filter model | Implemented | `tests/navigation-filters.spec.js` |
| 5 | Empty states include clear filters | Implemented | `tests/navigation-filters.spec.js` |
| 6 | Message attachments use first-class file rows | Implemented | `src/hooks/useSupabase.js`, `tests/release-workflows.spec.js` |
| 7 | Private objective file storage | Implemented | `supabase/release_ready_migration.sql`, `tests/unit/release-readiness.test.mjs` |
| 8 | File preview/download/delete and cleanup | Implemented | `src/components.jsx`, `src/hooks/useSupabase.js`, `tests/release-workflows.spec.js` |
| 9 | Mobile objective detail safe back/composer/files | Implemented | `tests/release-workflows.spec.js` |
| 10 | Activity export complete fields | Implemented | `src/pages.jsx` export action |
| 11 | Real email delivery through Resend | Implemented | `api/notifications/send-event.js`, `api/cron/*.js`, `npm run test:email-env` |
| 12 | Notification preferences persisted | Implemented | `notification_preferences`, admin Settings panel |
| 13 | Direct objective deep links | Implemented | `/?page=objectives&objective=<id>&tab=<tab>` |
| 14 | Objective members/watchers/access roles | Implemented | Access tab, `objective_members` table |
| 15 | Objective tracking types | Implemented | Create/edit form type selector |
| 16 | Metrics and check-ins | Implemented | Metrics tab, `objective_metric_checkins`, staging test |
| 17 | Subtasks/milestones with ownership/dates/weights | Implemented | Subtasks tab, migration, staging test |
| 18 | Parent roll-up behavior | Implemented | Average/weighted/manual roll-up display in objective fetch |
| 19 | Company/My Team/Individual dashboard scopes | Implemented | Dashboard scope control |
| 20 | Admin user invite/export/settings | Implemented | Admin invite API, CSV exports, persisted settings |
| 21 | Objective Assistant Starter Pack | Implemented | `api/agent/objective-starter.js`, `objective_agent_runs`, `tests/unit/objective-starter.test.mjs`, `tests/agent-starter.spec.js` |

## P0/P1 Limitation Policy

Known P0/P1 limitations must be empty before Jake handoff. Any remaining item belongs in P2 roadmap only after it is explicitly accepted as out of release scope.
