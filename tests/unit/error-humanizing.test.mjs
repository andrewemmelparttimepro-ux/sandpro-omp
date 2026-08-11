import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONNECTION_HICCUP_MESSAGE,
  GENERIC_FAILURE_MESSAGE,
  humanizeError,
  humanizeErrorMessage,
  isTransientConnectionError,
} from '../../src/lib/errors.js';

test('the go-live lock-steal error never reaches a user raw', () => {
  const malcolm = 'Lock "lock:sb-whgrkfhuzgwmbelocnhq-auth-token" was released because another request stole it';
  assert.equal(humanizeErrorMessage(malcolm), CONNECTION_HICCUP_MESSAGE);
  const err = new Error(malcolm);
  err.isAcquireTimeout = true;
  assert.ok(isTransientConnectionError(err));
  assert.equal(humanizeError(err, 'Could not create. Try again.'), CONNECTION_HICCUP_MESSAGE);
});

test('the current auth-js lock-broken variant is also treated as transient', () => {
  const current = "Lock broken by another request with the 'steal' option.";
  assert.equal(isTransientConnectionError(new Error(current)), true);
  assert.equal(humanizeErrorMessage(current), CONNECTION_HICCUP_MESSAGE);
});

test('the short auth-js stolen-lock variant is also treated as transient', () => {
  const current = 'Lock was stolen by another request';
  assert.equal(isTransientConnectionError(new Error(current)), true);
  assert.equal(humanizeErrorMessage(current), CONNECTION_HICCUP_MESSAGE);
});

test('fetch failures read as connection hiccups', () => {
  assert.equal(humanizeErrorMessage('Failed to fetch'), CONNECTION_HICCUP_MESSAGE);
  assert.equal(humanizeErrorMessage('Load failed'), CONNECTION_HICCUP_MESSAGE);
  assert.equal(humanizeErrorMessage('NetworkError when attempting to fetch resource.'), CONNECTION_HICCUP_MESSAGE);
  assert.equal(humanizeErrorMessage('AbortError: The operation was aborted.'), CONNECTION_HICCUP_MESSAGE);
});

test('internal jargon swaps to fallback copy', () => {
  assert.equal(humanizeErrorMessage('JWT expired'), GENERIC_FAILURE_MESSAGE);
  assert.equal(
    humanizeErrorMessage('duplicate key value violates unique constraint "objectives_pkey"'),
    GENERIC_FAILURE_MESSAGE,
  );
  assert.equal(humanizeErrorMessage('TypeError: x is not a function', 'Could not save.'), 'Could not save.');
  assert.equal(
    humanizeErrorMessage('invalid input syntax for type timestamp with time zone: "NaN-NaN-NaN"'),
    GENERIC_FAILURE_MESSAGE,
  );
});

test('human copy passes through untouched', () => {
  assert.equal(
    humanizeErrorMessage('Main OKRs are limited to authorized OKR editors.'),
    'Main OKRs are limited to authorized OKR editors.',
  );
  assert.equal(
    humanizeErrorMessage('2 attachments did not upload. Add from the Files tab.'),
    '2 attachments did not upload. Add from the Files tab.',
  );
  // "Upload failed" must not be mistaken for Safari's "Load failed".
  assert.equal(humanizeErrorMessage('Upload failed: file too large'), 'Upload failed: file too large');
  assert.equal(humanizeErrorMessage(''), GENERIC_FAILURE_MESSAGE);
});
