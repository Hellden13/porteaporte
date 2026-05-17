// PorteàPorte — Service Worker v2
const SW_VERSION = 'pap-v2';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== SW_VERSION).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

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
    vibrate: [200, 100, 200]
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

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
