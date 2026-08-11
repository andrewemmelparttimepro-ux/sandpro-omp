import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Over-The-Top item 5: Undo everywhere. The toast system carries a reversal
// on every one-click consequential action; undo-bearing toasts persist long
// enough to act on.

test('the toast system carries and renders an undo action', () => {
  const app = read('src/App.jsx');
  // Undo-bearing toasts get the 10s lifespan, not the 4s default.
  assert.match(app, /entry\?\.undo \? 10000 : 4000/);

  const widgets = read('src/sharedWidgets.jsx');
  assert.match(widgets, /t\.undo &&/);
  assert.match(widgets, /className="toast-undo"/);
  assert.match(widgets, /try \{ t\.undo\(\); \} finally \{ removeToast\(t\.id\); \}/);
  assert.match(widgets, /RotateCcw/);

  const styles = read('src/index.css');
  assert.match(styles, /\.toast-undo \{/);
});

test('every one-click consequential action offers a real reversal', () => {
  const app = read('src/App.jsx');
  // One-tap complete restores the prior status/progress.
  assert.match(app, /addToast\(\{ type: 'success', message: `"\$\{obj\.title\}" completed`, undo: \(\) => handleUpdateCard\(\{ \.\.\.obj, status: prevStatus, progress: prevProgress/);
  // Card delete snapshots and recreates (fields + subtasks).
  assert.match(app, /const snapshot = objectives\.find\(obj => obj\.id === id\)/);
  assert.match(app, /undo: snapshot \? async \(\) => \{\s*const recreated = await createObjective/);
  assert.match(app, /for \(const st of snapshot\.subtasks \|\| \[\]\)/);

  const detail = read('src/objectiveDetail.jsx');
  // Card status change reverts to the prior status.
  assert.match(detail, /undo: \(\) => doUpdate\(\{\s*status: prevStatus,\s*progress: prevProgress/);
  // Subtask delete re-adds the removed subtask.
  assert.match(detail, /undo: addSubtask \? async \(\) => \{\s*await addSubtask\(localObj\.id, \{\s*title: removed\.title/);
});

test('undo restores travel the explicit _restore lane, not the stale diff', () => {
  // Item 6's production gauntlet caught this: an undo resubmits the PRIOR
  // value, handleUpdateCard diffs it against objectives captured before the
  // action, sees "no change", and silently writes nothing. The restore lane
  // declares intent; updateObjective still diffs against the live server row.
  const app = read('src/App.jsx');
  assert.match(app, /if \(updated\._restore\) \{/);
  assert.match(app, /changes\.status = updated\.status;\s*changes\.progress = updated\.progress;/);
  // One-tap complete undo declares the restore.
  assert.match(app, /undo: \(\) => handleUpdateCard\(\{ \.\.\.obj, status: prevStatus, progress: prevProgress, _restore: true/);

  // Card status-change undo declares the restore too.
  const detail = read('src/objectiveDetail.jsx');
  assert.match(detail, /status: prevStatus,\s*progress: prevProgress,[\s\S]{0,300}?_restore: true/);
});

test('post-write refetches never dedupe into the boot window', () => {
  // Second half of the same gauntlet catch: the restore reached the server,
  // but the follow-up refetch started inside the 2.5s boot-dedupe window and
  // silently returned null — the UI never observed the write. Only the mount
  // effect may dedupe; every explicit refetch pulls, waiting out any
  // in-flight pull that may predate the commit.
  const hook = read('src/hooks/useSupabase.js');
  assert.match(hook, /if \(dedupeBoot && Date\.now\(\) - lastObjectivesFetchAtRef\.current < 2500\) return null;/);
  assert.match(hook, /useEffect\(\(\) => \{ fetchObjectives\(\{ dedupeBoot: true \}\); \}, \[fetchObjectives\]\);/);
  assert.match(hook, /await inFlightFetchRef\.current\.catch\(\(\) => \{\}\);/);
});

test('destructive dialogs tell the truth about undo (partial vs full)', () => {
  const detail = readFileSync(join(root, 'src/objectiveDetail.jsx'), 'utf8');
  // No dialog claims the flat falsehood anymore.
  assert.doesNotMatch(detail, /This cannot be undone/);
  // Subtask delete is fully undoable.
  assert.match(detail, /from this objective\? You'll have ten seconds to undo/);
  // Objective delete is honest that undo is partial.
  assert.match(detail, /not its message history or files/);
});
