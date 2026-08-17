// Over-The-Top item 2: the offline field outbox. When a create fails because
// the network is gone (jobsite reality), the work is saved on-device and
// sends itself when signal returns. Honest by design: queued items are shown
// in a chip until they are truly delivered; nothing is ever claimed sent
// that wasn't.
//
// Storage is adapter-injected: IndexedDB in the app (blobs supported for NCR
// evidence photos), in-memory for unit tests. Scope boundary (v1): the app
// must have been opened online at least once this session — cold offline
// boot is the rebuild's snapshot-boot territory.

const DB_NAME = 'omp-outbox';
const STORE = 'items';

const makeIdbAdapter = () => {
  let dbPromise = null;
  const openDb = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => {
          const db = req.result;
          // Mobile Safari may close IndexedDB while the app is suspended.
          // Drop the cached handle so the next operation opens a fresh one.
          db.onclose = () => { dbPromise = null; };
          db.onversionchange = () => {
            db.close();
            dbPromise = null;
          };
          resolve(db);
        };
        req.onerror = () => {
          dbPromise = null;
          reject(req.error);
        };
      });
    }
    return dbPromise;
  };
  const tx = async (mode, fn, retry = true) => {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        let t;
        try {
          t = db.transaction(STORE, mode);
          const store = t.objectStore(STORE);
          const result = fn(store);
          t.oncomplete = () => resolve(result?.result !== undefined ? result.result : result);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      const connectionClosed = /database connection is closing|database connection is closed|invalidstateerror/i
        .test(String(error?.message || error));
      if (!retry || !connectionClosed) throw error;
      dbPromise = null;
      return tx(mode, fn, false);
    }
  };
  return {
    all: () => tx('readonly', (store) => {
      const req = store.getAll();
      return req;
    }),
    put: (item) => tx('readwrite', (store) => store.put(item)),
    delete: (id) => tx('readwrite', (store) => store.delete(id)),
  };
};

export const makeMemoryAdapter = () => {
  const items = new Map();
  return {
    all: async () => Array.from(items.values()),
    put: async (item) => { items.set(item.id, item); },
    delete: async (id) => { items.delete(id); },
  };
};

// A failure is queueable only when it is a NETWORK failure (or we already
// know we're offline). Anything else is a real error the user must see.
export const isNetworkError = (error) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = String(error?.message || error || '');
  return /failed to fetch|networkerror|network request failed|load failed|timed out|err_internet|err_network/i.test(message);
};

export const createOutbox = (adapter) => {
  const store = adapter || makeIdbAdapter();
  const listeners = new Set();
  let draining = false;

  const notify = async () => {
    const items = await store.all();
    listeners.forEach((listener) => listener(items));
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      store.all().then((items) => listener(items));
      return () => listeners.delete(listener);
    },

    async list() {
      return store.all();
    },

    async enqueue({ kind, title, payload, files = [] }) {
      const item = {
        id: `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        title: title || 'Untitled',
        payload,
        files, // [{ name, type, blob }]
        createdAt: new Date().toISOString(),
        status: 'queued',
        lastError: null,
      };
      await store.put(item);
      await notify();
      return item;
    },

    async discard(id) {
      await store.delete(id);
      await notify();
    },

    async attachFiles(id, files) {
      const items = await store.all();
      const item = items.find((entry) => entry.id === id);
      if (!item) return;
      item.files = [...(item.files || []), ...files];
      await store.put(item);
      await notify();
    },

    // Drain the queue through the registered senders. Only network failures
    // keep an item queued; real rejections mark it failed for human review.
    async drain(senders, { onSent, onFailed } = {}) {
      if (draining) return { sent: 0, remaining: (await store.all()).length };
      draining = true;
      let sent = 0;
      try {
        const items = (await store.all()).filter((item) => item.status !== 'failed');
        for (const item of items) {
          const sender = senders[item.kind];
          if (!sender) continue;
          try {
            await sender(item);
            await store.delete(item.id);
            sent += 1;
            onSent?.(item);
          } catch (error) {
            if (isNetworkError(error)) {
              item.lastError = 'Still offline — will retry.';
              await store.put(item);
            } else {
              item.status = 'failed';
              item.lastError = String(error?.message || error).slice(0, 200);
              await store.put(item);
              onFailed?.(item, error);
            }
          }
        }
      } finally {
        draining = false;
        await notify();
      }
      return { sent, remaining: (await store.all()).length };
    },

    async retryFailed(id) {
      const items = await store.all();
      const item = items.find((entry) => entry.id === id);
      if (!item) return;
      item.status = 'queued';
      item.lastError = null;
      await store.put(item);
      await notify();
    },
  };
};
