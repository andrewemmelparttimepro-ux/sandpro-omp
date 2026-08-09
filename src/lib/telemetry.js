// Client error telemetry — the app phones home when something breaks.
//
/* global __OMP_BUILD_ID__ */
// Every red toast, unhandled rejection, and window error lands in the
// `client_errors` table (write-only from the client; readable via service
// role only). Telemetry is best-effort and must NEVER throw, block, or
// surface to the user. Per-session dedupe + a hard cap keep it quiet.

import { supabase } from './supabase';

const SESSION_SEND_CAP = 25;
const PER_SIGNATURE_COOLDOWN_MS = 30_000;

const NOISE_PATTERNS = [
  /resizeobserver loop/i,
  /^script error\.?$/i, // cross-origin, zero signal
];

const sentAt = new Map();
let sendCount = 0;
let currentUserId = null;

export const setTelemetryUser = (userId) => {
  currentUserId = userId || null;
};

const buildId = typeof __OMP_BUILD_ID__ !== 'undefined' ? __OMP_BUILD_ID__ : 'dev';

export const reportClientError = (source, message, extra = {}) => {
  try {
    const text = typeof message === 'string' ? message.trim() : String(message || '');
    if (!text || NOISE_PATTERNS.some((re) => re.test(text))) return;
    if (sendCount >= SESSION_SEND_CAP) return;
    const signature = `${source}:${text.slice(0, 200)}`;
    const now = Date.now();
    const last = sentAt.get(signature);
    if (last && now - last < PER_SIGNATURE_COOLDOWN_MS) return;
    sentAt.set(signature, now);
    sendCount += 1;
    const row = {
      source: String(source || 'manual').slice(0, 40),
      message: text.slice(0, 1000),
      stack: extra.stack ? String(extra.stack).slice(0, 4000) : null,
      page: typeof location !== 'undefined' ? `${location.pathname}${location.search}`.slice(0, 300) : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
      context: extra.context ? JSON.stringify(extra.context).slice(0, 2000) : null,
      user_id: extra.userId || currentUserId,
      app_version: buildId,
    };
    void supabase
      .from('client_errors')
      .insert(row)
      .then(() => {}, () => {});
  } catch {
    // Telemetry must never become its own incident.
  }
};

export const installGlobalErrorReporting = () => {
  try {
    if (typeof window === 'undefined' || window.__ompTelemetryInstalled) return;
    window.__ompTelemetryInstalled = true;
    window.addEventListener('error', (event) => {
      reportClientError('window', event?.message || 'Unknown window error', {
        stack: event?.error?.stack,
      });
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason;
      const text = reason?.message || (typeof reason === 'string' ? reason : 'Unhandled rejection');
      reportClientError('promise', text, { stack: reason?.stack });
    });
  } catch {
    // Never let telemetry installation break boot.
  }
};
