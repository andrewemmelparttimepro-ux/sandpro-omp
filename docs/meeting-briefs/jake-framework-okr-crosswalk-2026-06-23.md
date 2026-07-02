# SandPro OMP — Framework & OKR Crosswalk (for the Jake conversation)

**Date:** 2026-06-23
**Purpose:** Bridge what Tim & Jake handed over (the OMP Framework Rev 1 + the 2026 Consolidated OKRs) with what's actually in the platform today — in plain English, so Andrew can walk Jake through it and close the few open decisions.
**Inputs:** `OMP_FRAME_WORK_R1.xlsx`, `2026 All Group OKRs_ Consolidated_4.8.26.xlsx`.
**Live app:** https://objectivetracker.net · **Code state:** framework + OKR data shipped in commit `b5314f6` (pushed to main 2026-06-23 12:55).

> **One-line status:** The **department structure you asked for is live**. The **classification detail and your actual OKRs are encoded but not yet switched on** in the screens — that's the gap, and most of it is waiting on five quick decisions from you (below), not on build time.

---

## Legend
- 🟢 **Live** — in the app now, Jake can see/use it.
- 🟡 **Partial** — the capability exists but doesn't fully match the doc yet.
- 🔵 **Built, not switched on** — coded/encoded, needs wiring or a decision to surface.
- 🔴 **Gap** — not there yet.

---

## Part 1 — OMP Framework Rev 1

| What the framework specifies | Status | What Jake sees today | What's left |
| --- | --- | --- | --- |
| **5 departments** (Automation, Wellhead, Flowback, CP Warehouse, Business Team) | 🟢 Live | The new 5 departments appear in every create/edit screen and the add-employee form | Migrate existing records off the old 10 departments (decision #1) |
| **Keep the vertical scroll layout** (Excel is horizontal only for viewing) | 🟢 Honored | App stayed vertical; no horizontal matrix was introduced | — |
| **Department → Class** (2nd-level pick, e.g. Automation → Repair/Service/Rental/Inventory/Sale Goods) | 🔵 Built, not switched on | Class lists are encoded but the **Class dropdown isn't in the forms yet** | Wire the dependent Class dropdown + add the column to the database |
| **4 entry types** (Task · Project · OKR · NCR) | 🟡 Partial | App has **OKRs** (with levels), **Projects** (stage-gated), and **NCR** as its own module — but **no single Task/Project/OKR/NCR picker**, and "Task" isn't a first-class type | Decide: add a true type picker + Task type, or confirm "objective = task" (decision #2) |
| **Field matrix per type** — recurring tasks (duration/repeat), OKR audit-form flag, baseline/target, monthly Jan–Dec entries, rolling average, tagged-line permissions | 🟡 Partial | OKR entries already capture **baseline, target, current value, unit, cadence, period, weight, and parent-linking**. Missing: audit-form Y/N, the **Jan–Dec monthly grid**, recurring-task duration/repeat, and the tagged-line edit permissions | Add the missing fields per type |
| **Originator captured automatically, not selectable** | 🟡 Likely OK | Creator is recorded automatically | Confirm it's labeled "Originator" |
| **Priority = High / Medium / Low** | 🟡 Partial | App uses **Critical / High / Medium / Low** (4 levels) | Confirm 3 vs 4 (decision #3) |
| **NCR uses existing fields, departments aligned** | 🟢 Live | NCR keeps Tim's fields (criticality, disposition, lifecycle, root cause, group) and its **Group now uses the new departments** | Note: NCR criticality is Critical/Non-Critical — confirm that's intended |

---

## Part 2 — 2026 Consolidated OKRs (the linking system)

The sheet = **1 company top-line + 17 group scorecards = 91 OKRs.** All 91 are now transcribed into the codebase verbatim (titles, audit-form flag, baseline, target, owner, status, cadence, and the Jan–Dec actuals).

| What the OKR doc gives us | Status | What Jake sees today | What's left |
| --- | --- | --- | --- |
| **4 company top-line OKRs** (Net Profit ≥15%, Zero TRIR, Employee Cost <27%, 2.0 Digital Operating System) | 🔵 Built, not switched on | Encoded in the app's data, **not yet loaded into the live board** | Seed the 4 company OKRs into the live system |
| **17 group scorecards** (Sales, Inside Sales, Marketing, Field Trainers, Dispatch, Finance/Accounting, HR, Inventory/Logistics, Safety, Facility/Yard, Quality/Compliance, Field Ops, I&E-Panels, CP Warehouse, R&D/Engineering, Flowback Repair, Frac Repair) | 🔵 Built, not switched on | Same — transcribed, not surfaced | Seed into the live system + map each group |
| **Linking: Company → Group → Key Result** | 🟡 Partial | The app **supports** parent→child OKR linking and company/department/KR levels — but the **actual 17-group hierarchy isn't loaded**, so the structure is empty of your real OKRs | Load the data into the hierarchy |
| **OKR fields** (audit-form, baseline, target, owner, status, cadence, monthly actuals) | 🟡 Partial | baseline/target/current/cadence/period exist on objectives; **audit-form flag and the 12-month actuals grid are missing** | Add those two, then import the monthly numbers |
| **Owners (by initials)** | 🔴 Gap | ~11 owners in the sheet aren't in the system yet: **JS, LD, Brad, Bryce, Gershom, Dustin, Hunter, JPL, Matt, Aiden, Thomas** (plus compound owners like "JB/JS") | Add/confirm these people (decision #5) |

---

## The 5 decisions only Jake (with Tim) can make — this is the real bridge

1. **Old → new department remap.** Existing objectives/NCRs carry the old departments (Operations, Field Operations, Shop, Admin, Sales, Leadership, HR, Quality, Safety). Where does each land in the new 5? (Especially: Operations / Field Operations / Shop → Automation, Wellhead, or Flowback?)
2. **Types vs. groups.** Do you want a literal Task/Project/OKR/NCR picker, or is an "objective" effectively the task/OKR? And — the **17 OKR groups don't match the 5 departments 1:1** (e.g., Inside Sales, Dispatch, Field Trainers are finer). Should an OKR's "Department" use the 5 departments, the 17 groups, or both?
3. **Priority levels** — 3 (High/Med/Low, per the doc) or keep the 4 already in the app?
4. **Which baselines/targets are real numbers** vs. notes. Many sheet values are prose ("Needs Improvement", "Define what success means", "n/a"). Which should drive automatic progress/rolling-average, and which stay as text?
5. **The missing people.** Confirm/add the ~11 owners above so their OKRs attach to real users.

---

## Suggested 5-minute demo path (what to click in front of Jake)

1. **Create → New objective** → show the **Department dropdown = the 5 new departments** (live proof the framework landed).
2. **Objectives → tree view** → show **Company OKR → Department OKR → Key Result** linking and the OKR fields (baseline/target/current/period).
3. **KPI tab** → show the operating-KPI command center (Objective execution, NCR closure, scorecard) — the "rolling-up" layer the OKRs will feed.
4. **NCR tab** → show the existing NCR fields with **Group now on the new departments**.
5. Then put **this crosswalk** on screen and walk the 5 decisions.

---

## Honest gap summary (say this out loud to Jake)

> "The structure you and Tim defined is in — the 5 departments are live across the app, and all 91 of your 2026 OKRs are already loaded into the codebase exactly as written. What's left is mostly **switching things on and a handful of your calls**: the second-level Class picker, the audit-form + monthly-grid fields, seeding your real OKRs onto the live board, and adding the dozen people who own OKRs but aren't in the system yet. None of that is heavy build — it's waiting on the five decisions on this page."

*Note: this crosswalk reflects the code shipped in `b5314f6` (the framework commit) and the live KPI/Dashboard screens reviewed 2026-06-23. A final click-through of the live deploy is recommended once the Chrome session is back up.*
