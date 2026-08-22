import assert from 'node:assert/strict';
import test from 'node:test';

import { createSignedStorageUrl, SignedStorageUrlError } from '../../src/lib/ncrFileAccess.js';

const storageClient = (results) => {
  let index = 0;
  return {
    storage: {
      from: () => ({ createSignedUrl: async () => results[index++] }),
    },
    get calls() { return index; },
  };
};

test('secure NCR link retries a transient storage failure', async () => {
  const client = storageClient([
    { data: null, error: { code: 'InternalError', statusCode: 500, message: 'temporary' } },
    { data: { signedUrl: 'https://storage.example/signed' }, error: null },
  ]);
  const url = await createSignedStorageUrl({
    client, bucket: 'ncr-files', path: 'kpa-original/report.pdf', timeoutMs: 50,
  });
  assert.equal(url, 'https://storage.example/signed');
  assert.equal(client.calls, 2);
});

test('secure NCR link does not retry a stable authorization failure', async () => {
  const client = storageClient([
    { data: null, error: { code: 'AccessDenied', statusCode: 403, message: 'denied' } },
  ]);
  await assert.rejects(
    createSignedStorageUrl({ client, bucket: 'ncr-files', path: 'report.pdf', timeoutMs: 50 }),
    (error) => error instanceof SignedStorageUrlError
      && error.code === 'AccessDenied'
      && error.status === 403,
  );
  assert.equal(client.calls, 1);
});

test('secure NCR link returns a typed timeout instead of a generic empty URL', async () => {
  const client = storageClient([new Promise(() => {})]);
  await assert.rejects(
    createSignedStorageUrl({
      client, bucket: 'ncr-files', path: 'report.pdf', timeoutMs: 5, attempts: 1,
    }),
    (error) => error instanceof SignedStorageUrlError && error.code === 'CLIENT_TIMEOUT',
  );
});
