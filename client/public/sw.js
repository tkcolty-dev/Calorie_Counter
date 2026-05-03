// Bump this every deploy if you change SW behavior. Caches keyed off it.
const CACHE_NAME = 'bitewise-v6';

// Install: become active immediately, no preloading (saves users from a stale shell).
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate: drop ALL old caches on every SW update so stale asset references
// from previous deploys can never be served.
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.clients.claim();
    // Tell open tabs there's a new SW so they can reload.
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }));
  })());
});

// Fetch strategy:
//   - API: don't intercept (let the browser hit the network)
//   - Hashed assets (/assets/*): cache-first (they're content-addressed, never change)
//   - Everything else (incl. /, /index.html): network-first, NO HTML caching, so a
//     fresh deploy is picked up on the very next page load.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  // Hashed asset bundles — safe to cache forever.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached =>
        cached || fetch(request).then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return resp;
        })
      )
    );
    return;
  }

  // HTML / icons / manifest — network-first, do NOT cache HTML.
  event.respondWith((async () => {
    try {
      const resp = await fetch(request);
      // Only cache non-HTML successful responses (icons, manifest, etc.)
      const ct = resp.headers.get('content-type') || '';
      if (resp.ok && !ct.includes('text/html')) {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
      }
      return resp;
    } catch {
      return (await caches.match(request)) || (await caches.match('/index.html')) || Response.error();
    }
  })());
});

// Push notifications
self.addEventListener('push', (event) => {
  let data = { title: 'Bitewise', body: 'You have a notification' };
  try {
    data = event.data.json();
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Bitewise', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || undefined,
      renotify: !!data.renotify,
      vibrate: [200, 100, 200],
      data: data.url || '/',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
