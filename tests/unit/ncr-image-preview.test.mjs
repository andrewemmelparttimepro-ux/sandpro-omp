import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  getNcrFileMimeType,
  isNcrImageAttachment,
  NCR_IMAGE_PREVIEW_TRANSFORM,
} from '../../src/lib/ncrFiles.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('HEIC uploads are recognized as images even when the browser reports an opaque MIME type', () => {
  const heic = { name: 'IMG_3376.HEIC', type: 'application/octet-stream' };

  assert.equal(getNcrFileMimeType(heic), 'image/heic');
  assert.equal(isNcrImageAttachment(heic), true);
  assert.deepEqual(NCR_IMAGE_PREVIEW_TRANSFORM, {
    width: 1200,
    resize: 'contain',
    quality: 82,
  });
});

test('NCR image display signs a transformed preview but file opening keeps the original', () => {
  const hook = read('src/hooks/useSupabase.js');
  const route = read('src/routes/NcrPage.jsx');

  assert.match(hook, /preview && isNcrImageAttachment\(file\)/);
  assert.match(hook, /\{ transform: NCR_IMAGE_PREVIEW_TRANSFORM \}/);
  assert.match(hook, /contentType: uploadMimeType/);
  assert.match(hook, /mime_type: uploadMimeType/);
  assert.match(route, /resolveNcrFileUrl\(file, \{ preview: true \}\)/);
  assert.match(route, /resolveNcrFileUrl\(file, \{ required: true \}\)/);
  assert.match(route, /Loading picture…/);
  assert.match(route, /Preview unavailable — open file/);
});
