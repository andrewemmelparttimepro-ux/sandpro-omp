export class SignedStorageUrlError extends Error {
  constructor(message, { code = 'SIGNED_URL_FAILED', status = 0, bucket, path, cause } = {}) {
    super(message, { cause });
    this.name = 'SignedStorageUrlError';
    this.code = code;
    this.status = status;
    this.bucket = bucket;
    this.path = path;
  }
}

const withTimeout = (promise, timeoutMs, bucket, path) => new Promise((resolve, reject) => {
  const timer = globalThis.setTimeout(() => reject(new SignedStorageUrlError(
    `Timed out creating a secure link after ${timeoutMs}ms.`,
    { code: 'CLIENT_TIMEOUT', bucket, path },
  )), timeoutMs);
  Promise.resolve(promise).then(
    (value) => { globalThis.clearTimeout(timer); resolve(value); },
    (error) => { globalThis.clearTimeout(timer); reject(error); },
  );
});

const normalizeFailure = (error, bucket, path) => {
  if (error instanceof SignedStorageUrlError) return error;
  const status = Number(error?.statusCode || error?.status || 0) || 0;
  return new SignedStorageUrlError(
    error?.message || 'Storage did not return a secure link.',
    {
      code: error?.code || error?.error || 'SIGNED_URL_FAILED',
      status,
      bucket,
      path,
      cause: error,
    },
  );
};

const isRetryable = (error) => (
  error.code === 'CLIENT_TIMEOUT'
  || error.status === 0
  || error.status >= 500
  || error.code === 'InternalError'
  || error.code === 'DatabaseTimeout'
);

export const createSignedStorageUrl = async ({
  client,
  bucket,
  path,
  expiresIn = 60 * 60,
  options,
  timeoutMs = 10_000,
  attempts = 2,
}) => {
  if (!path) throw new SignedStorageUrlError('This file has no storage path.', {
    code: 'MISSING_STORAGE_PATH', bucket, path,
  });

  let lastFailure = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { data, error } = await withTimeout(
        client.storage.from(bucket).createSignedUrl(path, expiresIn, options),
        timeoutMs,
        bucket,
        path,
      );
      if (error) throw error;
      if (data?.signedUrl) return data.signedUrl;
      throw new SignedStorageUrlError('Storage returned no secure link.', {
        code: 'EMPTY_SIGNED_URL', bucket, path,
      });
    } catch (error) {
      lastFailure = normalizeFailure(error, bucket, path);
      if (attempt >= attempts || !isRetryable(lastFailure)) break;
    }
  }
  throw lastFailure;
};
