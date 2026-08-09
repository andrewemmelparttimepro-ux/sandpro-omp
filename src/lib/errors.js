// Error classification + user-facing message mapping.
//
// Users must never see raw internal errors (auth lock internals, fetch
// failures, PostgREST/JWT codes). Classify what we can, keep genuinely
// human-written messages untouched, and fall back to the caller's copy
// for everything else.

export const CONNECTION_HICCUP_MESSAGE =
  'Connection hiccup — nothing was lost. Please try again.';

export const GENERIC_FAILURE_MESSAGE =
  'Something went wrong on our side. Please try again.';

// Transient connection-class failures: safe to present as "try again".
const TRANSIENT_PATTERNS = [
  /lock broken by another request with the ['"]steal['"] option/i, // auth-js Web Lock steal victim
  /released because another request stole it/i, // auth-js Web Lock steal victim
  /navigator lockmanager/i,
  /acquiring an exclusive navigator/i,
  /process lock with name .* timed out/i,
  /abort ?error/i,
  /failed to fetch/i, // Chrome offline / dropped request
  /networkerror when attempting/i, // Firefox
  /\bload failed\b/i, // Safari fetch failure ("Load failed"); \b keeps "Upload failed" out
  /network request failed/i,
];

// Internal jargon that should never reach a banner, but isn't a simple
// connection blip — swap for the caller's fallback copy.
const INTERNAL_PATTERNS = [
  /jwt/i,
  /pgrst\d+/i,
  /@supabase/i,
  /^typeerror/i,
  /is not a function/i,
  /undefined is not an object/i,
  /cannot read propert/i,
  /minified react error/i,
  /duplicate key value/i,
  /violates .* constraint/i,
  /invalid input syntax/i,
  /lock:sb-/i,
];

export const isTransientConnectionError = (error) => {
  if (!error) return false;
  if (error.isAcquireTimeout) return true;
  if (error.name === 'AbortError') return true;
  const message = typeof error === 'string' ? error : error.message;
  return typeof message === 'string' && TRANSIENT_PATTERNS.some((re) => re.test(message));
};

const looksInternal = (message) => INTERNAL_PATTERNS.some((re) => re.test(message));

export const humanizeErrorMessage = (rawMessage, fallback = GENERIC_FAILURE_MESSAGE) => {
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
  if (!message) return fallback;
  if (TRANSIENT_PATTERNS.some((re) => re.test(message))) return CONNECTION_HICCUP_MESSAGE;
  if (looksInternal(message)) return fallback;
  return message;
};

export const humanizeError = (error, fallback = GENERIC_FAILURE_MESSAGE) => {
  if (isTransientConnectionError(error)) return CONNECTION_HICCUP_MESSAGE;
  return humanizeErrorMessage(error?.message || (typeof error === 'string' ? error : ''), fallback);
};
