import { createClient, navigatorLock } from '@supabase/supabase-js';

const cleanEnvValue = (value) => String(value || '').trim();

const isRecoverableNavigatorLockError = (error) => Boolean(
  error?.isAcquireTimeout
  || /lock broken by another request with the ['"]steal['"] option/i.test(String(error?.message || ''))
  || /released because another request stole it/i.test(String(error?.message || ''))
);

// Auth-token access runs under a cross-tab Web Lock. Under contention (a
// second open tab, or a token refresh crawling on bad Wi-Fi) a waiting call
// steals the lock after 10s and the victim call throws
// NavigatorLockAcquireTimeoutError — which surfaced raw to users on go-live
// morning (Malcolm, 8/5). A stolen acquire is safe to retry: the token fetch
// happens before any request is sent, so nothing has hit the network yet.
// acquireTimeout === 0 calls are non-blocking by design (auto-refresh tick
// skips when busy) and must not retry.
const resilientNavigatorLock = async (name, acquireTimeout, fn) => {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await navigatorLock(name, acquireTimeout, fn);
    } catch (error) {
      if (acquireTimeout === 0 || !isRecoverableNavigatorLockError(error)) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1) + Math.floor(Math.random() * 80)));
    }
  }
  throw lastError;
};

const supportsWebLocks = typeof globalThis !== 'undefined' && Boolean(globalThis.navigator?.locks);

const supabaseUrl = cleanEnvValue(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = cleanEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      ...(supportsWebLocks ? { lock: resilientNavigatorLock } : {}),
    },
  }
);

export default supabase;
