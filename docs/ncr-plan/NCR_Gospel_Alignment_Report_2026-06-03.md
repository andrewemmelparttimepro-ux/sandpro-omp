# SandPro OMP NCR Gospel Alignment Report

Generated: June 3, 2026

## Source Of Truth

This alignment pass treats Merci and Tim's NCR packet as the controlling scope:

- `NCR process & analytics_ Summary.pdf`
- `NCR process & analytics_ Transcript.pdf`
- `NCR_Module_Scope_Migration_KPA_to_OMP.docx`
- `Non- Conformance Report - NCR ScreenShot - KPA.docx`
- Merci's written summary of Tim's process and requirements
- Merci's June 3 follow-up packet of current KPA analytics outputs: Individual, Trend, Map, Observer, Employee, Worksite/Area, Operator and Location, Date and Time Event, Internal/External, Type of Event, Non-Productive Time, and Non-Productive Time Amount.

## What Changed

The first NCR route was useful but incomplete: it treated NCR primarily as a CAPA-style closure workflow. Tim and Merci's documents clarified that the real center of gravity is larger:

- migrate all 354 historical KPA NCRs into OMP;
- replace KPA as the forward source of truth;
- preserve KPA field detail instead of flattening it;
- let employees submit NCRs directly;
- give Tim analytics that remove the manual Excel cleanup step;
- normalize free-text failure descriptions into trendable failure groups.

The lifecycle work was kept because it is not contradicted by the gospel docs. It now sits around the KPA migration and analytics scope as the governance layer.

## Now Implemented

### KPA Migration Path

- Added a KPA Historical Import workspace in the NCR tab.
- Supports Excel and CSV import previews.
- Maps KPA-style fields into structured OMP NCR fields.
- Preserves the raw source row on every imported NCR.
- Tracks import batches with source system, file name, row counts, errors, imported-by, and timestamps.
- Uses source label `KPA` so historical records remain auditable.

Note: the actual 354-record import still requires the real KPA export file from Tim/KPA.

### KPA Form Parity

The NCR create/edit flow now includes equivalents for the required KPA structure:

- Worksite / Area
- Operator and Location
- Date and Time Event
- Internal / External
- Type of Event
- Critical / Non-Critical
- NPT and cost
- Estimated cost
- Author
- Personnel involved
- Event description
- Root cause code and RCA
- Immediate corrective/preventative action
- Time frame for action
- Permanent corrective action
- Affected departments: Shop, Service, CP, Sales, Automation, etc.
- Date of initial corrective action
- Date permanent action completed
- Date of review
- Date of signoff
- Evidence categories
- Management and reviewer signoffs

### Closure And Accountability

- NCRs now block premature closeout.
- Closure requires owner, reviewer, verifier, root cause, permanent action, completed action items, effectiveness verification, management signoff, and reviewer signoff.
- Native NCR action items remain in place with owner, due date, status, proof/evidence, completion, and audit trail.
- The production verifier proved the closeout gate blocks missing signoffs before allowing closure.

### AI / Trend Analytics Foundation

- Added an NCR Analytics workspace for Tim.
- Added KPA-style breakdowns: failure trend, department/group, event type, root cause, worksite/area, open aging.
- Added first-class KPA baseline report views from Merci's follow-up attachments:
  - Individual NCR CSV
  - Trend
  - Map / Location
  - Observer
  - Employee
  - Worksite / Area
  - Operator and Location
  - Date and Time Event
  - Internal or External Report
  - Type of Event
  - Non-Productive Time
  - Non-Productive Time Amount
- Added provisional failure taxonomy for examples named by Tim/Merci:
  - HRU failure
  - AWC valve failure
  - 710 valve failure
  - Equipment failure
  - Process loss
  - Substandard condition
- Added free-text Tim-style query surface, currently backed by deterministic taxonomy matching.
- Added an authenticated NCR AI analytics API that uses OpenAI when configured and falls back to taxonomy matching when not.
- Added `ncr_failure_codes` so Tim-approved taxonomy/aliases can be managed without losing original text.

Note: until the KPA import and Tim-approved taxonomy are in place, AI answers should be treated as assisted trend analysis rather than final quality reporting.

### Reporting And Outputs

- Kept NCR Detail PDF packet and expanded it with KPA fields, signatures, evidence, actions, and audit trail.
- Added Analytics PDF export.
- Added Excel export with summary and NCR row sheets.
- Kept CSV analytics export and added an Individual CSV export shaped around the KPA individual-results attachment.
- Expanded database schema checks so these reporting and migration surfaces are release-gated.

### Access And Production Readiness

- NCR remains available as a first-class navigation tab.
- All authenticated users can view/create NCRs under current RLS.
- Manager/admin quality controls stay in the detailed workflow.
- Push infrastructure already exists separately and remains aligned with the requirement that team members receive phone alerts.

## Differences From The Earlier Route

| Area | Earlier route | Gospel-aligned route |
| --- | --- | --- |
| Main purpose | CAPA/quality closure workflow | KPA replacement plus migration, analytics, and governance |
| Historical data | Not central | 354 KPA records must import and remain auditable |
| Form fields | Quality lifecycle fields | KPA form parity plus lifecycle fields |
| Analytics | Basic reporting/export | Tim-facing trend analytics and failure taxonomy |
| AI | Not central | Core ask, beginning with taxonomy/alias normalization |
| Output | Detail PDF and CSV | Detail PDF, analytics PDF, Excel, CSV |
| Closure | Mark closed after verifier/effectiveness | Block closure until actions and required signoffs are complete |

## Verification

Local gates:

- `npm run lint` passed.
- `npm run test:unit` passed, 63/63.
- `npm run build` passed.
- `npm run test:schema` passed after applying the release migration.
- `npm run test:pwa` passed, 7 passed / 1 intentionally skipped.
- `npm run test:mobile` ran; current mobile crop tests are configured as 3 skipped.
- `npm audit --omit=dev` passed with 0 vulnerabilities.

Production:

- Supabase release migration applied successfully.
- Vercel production deployed successfully.
- `objectivetracker.net` is aliased to deployment `dpl_6vLok32LikkoQzLHJUy12XRRmZLT`.
- NCR production workflow verification passed with a temporary QA user and report.
- Temporary QA NCR, action items, attachments, audit rows, signatures, profile, and auth user were cleaned up.
- Proof screenshot: `docs/evidence/ncr-lifecycle/ncr-lifecycle-proof-1780522306914-753981.png`.

Production smoke caveat:

- The stock named Jake/Merci smoke remains blocked locally until `SANDPRO_JAKE_EMAIL`, `SANDPRO_JAKE_PASSWORD`, `SANDPRO_MERCI_EMAIL`, and `SANDPRO_MERCI_PASSWORD` are provided.
- This did not block deploy or the temporary-user NCR production verifier.

## Still Needed From Tim / SandPro

- The actual KPA export for the 354 historical NCR records.
- Tim review of the provisional failure taxonomy and aliases.
- Decision on whether signatures must be typed, drawn, or uploaded signed documents for every future NCR.
- Confirmation of exact saved report presets Tim wants first: Shop, Service, CP, Sales, Automation, critical open, overdue open, customer/operator views.
- Tim PWA/push onboarding pass: login, install, enable push, submit sample NCR, receive assignment push, review analytics.

## Recommendation

The NCR module is now pointed in the correct direction. It is no longer just a closure tracker; it is structured to become the KPA replacement Tim described. The next high-value move is importing a real KPA sample batch, reconciling counts/open-closed status against KPA, and letting Tim tune the taxonomy before importing all 354 records.
