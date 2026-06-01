// PorteàPorte — Service Worker v3
// Stratégie : cache-first pour assets statiques, network-first pour API
const SW_VERSION = 'pap-v57-emails-booking';

const STATIC_CACHE  = `${SW_VERSION}-static`;
const DYNAMIC_CACHE = `${SW_VERSION}-dynamic`;

// Assets mis en cache à l'installation
const PRECACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/logo.svg',
  '/assets/brand-uniform.css',
  '/assets/visual-polish.css',
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      cache.addAll(PRECACHE).catch(() => {}) // silencieux si offline dès l'install
    )
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Ne pas intercepter : API, Supabase, Stripe, cross-origin
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('stripe') ||
    url.hostname.includes('cloudflare') ||
    url.origin !== self.location.origin
  ) return;

  // Ne pas intercepter les requêtes non-GET
  if (request.method !== 'GET') return;

  // Assets statiques (CSS, JS, images, fonts) → cache-first
  if (
    url.pathname.match(/\.(css|js|svg|png|jpg|jpeg|webp|woff2?|ico)$/)
  ) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then(c => c.put(request, clone));
          }
          return res;
        }).catch(() => {
          if (url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico)$/)) {
            return caches.match('/logo.svg');
          }
          return new Response('', {
            status: 503,
            statusText: 'Asset unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        });
      })
    );
    return;
  }

  // Pages HTML → network-first, fallback offline
  if (request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(DYNAMIC_CACHE).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(request) ||
          caches.match('/offline.html') ||
          caches.match('/index.html')
        )
    );
    return;
  }
});

// ─── Push notifications ───────────────────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch { payload = { title: 'PorteàPorte', body: e.data.text() }; }

  const title   = payload.title || 'PorteàPorte';
  const options = {
    body:    payload.body    || 'Nouvelle notification',
    icon:    payload.icon    || '/logo.svg',
    badge:   '/logo.svg',
    tag:     payload.tag     || 'pap-notif',
    data:    payload.data    || {},
    actions: payload.actions || [],
    vibrate: [200, 100, 200],
    renotify: Boolean(payload.renotify),
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/dashboard-livreur.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(url) || c.url.includes('porteaporte.site'));
      if (existing) { existing.focus(); existing.navigate(url); }
      else self.clients.openWindow(url);
    })
  );
});
