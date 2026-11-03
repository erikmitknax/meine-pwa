/* Aufgaben: Oberfläche.
   Im Browser/als PWA kommen die Benachrichtigungen über den Service Worker.
   In der Android-App (Capacitor) übernimmt das Plug-in "AufgabenNative" – das kann Benachrichtigungen
   zuverlässig zur Uhrzeit zeigen und nach dem Wegwischen wiederbringen. */
var reg = null;
var $ = function (id) { return document.getElementById(id); };

var NATIVE = (function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
  return (C.Plugins && C.Plugins.AufgabenNative) || (typeof C.registerPlugin === 'function' ? C.registerPlugin('AufgabenNative') : null);
})();
var nativeSent = '';
var repeatMs = REPEAT_MS;
var nativeGranted = true;

function fmt(ms) {
  return new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

var REPS = { daily: 'täglich', weekdays: 'Mo–Fr', weekly: 'wöchentlich', monthly: 'monatlich' };
var editId = null;

function toLocalInput(ms) {
  var d = new Date(ms);
  function p(n) { return String(n).padStart(2, '0'); }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

async function closeNotif(id) {
  if (!reg) return;
  var open = await reg.getNotifications({ tag: 'task-' + id });
  open.forEach(function (n) { n.close(); });
}

function startEdit(t) {
  editId = t.id;
  $('title').value = t.title;
  $('due').value = toLocalInput(t.due);
  $('rep').value = t.rep || '';
  $('saveBtn').textContent = 'Speichern';
  $('cancelEdit').hidden = false;
  window.scrollTo(0, 0);
  $('title').focus();
}

function stopEdit() {
  editId = null;
  $('title').value = '';
  $('due').value = '';
  $('rep').value = '';
  $('saveBtn').textContent = 'Hinzufügen';
  $('cancelEdit').hidden = true;
}

function needsPermission() {
  if (NATIVE) return !nativeGranted;
  return 'Notification' in window && Notification.permission !== 'granted';
}

function fmtDone(ms) {
  var d = new Date(ms), n = new Date();
  var same = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return same ? 'heute ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : fmt(ms);
}

async function render() {
  var now = Date.now();
  var all = (await openTasks()).sort(function (a, b) { return a.due - b.due; });
  var tasks = all.filter(function (t) { return !isDoneRepeat(t, now); });
  var doneList = all.filter(function (t) { return isDoneRepeat(t, now); }).sort(function (a, b) { return b.done - a.done; });

  var ul = $('list');
  ul.textContent = '';
  $('empty').hidden = tasks.length > 0;
  tasks.forEach(function (t) {
    var li = document.createElement('li');
    var box = document.createElement('div');
    var title = document.createElement('span');
    title.textContent = t.title;
    var when = document.createElement('small');
    when.textContent = fmt(t.due) + (t.due <= now ? ' · fällig' : '') + (t.rep ? ' · ' + REPS[t.rep] : '');
    box.append(title, when);
    var acts = document.createElement('div');
    acts.className = 'acts';
    var edit = document.createElement('button');
    edit.className = 'ghost';
    edit.textContent = '✎';
    edit.setAttribute('aria-label', 'Bearbeiten');
    edit.onclick = function () { startEdit(t); };
    var btn = document.createElement('button');
    btn.textContent = '✓';
    btn.setAttribute('aria-label', 'Erledigt');
    btn.onclick = function () { complete(t.id); };
    acts.append(edit, btn);
    li.append(box, acts);
    ul.append(li);
  });

  var dl = $('doneList');
  dl.textContent = '';
  $('doneH').hidden = doneList.length === 0;
  doneList.forEach(function (t) {
    var li = document.createElement('li');
    var box = document.createElement('div');
    var title = document.createElement('span');
    title.textContent = t.title;
    var when = document.createElement('small');
    when.textContent = '✓ erledigt ' + fmtDone(t.done) + ' · nächstes Mal ' + fmt(t.due) + ' · ' + REPS[t.rep];
    box.append(title, when);
    var acts = document.createElement('div');
    acts.className = 'acts';
    var edit = document.createElement('button');
    edit.className = 'ghost';
    edit.textContent = '✎';
    edit.setAttribute('aria-label', 'Bearbeiten');
    edit.onclick = function () { startEdit(t); };
    var undo = document.createElement('button');
    undo.className = 'ghost';
    undo.textContent = '↩';
    undo.setAttribute('aria-label', 'Rückgängig');
    undo.onclick = async function () { await undoTask(t.id); await render(); await tick(); pushSoon(); };
    acts.append(edit, undo);
    li.append(box, acts);
    dl.append(li);
  });
  $('perm').hidden = !needsPermission();
}

function pushSoon() { if (window.syPush) window.syPush(); }

async function complete(id) {
  await completeTask(id);
  await closeNotif(id);
  await render();
  await tick();
  pushSoon();
}

/* Android-App: erledigte Aufgaben aus der Benachrichtigung übernehmen, aktuelle Liste ans Plug-in geben. */
async function nativeTick() {
  try {
    var p = await NATIVE.permissionState();
    nativeGranted = !!p.granted;
    var done = await NATIVE.takeDone();
    var items = (done && done.items) || [];
    for (var i = 0; i < items.length; i++) await completeTask(items[i].id, items[i].ts, items[i].due);
    if (items.length) { await render(); pushSoon(); }
    var list = (await openTasks()).map(function (t) { return { id: t.id, title: t.title, due: t.due, rep: t.rep || '' }; });
    var key = JSON.stringify(list) + '|' + repeatMs;
    if (key !== nativeSent) {
      await NATIVE.setTasks({ tasks: list, repeatMs: repeatMs });
      nativeSent = key;
    }
    $('perm').hidden = !needsPermission();
  } catch (e) { /* Plug-in nicht erreichbar */ }
}

async function tick() {
  if (NATIVE) return nativeTick();
  if (reg && 'Notification' in window && Notification.permission === 'granted') {
    await checkTasks(reg);
  }
}

$('f').addEventListener('submit', async function (ev) {
  ev.preventDefault();
  var title = $('title').value.trim();
  if (!title) return;
  var v = $('due').value;
  var due = v ? new Date(v).getTime() : Date.now();
  var rep = $('rep').value;
  if (editId) {
    await updateTask(editId, title, due, rep);
    await closeNotif(editId);
  } else {
    await newTask(title, due, rep);
  }
  stopEdit();
  await render();
  await tick();
  pushSoon();
});

$('cancelEdit').addEventListener('click', stopEdit);

$('repeatSel').addEventListener('change', async function () {
  repeatMs = Number($('repeatSel').value) * 60000;
  try { await setRepeatMs(repeatMs); } catch (e) { /* ohne Cache-API weiter */ }
  tick();
});

$('permBtn').addEventListener('click', async function () {
  if (NATIVE) {
    try { await NATIVE.requestPermission(); } catch (e) { /* egal */ }
    setTimeout(function () { tick(); }, 1500);
    return;
  }
  await Notification.requestPermission();
  await render();
  tick();
});

async function registerPeriodic() {
  try {
    if (!reg || !('periodicSync' in reg)) return;
    var st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state === 'granted') await reg.periodicSync.register('check-tasks', { minInterval: REPEAT_MS });
  } catch (e) { /* nicht unterstützt */ }
}

(async function () {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
      if (!NATIVE) {
        reg = await navigator.serviceWorker.ready;
        navigator.serviceWorker.addEventListener('message', function () { render(); pushSoon(); });
        registerPeriodic();
      }
    } catch (e) { /* ohne Service Worker weiter */ }
  }
  try { repeatMs = await getRepeatMs(); } catch (e) { /* Standard */ }
  $('repeatSel').value = String(Math.round(repeatMs / 60000));
  await render();
  tick();
  setInterval(tick, NATIVE ? 4000 : 15000);
  setInterval(render, 30000); // Erledigtes wandert zurück in die Liste, sobald der nächste Termin da ist
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { render(); tick(); pushSoon(); }
  });
})();
