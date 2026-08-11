// ============================================================================
// SNAPSHOT BOOT — Over-The-Top item 12
// ----------------------------------------------------------------------------
// The last good workspace payload lives in IndexedDB, keyed by user. On boot,
// an eligible returning user sees their real board in the first paint while
// the fresh pull runs behind it. Eligibility is a synchronous localStorage
// marker written during the previous session (flags load too late for boot),
// so the pilot gate costs the boot path nothing. Every function here fails
// soft: a broken IndexedDB must never break the app.
// ============================================================================

const DB_NAME = 'sandpro-omp-snapshot';
const STORE = 'workspace';
const MARKER_PREFIX = 'omp-snapshot-on-';
// Snapshots older than this render stale boards; skip them.
const MAX_AGE_MS = 7 * 24 * 3600000;

const hasIdb = () => typeof indexedDB !== 'undefined';

const openDb = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export const snapshotEligible = (userId) => {
  if (!userId) return false;
  try { return window.localStorage.getItem(`${MARKER_PREFIX}${userId}`) === '1'; } catch { return false; }
};

export const setSnapshotEligibility = (userId, on) => {
  if (!userId) return;
  try {
    if (on) window.localStorage.setItem(`${MARKER_PREFIX}${userId}`, '1');
    else window.localStorage.removeItem(`${MARKER_PREFIX}${userId}`);
  } catch { /* preference only */ }
};

export const readSnapshot = async (userId) => {
  if (!userId || !hasIdb()) return null;
  try {
    const db = await openDb();
    const payload = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(userId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!payload?.savedAt || Date.now() - payload.savedAt > MAX_AGE_MS) return null;
    if (!Array.isArray(payload.objectives)) return null;
    return payload;
  } catch {
    return null;
  }
};

export const writeSnapshot = async (userId, { objectives, okrProjects }) => {
  if (!userId || !hasIdb()) return;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ objectives, okrProjects: okrProjects || [], savedAt: Date.now() }, userId);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* a failed write costs nothing — next boot fetches normally */ }
};

// Sign-out clears the board from the device — field tablets get shared.
export const clearSnapshot = async (userId) => {
  setSnapshotEligibility(userId, false);
  if (!userId || !hasIdb()) return;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(userId);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* nothing to clear */ }
};
