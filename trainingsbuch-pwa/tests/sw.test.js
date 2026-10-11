// Tests für trainingsbuch-pwa/sw.js ohne Browser: der Service Worker läuft in einer nachgebauten Umgebung.
// Ausführen: node --test "trainingsbuch-pwa/tests/*.test.js"
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const ORIGIN = 'https://example.github.io';
const SCOPE = ORIGIN + '/meine-pwa/trainingsbuch-pwa/';
const abs = k => new URL(typeof k === 'string' ? k : k.url, SCOPE).href;

function mkRes(status, body, type = 'basic') {
  const r = { status, ok: status >= 200 && status < 300, type, body, clone() { return mkRes(status, body, type); } };
  return r;
}

function setup() {
  const stores = new Map(); // cacheName -> Map(url -> res)
  const handlers = {}; const fetchCalls = [];
  const state = { fetchImpl: async () => mkRes(200, 'net') };
  const store = n => { if (!stores.has(n)) stores.set(n, new Map()); return stores.get(n); };
  const caches = {
    async open(n) {
      const m = store(n);
      return {
        async add(u) { const res = await state.fetchImpl(abs(u), {}); if (!res.ok) throw new Error('bad'); m.set(abs(u), res); },
        async put(k, res) { m.set(abs(k), res); },
        async match(k, opts) {
          const key = abs(k); if (m.has(key)) return m.get(key);
          if (opts && opts.ignoreSearch) { const base = key.split('?')[0]; for (const [u, v] of m) if (u.split('?')[0] === base) return v; }
          return undefined;
        }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(n) { return stores.delete(n); }
  };
  const self = {
    addEventListener(t, fn) { handlers[t] = fn; }, location: { origin: ORIGIN }, registration: { scope: SCOPE },
    skipWaiting() { self.skipped = true; return Promise.resolve(); }, clients: { claim() { self.claimed = true; return Promise.resolve(); } }
  };
  const sandbox = {
    self, caches, URL, AbortController, setTimeout, clearTimeout, Promise, Response: { error: () => ({ error: true, ok: false }) },
    fetch: (req, init) => { fetchCalls.push({ req, init }); return state.fetchImpl(typeof req === 'string' ? req : req.url, init); },
    console
  };
  vm.runInNewContext(SRC, sandbox);
  const ask = async (url, extra = {}) => {
    let p = null;
    const e = { request: Object.assign({ method: 'GET', url, mode: 'cors' }, extra), respondWith(x) { p = x; } };
    handlers.fetch(e); return p === null ? null : await p;
  };
  const run = async (type, waitList) => { let p; handlers[type]({ waitUntil(x) { p = x; } }); return p; };
  return { stores, store, state, fetchCalls, ask, run, self, handlers };
}
const VERSION = () => /const VERSION = '([^']+)'/.exec(SRC)[1];

test('Navigation: gute Antwort wird geliefert und als index.html gespeichert', async () => {
  const t = setup();
  const res = await t.ask(SCOPE + '?code=abc&state=x', { mode: 'navigate' });
  assert.equal(res.body, 'net');
  assert.equal(t.store(VERSION()).get(abs('./index.html')).body, 'net');
});

test('Navigation: 404 überschreibt die gespeicherte Seite NICHT', async () => {
  const t = setup();
  t.store(VERSION()).set(abs('./index.html'), mkRes(200, 'gut'));
  t.state.fetchImpl = async () => mkRes(404, 'weg');
  const res = await t.ask(SCOPE, { mode: 'navigate' });
  assert.equal(res.status, 404);
  assert.equal(t.store(VERSION()).get(abs('./index.html')).body, 'gut');
});

test('Navigation: Serverfehler 500 liefert die gespeicherte Seite statt der Fehlerseite', async () => {
  const t = setup();
  t.store(VERSION()).set(abs('./index.html'), mkRes(200, 'gut'));
  t.state.fetchImpl = async () => mkRes(500, 'kaputt');
  const res = await t.ask(SCOPE, { mode: 'navigate' });
  assert.equal(res.body, 'gut');
  assert.equal(t.store(VERSION()).get(abs('./index.html')).body, 'gut');
});

test('Navigation offline: gespeicherte Seite, ohne Speicher ein Fehler', async () => {
  const t = setup();
  t.store(VERSION()).set(abs('./index.html'), mkRes(200, 'gut'));
  t.state.fetchImpl = async () => { throw new TypeError('offline'); };
  assert.equal((await t.ask(SCOPE, { mode: 'navigate' })).body, 'gut');
  const empty = setup(); empty.state.fetchImpl = async () => { throw new TypeError('offline'); };
  assert.equal((await empty.ask(SCOPE, { mode: 'navigate' })).error, true);
});

test('Code-Dateien: Netz zuerst und ohne alte HTTP-Cache-Kopie', async () => {
  const t = setup();
  t.store(VERSION()).set(abs('./app.js'), mkRes(200, 'alt'));
  t.state.fetchImpl = async () => mkRes(200, 'neu');
  const res = await t.ask(SCOPE + 'app.js');
  assert.equal(res.body, 'neu');
  assert.equal(t.fetchCalls[0].init.cache, 'no-cache');
  assert.equal(t.store(VERSION()).get(abs('./app.js')).body, 'neu');
  t.state.fetchImpl = async () => { throw new TypeError('offline'); };
  assert.equal((await t.ask(SCOPE + 'app.js')).body, 'neu', 'offline kommt die zuletzt geladene Fassung');
});

test('Schriften: aus dem Cache, nur beim ersten Mal aus dem Netz', async () => {
  const t = setup(); let n = 0;
  t.state.fetchImpl = async () => { n++; return mkRes(200, 'font'); };
  await t.ask(SCOPE + 'fonts/barlow-latin-400-normal.woff2');
  await t.ask(SCOPE + 'fonts/barlow-latin-400-normal.woff2');
  assert.equal(n, 1);
});

test('Fremde Adressen, POST und seed.json fasst der Service Worker nicht an', async () => {
  const t = setup();
  assert.equal(await t.ask('https://api.dropboxapi.com/2/files/upload'), null);
  assert.equal(await t.ask('https://fonts.googleapis.com/css2?family=Barlow'), null);
  assert.equal(await t.ask(SCOPE + 'app.js', { method: 'POST' }), null);
  assert.equal(await t.ask(SCOPE + 'seed.json'), null);
});

test('Installation: fehlt eine Datei, geht die Installation trotzdem durch', async () => {
  const t = setup();
  t.state.fetchImpl = async u => (u.endsWith('icon-512.png') ? mkRes(404, '') : mkRes(200, 'x'));
  await t.run('install');
  assert.equal(t.self.skipped, true);
  assert.ok(t.store(VERSION()).has(abs('./app.js')));
  assert.ok(!t.store(VERSION()).has(abs('./icon-512.png')));
});

test('Aktivierung: alte Caches werden gelöscht', async () => {
  const t = setup(); t.store('tb-v7').set('x', 1); t.store(VERSION());
  await t.run('activate');
  assert.deepEqual([...t.stores.keys()], [VERSION()]);
  assert.equal(t.self.claimed, true);
});

test('Dateiliste im Service Worker stimmt mit den Dateien überein', () => {
  const dir = path.join(__dirname, '..');
  const m = /const SHELL = \[([\s\S]*?)\];/.exec(SRC)[1];
  const files = [...m.matchAll(/'\.\/([^']*)'/g)].map(x => x[1]).filter(f => f && !f.includes('...'));
  for (const f of files) assert.ok(fs.existsSync(path.join(dir, f)), 'fehlt: ' + f);
  for (const f of fs.readdirSync(path.join(dir, 'fonts')).filter(x => x.endsWith('.woff2'))) assert.ok(SRC.includes(f.replace('.woff2', '')), 'Schrift nicht im Service Worker: ' + f);
  for (const need of ['index.html', 'app.css', 'logic.js', 'app.js', 'settings-theme.js', 'dropbox-backup.js', 'manifest.webmanifest']) assert.ok(files.includes(need), need + ' fehlt im Cache');
});
