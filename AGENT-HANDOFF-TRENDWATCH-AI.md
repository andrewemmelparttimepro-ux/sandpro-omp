# Agent Handoff: Trend Watch + Ask-AI Production Push (DEPLOY BY MORNING)

Date: 2026-06-09 evening. Tim Dibben demo: tomorrow morning — this is time-critical.
From: Cowork session (Claude agent, sandboxed — no GitHub/Vercel credentials)
Repo: /Users/andrewemmel/Documents/New project/sandpro-omp · Branch: main
Supersedes: AGENT-HANDOFF-NCR-FIELDKEY-POLISH.md (push any of its commits that are still unpushed)
Companion plan: docs/ncr-ai-trends-production-plan.md (read it — it has the route map, the env checklist, and Phase 2/3)

## Your instruction

Push and deploy local `main`. The new commit is:

```text
f82e943 feat: Trend Watch auto-insights, Ask-AI redesign, analytics top-fold cleanup, org wheel-zoom removal
```

```bash
cd "/Users/andrewemmel/Documents/New project/sandpro-omp"
git log --oneline -4                                  # f82e943 should be on top
npm run lint && npm run test:unit && npm run build    # re-confirm on the Mac (sandbox gates all passed)
git push origin main
npm run deploy:prod                                   # gated deploy; no schema changes, no db:migrate:release needed
```

Then the single most important post-deploy step:

**Verify `OPENAI_API_KEY` and `OPENAI_MODEL` are set in Vercel production env**, then ask the live Ask-AI box "How many AWC valve failures?" and confirm the answer footer reads "Answered by NCR AI from the live report set." If it says taxonomy fallback, the key/model env is the problem — fix env, redeploy, retest. Tim's demo tomorrow leans on this feature.

Do NOT amend/rebase/squash these commits. Do NOT commit the other dirty WIP files. The edited `tests/unit/release-readiness.test.mjs` (untracked tests/ tree) must be kept in the working tree — unit gate depends on it.

## What shipped in f82e943

1. **Trend Watch** — auto-surfacing trend system (v1, deterministic, client-side, free):
   rising failure groups, new failure groups, repeat operator×failure combos, critical
   clusters, stalling open NCRs, NPT concentration. Severity-ranked rows; clicking one
   drives the Issue Trend Explorer or tracker quick-filters. Respects the scope bar.
2. **Ask AI about these NCRs — redesigned**: question + Ask + suggested-question chips
   (auto-submit, Enter works); answer pane shows headline sentence, ranked group rows
   with counts, clickable example NCR numbers that jump to the tracker, loading state
   ("Reading 354 NCRs..."), caveats, and honest mode labeling (AI vs fallback).
3. **Top fold fixed**: exports unified into one labeled uniform group
   (Export · PDF / Excel / Summary CSV / Individual CSV). The floating orange CSV
   button is gone.
4. **Org chart**: wheel zoom removed (Tim's decision from today's meeting); +/− zoom
   buttons added next to Fit/Root; hint copy updated.

## Post-deploy validation (validate like a real user, attach proof if a Fix-It item exists)

1. /?page=ncr → Analytics: top fold shows hero + one tidy export row; nothing floats oddly at any width (test ~1100px and ~1400px).
2. Trend Watch card renders between the KPI row and Ask-AI; with current production data expect several insights (112 past due alone guarantees the stalling insight). Click a "trending up" insight → Issue Trend Explorer query updates. Click a tracker-type insight → lands on tracker with the right quick-filter active.
3. Ask-AI: click suggestion chip "How many AWC valve failures?" → auto-submits, loading state appears, answer renders as ranked rows; click an example #NCR → tracker opens with that report found.
4. Verify answer footer says "Answered by NCR AI..." (see env step above).
5. Organization page: mouse wheel scrolls (no zoom); +/− buttons zoom; Fit still works.
6. Field Key (from fc33ac1 if deploying together): launcher pill, "?" shortcut, Observer/Employees-named definitions.
7. Quick regression: Tracker filters/sort/KPI quick-filters, KPA import preview, Dashboard/Objectives/Fix-It load.

## For the morning meeting (Andrew's other action items from today's Tim meeting)

- Email Merci's CSV template to Tim (data-format alignment for his upload; newest reports only — importer dedupes by report number regardless).
- The analytics page improvements Tim asked for ("improved filter options and reporting functionality... more usable layout") are what you are deploying — call that out to him explicitly.
- Bamboo-HR-style org chart: still open; Andrew owes Tim a clarification note (see plan §7).

No Fix-It items were claimed/commented/archived this session. No Supabase data touched. No schema changes.
