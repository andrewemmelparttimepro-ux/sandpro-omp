import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('new NCR creation supports queued photo evidence', () => {
  const pages = read('src/pages.jsx');
  const styles = read('src/index.css');

  assert.match(pages, /NCR_PHOTO_ACCEPT = 'image\/\*,\.heic,\.heif'/);
  assert.match(pages, /createEvidenceFiles/);
  assert.match(pages, /ncr-create-photo-drop/);
  assert.match(pages, /Drop photos here or add them before creating the NCR/);
  assert.match(pages, /ncr-mobile-photo-entry/);
  assert.match(pages, /openCreateModalForPhotos/);
  assert.match(pages, /capture="environment"/);
  assert.match(pages, /onUploadAttachment\(created\.id, file, currentUser\?\.id, 'pictures'\)/);
  assert.match(styles, /\.ncr-create-photo-drop/);
  assert.match(styles, /\.ncr-create-photo-chip/);
  assert.match(styles, /\.ncr-mobile-photo-entry/);
});

test('NCR detail rail exposes event photo thumbnails and picture upload', () => {
  const pages = read('src/pages.jsx');
  const styles = read('src/index.css');

  assert.match(pages, /const NcrEventPhotoStrip/);
  assert.match(pages, /Event photos/);
  assert.match(pages, /getNcrImageFiles\(report\)/);
  assert.match(pages, /onUpload\?\.\(event, 'pictures'\)/);
  assert.match(pages, /<NcrEventPhotoStrip report=\{selectedReport\}/);
  assert.match(styles, /\.ncr-event-photos/);
  assert.match(styles, /\.ncr-event-photo-thumb/);
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
