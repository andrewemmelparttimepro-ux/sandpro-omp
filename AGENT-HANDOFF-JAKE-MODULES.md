# Jake Modules Handoff — Nav, Create Wizard, OKR Page

Updated: 2026-07-02. This documents the Jake-build parity pass (per the July 1
OKR/task-workflow meeting) so the next agent doesn't undo it.

## What changed

- **Nav** (`src/App.jsx` `pages`): `Tasks & Projects / OKR / NCR / KPI / Fix-It Feed / Organization`.
  There is deliberately **no Objectives tab** — Jake banned the word. The
  objectives page stays routable (`?page=objectives`) for deep links and KPI
  drill-downs; `NAV_PARENT` maps it to the dashboard pill.
- **Global KPI strip** (`GlobalKpiStrip` in `src/pages.jsx`): View type
  (Company / My team / Individual) + Active/Completed/Past Due/Due horizon +
  framework mini-strip. Rendered in `App.jsx` above **every** page — that
  placement is Jake's explicit requirement. Scope state (`viewScope`) lives in App.
- **Create New wizard** (`CreateWizardModal` in `src/pages.jsx`): replaces the
  old New-Objective modal for creation (`showCreateForm` opens the wizard;
  `ObjectiveFormModal` is edit-only now). Guided steps: what-is-it →
  single/recurring → associated-with → open-parents dropdown → standard form.
  **No priority field** — do not add one. Linkage on create: OKR → `parentId`,
  project → `updateOkrProject({ linkedObjectiveIds })`, NCR →
  `updateNcrReport({ linkedObjectiveId })`. Recurring is stored as a
  `[Recurring — every X]` description note (no schema support yet). Choosing
  NCR routes to the NCR page's standard form.
- **OKR page** (`OkrPage` in `src/pages.jsx`, route `?page=okr`): company-level
  objectives × Jan–Dec grid backed by `objective_metric_checkins`
  (`addMetricCheckin`; a cell shows the month's latest check-in). Cells editable
  only for owner/members/executives. Presentation view = clean per-department
  roll-up headed **"Did it get done or didn't it?"** (keep that wording —
  deliberately cleaned up) with print CSS (`#okr-print-sheet`).
- **Dashboard** = KPI strip (global) + Jake's list view (`DashboardListView`):
  Main department → Subdepartment → Type → Linked to → Originator →
  Assigned to → Aging chips. Dependent filters; company OKRs excluded from rows.

## Tests

`tests/prod-smoke.spec.js` and `tests/helpers.js` (`isSignedInShellVisible`)
were updated for the new nav ('Tasks & Projects', `.global-kpi-strip`).
Playwright QA trap: never `.remove()` React-managed DOM (e.g. `.brief-overlay`)
— it crashes React reconciliation and blanks the app. Dismiss overlays through
their own buttons.

## Notifications (fixed 2026-07-02)

Jake's "not receiving push notifications or daily briefing email":

- **Push root causes (both fixed in `api/_shared/push.js` + crons):** (1) the
  reminder (`api/cron/reminders.js`, 14:00 UTC) and daily-digest
  (`api/cron/daily-digest.js`, 13:00 UTC) crons only sent email — push only
  fired on in-app events via `send-event.js`; both crons now fan out
  `sendPushNotifications` per recipient (skipped when that day's email
  deduped). (2) `buildPushPayload` set `silent: true` on every non-urgent push
  — the service worker honors it, so pushes arrived as invisible ghosts. Now
  `silent: false` always. Also: a missing `notification_preferences` row no
  longer blocks all pushes (defaults on); `due_soon` no longer requires high
  priority (priority is dead per Jake); `stale` + `daily_digest` push types
  added.
- **Email root cause:** delivery is healthy (Resend, DKIM/SPF/DMARC verified,
  every send logged `sent` in `email_delivery_log`) — Jake's digests land in
  M365 junk/quarantine. Fix is on SandPro IT: allow-list objectivetracker.net.
- Verify with `push_delivery_log` / `email_delivery_log` in Supabase
  (`whgrkfhuzgwmbelocnhq`).

## SandPro Times (2026-07-02)

- The in-app newspaper **overlay is pulled**: `DAILY_BRIEF_ENABLED = false` in
  `src/App.jsx` gates the login auto-open and the header Newspaper button. All
  code kept — flip the flag to bring it back.
- The Times now lives as **the daily email brief** (`buildTimesEmail` in
  `api/cron/daily-digest.js`, weekdays 13:00 UTC): newspaper masthead + dated
  subject, personal desk stats, top-3 stories, company-wide aggregates.
  Sent to ALL users by default (opt-out via digest_frequency 'off' /
  email_enabled false); robo accounts (`isRoboAccount`: release-smoke,
  qa-agent, agent.fixit) are excluded. Layout is table-based on purpose —
  Outlook doesn't support grid/flex. Due dates must format with
  `timeZone: 'UTC'` or they render a day early.

## Deploy

`vercel deploy --prod`, then move the pinned aliases:
`vercel alias set <deployment-url> objectivetracker.net` (+ `www.`), verify the
served `assets/index-*.js` hash changed, then `npm run smoke:prod` (6 must pass).
