// Stale-bundle heartbeat. Three incidents (subtasks 8/6, Andrew's devices,
// Tim's post-fix retries 8/10) came from sessions running an old bundle after
// a deploy. The app now polls /version.json (emitted per build) and tells the
// session when a newer build is live so the user can refresh on purpose —
// no more fixes that are live but invisible.

/* global __OMP_BUILD_ID__ */

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export const CURRENT_BUILD_ID = typeof __OMP_BUILD_ID__ !== 'undefined' ? __OMP_BUILD_ID__ : 'dev';

export const isNewerBuild = (currentId, remoteId) => {
  if (!remoteId || typeof remoteId !== 'string') return false;
  if (!currentId || currentId === 'dev') return false;
  // Build ids are ISO-minute stamps (YYYY-MM-DD-HH:MM) — lexical order is
  // chronological. Only a strictly newer remote counts; equal or older
  // (a rollback serving an old version.json) never prompts a refresh loop.
  return remoteId > currentId;
};

export const startVersionHeartbeat = (onNewVersion) => {
  if (typeof window === 'undefined' || CURRENT_BUILD_ID === 'dev') return () => {};

  let notified = false;
  let timer = null;

  const check = async () => {
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!notified && isNewerBuild(CURRENT_BUILD_ID, data?.build)) {
        notified = true;
        onNewVersion?.(data.build);
      }
    } catch {
      // Offline or a blip — the next interval will try again.
    }
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') check();
  };

  timer = window.setInterval(check, CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisible);
  window.setTimeout(check, 20 * 1000);

  return () => {
    if (timer) window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
};
