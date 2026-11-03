/* Gemeinsamer Code für Seite und Service Worker: Speicher (IndexedDB) und Benachrichtigungen.
   Aufgabe: { id, title, due, nextShow, u (Änderungszeit), del (erledigt = Löschvermerk), dirty (noch nicht hochgeladen) } */
var FAR = Number.MAX_SAFE_INTEGER;
var REPEAT_MS = 15 * 60 * 1000;

function openDb() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open('aufgaben', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('tasks', { keyPath: 'id' }); };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}

function run(mode, fn) {
  return openDb().then(function (db) {
    return new Promise(function (res, rej) {
      var t = db.transaction('tasks', mode);
      var req = fn(t.objectStore('tasks'));
      t.oncomplete = function () { res(req.result); };
      t.onerror = function () { rej(t.error); };
    });
  });
}

function allTasks() { return run('readonly', function (s) { return s.getAll(); }); }
function getTask(id) { return run('readonly', function (s) { return s.get(id); }); }
function putTask(t) { return run('readwrite', function (s) { return s.put(t); }); }

/* Nur offene Aufgaben (erledigte bleiben als Löschvermerk gespeichert, damit der Abgleich sie überall entfernt). */
async function openTasks() {
  return (await allTasks()).filter(function (t) { return !t.del; });
}

/* Neue Aufgabe lokal anlegen. */
function newTask(title, due) {
  var now = Date.now();
  var t = { id: now.toString(36) + Math.random().toString(36).slice(2, 6), title: title, due: due, nextShow: due, u: now, del: false, dirty: true };
  return putTask(t).then(function () { return t; });
}

/* Aufgabe abhaken: Löschvermerk setzen, wird beim nächsten Abgleich hochgeladen. */
async function completeTask(id) {
  var t = await getTask(id);
  if (!t || t.del) return;
  t.del = true;
  t.u = Math.max(Date.now(), (t.u || 0) + 1);
  t.dirty = true;
  await putTask(t);
}

/* Zeigt eine lautlose Benachrichtigung, die stehen bleibt, bis man sie abhakt. */
function showTask(reg, t) {
  return reg.showNotification(t.title, {
    body: 'Offen – mit „Erledigt“ abhaken',
    tag: 'task-' + t.id,
    requireInteraction: true,
    silent: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { id: t.id },
    actions: [{ action: 'done', title: 'Erledigt' }]
  });
}

/* Prüft alle Aufgaben: Fällige ohne sichtbare Benachrichtigung werden (wieder) angezeigt. */
async function checkTasks(reg) {
  var now = Date.now();
  var shown = (await reg.getNotifications()).map(function (n) { return n.tag; });
  var tasks = await openTasks();
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (t.due > now) continue;
    if (shown.indexOf('task-' + t.id) !== -1) continue;
    // nextShow === FAR heißt: wir dachten, sie wird angezeigt, sie ist aber weg (z. B. nach Neustart)
    if ((t.nextShow || 0) <= now || t.nextShow === FAR) {
      await showTask(reg, t);
      t.nextShow = FAR;
      await putTask(t);
    }
  }
}
