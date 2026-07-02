# OMP — Bridging the Data → Display Gap

**Prepared:** 2026-06-27
**Basis:** June 24 weekly meeting transcript (Tim Dibben + Mercileidy Jimenez + Andrew), the `OMP_FRAME_WORK_R1` framework sheet, the 8-week roadmap, and a live audit of the `sandpro_objectives` Supabase project + the `sandpro-omp` codebase.
**Purpose:** name the real problem ("the features work but something is missing between what is going on and how it is displayed"), lay out a concrete plan to fix it, and list the decisions that legitimately need a human answer before wiring proceeds.

---

## 1. The actual problem (why it feels like spinning wheels)

The features are built. The screens render. What is missing is the **data contract** — the explicit agreement, for every number and label on screen, about:

1. **Where it comes from** (which table/column/file is the source of truth),
2. **How it is treated** (is it typed in by hand, rolled up from child items, calculated from a formula, or confirmed by a manager), and
3. **How it is displayed** (what the progress bar, status chip, or KPI tile is actually reading).

Right now those three are not aligned. The UI is reading fields that nobody is reliably *feeding*, and the real data is sitting in places the UI never *reads*. So the app looks complete while telling you very little that is true. Three concrete proofs from the live system:

**Proof A — Progress bars show a number disconnected from the work.**
Every objective row renders `<ProgressBar value={obj.progress} />` (`src/pages.jsx` lines 1620, 1667, 1974, 2033, 2698). But in the database `objectives.progress` is a **hand-typed integer** (avg 65% across 18 objectives), while the underlying work tells a different story: only **13 of 108 workflow steps are done (12%)** and only **1 of 18 objectives has any subtasks at all**. `rollup_method` says `average` on 17 objectives, yet there is nothing to average. The bar is showing an opinion, not progress. This is exactly Jake's open item: *"Define whether progress is manual, workflow-based, manager-confirmed, or a mix."*

**Proof B — The real OKRs aren't in the system the OKR screen reads.**
The 91 consolidated 2026 OKRs were transcribed into `src/data/okr2026Consolidated.js`, but that file is **imported by nothing** in the app. The OKR/KPI screens read from Supabase `objectives`, `okr_projects` (0 rows), `kpi_definitions` (0 rows), and `kpi_datapoints` (0 rows). So the screen that is supposed to answer *"8 of 10 OKRs on track"* has almost no source data, while the real OKRs sit in a JSON file the UI never opens.

**Proof C — Two department vocabularies that don't match.**
The framework defines **5 departments** (Automation, Wellhead, Flowback, CP Warehouse, Business Team) and a Class list under each. But the live data is bucketed in **completely different words**: `profiles` use Operations/Admin/Sales/Leadership/Field Operations/Shop/HR/Quality/Safety; the 354 NCRs group by Shop/Operations/Service/Automation/CP/Inventory. Anything that "groups by department" — Department Health, the KPI scorecard, the org chart — is bucketing on a key that means different things in different tables. The grouping/multi-select Merci asked for cannot be trusted until there is **one** department vocabulary.

These three are the same disease: **no enforced contract between source, treatment, and display.** Everything below is the cure, organized so each screen has one answer for "where does this number come from and how is it made."

---

## 2. The bridge — one data contract per domain

For each domain: **Source of truth → Treatment (how the value is made) → Display (what reads it) → Current gap → Bridge step.** Ordered to match the roadmap priority you set (KPI summary + nav first), then following the transcript/framework for the rest. The principle stays the roadmap's: *nothing is shown as real until it is fed by something real.*

### Domain 1 — Classification & taxonomy (the shared key everything groups by)
This is first in *dependency* order even though it's invisible, because progress, KPI rollups, filtering, multi-select, and permissions all group on it.

- **Source of truth:** `OMP_CLASSIFICATION_TYPES` (Task/Project/OKR/NCR) + `OMP_DEPARTMENTS` (5) + `OMP_DEPARTMENT_CLASSES` in `src/ompFramework.js`.
- **Treatment:** Originator auto-captured (not selectable). Type chosen by originator; Department drives a dependent Class select. Same Class list applies across all four types.
- **Display:** the existing **vertical scroll** create/edit form (explicit client instruction: the Excel horizontal layout is for visualization only — do **not** re-flow the UI to a matrix).
- **Current gap:** `objectives.type` only holds `simple`/`measured` (17/1), not Task/Project/OKR. There is no `class` column. Departments in the DB are the legacy 10, not the framework 5. NCR groups are a third vocabulary.
- **Bridge:**
  1. Resolve the legacy→new department remap (Human Q1) and run a migration on `profiles`, `objectives`, and `ncr_reports` so one vocabulary wins.
  2. Add `class` (and the per-type fields below) to the schema.
  3. Render create/edit forms from `OMP_FIELD_MATRIX` so type → fields and Department → Class are wired.
  4. Backfill `objectives.type`/`class` for the 18 existing records (or accept them as test data and start clean — Human Q9).

### Domain 2 — Navigation / information architecture
- **Source of truth:** the transcript's agreed structure: **Dashboard · Objectives · KPIs · Organization**, with **NCR and the objective subtabs living *under* Objectives**.
- **Treatment:** pure IA — no data change, just where things hang.
- **Display:** top nav + Objectives sub-navigation.
- **Current gap:** NCR currently sits as a top-level concern; subtabs aren't nested under Objectives.
- **Bridge:** restructure nav so NCR is a tab under Objectives; KPIs becomes the summary surface (Domain 3). Low risk, high "feels finished" payoff — good to do early per your priority.

### Domain 3 — KPI page (the running summary Jake wants)
- **Source of truth:** **derived**, not entered. NCR summary derives from `ncr_reports`; OKR on-track summary derives from objectives classified as OKR (Domain 4); project-gate/stale signals from `okrFramework.js` helpers already present (`buildProjectGateBlockers`, `isKeyResultStale`).
- **Treatment:** counts and rollups computed on read — e.g. *"X open NCRs, Y closed this quarter"*; *"8 of 10 OKRs on track, 2 at risk/off track."* `kpiSystem.js` already has the status logic; it needs real inputs.
- **Display:** KPI tab tiles + a one-screen status roll.
- **Current gap:** `kpi_definitions`/`kpi_datapoints` are empty; the KPI page has nothing to summarize because OKRs aren't seeded and NCR↔KPI wiring isn't defined. Tim himself said he doesn't yet know what "stale key results" or "project gate blockers" should mean (Human Q6).
- **Bridge:**
  1. Define the NCR running-summary query (what counts as open/closed/overdue) and bind it to the KPI tab.
  2. After OKRs are seeded (Domain 4), compute the on-track rollup from OKR status.
  3. Confirm the thresholds that turn raw counts into green/yellow/red (Human Q6).

### Domain 4 — OKRs & the linking hierarchy
- **Source of truth:** `src/data/okr2026Consolidated.js` — 1 company top-line → 17 group scorecards → 91 OKRs, verbatim from the 4.8.26 sheet — **seeded into Supabase** (`objectives` with `okr_level`, plus `okr_projects` + `okr_project_kr_links` for project↔KR links).
- **Treatment:** hierarchy Company → Department/Group → Key Result → Project. Each OKR carries baseline, target, owner, manual status, reporting cadence, monthly actuals.
- **Display:** OKR view rendering the tree; KPI rollup reads status off it.
- **Current gap:** the 91 OKRs are in a file nothing imports; Supabase OKR tables are empty; the 17 groups are finer-grained than the 5 framework departments (Human Q2); several owners are unresolved/compound (Human Q3).
- **Bridge:**
  1. Resolve owners (Q3) and the group↔department relationship (Q2).
  2. Decide which baseline/target values are numeric vs qualitative (Q4) — this determines which OKRs can drive a Rolling AVG/progress and which only show a manual status.
  3. Seed company→group→OKR into Supabase from the JSON; flag unresolved owners rather than guessing.

### Domain 5 — Metrics, monthly entries & Rolling AVG
- **Source of truth:** monthly/quarterly values entered into `objective_metric_checkins` (currently 0 rows); baseline/target on the objective.
- **Treatment:** **Rolling AVG is auto-calculated** from the entered monthly cells (framework R26: "autocalculated in the table based on what is entered"). The monthly cells are the *only* editable inputs; the average and any progress derived from it are **calculation fields and must be immutable** (transcript: "they should be kind of immutable… stay on the people"). `computeMetricProgress(baseline, current, target)` already exists in `okrFramework.js` but is **not used** by the progress bars.
- **Display:** the OKR table's monthly columns (Jan–Dec) + a locked Rolling AVG column; progress bar for measured objectives should read the *computed* metric progress, not the hand-typed `progress`.
- **Current gap:** no check-in data; progress bars ignore the metric formula; cadence (monthly vs quarterly) isn't enforced per objective even though `measurement_cadence` exists.
- **Bridge:**
  1. Wire the monthly-entry grid to `objective_metric_checkins`.
  2. Compute Rolling AVG on read; render it locked.
  3. For `measured`/OKR objectives, switch the progress bar to `computeMetricProgress`; keep manual progress only for objectives explicitly defined as manually tracked (ties to Human Q5 progress semantics).

### Domain 6 — Progress semantics ("progress that means something")
- **Source of truth:** depends on the decision in Human Q5. Candidate sources already in the data model: subtask weighted completion (`subtasks.weight`/`progress`), workflow-step completion (`objective_workflow_steps`), metric progress (Domain 5), or manual entry.
- **Treatment:** one rule per objective *type*, e.g. — Task: workflow-step or manual; Project: weighted rollup of its task table; OKR: metric-based; or manager-confirmed override.
- **Display:** the same `ProgressBar`, but reading the value the type's rule produces.
- **Current gap:** one manual integer used for everything, contradicted by the workflow-step and subtask data (Proof A).
- **Bridge:** after Q5 lands, implement a single `getObjectiveProgress(objective)` that branches on type, and replace the raw `obj.progress` reads. Until then, the bar is the #1 thing that "looks done but isn't true."

### Domain 7 — Permissions: edit vs view contract
- **Source of truth:** `profiles.role` (executive/manager/contributor) + `objective_members.role` (assignee/manager) — the "tagging" model.
- **Treatment (from transcript + framework R10–R16):** admins edit anything and add; **tagged employees edit only the line fields they're tagged in**; **Status is editable only by the assigned person**; **calculation fields (Rolling AVG) are immutable for everyone**; **everyone with access can view everything** ("if you're on the team, you're on the team"). Default landing = read/presentation view.
- **Display:** edit affordances appear only on fields the current user may edit; everything else is read-only but visible.
- **Current gap:** the field-level edit/view rules and the assignee-only-status rule aren't enforced; 31 assignees + 1 manager are tagged but the permission contract isn't applied to fields.
- **Bridge:** define a field-level permission map keyed on (objective type, field, current-user role/tag), enforce in both the UI and Supabase RLS, and confirm who counts as "admin" (Human Q10).

### Domain 8 — NCR ↔ Objectives & the KPI summary link
- **Source of truth:** `ncr_reports` (354 rows, rich, populated) with `linked_objective_id`.
- **Treatment:** NCR keeps its existing field set (Tim's prior spec); only its **department/class must match the unified taxonomy** (Domain 1). KPI page summarizes NCRs.
- **Display:** NCR tab under Objectives; running NCR summary on KPI page.
- **Current gap:** only **2 of 354** NCRs are linked to an objective; NCR groups use a third vocabulary; the "KPIs gives a running summary of NCRs" wiring isn't built.
- **Bridge:** align NCR department/class to the 5/Class taxonomy, decide whether/how NCRs roll into objectives or just summarize (Human Q8), and bind the summary to the KPI tab.

### Domain 9 — Tracker grouping, export, presentation, files (largely the later sales-readiness package)
- **Source of truth:** the same objective/NCR records; export reads the current filtered set.
- **Treatment (from transcript):** multi-select grouping (select several departments/groups, not all-or-one); export the selected set; batch-to-PDF that **includes pictures**; **on re-import the new list takes precedence**, but **pictures stay associated to the report number** and revisions are tracked; presentation/full-screen mode.
- **Display:** tracker filters with multi-select; export/present buttons; presentation view.
- **Current gap:** export plumbing exists (`filteredExportObjectives`, scorecard CSV/HTML at `pages.jsx` ~1314, ~8953) but multi-select grouping, picture-preserving import, and presentation mode aren't built. The roadmap deliberately defers "advanced exports and polished reporting" to the later package — so this is **last**, after the data contract is trustworthy.
- **Bridge:** once taxonomy + permissions are solid, add multi-select to the filter, a presentation view, and an import routine that keys pictures to report number and writes a revision record (`objective_updates` already tracks update history and can model revisions).

---

## 3. Sequenced path (dependency-ordered, your priority weighted in)

1. **Decide the open questions in §4.** Most wiring is blocked on these — this is the true unblock.
2. **Unify the department/class taxonomy** (Domain 1) + migrate existing rows. Everything groups on this.
3. **Nav cleanup** (Domain 2) — cheap, visible, your stated first priority; safe to land in parallel with #2.
4. **Seed the real OKRs** into Supabase (Domain 4) so the OKR and KPI screens finally have real source data.
5. **KPI running summary** (Domain 3) — NCR summary first (data already exists), OKR on-track rollup after #4.
6. **Metrics + Rolling AVG** wiring (Domain 5), then **progress semantics** (Domain 6) — the two changes that make on-screen numbers true.
7. **Permission contract** (Domain 7) enforced in UI + RLS.
8. **NCR taxonomy alignment + summary link** (Domain 8).
9. **Tracker multi-select, presentation, picture-preserving import/export** (Domain 9) — the sales-readiness package, last.

Every step ends the roadmap way: tested on real SandPro work, and anything not trustworthy is labeled pending, not shown as done.

---

## 4. Questions that legitimately need a human answer

These are real decisions — taxonomy, ownership, thresholds, and policy — that should not be guessed by an agent. They are the gate on most of §3. (Items 1–5 carry over from the June 23 handoff and are still open; 6–12 surfaced from the transcript + live audit.)

1. **Legacy → new department mapping.** The 5 framework departments replace the legacy 10. Where do **Operations, Field Operations, Shop, Admin, Leadership, HR, Quality, Safety, Sales** each map? (`LEGACY_DEPARTMENT_REMAP` has `null`s where it refused to guess.) Without this, every department grouping double-buckets.
2. **OKR group ↔ framework department.** The 17 OKR groups (Inside Sales, Dispatch, Field Trainers, etc.) are finer than the 5 departments. Does the OKR "Department" field use the 5, the 17, or the 17 as a sub-tag of the 5?
3. **Unresolved / compound OKR owners.** `JB/JS, LD, Brad/Bryce, Gershom/Dustin, HUNTER/DREW, JPL, Matt, Jaelen/Thomas, Aiden, Malcolm/Field Service Managers` — seed/confirm these people and pick a single primary assignee per OKR.
4. **Baseline/target normalization.** Sheet values mix %, $, counts, and prose ("Needs Improvement", "Define what success means"). Which become **numeric** (and can drive Rolling AVG / progress) vs which stay **qualitative** (manual status only)?
5. **Progress definition (Jake's open item).** For each type, is progress **manual, workflow-step-based, weighted-subtask rollup, metric-based, or manager-confirmed**? One rule per type unblocks Domain 6 and stops the progress bar from lying.
6. **KPI thresholds & definitions.** What turns counts into green/yellow/red? What exactly is a **"stale" key result** (no update in N days?) and a **"project gate blocker"**? For the "8 of 10 on track" rollup, which objectives count as OKRs in the denominator?
7. **Reporting cadence default.** Framework allows Monthly or Quarterly per objective. What's the default, and which groups are quarterly vs monthly? (Drives which monthly cells are editable and how Rolling AVG is computed.)
8. **NCR ↔ objective relationship.** Should NCRs **link into** objectives (and roll into progress/KPIs), or only be **summarized** on the KPI page? Only 2 of 354 are currently linked — is linking expected going forward, and is the existing NCR field set final?
9. **Existing records: migrate or restart.** The 18 current objectives / 7 subtasks look like test/beta data with hand-typed progress. Do we **backfill** them into the new type/class model, or treat them as test data and start clean once the real OKRs are seeded?
10. **Who is an "admin."** Which roles/people get edit-anything rights? Confirm the mapping of `executive`/`manager`/`contributor` (and Tim/Jake/Merci specifically) to the edit-all-except-calc-fields rule.
11. **Re-import precedence & retention policy.** On mass re-import: confirm new list overwrites, **pictures persist keyed to report number**, and revisions are tracked (kept forever? last N?). What is the unique key that ties a picture to its record across imports?
12. **Presentation/export scope for rollout vs sales.** Which export/presentation features are needed for the **team rollout** now vs deferred to the **sales-readiness** package (per the roadmap's deliberate-delay list)?

---

*Audit basis: live read of Supabase project `sandpro_objectives` (no writes were made) and the `sandpro-omp` working tree. The framework data definitions in `src/ompFramework.js`, `src/okrFramework.js`, `src/kpiSystem.js`, and `src/data/okr2026Consolidated.js` are sound — the missing piece is wiring them to a single, enforced source-of-truth and to what the screens read.*
