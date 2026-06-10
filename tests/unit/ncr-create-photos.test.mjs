import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('new NCR creation supports queued photo and document evidence', () => {
  const pages = read('src/pages.jsx');
  const styles = read('src/index.css');

  assert.match(pages, /NCR_PHOTO_ACCEPT = 'image\/\*,\.heic,\.heif'/);
  assert.match(pages, /const NCR_DOCUMENT_ACCEPT = \[/);
  assert.match(pages, /const NCR_EVIDENCE_ACCEPT = `\$\{NCR_PHOTO_ACCEPT\},\$\{NCR_DOCUMENT_ACCEPT\}`/);
  assert.match(pages, /const isNcrEvidenceAttachment/);
  assert.match(pages, /createEvidenceFiles/);
  assert.match(pages, /ncr-create-photo-drop/);
  assert.match(pages, /Drop photos, PDFs, spreadsheets, or support docs here before creating the NCR/);
  assert.match(pages, /Photos \+ documentation/);
  assert.match(pages, /Add docs/);
  assert.match(pages, /ncr-mobile-photo-entry/);
  assert.match(pages, /Take \/ add photo or doc to NCR/);
  assert.match(pages, /openCreateModalForPhotos/);
  assert.match(pages, /capture="environment"/);
  assert.match(pages, /getNcrAttachmentPurpose\(file\)/);
  assert.match(pages, /accept=\{NCR_DOCUMENT_ACCEPT\}/);
  assert.match(styles, /\.ncr-create-photo-drop/);
  assert.match(styles, /\.ncr-create-photo-actions/);
  assert.match(styles, /\.ncr-create-photo-chip/);
  assert.match(styles, /\.ncr-mobile-photo-entry/);
});

test('NCR detail rail exposes event photo thumbnails and picture upload', () => {
  const pages = read('src/pages.jsx');
  const styles = read('src/index.css');

  assert.match(pages, /const NcrEventPhotoStrip/);
  assert.match(pages, /Event photos \+ docs/);
  assert.match(pages, /getNcrImageFiles\(report\)/);
  assert.match(pages, /getNcrDocumentFiles\(report\)/);
  assert.match(pages, /onUpload\?\.\(event, 'pictures'\)/);
  assert.match(pages, /onUpload\?\.\(event, 'evidence'\)/);
  assert.match(pages, /Photos \+ Documentation/);
  assert.match(pages, /<NcrEventPhotoStrip report=\{selectedReport\}/);
  assert.match(styles, /\.ncr-event-photos/);
  assert.match(styles, /\.ncr-event-photo-thumb/);
  assert.match(styles, /\.ncr-event-doc-file/);
});

test('NCR header section is not branded as KPA-only', () => {
  const pages = read('src/pages.jsx');
  const glossary = read('src/glossaryData.js');

  assert.match(pages, /<h3>Header \+ Classification<\/h3>/);
  assert.doesNotMatch(pages, /KPA Header \+ Classification/);
  assert.doesNotMatch(pages, /<span>Failure Taxonomy<\/span>/);
  assert.doesNotMatch(pages, /failure taxonomy updated/);
  assert.match(glossary, /term: 'Failure Grouping'/);
  assert.doesNotMatch(glossary, /term: 'Failure Taxonomy'/);
});

test('NCR intake requires primary group affected and highlights mandatory fields', () => {
  const pages = read('src/pages.jsx');
  const styles = read('src/index.css');
  const glossary = read('src/glossaryData.js');

  assert.match(pages, /const NCR_CREATE_REQUIRED_FIELDS = \[/);
  assert.match(pages, /Primary group affected/);
  assert.match(pages, /Primary Group Affected/);
  assert.match(pages, /getMissingNcrRequiredFields/);
  assert.match(pages, /getNcrPrimaryGroupValue/);
  assert.match(pages, /mergeNcrPrimaryGroup/);
  assert.match(pages, /Complete required NCR fields/);
  assert.match(pages, /Complete required fields before creating:/);
  assert.match(pages, /disabled=\{creating \|\| createMissingRequiredFields\.length > 0\}/);
  assert.match(pages, /\.\.\.getMissingNcrRequiredFields\(report\)\.map\(field => `\$\{field\.label\} is required\.`\)/);
  assert.match(styles, /\.ncr-required-label/);
  assert.match(styles, /\.ncr-required-field/);
  assert.match(styles, /\.ncr-required-missing/);
  assert.match(styles, /\.ncr-required-summary/);
  assert.match(glossary, /term: 'Primary Group Affected'/);
});

test('selected NCR detail panel mirrors create NCR fields and remounts by selected record', () => {
  const pages = read('src/pages.jsx');

  assert.match(pages, /<aside key=\{selectedReport\?\.id \|\| 'empty'\} className="card ncr-detail-panel">/);
  assert.match(pages, /<h3>Report Details<\/h3>/);
  assert.match(pages, /<NcrRequiredLabel>Report Number<\/NcrRequiredLabel>/);
  assert.match(pages, /<NcrRequiredLabel>Report Date<\/NcrRequiredLabel>/);
  assert.match(pages, /<NcrRequiredLabel>Observer<\/NcrRequiredLabel>/);
  assert.match(pages, /<NcrRequiredLabel>Author<\/NcrRequiredLabel>/);
  assert.match(pages, /<span>Source Sheet<\/span>/);
  assert.match(pages, /<span>Source Link<\/span>/);
  assert.match(pages, /<span>Personnel Involved<\/span>/);
  assert.match(pages, /<span>NPT<\/span><select value=\{selectedReport\.nonProductiveTime/);
  assert.match(pages, /<span>NPT Amount<\/span>/);
  assert.match(pages, /<span>Time Frame for Action<\/span>/);
  assert.match(pages, /<span>Follow-Up Count<\/span>/);
  assert.match(pages, /<span>Follow-Up Due Date<\/span>/);
  assert.match(pages, /follow-up details updated/);
  assert.match(pages, /<span>Date of Initial Corrective Action<\/span>/);
  assert.match(pages, /<span>Permanent Action Completed<\/span>/);
  assert.match(pages, /long-term follow-up updated/);
});

test('manual NCR creation auto-sequences report numbers and keeps root cause as one dropdown', () => {
  const pages = read('src/pages.jsx');
  const styles = read('src/index.css');

  assert.match(pages, /const getNextNcrReportNumber/);
  assert.match(pages, /reportNumber: getNextNcrReportNumber\(reports\)/);
  assert.match(pages, /setCreateDraft\(buildDefaultNcrDraft\(currentUser, reports\)\)/);
  assert.match(pages, /Use next NCR report number/);
  assert.match(pages, /<span>Root Cause Analysis<\/span>\s*<select/);
  assert.match(pages, /rootCauseCodes: event\.target\.value,[\s\S]*rootCauseAnalysis: event\.target\.value/);
  assert.doesNotMatch(pages, /<span className="text-xs text-muted">Root Cause Analysis<\/span><textarea/);
  assert.match(styles, /\.ncr-report-number-field/);
  assert.match(styles, /\.ncr-root-cause-grid/);
});

test('NCR effectiveness fields use standard controlled yes/no outcomes', () => {
  const pages = read('src/pages.jsx');
  const hook = read('src/hooks/useSupabase.js');

  assert.match(pages, /const NCR_YES_NO_OPTIONS = \['Yes', 'No'\]/);
  assert.match(pages, /const normalizeNcrYesNo/);
  assert.match(pages, /<span>Action Effective\?<\/span><NcrYesNoSelect/);
  assert.match(pages, /Action effective yes\/no decision is required\./);
  assert.match(pages, /Action is marked not effective; revise the corrective action before closure\./);
  assert.doesNotMatch(pages, /<span className="text-xs text-muted">Action Effective<\/span><textarea/);
  assert.match(pages, /actionEffective: normalizeNcrYesNo\(report\.actionEffective\)/);
  assert.match(pages, /'Action Effective\?'/);
  assert.match(hook, /recurrence_prevented: draft\.recurrencePrevented \?\? null/);
  assert.match(hook, /effectiveness_checked_at: draft\.effectivenessCheckedAt \|\| null/);
});
