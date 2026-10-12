// Netz zuerst (Updates kommen ohne Neuinstallation), sonst Cache -> App startet auch offline.
// VERSION nur hochzählen, wenn sich die Dateiliste ändert.
const VERSION = 'ern-v6';
const SHELL = ['./', './index.html', './app.css', './app.js', './manifest.webmanifest', './lib/zxing.min.js', './fonts/bricolage-grotesque-latin-wght-normal.woff2',
  './icons/logo.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // API-Aufrufe (Open Food Facts, Anthropic) nie cachen
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
