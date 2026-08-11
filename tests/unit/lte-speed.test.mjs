import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canUseSnapshotBoot, SNAPSHOT_BOOT_PILOT_EMAILS } from '../../src/data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Over-The-Top item 12: sub-second work on LTE. Snapshot boot, first-paint
// skeleton, cache-first immutable assets, optimistic complete.

test('hashed assets are cache-first in the SW — the bundle downloads once', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /CACHE_NAME = 'sandpro-omp-shell-v13'/);
  assert.match(sw, /url\.pathname\.startsWith\('\/assets\/'\)/);
  assert.match(sw, /caches\.match\(request\)\.then\(\(hit\) => hit \|\| fetch\(request\)/);
  // Navigations stay network-first; the heartbeat stays uncached.
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /version\.json/);
});

test('the first paint carries a skeleton, not a blank page', () => {
  const html = read('index.html');
  assert.match(html, /omp-shimmer/);
  assert.match(html, /<div id="root"><div/);
});

test('snapshot boot: eligible returning users paint the last-good board instantly', () => {
  const lib = read('src/lib/snapshotBoot.js');
  assert.match(lib, /MAX_AGE_MS = 7 \* 24 \* 3600000/);
  assert.match(lib, /export const clearSnapshot/);
  const hook = read('src/hooks/useSupabase.js');
  assert.match(hook, /snapshotEligible\(userId\)/);
  assert.match(hook, /objectivesLoadedRef\.current\) return;[\s\S]{0,200}?setObjectives\(snapshot\.objectives\)/);
  assert.match(hook, /snapshotEligible\(currentUserId\)/, 'the snapshot refreshes after real pulls');
  // Sign-out clears the cached board — field tablets get shared.
  const app = read('src/App.jsx');
  assert.match(app, /await clearSnapshot\(profile\.id\);/);
  assert.match(app, /setSnapshotEligibility\(profile\.id, canUseSnapshotBoot\(profile, snapshotBootForAll\)\)/);
});

test('snapshot boot is pilot-gated until the flag opens it', () => {
  assert.ok(SNAPSHOT_BOOT_PILOT_EMAILS.includes('andrew@ndai.pro'));
  assert.ok(canUseSnapshotBoot({ email: 'release-smoke-admin@objectivetracker.net' }, false));
  assert.ok(!canUseSnapshotBoot({ email: 'mjimenez@sandpro.com' }, false));
  assert.ok(canUseSnapshotBoot({ email: 'mjimenez@sandpro.com' }, true));
});

test('one-tap complete is optimistic: toast now, write behind, honest revert', () => {
  const app = read('src/App.jsx');
  assert.match(app, /patchObjectiveLocal\(obj\.id, \{ status: 'completed', progress: 100 \}\);[\s\S]{0,400}?addToast\(\{ type: 'success'/);
  assert.match(app, /patchObjectiveLocal\(obj\.id, \{ status: prevStatus, progress: prevProgress \}\);/);
  assert.match(app, /did not save — the row is back/);
  const hook = read('src/hooks/useSupabase.js');
  assert.match(hook, /const patchObjectiveLocal = useCallback/);
});
