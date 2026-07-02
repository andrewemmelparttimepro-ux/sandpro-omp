# Onboarding Tim's NCR Data — the Path

Updated 2026-07-02. Owner: Andrew. Audience: Tim (and whoever runs the import).

## The short version

Tim has two lanes, and Lane 1 is less work for him:

- **Lane 1 (preferred): send whatever you already have.** Any Excel/CSV export,
  any column names, as-is. We map the columns once and run the import. Tim does
  zero reformatting.
- **Lane 2: fill the template.** `SandPro-NCR-Import-Template.xlsx` — one row
  per NCR, orange columns required, dropdowns locked to valid values. Use this
  only for NCRs that don't exist in any system yet.

Either way the data enters through the same pipeline, with the same safety
rails, and Tim can re-send corrected files as many times as he wants without
creating duplicates.

## Why this is safe to run repeatedly

- **Report Number is the dedupe key.** Importing a number that already exists
  *replaces* that record instead of duplicating it. Preview labels every row
  `Create new` or `Replace existing` before anything is written.
- **Nothing imports blind.** The KPA Import tab parses the file into a preview
  table first — a human looks at it, filters it, then clicks import.
- **Main Department can't be wrong, only missing.** If a row carries a valid
  Main Department (or its group maps deterministically), it's used. If not,
  the record lands in the **Dept triage** queue where the app suggests a
  department from the record's own text and a human confirms. Guessing is
  structurally impossible.
- **Counts reconcile.** Rows in file = created + replaced + rejected (rejected
  rows are missing report number/description — fix and re-send just those).

## Step-by-step (whoever runs it)

1. objectivetracker.net → **NCR** → **KPA Import** tab.
2. Upload Tim's file. Read the preview: check the Main Department column —
   rows showing "→ triage" will need a confirm later (that's fine).
3. Click import. Note the created/replaced counts against the file's row count.
4. Open **Dept triage** (tab appears if anything is unassigned) and confirm
   the suggestions — bulk-approve the high-confidence ones.
5. Spot-check 3–5 records in the Tracker against Tim's original file.

## The cutover (the actual goal)

The import is a one-time backfill, not a workflow. Once Tim's historical data
is in:

1. **Tim stops maintaining the spreadsheet.** New NCRs go in through the app —
   the Create NCR form now requires Main Department and channels everything
   correctly at entry, on desktop or phone.
2. The spreadsheet becomes read-only archive. If two systems stay live in
   parallel, they *will* drift and someone will have to reconcile them by hand
   — this is the one failure mode that has no tooling fix.
3. If Tim wants a spreadsheet view back out, the app's export section produces
   one from live data — the flow is app → spreadsheet, never spreadsheet → app
   again after backfill.

## Files

- Template: `SandPro-NCR-Import-Template.xlsx` (Andrew's Desktop; send to Tim
  for Lane 2).
- Import column mapping: `transformImportedNcrRow` in `src/pages.jsx` — header
  matching is case/punctuation-insensitive; add candidate strings there when
  mapping a new raw file for Lane 1.
