/* Aufgaben Service Worker: Offline-Cache und Benachrichtigungen. */
importScripts('store.js');

const CACHE = 'aufgaben-v4';
const FILES = ['./', './index.html', './app.js', './store.js', './sync.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

/* Netz zuerst (damit Updates ankommen), sonst aus dem Cache */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});

async function tellPages() {
  const pages = await self.clients.matchAll({ type: 'window' });
  pages.forEach(p => p.postMessage('refresh'));
}

/* "Erledigt" getippt: Aufgabe löschen. Antippen der Meldung: App öffnen. */
self.addEventListener('notificationclick', e => {
  const id = e.notification.data && e.notification.data.id;
  e.notification.close();
  if (e.action === 'done') {
    e.waitUntil(completeTask(id).then(tellPages));
  } else {
    e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => list.length ? list[0].focus() : self.clients.openWindow('./')));
  }
});

/* Weggewischt: in 15 Minuten wieder anzeigen (sobald die App oder ein Hintergrundabgleich läuft). */
self.addEventListener('notificationclose', e => {
  const id = e.notification.data && e.notification.data.id;
  e.waitUntil((async () => {
    const t = await getTask(id);
    if (t) {
      t.nextShow = Date.now() + REPEAT_MS;
      await putTask(t);
    }
  })());
});

/* Hintergrundabgleich (nur wenn Chrome ihn erlaubt) */
self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-tasks') e.waitUntil(checkTasks(self.registration));
});
