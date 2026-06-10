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
  assert.match(pages, /onUploadAttachment\(created\.id, file, currentUser\?\.id, 'pictures'\)/);
  assert.match(styles, /\.ncr-create-photo-drop/);
  assert.match(styles, /\.ncr-create-photo-chip/);
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
