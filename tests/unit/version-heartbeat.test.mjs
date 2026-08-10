import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { isNewerBuild } from '../../src/lib/versionHeartbeat.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Three stale-bundle incidents (8/6 subtasks, Andrew's devices, Tim's 8/10
// post-fix retries) motivated the heartbeat: shipped fixes must become
// visible to sessions that are still running the old bundle.

test('isNewerBuild only fires for a strictly newer remote build', () => {
  assert.equal(isNewerBuild('2026-08-10-15:11', '2026-08-10-16:02'), true);
  assert.equal(isNewerBuild('2026-08-10-15:11', '2026-08-10-15:11'), false);
  // A rollback serving an older version.json must never cause a refresh loop.
  assert.equal(isNewerBuild('2026-08-10-15:11', '2026-08-10-00:35'), false);
  assert.equal(isNewerBuild('2026-08-10-15:11', null), false);
  assert.equal(isNewerBuild('2026-08-10-15:11', undefined), false);
  assert.equal(isNewerBuild('dev', '2026-08-10-16:02'), false);
  assert.equal(isNewerBuild('', '2026-08-10-16:02'), false);
});

test('the heartbeat is wired: build emits version.json, app shows the banner, SW stays out of the way', () => {
  const vite = read('vite.config.js');
  assert.match(vite, /writeFileSync\(resolve\('dist', 'version\.json'\)/);
  assert.match(vite, /__OMP_BUILD_ID__: JSON\.stringify\(BUILD_ID\)/);

  const app = read('src/App.jsx');
  assert.match(app, /startVersionHeartbeat\(\(\) => setUpdateReady\(true\)\)/);
  assert.match(app, /update-ready-banner/);
  assert.match(app, /Refresh now/);

  const sw = read('public/sw.js');
  assert.match(sw, /url\.pathname === '\/version\.json'\) return/);

  const styles = read('src/index.css');
  assert.match(styles, /\.update-ready-banner \{/);
});
