// Service Worker: App-Shell wird gecacht, damit Shopwise offline startet.
// VERSION wird von bump-version.mjs hochgezählt. Ändert sich diese Datei,
// erkennt der Browser eine neue Version und die App zeigt das Update-Banner.
const VERSION = '0.3.0';
const CACHE = 'shopwise-' + VERSION;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/router.js',
  './js/store.js',
  './js/updater.js',
  './js/version.js',
  './js/pages/_empty.js',
  './js/pages/einkaufsliste.js',
  './js/pages/angebote.js',
  './js/pages/bestand.js',
  './js/pages/einstellungen.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' umgeht den HTTP-Cache, damit wirklich die neuen Dateien geholt werden.
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
  );
  // Kein skipWaiting hier: Die neue Version wartet, bis der Nutzer im Banner "Aktualisieren" tippt.
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache zuerst, sonst Netzwerk.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request))
  );
});
