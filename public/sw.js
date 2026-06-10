const CACHE_NAME = 'sandpro-omp-shell-v10';
const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/brand/sandpro-omp-logo.png',
  '/brand/sandpro-omp-mark.png',
  '/favicon-omp-v2.png',
  '/favicon.png',
  '/favicon.svg',
  '/pwa/sandpro-omp-icon-192-v2.png',
  '/pwa/sandpro-omp-icon-512-v2.png',
  '/pwa/sandpro-omp-apple-touch-icon-v2.png',
];

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#ff7f02" />
    <title>SandPro OMP Offline</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; background: #f8fafc; }
      main { max-width: 360px; padding: 24px; border: 1px solid #e5e7eb; border-radius: 16px; background: white; box-shadow: 0 12px 30px rgba(15,23,42,.08); }
      h1 { margin: 0 0 10px; font-size: 22px; }
      p { margin: 0; color: #4b5563; line-height: 1.45; }
      strong { color: #ff7f02; }
    </style>
  </head>
  <body>
    <main>
      <h1><strong>SandPro OMP</strong> is offline</h1>
      <p>Reconnect to load current objectives, Fix-It items, NCR reports, and organization data.</p>
    </main>
  </body>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(async () => (await caches.match('/')) || new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    );
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (url.origin === self.location.origin && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || '' };
  }
  const options = payload.options || {};
  event.waitUntil(
    self.registration.showNotification(payload.title || 'SandPro OMP', {
      body: payload.body || 'Open SandPro OMP for details.',
      icon: options.icon || '/pwa/sandpro-omp-icon-192-v2.png',
      badge: options.badge || '/pwa/sandpro-omp-icon-192-v2.png',
      tag: options.tag || 'sandpro-omp',
      renotify: Boolean(options.renotify),
      requireInteraction: Boolean(options.requireInteraction),
      silent: Boolean(options.silent),
      data: {
        url: payload.url || '/',
        type: payload.type || '',
        objectiveId: payload.objectiveId || null,
        notificationId: payload.notificationId || null,
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification?.data?.url || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).toString();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const sameOriginClient = clients.find(client => new URL(client.url).origin === self.location.origin);
        if (sameOriginClient) {
          if ('navigate' in sameOriginClient) return sameOriginClient.navigate(targetUrl).then(() => sameOriginClient.focus());
          return sameOriginClient.focus();
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
