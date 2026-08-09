# SandPro OMP Fix-It Feed / Automated Fix Run Handoff

## Context

You are working in the SandPro OMP app.

- Production: <https://objectivetracker.net>
- Repo: `/Users/andrewemmel/Documents/New project/sandpro-omp`
- Main Fix-It UI: `src/pages.jsx`
- Fix-It Supabase hook: `src/hooks/useSupabase.js`
- Fix-It schema: `supabase/release_ready_migration.sql`
- Automation config: `/Users/andrewemmel/.codex/automations/sandpro-fix-it-feed-agent-closure/automation.toml`

The user expectation is simple: humans put problems on the Fix-It Feed; Agents fix existing human posts. Those items are not truly done until they are fixed, deployed, validated in production like a real user, given screenshot proof, and left for human archive.

## Fix-It Feed Workflow

The Fix-It Feed is a proof-based closure workflow, not a simple status board.

### Absolute authorship rule

An Agent never creates, inserts, or auto-files a Fix-It Feed post. Do not use the composer, call a post-creation helper, insert into `fix_it_posts`, delegate post creation to another agent, or create temporary Fix-It posts for QA.

Telemetry, `client_errors`, email, chat, direct reports, agent-discovered incidents, root-cause analyses, postmortems, validation evidence, and already-completed fixes stay off the wall. Fix off-wall problems in the correct workspace and report the result through the original channel and the Codex task. If a human wants the issue on the wall, that human creates it.

Agent actions are limited to existing human-created posts: claim, add a short useful reply when needed, attach validation proof, mark validation complete, and leave archive to a human. No active human-created post means no Fix-It mutation and no Fix-It notification.

Statuses:

- `open`: reported, not yet owned.
- `in_progress`: someone is working it.
- `fixed`: code/app behavior changed, awaiting validation. This state exists but is rarely left visible because the current UI often moves straight to validation complete.
- `agent_done`: Agent has tested it like a user, attached proof, and marked validation complete.
- `archived`: human reviewed and archived.

Andrew displays as `Agent` on the Fix-It Feed only. Do not rename Andrew's real profile or change underlying ownership. The display alias is handled by `isFixItAgentUser()` and `getFixItActorName()` in `src/pages.jsx`.

## Required Agent Closure Protocol

For every actionable Fix-It item:

1. Read the post and any attachment carefully.
2. Determine the exact app behavior being requested or reported.
3. Implement the fix in code/database if the request is clear and safe.
4. Run the appropriate local gates.
5. Deploy to production.
6. Validate the exact production behavior as a real user would.
7. Capture screenshot proof showing the actual requested behavior.
8. Upload that proof to the Fix-It item.
9. Mark the item `agent_done` / validation complete.
10. Leave it unarchived for Andrew or another human moderator to archive.

Do not archive Fix-It posts yourself unless Andrew explicitly asks. The large orange `archive` button is the human review step.

Do not mark a feature-scope item done unless the feature actually exists and has been verified in production. If the post is ambiguous, leave it open or in progress and report the product decision needed.

## Public Comment Discipline

Fix-It comments are public-facing team communication, not an agent work log. Do not post routine recheck notes, audit summaries, route observations, deployment/test/proof narration, "no safe bug fix" explanations, or long product-architecture reasoning in the public comment thread.

Post a Fix-It comment only when it directly helps the card:

- answer a user question,
- ask one concise clarification or decision question needed to unblock the item,
- provide a brief user-facing completion note after an actual live fix and attached proof.

Keep command output, proof inventory, deployment blockers, no-op reasoning, and internal verification details in the Codex thread report. If no response is needed on the card, do not add a comment.

## Database Model

Primary table: `fix_it_posts`

Important columns:

```text
id
body
created_by
claimed_by
agent_tested_by
agent_tested_at
human_reviewed_by
human_reviewed_at
archived_by
archived_at
reopened_by
reopened_at
reopen_count
reopened_from_status
status
created_at
updated_at
```

Attachment table: `fix_it_attachments`

Important columns:

```text
id
post_id
uploaded_by
name
purpose
type
mime_type
size
storage_path
url
created_at
```

Attachment `purpose` values:

- `report`: normal user attachment.
- `validation_proof`: Agent proof screenshot.

Validation proof screenshots are stored in the Supabase Storage bucket `fix-it-files`, normally under:

```text
{postId}/{timestamp}_{filename}
```

## Reopened Items

A reopened item must visibly show that it was reopened. The app supports durable reopened metadata:

```text
reopened_by
reopened_at
reopen_count
reopened_from_status
```

The UI should show:

- `Reopened` badge.
- Orange reopened card treatment.
- Banner such as `Reopened from archive` or `Reopened from validation`.

When an item is reopened, it returns to `open` and clears claim/test/archive fields. It must go through Agent fix, validation, proof, and human archive again. Do not rely on old proof unless the reopened issue is explicitly the same and the live behavior is still verified.

## Current Automation

There is an active hourly automation:

```text
id: sandpro-fix-it-feed-agent-closure
name: SandPro Fix-It Feed Agent Closure
schedule: hourly
model: gpt-5-codex
cwd: /Users/andrewemmel/Documents/New project/sandpro-omp
```

Current automation prompt summary:

- Review production Fix-It Feed at `https://objectivetracker.net`.
- Look only at existing human-created, non-archived posts.
- Never create or backfill a Fix-It post, including for an off-wall incident that is already fixed.
- For each open or in-progress item, determine the concrete app issue.
- Implement clear and safe fixes.
- Run local gates.
- Deploy to production.
- Validate behavior as a human user would.
- Attach screenshot proof.
- Mark Agent validation complete.
- Leave the item unarchived for human review.
- Clean up temporary QA users/objectives/files.
- Report leftovers or blockers.

Important caution: the automation memory currently contains stale/contradictory notes from a prior isolated run that claimed the workspace did not contain the Fix-It implementation. Do not inherit that as truth. The current repo does contain the Fix-It Feed, push system, NCR code, and production scripts.

## Client Error Telemetry (added 2026-08-05)

The app now phones home on every user-visible error. Table: `client_errors`
(write-only from clients; read via service role / SQL only).

Columns: `id, created_at, user_id, source, message, stack, page, user_agent, context, app_version`.

Sources: `toast` (any red toast a user saw), `create-wizard` / `create-wizard-followup`
(Create New failures), `window` / `promise` (uncaught errors).

On each run, before reviewing feed posts, query for fresh signals:

```sql
select created_at, source, message, page, app_version
from client_errors
where created_at > now() - interval '2 hours'
order by created_at desc limit 50;
```

- Repeated signatures from multiple users = a live incident; investigate and fix
  before touching feed backlog items.
- Never translate telemetry into a Fix-It post. Investigate, fix, validate, and
  report the result through the Codex task and the original human-reporting
  channel. The wall remains human-authored even when the incident is real and
  the root cause is understood.
- QA runs (`npm run chaos:lock`) clean their own rows; rows from
  release-smoke/QA accounts are noise — ignore them and never file a wall post.

## Push Updates

Fix-It push updates are wired through:

- `src/App.jsx`
- `api/fixit/push-event.js`
- `api/_shared/push.js`

Andrew receives push events for:

- `fixit_new`: new Fix-It Feed item.
- `fixit_agent`: Agent status change or update.

This depends on Andrew having an active PWA/browser push subscription. Push is additive; the in-app notification bell remains the permanent notification home.

The app sends Fix-It push updates when:

- a new Fix-It post is created;
- a post is claimed;
- a post is marked validation complete;
- a post is archived;
- a post is reopened.

## Local Gates

Minimum gates before production deploy:

```bash
npm run lint
npm run test:unit
npm run build
npm run test:schema
```

When relevant, also run:

```bash
npm run test:pwa
npm run test:mobile
npm run smoke:push:prod
npm run smoke:push:android
npm run test:e2e:prod-qa
```

Production deploy:

```bash
vercel deploy --prod --yes
```

Production health check:

```bash
curl -I https://objectivetracker.net
```

Named Jake/Merci smoke tests may require local env vars that are not always present. If unavailable, use temporary QA users/data, validate the same workflow, and clean everything up.

## Proof Standard

Proof must show the actual issue was resolved, not merely show a generic page.

Good proof examples:

- A right-click menu proof should show the menu and the option requested.
- A voice-note proof should show the explicit Stop/Preview/Send flow.
- An org-chart navigation proof should show the improved view controls, zoom/pan/fit tools, or compact/directory view.
- An NCR analytics proof should show the specific analytics query/grouping Tim asked for.

Bad proof examples:

- A screenshot of a general dashboard when the issue was a specific control.
- A screenshot after closing a modal if the issue was inside the modal.
- A screenshot of a fixed status badge without showing the fixed behavior.

## Production Data Discipline

Temporary QA data is allowed only when needed and must be cleaned.

Common cleanup targets:

- temporary QA users/profiles;
- temporary objectives;
- temporary NCR reports/actions/attachments/audit rows;
- temporary push subscriptions/logs;
- temporary uploaded files.

Temporary Fix-It posts are prohibited. Validate against an existing human post,
non-production fixtures, or a read-only production path instead.

After any mutating production QA, report cleanup explicitly.

Example cleanup wording:

```text
Cleanup verified: 0 temporary QA objectives, 0 temporary profiles, 0 temporary NCR rows, 0 temporary files left behind.
```

## Operating Rule

A Fix-It item is not done because code changed, a status changed, or a screenshot exists.

It is done only when:

1. the production behavior matches the request;
2. the proof screenshot shows that behavior;
3. the item is marked validation complete;
4. the item remains available for human archive.
