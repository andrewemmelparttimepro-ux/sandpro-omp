import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

test('NCR closure requires department manager and executive signoff levels', () => {
  const pages = read('src/pages.jsx');
  const styles = read('src/index.css');
  const hook = read('src/hooks/useSupabase.js');

  assert.match(pages, /NCR_DEPARTMENT_MANAGER_SIGNATURE_ROLES = \['department_manager', 'management'\]/);
  assert.match(pages, /NCR_EXECUTIVE_SIGNATURE_ROLES = \['executive', 'final_management'\]/);
  assert.match(pages, /Department manager signoff is required/);
  assert.match(pages, /Executive signoff is required/);
  assert.match(pages, /<option value="department_manager">Department manager signoff<\/option>/);
  assert.match(pages, /<option value="executive">Executive signoff<\/option>/);
  assert.match(pages, /<NcrSignatureLevels report=\{selectedReport\} people=\{people\} \/>/);
  assert.match(styles, /\.ncr-signature-levels/);
  assert.match(styles, /\.ncr-signature-level\.complete/);
  assert.match(hook, /signed_off_by_management_id = payload\.signed_by/);
  assert.match(hook, /final_management_signoff_id = payload\.signed_by/);
});
