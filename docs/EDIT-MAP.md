# EDIT MAP — where the live code actually is

Audited Aug 10, 2026 (full import-graph walk from App.jsx). Two production
incidents came from editing a dead copy; this map is the law until the rebuild
deletes the duplicates. **When in doubt, check this file before editing.**

## The rule of thumb

- Page surfaces → edit `src/routes/*`.
- The ONLY live things in `src/pages.jsx`: **GlobalKpiStrip (~744–947)** and
  **CreateWizardModal (~975–1390)** + their helpers (DueHorizonStrip,
  isOkrSheetObjective, eventHasDraggedFiles/getDroppedFiles,
  FIXIT_COMMON_FILE_ACCEPT, GLOBAL_KPI_* consts). Everything else in
  pages.jsx is dead.
- SuperCard and everything inside the card → `src/objectiveDetail.jsx`.
- Shared widgets (ProgressBar, KPICard, ObjectiveCard, EmptyState, …) →
  `src/sharedWidgets.jsx` (components.jsx/objectiveDetail.jsx only re-export).
- `src/components.jsx` is live ONLY for: ObjectiveFormModal, DailyBrief,
  BriefErrorBoundary, the ToastContainer wrapper. Lines ~90–701 are orphaned
  dead SuperCard helpers.

## Route shims (the import points somewhere else)

- routes/GlobalKpiStrip.jsx → re-exports from **pages.jsx** (pages copy LIVE)
- routes/CreateWizardModal.jsx → re-exports from **pages.jsx** (pages copy LIVE)
- routes/AdminSidebar.jsx → re-exports from **routes/OrgPage.jsx:~2542**

## Dead twins (NEVER edit these copies)

pages.jsx dead twins of live routes/* code: DashboardPage, DashboardListView,
AgingPill, aging helpers (DASHBOARD_AGING_BUCKETS/daysUntilDue/rowMatchesAging),
the entire Alt-dashboard family, ObjectivesPage + its filter constants,
DueDatePill/PriorityBadge. components.jsx dead twins of objectiveDetail.jsx
code: MessageReactions family, VoiceNote components, FilesTab,
ProjectArtifactRow/ProjectAssessmentPanel (also a THIRD dead copy of those two
in sharedWidgets.jsx:457–723).

## MULTI-LIVE duplicates — a fix here must land in EVERY listed copy

1. eventHasDraggedFiles + getDroppedFiles — pages.jsx:144, objectiveDetail.jsx:2147,
   routes/FixItFeedPage.jsx:25, routes/NcrPage.jsx:46 (**4 live copies**)
2. escapeExportHtml — routes/NcrPage.jsx, routes/ObjectivesPage.jsx,
   routes/OrgPage.jsx (**3 live copies** — escaping fixes ×3)
3. loadWriteXlsxFile — routes/NcrPage.jsx, routes/ObjectivesPage.jsx, routes/OrgPage.jsx
4. isOkrSheetObjective — pages.jsx:76 (wizard) vs routes/OkrPage.jsx:8 (sheet —
   already has extra logic; verify intent before syncing)
5. FIXIT_COMMON_FILE_ACCEPT — pages.jsx:161 vs routes/FixItFeedPage.jsx:65
6. Clipboard helpers (nameClipboardFile/getClipboardFiles/extensionForMime) —
   FixItFeedPage.jsx vs NcrPage.jsx
7. NCR normalizers (getNcrStageLabel/normalizeNcrYesNo/getNcrDepartmentValue) —
   NcrPage.jsx vs OrgPage.jsx
8. writeDraft — components.jsx:40 vs objectiveDetail.jsx:47

## Dead-code deletion gate

pages.jsx holds a 4,379-line commented block (3062–7440) + ~2,240 unreachable
lines. tests/unit/release-readiness.test.mjs and kpi-strip-list-coherence
regex-read pages.jsx source — deleting the block requires updating those tests
in the same commit. Scheduled for the rebuild window, not freeze-time.
