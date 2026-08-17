import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createOutbox, makeMemoryAdapter, isNetworkError } from '../../src/lib/outbox.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Over-The-Top item 2: the offline field outbox.

test('network failures stay queued and retry; real rejections stop and surface', async () => {
  const outbox = createOutbox(makeMemoryAdapter());
  await outbox.enqueue({ kind: 'task', title: 'Check pump 3', payload: { title: 'Check pump 3' } });
  await outbox.enqueue({ kind: 'task', title: 'Bad payload', payload: {} });

  let attempts = 0;
  const senders = {
    task: async (item) => {
      attempts += 1;
      if (item.title === 'Check pump 3' && attempts === 1) throw new TypeError('Failed to fetch');
      if (item.title === 'Bad payload') throw new Error('title is required');
    },
  };

  const failures = [];
  const first = await outbox.drain(senders, { onFailed: (item) => failures.push(item.title) });
  assert.equal(first.sent, 0, 'network failure sends nothing');
  assert.equal(failures.length, 1, 'real rejection surfaces once');
  const afterFirst = await outbox.list();
  assert.equal(afterFirst.find((i) => i.title === 'Check pump 3').status, 'queued', 'network failure stays queued');
  assert.equal(afterFirst.find((i) => i.title === 'Bad payload').status, 'failed', 'real rejection marks failed');

  const sent = [];
  const second = await outbox.drain(senders, { onSent: (item) => sent.push(item.title) });
  assert.equal(second.sent, 1, 'retry delivers the queued item');
  assert.deepEqual(sent, ['Check pump 3']);
  const remaining = await outbox.list();
  assert.equal(remaining.length, 1, 'failed item awaits human review');

  await outbox.retryFailed(remaining[0].id);
  assert.equal((await outbox.list())[0].status, 'queued', 'retryFailed re-queues');
  await outbox.discard(remaining[0].id);
  assert.equal((await outbox.list()).length, 0, 'discard empties the queue');
});

test('files ride along with their queued item', async () => {
  const outbox = createOutbox(makeMemoryAdapter());
  const item = await outbox.enqueue({ kind: 'ncr', title: 'NCR 999', payload: { reportNumber: '999' } });
  await outbox.attachFiles(item.id, [{ name: 'photo.jpg', type: 'image/jpeg', blob: 'BLOB' }]);
  const [stored] = await outbox.list();
  assert.equal(stored.files.length, 1);
  assert.equal(stored.files[0].name, 'photo.jpg');
});

test('isNetworkError separates jobsite reality from real errors', () => {
  assert.equal(isNetworkError(new TypeError('Failed to fetch')), true);
  assert.equal(isNetworkError(new Error('NetworkError when attempting to fetch resource')), true);
  assert.equal(isNetworkError(new Error('objectives fetch timed out')), true);
  assert.equal(isNetworkError(new Error('title is required')), false);
  assert.equal(isNetworkError(new Error('invalid input syntax for type boolean')), false);
});

test('IndexedDB outbox reopens once when mobile Safari closes its cached connection', () => {
  const lib = read('src/lib/outbox.js');
  assert.match(lib, /db\.onclose = \(\) => \{ dbPromise = null; \}/);
  assert.match(lib, /database connection is closing\|database connection is closed\|invalidstateerror/i);
  assert.match(lib, /return tx\(mode, fn, false\)/);
});

test('the outbox is wired: create paths queue on network failure, chip renders, drain runs', () => {
  const app = read('src/App.jsx');
  assert.match(app, /const fieldOutbox = createOutbox\(\)/);
  assert.match(app, /if \(!isNetworkError\(error\)\) throw error;/);
  assert.match(app, /fieldOutbox\.enqueue\(\{ kind: 'task'/);
  assert.match(app, /fieldOutbox\.enqueue\(\{\s*\n?\s*kind: 'ncr'/);
  assert.match(app, /window\.addEventListener\('online', drainOutbox\)/);
  assert.match(app, /<OutboxChip outbox=\{fieldOutbox\} onDrainNow=\{drainOutbox\} \/>/);

  const ncr = read('src/routes/NcrPage.jsx');
  assert.match(ncr, /if \(created\?\.queued\) \{/);
  assert.match(ncr, /onQueueNcrFiles\?\.\(created\.outboxId/);
});
