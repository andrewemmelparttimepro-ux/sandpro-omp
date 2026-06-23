# Agent Handoff — OMP Framework Rev 1 + 2026 Consolidated OKRs

**Prepared:** 2026-06-23
**Trigger:** Email from Mercileidy Jimenez relaying her meeting with **Tim Dibben** and **Jake Feil**, with two attached reference docs for the OMP build.
**Status of this work:** Data definitions encoded + pick list switched. **Left uncommitted on purpose.** Wiring into forms/schema, existing-record migration, and the Supabase OKR seed are intentionally NOT done — they need your prod context and the open decisions below resolved first.

---

## Source documents (the two attachments)

Originals: `~/Downloads/ompframeworkokrsreferencedocuments/`
1. **`OMP_FRAME_WORK_R1.xlsx`** → objective **classification structure, department pick list, class definitions, field matrix**.
2. **`2026 All Group OKRs_ Consolidated_4.8.26.xlsx`** → the **17 group OKRs** (+ company top-line) for the **linking system**.

> **Explicit client instruction from the email:** the framework is shown **horizontally in Excel only for visualization**. The **platform keeps the existing vertical scroll format as-is.** Do not re-flow any screen into a horizontal matrix.

---

## What I changed (my entire footprint — everything else in the dirty tree pre-existed and is NOT mine)

| File | Change |
| --- | --- |
| `src/ompFramework.js` | **NEW.** Source of truth for Framework Rev 1: classification types, 5-department pick list, department→class map, per-type field matrix, OKR permission model, legacy→new remap. |
| `src/data/okr2026Consolidated.json` | **NEW.** Machine-generated from the OKR sheet: 1 company top-line + 17 groups, 91 OKRs, verbatim values + monthly actuals. |
| `src/data/okr2026Consolidated.js` | **NEW.** Wraps the JSON: `COMPANY_OKRS`, `GROUP_OKRS` (the 17), owner map, `flattenOkrs()`. |
| `src/data.js` | **EDITED (+11/−1).** `DEPARTMENTS` now re-exported from the framework (the new 5); old list preserved as `LEGACY_DEPARTMENTS`. |
| `AGENT-HANDOFF-OMP-FRAMEWORK-AND-OKRS.md` | **NEW.** This file. |

⚠️ **The working tree was already dirty before I started** (17 modified tracked files incl. `src/pages.jsx`, `src/components.jsx`, both `supabase/*.sql`; plus many untracked `docs/` + `src/kpiSystem.js`). **None of those are mine** — I deliberately avoided touching `pages.jsx`/migrations to prevent conflicts with your in-flight work. Verify your own changes are intact: my diff is confined to `src/data.js` + the 3 new files above.

Validation I ran: `eslint` clean on all changed/new files; `esbuild --bundle` resolves the re-export chain and JSON import; runtime check confirms `DEPARTMENTS` = the new 5.

### Codex review addendum before live push

After review, the live-safe footprint was expanded because the global `DEPARTMENTS` flip left production create/edit surfaces with legacy defaults and old NCR group options.

Additional changes:
- `src/data.js` now exports `DEFAULT_DEPARTMENT` and `getDepartmentOptions(currentValue)` so legacy selected values remain visible while new creates default to **Business Team**.
- `src/App.jsx` uses the framework department helper on signup and KPI-created objective fallback.
- `src/components.jsx` uses the framework department helper in the Objective create/edit modal.
- `src/pages.jsx` points NCR group selections at the framework departments, preserves existing legacy current values in selects, and updates org/admin defaults to **Business Team**.
- `tests/kpi-system.spec.js` and `tests/unit/release-readiness.test.mjs` were updated from the legacy department contract to the Framework Rev 1 contract.

Review validation added: direct Node import check for `src/data.js`, `npm run lint`, `npm run build`, `npm run test:unit`, `npm run test:schema`.

---

## Framework Rev 1 — the spec as encoded

**Classification types (top level):** Task · Project · OKR · NCR. Originator is auto-captured, **not user-selectable**.

**Department pick list (5):** Automation · Wellhead · Flowback · CP Warehouse · Business Team.

**Department → Class (second-level selection, shared across all four types):**
| Department | Classes |
| --- | --- |
| Automation | Repair, Service, Rental, Inventory, Sale Goods |
| Wellhead | Repair, Service, Rental, Inventory, Sale Goods |
| Flowback | Repair, Service, Rental, Inventory, Sale Goods |
| CP Warehouse | Repair, Inventory, Sale Goods |
| Business Team | HR, Accounting, Safety, Sale Team, Marketing, Quality, Leadership, Purchasing, Training, Facility, Maintenance, R&D |

**Field matrix** (full detail in `OMP_FIELD_MATRIX`):
- **Task** — single vs recurring. Fields: Title, Description, Priority (High/Med/Low), Department, Class, Originator (auto), Assigned to, Upload, Due Date. Recurring adds **Duration** (Day/Week/Month/Qtr/Semi Annual/Annual) + **Repeating Date** (Week/Month/Quarter/Semi Annual/Annual).
- **Project** — Project, Project Name, Scope of work, Priority, Overall timeline, Originator (auto), Assigned to, Upload, Due Date + a **task-assignment table** (Title/Description/Priority/Department/Class/Assigned-to[multiple]/Upload/Due) with an add-line button.
- **OKR** — Department, Class, Audit form Use (Y/N), Baseline, Target, Assigned to (multiple), Status (On Track/At Risk/Off Track — editable **only by assignee**), Report Cadence (Monthly/Quarterly), Rolling AVG (**auto-calculated**), monthly entries Jan–Dec. Permission model: admin edits anything/adds; tagged employees edit only their tagged line fields; default view is read/presentation for all with access.
- **NCR** — **keep existing NCR fields** (from Tim's prior conversation); only requirement is that NCR **department/class selections match this taxonomy**.

---

## 2026 OKRs — the linking system

`src/data/okr2026Consolidated.js`. Hierarchy = **COMPANY top-line → 17 group scorecards → their OKRs** (91 total).

The 17 groups: Sales · Inside Sales · Marketing · Field Trainers · Dispatch · Finance/Accounting · HR · Inventory/Logistics · Safety · Facility/Yard · Quality/Compliance · Field Ops · I&E-Panels · CP Warehouse · R&D/Engineering/Design · Flowback Repair · Frac Repair.

Each OKR carries: `title, auditForm (Y/N), baseline, target, owner, manualStatus, reportingCadence, ytdAvg, actuals{jan..dec}` — **verbatim** from the sheet (numbers, %, "Needs Improvement", "n/a", free text preserved; do not assume normalized).

**Regenerate the JSON** if the sheet is updated:
```bash
# from repo root, requires python3 + openpyxl
python3 scripts/gen-okr-2026.py            # uses the copy in ~/Downloads/ompframeworkokrsreferencedocuments/
python3 scripts/gen-okr-2026.py /path/to/updated.xlsx   # or pass an explicit path
```
`scripts/gen-okr-2026.py` is committed (untracked, with the other new files) and is **deterministic** — verified to reproduce the JSON byte-identical.

---

## ⚠️ BREAKING: department remap + data migration (do before deploy)

Switching `DEPARTMENTS` from the legacy 10 to the new 5 means **existing objectives/NCRs/users carry department values that are no longer in the pick list** (Operations, Sales, Field Operations, Shop, Admin, Leadership, HR, Quality, Safety). Until migrated:
- create/edit dropdowns show the new 5;
- existing records still show legacy strings;
- anything grouping by department (dashboard Department Health, KPI Department Quarterly Scorecard, org chart, `buildDepartmentScorecard`) will show **both** old and new buckets.

`LEGACY_DEPARTMENT_REMAP` in `src/ompFramework.js` is a **proposed** mapping with `null` where I refused to guess. Confirm it with Tim/Jake, then migrate `profiles`, `objectives`, and NCR rows (Supabase). `seed-users.mjs` department values also need updating to the new taxonomy.

**Consumers to update (grep `DEPARTMENTS`):** `src/pages.jsx` (lines ~2454, ~2463, ~8101, ~8183, ~8726, ~8758), and the department regex in `src/okrFramework.js` `inferObjectiveClassification` (`/admin|operations|shop|safety|hr/`) which references legacy names.

---

## Open decisions for Tim / Jake (I did not guess these)

1. **Legacy→new department mapping** — especially: Operations, Field Operations, Shop → which of Automation/Wellhead/Flowback? And does "Admin" map to Business Team→Accounting or →Purchasing? (`LEGACY_DEPARTMENT_REMAP` has the `null`s.)
2. **OKR group ↔ framework department** — the 17 OKR groups (e.g. Inside Sales, Dispatch, Field Trainers) are finer-grained than the 5 framework departments. Decide whether the OKR "Department" field uses the 5 departments, the 17 group names, or both (group as a sub-tag).
3. **Unresolved OKR owners** — these appear in the sheet but aren't in the seeded roster (or are compound): `JB/JS, LD, Brad/Bryce, Gershom/Dustin, HUNTER/DREW, JPL, Matt, Jaelen/Thomas, Aiden, Malcolm/Field Service Managers`. Seed/confirm users and pick a primary assignee per OKR. (See `UNRESOLVED_OWNERS`; resolved ones are in `OKR_OWNER_MAP`.)
4. **Baseline/target normalization** — values mix %, $, counts, and prose ("Needs Improvement", "Define what success means"). Decide which become numeric metrics (drive Rolling AVG / progress) vs. qualitative.
5. **NCR field set** — confirm the existing NCR fields are the intended ones; only the department/class alignment is mandated here.

---

## Wiring steps (suggested order, after decisions land)

1. Confirm decisions 1–5.
2. Render create/edit forms from `OMP_FIELD_MATRIX` (type → fields; Department drives the dependent Class select) in the **existing vertical layout**.
3. Add `class` (and recurring `duration`/`repeatEvery`, OKR `auditFormUse`/monthly grid) columns to the Supabase schema (`supabase/release_ready_migration.sql`).
4. Run the confirmed department migration on `profiles` + `objectives` + NCRs; update `seed-users.mjs`.
5. Seed the 2026 OKRs from `okr2026Consolidated.js` into Supabase as company→group→OKR with `OKR_OWNER_MAP`; flag unresolved owners.
6. Point NCR department/class selects at `OMP_DEPARTMENTS` / `getDepartmentClasses`.
7. Update department consumers in `pages.jsx` + the `okrFramework.js` regex.

## Verification still needed (I couldn't do these without prod/your context)
- App builds + boots with the new pick list; create-objective Class select populates per department.
- Department Health / KPI scorecard / org chart don't double-bucket after migration.
- OKR linking renders company→group→OKR with correct owners; Rolling AVG auto-calcs from monthly entries.
- Run the repo test suite (`tests/`) — several unit/spec files are already modified in the dirty tree.

---

*My code changes are uncommitted and isolated to `src/data.js` + the 3 new files. Nothing was committed, pushed, or run against the production database.*
