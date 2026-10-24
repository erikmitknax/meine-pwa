// Service Worker: App-Shell wird gecacht, damit Shopwise offline startet.
// VERSION wird von bump-version.mjs hochgezählt. Ändert sich diese Datei,
// erkennt der Browser eine neue Version und die App zeigt das Update-Banner.
const VERSION = '0.13.3';
const CACHE = 'shopwise-' + VERSION;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/router.js',
  './js/store.js',
  './js/toast.js',
  './js/dom.js',
  './js/sync.js',
  './js/firebase-config.js',
  './js/icons.js',
  './js/quick.js',
  './js/angebote-logik.js',
  './js/theme.js',
  './js/updater.js',
  './js/version.js',
  './js/pages/empty.js',
  './js/pages/einkaufsliste.js',
  './js/pages/einkaufsliste-artikel.js',
  './js/pages/nachkaufen.js',
  './js/pages/angebote.js',
  './js/pages/angebote-merken.js',
  './js/pages/bestand.js',
  './js/pages/bestand-kategorie.js',
  './js/pages/bestand-bearbeiten.js',
  './js/pages/einstellungen.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// Einmalige Umstellung: Installationen vor Version 0.3 (Cache "shopwise-v1"/"shopwise-v2")
// kennen das Update-Banner nicht und würden die neue Version ewig im Hintergrund warten lassen.
// Diese werden automatisch umgestellt. Ab dann gilt immer: neue Version wartet auf "Aktualisieren".
const LEGACY_CACHE = /^shopwise-v\d+$/;
let migratingFromLegacy = false;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // cache: 'reload' umgeht den HTTP-Cache, damit wirklich die neuen Dateien geholt werden.
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    const keys = await caches.keys();
    if (keys.some((k) => LEGACY_CACHE.test(k))) {
      migratingFromLegacy = true;
      await self.skipWaiting();
    }
    // Sonst kein skipWaiting: Die neue Version wartet, bis im Banner "Aktualisieren" getippt wird.
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    if (migratingFromLegacy) {
      // Offene alte Fenster einmal neu laden, damit sie die neue Version zeigen.
      const windows = await self.clients.matchAll({ type: 'window' });
      windows.forEach((w) => w.navigate(w.url).catch(() => {}));
    }
  })());
});

// Cache zuerst, sonst Netzwerk.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;   // Firebase & Co. direkt ins Netz
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request))
  );
});
