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
var nativeGranted = true;

function fmt(ms) {
  return new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function needsPermission() {
  if (NATIVE) return !nativeGranted;
  return 'Notification' in window && Notification.permission !== 'granted';
}

async function render() {
  var tasks = (await openTasks()).sort(function (a, b) { return a.due - b.due; });
  var ul = $('list');
  ul.textContent = '';
  $('empty').hidden = tasks.length > 0;
  tasks.forEach(function (t) {
    var li = document.createElement('li');
    var box = document.createElement('div');
    var title = document.createElement('span');
    title.textContent = t.title;
    var when = document.createElement('small');
    when.textContent = fmt(t.due) + (t.due <= Date.now() ? ' · fällig' : '');
    box.append(title, when);
    var btn = document.createElement('button');
    btn.textContent = '✓ Erledigt';
    btn.onclick = function () { complete(t.id); };
    li.append(box, btn);
    ul.append(li);
  });
  $('perm').hidden = !needsPermission();
}

function pushSoon() { if (window.syPush) window.syPush(); }

async function complete(id) {
  await completeTask(id);
  if (reg) {
    var open = await reg.getNotifications({ tag: 'task-' + id });
    open.forEach(function (n) { n.close(); });
  }
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
    var ids = (done && done.ids) || [];
    for (var i = 0; i < ids.length; i++) await completeTask(ids[i]);
    if (ids.length) { await render(); pushSoon(); }
    var list = (await openTasks()).map(function (t) { return { id: t.id, title: t.title, due: t.due }; });
    var key = JSON.stringify(list);
    if (key !== nativeSent) {
      await NATIVE.setTasks({ tasks: list });
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
  await newTask(title, due);
  $('title').value = '';
  $('due').value = '';
  await render();
  await tick();
  pushSoon();
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
  await render();
  tick();
  setInterval(tick, NATIVE ? 4000 : 15000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { render(); tick(); pushSoon(); }
  });
})();
