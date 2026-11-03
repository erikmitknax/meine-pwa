/* Aufgaben: Oberfläche */
var reg = null;
var $ = function (id) { return document.getElementById(id); };

function fmt(ms) {
  return new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function render() {
  var tasks = (await allTasks()).sort(function (a, b) { return a.due - b.due; });
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
  $('perm').hidden = !('Notification' in window) || Notification.permission === 'granted';
}

async function complete(id) {
  await delTask(id);
  if (reg) {
    var open = await reg.getNotifications({ tag: 'task-' + id });
    open.forEach(function (n) { n.close(); });
  }
  render();
}

async function tick() {
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
  await putTask({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: title, due: due, nextShow: due });
  $('title').value = '';
  $('due').value = '';
  await render();
  tick();
});

$('permBtn').addEventListener('click', async function () {
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
    await navigator.serviceWorker.register('sw.js');
    reg = await navigator.serviceWorker.ready;
    navigator.serviceWorker.addEventListener('message', render);
    registerPeriodic();
  }
  await render();
  tick();
  setInterval(tick, 15000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { render(); tick(); }
  });
})();
