// Cache-Name nur hochzaehlen, wenn sich die Dateiliste aendert oder alte Caches weg sollen.
// HTML holt der Service Worker immer zuerst aus dem Netz, so kommen Updates ohne Neuinstallation an.
const VERSION = 'lw-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './fonts/bricolage-grotesque-latin-wght-normal.woff2','./fonts/source-sans-3-latin-400-normal.woff2','./fonts/source-sans-3-latin-500-normal.woff2','./fonts/source-sans-3-latin-600-normal.woff2','./fonts/jetbrains-mono-latin-400-normal.woff2','./fonts/jetbrains-mono-latin-500-normal.woff2'];
const INDEX = './index.html';

self.addEventListener('install', e => {
  // Einzeln zwischenspeichern: fehlt eine Datei, geht die Installation trotzdem durch.
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Netz zuerst (3 s Geduld), sonst die gespeicherte Fassung. Nur gute Antworten werden gespeichert.
async function networkFirst(req, key) {
  const cache = await caches.open(VERSION);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(req, { signal: ctrl.signal, cache: 'no-cache' });
    if (res.ok) { if (res.type === 'basic') cache.put(key, res.clone()); return res; }
    if (res.status < 500) return res;
    throw new Error('Serverfehler ' + res.status);
  } catch (err) {
    return (await cache.match(key, { ignoreSearch: true })) || (key === INDEX ? await cache.match('./') : null) || Response.error();
  } finally { clearTimeout(timer); }
}
// Schriften und Icons aendern sich nie: aus dem Cache, sonst holen und merken.
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
  if (url.origin !== location.origin) return;
  if (/\.(woff2|png)$/.test(url.pathname)) { e.respondWith(cacheFirst(req)); return; }
  const isDoc = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  e.respondWith(networkFirst(req, isDoc ? INDEX : req));
});
