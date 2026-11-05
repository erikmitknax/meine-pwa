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
var selCat = '';
var delArmed = null;

function catNames() {
  try { return JSON.parse(localStorage.getItem('aufgaben.catnames') || '{}') || {}; } catch (e) { return {}; }
}
function catName(k) { return catNames()[k] || CATS[k].n; }

function setCat(k) {
  selCat = k || '';
  Array.prototype.forEach.call($('chips').children, function (b) { b.classList.toggle('sel', b.dataset.cat === selCat); });
}

function renderChips() {
  var box = $('chips');
  box.textContent = '';
  var none = document.createElement('button');
  none.type = 'button';
  none.className = 'chip none';
  none.textContent = 'Keine';
  none.dataset.cat = '';
  none.onclick = function () { setCat(''); };
  box.append(none);
  Object.keys(CATS).forEach(function (k) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.cat = k;
    b.style.background = CATS[k].c;
    b.title = catName(k);
    b.setAttribute('aria-label', catName(k));
    b.onclick = function () { setCat(k); };
    box.append(b);
  });
  setCat(selCat);
}

function renderCatSettings() {
  var box = $('catNames');
  box.textContent = '';
  Object.keys(CATS).forEach(function (k) {
    var row = document.createElement('div');
    row.className = 'catrow';
    var dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = CATS[k].c;
    var inp = document.createElement('input');
    inp.value = catNames()[k] || '';
    inp.placeholder = CATS[k].n;
    inp.maxLength = 20;
    inp.addEventListener('change', function () {
      var n = catNames(), v = inp.value.trim();
      if (v) n[k] = v; else delete n[k];
      try { localStorage.setItem('aufgaben.catnames', JSON.stringify(n)); } catch (e) { /* egal */ }
      renderChips();
      render();
    });
    row.append(dot, inp);
    box.append(row);
  });
}

function resetDel() {
  clearTimeout(delArmed);
  delArmed = null;
  $('delBtn').textContent = 'Löschen';
}

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
  setCat(t.cat || '');
  $('snoozeSel').value = String(t.snooze || 0);
  $('saveBtn').textContent = 'Speichern';
  $('cancelEdit').hidden = false;
  $('delBtn').hidden = false;
  resetDel();
  window.scrollTo(0, 0);
  $('title').focus();
}

function stopEdit() {
  editId = null;
  $('title').value = '';
  $('due').value = '';
  $('rep').value = '';
  setCat('');
  $('snoozeSel').value = '0';
  $('saveBtn').textContent = 'Hinzufügen';
  $('cancelEdit').hidden = true;
  $('delBtn').hidden = true;
  resetDel();
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
    if (t.cat && CATS[t.cat]) li.style.borderLeft = '6px solid ' + CATS[t.cat].c;
    var box = document.createElement('div');
    var title = document.createElement('span');
    title.textContent = t.title;
    var when = document.createElement('small');
    when.textContent = fmt(t.due) + (t.due <= now ? ' · fällig' : '') + (t.rep ? ' · ' + REPS[t.rep] : '') + (t.cat && CATS[t.cat] ? ' · ' + catName(t.cat) : '') + (t.snooze ? ' · wieder nach ' + t.snooze + ' Min' : '');
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
    if (t.cat && CATS[t.cat]) li.style.borderLeft = '6px solid ' + CATS[t.cat].c;
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
  await renderTrash();
  $('perm').hidden = !needsPermission();
}

async function renderTrash() {
  var del = await deletedTasks();
  $('trash').hidden = del.length === 0;
  $('trashSum').textContent = 'Papierkorb (' + del.length + ')';
  var tl = $('trashList');
  tl.textContent = '';
  del.forEach(function (t) {
    var li = document.createElement('li');
    if (t.cat && CATS[t.cat]) li.style.borderLeft = '6px solid ' + CATS[t.cat].c;
    var box = document.createElement('div');
    var title = document.createElement('span');
    title.textContent = t.title;
    var when = document.createElement('small');
    when.textContent = (t.delWhy === 'gelöscht' ? '🗑 gelöscht ' : '✓ erledigt ') + fmtDone(t.delAt || t.u || Date.now()) + (t.rep ? ' · ' + REPS[t.rep] : '');
    box.append(title, when);
    var acts = document.createElement('div');
    acts.className = 'acts';
    var back = document.createElement('button');
    back.className = 'ghost';
    back.textContent = '↩';
    back.setAttribute('aria-label', 'Zurückholen');
    back.onclick = async function () { await restoreTask(t.id); await render(); await tick(); pushSoon(); };
    acts.append(back);
    li.append(box, acts);
    tl.append(li);
  });
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
    var list = (await openTasks()).map(function (t) { return { id: t.id, title: t.title, due: t.due, rep: t.rep || '', color: t.cat && CATS[t.cat] ? CATS[t.cat].c : '', snooze: t.snooze || 0 }; });
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
  var snooze = Number($('snoozeSel').value) || 0;
  if (editId) {
    await updateTask(editId, title, due, rep, selCat, snooze);
    await closeNotif(editId);
  } else {
    await newTask(title, due, rep, selCat, snooze);
  }
  stopEdit();
  await render();
  await tick();
  pushSoon();
});

$('cancelEdit').addEventListener('click', stopEdit);

/* Löschen: erst tippen, dann zur Sicherheit noch einmal. */
$('delBtn').addEventListener('click', async function () {
  if (!editId) return;
  if (!delArmed) {
    $('delBtn').textContent = 'Wirklich löschen? Nochmal tippen';
    delArmed = setTimeout(resetDel, 4000);
    return;
  }
  var id = editId;
  resetDel();
  await deleteTask(id);
  await closeNotif(id);
  stopEdit();
  await render();
  await tick();
  pushSoon();
});

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
  renderChips();
  renderCatSettings();
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
