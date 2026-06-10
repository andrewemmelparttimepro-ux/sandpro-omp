# SandPro OMP Fix-It Feed Agent Handoff

This file is the operating contract for agents working on the SandPro OMP Fix-It Feed. The Fix-It Feed is a proof-based closure workflow, not a normal task list and not a place to guess product intent.

## Live Targets

- Production app: `https://objectivetracker.net`
- Fix-It route: `https://objectivetracker.net/?page=fixit`
- Local repo: `/Users/andrewemmel/Documents/New project/sandpro-omp`
- Main UI file: `src/pages.jsx`
- Data hook: `src/hooks/useSupabase.js`
- App wiring and push notifications: `src/App.jsx`
- Database/storage schema: `supabase/release_ready_migration.sql`

## What The Feed Is

The Fix-It Feed is a chronological beta feedback wall for screenshots, photos, PDFs, notes, clarifications, and small safe fixes. The app describes it as:

`Chronological beta feedback wall. No DMs, no guessing, no algorithm.`

Agents inspect the active feed, reply when helpful, claim clear safe work, fix only what is clear or already approved, validate live like a real user, attach proof, and then mark validation complete. Human reviewers decide when to archive.

## UI Structure

The Fix-It page is `FixItFeedPage` in `src/pages.jsx`.

- The page has two tabs: `Active` and `Archive`.
- `Active` shows every post where `status !== 'archived'`.
- `Archive` shows posts where `status === 'archived'`.
- The active count is the count of non-archived posts.
- The composer only appears on the active tab.
- The composer accepts text, screenshots, photos, PDFs, and notes.
- Files can be added by file picker, drag/drop, or paste.
- A post requires either body text or at least one file.
- Feed order comes from the hook query: newest posts first by `created_at desc`.
- Attachments and proof images are opened through signed Supabase Storage URLs.
- Task comments appear under each post and can include their own attachments.
- Andrew Emmel / `andrew@ndai.pro` displays as `Agent` only inside Fix-It Feed UI via `isFixItAgentUser`, `getFixItDisplayUser`, and `getFixItActorName`. Do not change the real profile to make this happen.

## Status Contract

The canonical post statuses are:

| Status | UI label | Meaning |
| --- | --- | --- |
| `open` | Open | Reported and not owned yet, or reopened after prior closure. |
| `in_progress` | In progress | Someone has claimed it and is working it. |
| `fixed` | Fixed | Supported by schema/tests, but the current UI normally skips directly to `agent_done`. |
| `agent_done` | Validation complete | Agent marked the fix complete after testing. This is only truly closed when valid proof is attached. |
| `archived` | Archived | Human reviewed and archived. Agents do not archive unless Andrew explicitly asks. |

Important UI detail: the current `Mark fixed` button updates the post directly to `agent_done`, sets `claimedBy`, `agentTestedBy`, and `agentTestedAt`, and shows the pill text `Fixed by Agent; validation complete`. Because of that, agents must attach proof before or immediately after using this action. If a post is `agent_done` but proof is missing, treat it as not fully closed.

## Action Rules

### Claim

`I'm on it` calls `onUpdatePost(post.id, { status: 'in_progress', claimedBy: currentUser.id })`.

Use it only when:

- the requested behavior is clear,
- the target client/project/app behavior is known,
- the work is safe and non-destructive,
- the agent can reasonably validate the outcome.

### Reply

Use task comments when:

- someone asks a question,
- someone needs clarification,
- the agent can explain a blocker or next decision,
- the right action is guidance rather than a code change.

Agent comments display with an `Agent reply` badge when the commenter is Andrew/agent identity.

### Mark Fixed / Validation Complete

The UI button says `Mark fixed`, but the code currently writes `status: 'agent_done'`.

Only mark validation complete after:

- the code/app change is live in the correct environment,
- the behavior was validated like a real user,
- screenshot proof was uploaded as `purpose = 'validation_proof'`,
- temporary QA data was cleaned up or explicitly reported.

If proof upload fails, do not leave the item as complete without proof. Use the Supabase fallback in this file, then verify the proof appears. If proof still cannot attach, comment the blocker and do not call the item closed.

### Archive

The archive control is intentionally human review.

- The archive button is visible to moderators on `fixed` or `agent_done` posts.
- Archiving sets `status: 'archived'`, `humanReviewedBy`, `humanReviewedAt`, `archivedBy`, and `archivedAt`.
- Agents must not archive unless Andrew explicitly asks in the current task.

### Reopen

Reopen sets:

- `status: 'open'`
- `claimedBy: null`
- `agentTestedBy: null`
- `agentTestedAt: null`
- `humanReviewedBy: null`
- `humanReviewedAt: null`
- `archivedBy: null`
- `archivedAt: null`
- `reopenedBy: currentUser.id`
- `reopenedAt: now`
- `reopenCount: previous + 1`
- `reopenedFromStatus: previous status`

A reopened item must go through the workflow again. Prior validation proof is historical context, not automatic closure.

### Delete

Delete removes the post plus all related storage objects for report attachments, validation proof, and comment attachments. It is for cleanup or explicit permission only. Do not use delete to hide unresolved work.

## Data Model

Tables:

- `fix_it_posts`
- `fix_it_comments`
- `fix_it_attachments`

`fix_it_posts` important columns:

- `id`
- `body`
- `created_by`
- `claimed_by`
- `agent_tested_by`
- `agent_tested_at`
- `human_reviewed_by`
- `human_reviewed_at`
- `archived_by`
- `archived_at`
- `reopened_by`
- `reopened_at`
- `reopen_count`
- `reopened_from_status`
- `status`
- `created_at`
- `updated_at`

`fix_it_comments` important columns:

- `id`
- `post_id`
- `body`
- `created_by`
- `created_at`
- `updated_at`

`fix_it_attachments` important columns:

- `id`
- `post_id`
- `comment_id`
- `uploaded_by`
- `name`
- `purpose`
- `type`
- `mime_type`
- `size`
- `storage_path`
- `url`
- `created_at`

Attachment purposes:

- `report`: original post attachment.
- `comment`: comment attachment.
- `validation_proof`: proof screenshot for agent validation.

The hook maps proof separately:

- `attachments`: post attachments excluding `validation_proof` and excluding comment attachments.
- `comments`: each comment with its own attachment list.
- `validationProof`: newest `validation_proof` attachment.
- `validationProofs`: all `validation_proof` attachments, newest first.

## Storage Contract

Storage bucket:

- `fix-it-files`

The bucket is private. The app creates signed URLs for display.

Upload paths:

- Post/report/proof attachment: `{postId}/{timestamp}_{safeName}`
- Comment attachment: `{postId}/comments/{commentId}/{timestamp}_{safeName}`

Storage rules:

- Authenticated users can read `fix-it-files`.
- Authenticated users can upload to `fix-it-files` when storage object owner is the authenticated user.
- Upload owners and moderators can delete Fix-It file objects.

Validation proof must be an image. `uploadValidationProof` rejects files where `file.type` does not start with `image/`.

## Supabase Proof Fallback

Use this only when the app upload path fails but the user requires proof attachment.

1. Upload the proof screenshot image to bucket `fix-it-files`.
2. Use path format `{postId}/{timestamp}_{safeName}`.
3. Insert a `fix_it_attachments` row:

```sql
insert into public.fix_it_attachments (
  post_id,
  comment_id,
  uploaded_by,
  name,
  purpose,
  type,
  size,
  mime_type,
  storage_path,
  url
) values (
  '<post-id>',
  null,
  '<current-user-id>',
  '<filename>',
  'validation_proof',
  'image',
  <file-size>,
  '<image-mime-type>',
  '<post-id>/<timestamp>_<safe-name>',
  ''
);
```

4. Refresh the live app and confirm the validation proof modal shows the image.
5. If any of those steps fail, comment the blocker and do not mark validation complete.

## Realtime And Notifications

`useFixItFeed` subscribes to all changes on:

- `fix_it_posts`
- `fix_it_comments`
- `fix_it_attachments`

The channel name is `fix-it-feed`.

Push event wiring is in `src/App.jsx`.

- New post sends type `fixit_new`.
- New comment sends type `fixit_agent`.
- Status updates send type `fixit_agent`.
- Push URLs point to `/?page=fixit&fixit=<postId>`.
- Status labels used in push copy include `Agent is on it`, `Agent validation complete`, `Human reviewed and archived`, `Reopened`, and `Fixed by Agent`.

## Permissions Reality

RLS allows all authenticated users to select posts/comments/attachments. Authenticated users can create their own posts, comments, and attachments. Post updates are permissive for authenticated users, so the real safety boundary is the agent workflow and human discipline.

Moderators in UI are:

- users with role `executive`
- `mjimenez@sandpro.com`
- `tdibben@sandpro.com`
- `jfeil@sandpro.com`
- `andrew@ndai.pro`

Do not use permissive update access as permission to make product calls, archive items, delete user reports, or bypass proof.

## Exact Agent Workflow

For every active, non-archived item:

1. Read the post body, screenshots/files, comments, status, owner, and proof state.
2. Determine the target client/project and exact app behavior requested.
3. If someone asks a question, needs clarification, or the agent can be helpful, reply in task comments.
4. If the request is clear, safe, and already approved or obviously a bug, claim it.
5. Implement the smallest correct fix in the right workspace.
6. Run the relevant checks for the touched surface.
7. Deploy or confirm the fix is live in production.
8. Validate production like a user while signed in.
9. Capture screenshot proof that shows the requested behavior working.
10. Attach proof as `validation_proof`.
11. Mark validation complete only when proof is attached and visible.
12. Leave the item unarchived for Andrew/human review.
13. Report items found, actions taken, replies posted, tests, deploys, proof, cleanup, and blockers.

If an item says validation complete but proof is missing or the UI says proof is needed, treat it as not fully closed. Attach valid proof or comment the proof blocker.

## What Agents May Fix Without Asking

Agents may fix:

- clear bugs with obvious expected behavior,
- already-approved Jake Feil or Mercileidy Jimenez requests,
- broken UI states that block the described workflow,
- validation/proof attachment gaps,
- small copy/status mismatches where intent is clear,
- safe layout polish that preserves the requested behavior.

Agents may reply without code changes when the useful action is an explanation, a clarification request, or a decision summary.

## What Agents Must Escalate

Leave the item open or in progress and comment the exact decision needed when the item is:

- ambiguous,
- strategic or product-scope,
- destructive,
- privacy-sensitive,
- permission-risky,
- conflicting with another stakeholder request,
- not mappable to a known workspace,
- impossible to validate live,
- blocked by missing credentials or environment access,
- asking to archive/delete without explicit Andrew approval.

## Live Inspection Queries

Active queue:

```sql
select
  id,
  status,
  body,
  created_by,
  claimed_by,
  agent_tested_by,
  agent_tested_at,
  archived_at,
  created_at,
  updated_at
from public.fix_it_posts
where status <> 'archived'
order by created_at desc;
```

Proof audit:

```sql
select
  p.id,
  p.status,
  p.body,
  count(a.id) filter (where a.purpose = 'validation_proof') as proof_count,
  max(a.created_at) filter (where a.purpose = 'validation_proof') as latest_proof_at
from public.fix_it_posts p
left join public.fix_it_attachments a on a.post_id = p.id
where p.status <> 'archived'
group by p.id, p.status, p.body
order by p.created_at desc;
```

Comments and attachments for one post:

```sql
select * from public.fix_it_comments
where post_id = '<post-id>'
order by created_at asc;

select * from public.fix_it_attachments
where post_id = '<post-id>'
order by created_at asc;
```

## Final Report Checklist

Every Fix-It run should report:

- Items found.
- Which items were already closed, claimed, fixed, replied to, or left open.
- Agent replies posted.
- Files changed.
- Tests/checks run.
- Deployment URL or deployment blocker.
- Live validation performed.
- Proof attached or proof blocker.
- Cleanup performed.
- Remaining blockers and exact human decisions needed.

No code change alone is closure. Closure requires live validation, visible proof, and leaving archive to a human.
