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
