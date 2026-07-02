# SandPro KPI System Build Plan

## Executive Intent

The KPI tab is a first-class SandPro OMP operating surface beside Objectives. It is not a generic BI clone and not a dashboard mode. Its job is to help SandPro see whether the company is executing against goals, where operating health is slipping, and which red metric should become work immediately.

V1 ships as a live SandPro execution cockpit using the data already trusted inside OMP: Objectives, OKRs, departments, projects, NCRs, objective metric check-ins, and manual/CSV KPI datapoints.

## Source Documents And Research Anchors

- Original KPI system plan: metric definitions, targets, RAG thresholds, alerts, AI insight, OKR linkage, dashboarding, and mobile operating review.
- KPI software guide: semantic governance, metric stores, data lineage, scorecard/OKR cascading, executive meeting lifecycle, RLS, NFRs, and target models.
- SandPro department quarterly scorecard CSV: department, objectives, OKR levels, KRs, average progress, and stale KRs.
- Domo KPI dashboard guidance: keep dashboards actionable, target-based, and focused on KPIs that drive decisions.
- ClearPoint strategy platform pattern: objectives, measures, initiatives, reports, dashboards, collaboration, and automation belong together.
- Geckoboard/Databox operating pattern: live scorecards, recurring updates, notifications, and simple review surfaces matter for teams.
- Atlan, Improvado, and Omni semantic-layer guidance: KPI systems need one controlled metric definition layer so numbers do not drift across views.

## V1 Product Contract

The first release prioritizes SandPro execution:

- KPI tab appears directly beside Objectives and supports `?page=kpi`.
- Hero cards show company operating health, active objectives, NCR closure, and manual scorecard coverage.
- KPI cards include value, target, RAG status, trend, source, freshness, and action narrative.
- Department scorecard reuses the existing Objectives/OKR logic and supports CSV import.
- NCR strip shows open NCRs, critical issues, overdue follow-ups, repeat issues, NPT-linked issues, and closure rate.
- Action inbox surfaces red/yellow/missing-data KPIs and gives the user an inspect path.
- KPI detail lens shows trend, target, definition, source/freshness, linked objective candidates, manual datapoint entry, and create-objective action.
- Red/yellow KPIs can create a prefilled Objective with metric context; stored KPI definitions persist links back to that Objective.

## Data Model

The existing `objective_metric_checkins` table remains objective-specific. KPI gets a registry:

- `kpi_definitions`: name, category, department, owner, unit, direction, targets, thresholds, source type, formula JSON, cadence, status.
- `kpi_datapoints`: period, value, denominator, dimensions, source label/ref, importer.
- `kpi_objective_links`: many-to-many relationship from KPIs to Objectives.
- `kpi_checkins`: narrative notes and operating updates.
- `kpi_alert_rules`: threshold/rule definitions.
- `kpi_alert_events`: open/acknowledged action events.
- `kpi_import_batches`: CSV import audit trail and rejected-row reporting.

All new public tables enable RLS. Authenticated users can read shared SandPro KPI data. Write paths are tied to creators, owners, import actors, or executive role checks already used elsewhere in OMP. The release migration also grants authenticated table access because new Supabase public tables are no longer automatically exposed to the Data API in all projects.

## Metric Model

The KPI engine supports:

- increasing-is-good,
- decreasing-is-good,
- target-band,
- green/yellow/red/gray status,
- stale datapoint detection by cadence,
- trend series preparation,
- department scorecard rollups,
- NCR quality rollups,
- action alert generation,
- objective-link scoring,
- CSV normalization.

Computed v1 KPI families:

- Objective execution health.
- 7-day due readiness.
- Stale key results.
- Project gate blockers.
- NCR closure rate.

Manual/imported KPI families:

- Department quarterly scorecards.
- Generic manual datapoints.
- Future CSV scorecards from finance, operations, quality, service, shop, sales, and leadership.

## AI Scope

AI is grounded and optional in v1. The core KPI math, page rendering, alerts, CSV import, and objective handoff must work without AI. Narrative fallback is deterministic: every KPI can explain its status using loaded app data.

## Acceptance Gates

- Unit tests cover status math, trend prep, department scorecards, NCR rollups, CSV parsing, alert generation, narrative fallback, and objective-link scoring.
- Schema tests prove every KPI table and required column exists.
- Playwright proves the KPI tab appears beside Objectives, loads at `?page=kpi`, filters data, opens detail, previews/imports CSV, and creates a prefilled objective from a KPI.
- Regression checks keep Dashboard, Alternative Dashboard, Objectives, NCR, Fix-It, Org, PWA/mobile, and dark mode usable.
- Production deployment is not complete until a human-style Computer Use smoke verifies the live KPI tab in the browser after deploy.
