/* Gemeinsamer Code für Seite und Service Worker: Speicher (IndexedDB) und Benachrichtigungen.
   Aufgabe: { id, title, due, rep (Wiederholung: '', daily, weekdays, weekly, monthly), nextShow,
              done (wann zuletzt abgehakt, nur bei Wiederholung), prevDue (Termin davor, fürs Rückgängig),
              u (Änderungszeit), del (erledigt = Löschvermerk), dirty (noch nicht hochgeladen) } */
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

/* Nächster Zeitpunkt einer Wiederholung (gleiche Uhrzeit, Ortszeit). */
function addPeriod(ms, rep) {
  var d = new Date(ms);
  if (rep === 'weekly') d.setDate(d.getDate() + 7);
  else if (rep === 'weekdays') { do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); }
  else if (rep === 'monthly') {
    var day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  } else d.setDate(d.getDate() + 1);
  return d.getTime();
}

/* Erster Termin nach "jetzt" (und nach dem bisherigen Termin). */
function nextOccurrence(due, rep, now) {
  var base = Math.max(now, due), d = due;
  for (var i = 0; i < 5000; i++) { d = addPeriod(d, rep); if (d > base) break; }
  return d;
}

/* Neue Aufgabe lokal anlegen. */
function newTask(title, due, rep) {
  var now = Date.now();
  var t = { id: now.toString(36) + Math.random().toString(36).slice(2, 6), title: title, due: due, rep: rep || '', nextShow: due, u: now, del: false, dirty: true };
  return putTask(t).then(function () { return t; });
}

/* Bestehende Aufgabe ändern. */
async function updateTask(id, title, due, rep) {
  var t = await getTask(id);
  if (!t || t.del) return;
  t.title = title;
  t.due = due;
  t.rep = rep || '';
  t.nextShow = due;
  delete t.done;
  delete t.prevDue;
  t.u = Math.max(Date.now(), (t.u || 0) + 1);
  t.dirty = true;
  await putTask(t);
}

/* Aufgabe abhaken. Ohne Wiederholung: Löschvermerk (wird beim nächsten Abgleich hochgeladen).
   Mit Wiederholung: sie rückt auf den nächsten Termin und kommt dann wieder.
   ts/newDue kommen aus der Android-App, wenn dort abgehakt wurde. */
async function completeTask(id, ts, newDue) {
  var t = await getTask(id);
  if (!t || t.del) return;
  if (t.rep) {
    t.prevDue = t.due;
    t.done = ts || Date.now();
    t.due = newDue || nextOccurrence(t.due, t.rep, t.done);
    t.nextShow = t.due;
  } else {
    t.del = true;
  }
  t.u = Math.max(Date.now(), (t.u || 0) + 1);
  t.dirty = true;
  await putTask(t);
}

/* Wiederholende Aufgabe, die abgehakt ist und deren nächster Termin noch bevorsteht. */
function isDoneRepeat(t, now) {
  return !!(t.rep && t.done && t.due > (now || Date.now()));
}

/* Abhaken rückgängig machen (nur bei Wiederholung): zurück auf den Termin davor. */
async function undoTask(id) {
  var t = await getTask(id);
  if (!t || t.del || !t.done || !t.prevDue) return;
  t.due = t.prevDue;
  t.nextShow = t.due;
  delete t.done;
  delete t.prevDue;
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
