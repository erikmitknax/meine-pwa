// Cache-Name nur hochzählen, wenn sich die Dateiliste ändert oder alte Caches weg sollen.
// Code-Dateien (HTML, JS, CSS) holt der Service Worker immer zuerst aus dem Netz. Ein vergessenes Hochzählen
// liefert deshalb keine alten Dateien mehr aus, und HTML und JS laufen nicht mehr auseinander.
const VERSION = 'tb-v8';
const FONTS = ['barlow-latin-400-normal', 'barlow-latin-500-normal', 'barlow-latin-600-normal', 'barlow-condensed-latin-500-normal', 'barlow-condensed-latin-600-normal', 'barlow-condensed-latin-700-normal'].map(n => './fonts/' + n + '.woff2');
const SHELL = ['./', './index.html', './app.css', './logic.js', './app.js', './settings-theme.js', './dropbox-backup.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', ...FONTS];
const INDEX = './index.html';

self.addEventListener('install', e => {
  // Einzeln zwischenspeichern: fehlt eine Datei, soll die Installation trotzdem durchgehen und das Update nicht blockieren.
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Netz zuerst (mit 3 s Geduld, ohne alte HTTP-Cache-Kopie), sonst die gespeicherte Fassung. Nur gute Antworten werden gespeichert.
async function networkFirst(req, key) {
  const cache = await caches.open(VERSION);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(req, { signal: ctrl.signal, cache: 'no-cache' });
    if (res.ok) { if (res.type === 'basic') cache.put(key, res.clone()); return res; }
    if (res.status < 500) return res; // 404 und Co. gehören dem Aufrufer, nicht dem Cache
    throw new Error('Serverfehler ' + res.status);
  } catch (err) {
    return (await cache.match(key, { ignoreSearch: true })) || (key === INDEX ? await cache.match('./') : null) || Response.error();
  } finally { clearTimeout(timer); }
}
// Schriften ändern sich nie: aus dem Cache, sonst holen und merken.
async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Dropbox und andere Fremdadressen fasst der Service Worker nicht an
  if (url.pathname.endsWith('/seed.json')) return;    // nur beim ersten Start, nie cachen
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, INDEX)); return; }
  if (url.pathname.includes('/fonts/')) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(networkFirst(req, req));
});
