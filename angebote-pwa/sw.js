// Netz zuerst (Updates kommen ohne Neuinstallation), sonst Cache -> App startet auch offline.
// VERSION nur hochzählen, wenn sich die Dateiliste ändert.
const VERSION = 'ar-v3';
const SHELL = ['./', './index.html', './app.css', './app.js', './logik.js', './quelle.js', './benachr.js', './sync.js', './manifest.webmanifest',
  './fonts/bricolage-grotesque-latin-wght-normal.woff2', './fonts/jetbrains-mono-latin-400-normal.woff2', './fonts/jetbrains-mono-latin-500-normal.woff2',
  './icons/icon-192.png?v=2', './icons/icon-512.png?v=2', './icons/icon-maskable-512.png?v=2', './icons/apple-touch-icon.png?v=2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ar-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(req, { signal: ctrl.signal, cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('./index.html') : null) || Response.error();
    } finally { clearTimeout(timer); }
  })());
});
// Tippen auf eine Benachrichtigung (Browser-Variante): App in den Vordergrund holen
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const extra = e.notification.data || {};
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    if (list.length) { list[0].postMessage({ type: 'klick', extra }); return list[0].focus(); }
    return self.clients.openWindow('./');
  }));
});
