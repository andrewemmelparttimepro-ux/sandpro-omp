# Agent Handoff: OKR Framework Trust Fixes (review + push live)

Date: 2026-06-11
From: Cowork session (Claude agent, sandboxed — no GitHub/Vercel credentials)
Repo: /Users/andrewemmel/Documents/New project/sandpro-omp · Branch: main
Context: Andrew reviewed your OKR/project-assessment implementation (3cc252d and the org-chart fit series). Verdict: architecture and proof discipline are strong; this commit fixes the places it missed. Read this whole file before pushing — the "why" matters for not regressing it later.

## Your instruction

Review, push, and deploy:

```text
a257d66 fix: OKR classifier trust + gate threshold + filter bar scoping
```

```bash
cd "/Users/andrewemmel/Documents/New project/sandpro-omp"
git show a257d66 --stat                                # review the diff first
npm run lint && npm run test:unit && npm run build     # sandbox gates: lint clean, 81/81, build OK
git push origin main
npm run deploy:prod                                    # no schema changes; no db:migrate:release
```

Do NOT amend/rebase/squash. Files in commit: src/okrFramework.js, src/pages.jsx, src/index.css.

## What was wrong and what changed

### 1. The classifier was confidently wrong (trust-killer)

Your own evidence screenshot (docs/reports/evidence/okr-project-framework-2026-06-11/objectives-okr-project-tree.png) shows "Finalize April expense report" badged Project and "Unread Message Count Not Refreshing" (a bug ticket) badged KR. Cause: PROJECT_KEYWORDS contained everyday ops verbs (build, implement, install, deploy) and keyword hits were asserted at 0.78 confidence with authoritative badges.

Fixed:
- Keyword list narrowed to stage-gate language: project, prototype, pilot, r&d, research, feasibility, new product, stage gate.
- Keyword matches now return `status: "needs_review"` — a suggestion, not an assertion.
- parent-without-metric now classifies as `needs_review` (was: asserted Project).

### 2. Uncertain classifications looked authoritative

Anything with `needs_review` status or confidence < 80 now renders a muted dashed "Unclassified · review" chip (hover shows the classifier's reason) instead of a colored level badge — in both the OKR tree and the list table. New helper `isOkrClassificationUncertain()` in okrFramework.js; new `.okr-unclassified-chip` style. Do not "improve" this back to colored badges: the entire point is that the UI must not assert what the classifier doesn't know. Wrong-but-confident labels in Jake's first impression of the tree would sink trust in the rollup math.

### 3. "Needs Assessment" label collided with the project Assessment stage

Renamed to "Unclassified" (level id `needs_review` unchanged; color de-saturated to slate). Two different concepts now read as two different things.

### 4. Senior-management signoff on every project (pre-empted Jake's decision #5)

Now gate-blocking only when `budget_estimate >= $25,000` (`SENIOR_APPROVAL_BUDGET_THRESHOLD`, exported, commented as a DEFAULT pending Jake's approval-matrix decision) or when a project is flagged `requiresSeniorApproval`. Sponsor/quality/finance remain always required. When Jake sets the real threshold in the meeting, change the one constant.

### 5. Objectives filter bar bloat

The four OKR-specific selects (OKR level, period, KR freshness, project stage) now render only in the OKR tree view — or in any view when their filter is active, so the dashboard KPI-strip jumps (e.g. "Stale KRs" → list view with stale filter) keep working. List/grid/kanban get their top bar back.

## Post-deploy validation (like a real user)

1. Objectives → list view: top bar shows only the original selects (status/owner/dept/priority/due + sort); no OKR dropdowns. Switch to tree view → the four OKR selects appear.
2. Dashboard KPI strip → click "Stale KRs" → lands in list view with the KR freshness select visible and set; clear it → select disappears.
3. Tree view: ops items ("expense report", bug tickets) show the muted dashed "Unclassified · review" chip, NOT Project/KR badges; hover a chip → reason tooltip. Real parent+metric items still get solid L1/L2/KR badges.
4. List table "work type" column: same chip treatment; period still shows.
5. Create/inspect a test project with no budget → gate blockers list sponsor/quality/finance but NOT senior management; set budget_estimate to 30000 → senior-management blocker appears with the threshold wording. (Clean up any test rows.)
6. Unit tests: tests/unit/okr-framework.test.mjs passes as-is (it covers the new behavior; the gate test's no-budget project intentionally no longer requires senior signoff).
7. Regression: NCR Trend Watch/Ask-AI, Field Key, org chart fit, Fix-It all load.

## For the Jake meeting (context you should know)

These defaults intentionally leave Jake's decisions open (docs/okr-project-assessment-framework.md §5): the $25k threshold is a placeholder for decision #5; kill/re-assessment criteria (#7) remain unimplemented on purpose; the tree has no real L1/L2 spine until Jake's 3–5 company OKRs are seeded — recommend seeding them live in the meeting and letting the tree organize itself. Frame the whole framework as a working prototype for the discussion, not a finished system.

Build note: if `npm ci` ran recently, the sandbox needs `@rolldown/binding-linux-arm64-gnu` reinstalled (--no-save) to build; irrelevant on the Mac.

Gates run in sandbox: lint clean, unit 81/81, vite build OK. No schema changes, no Supabase data touched, no Fix-It mutations.
