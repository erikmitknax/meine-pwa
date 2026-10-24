// Geräte-Abgleich über Firebase (Anmeldung + Firestore). Lokal zuerst: alles bleibt auf dem Gerät,
// Firebase gleicht nur ab. Dokumente: users/<uid>/<sammlung>/<id> = { d: Daten, u: Zeitstempel, del: true bei Löschung }.
// Letzte Änderung gewinnt. Aufbau und Regeln wie bei der Wunschliste-App (wunschliste-pwa/sync.js).
import { FIREBASE_CONFIG, FIREBASE_VERSION } from './firebase-config.js';
import { exportAll, importDoc, removeDoc, isPristine, resetType } from './store.js';

const LS_KEY = 'shopwise.sync';
const COLS = { lists: 'sw_lists', cats: 'sw_cats', litems: 'sw_litems', stock: 'sw_stock' };
const TYPES = ['lists', 'cats', 'litems', 'stock'];       // Eltern vor Kindern
const RESETTABLE = { lists: 'lists', cats: 'cats', stock: 'stock' }; // litems hängen an den Listen

const SY = {
  uid: '', meta: {}, last: 0,           // gespeichert: letzte Konto-ID, Stand je Dokument, letzter Abgleich
  user: null, fb: null, ready: false, pushing: false, again: false,
  unsub: [], err: '', state: 'off', timer: null, orphans: {},
};

function load() {
  try {
    const j = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (j) { SY.uid = j.uid || ''; SY.meta = j.meta || {}; SY.last = j.last || 0; }
  } catch { /* leer */ }
}
function persist() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ uid: SY.uid, meta: SY.meta, last: SY.last })); } catch { /* Speicher voll */ }
}
function setState(state, err) {
  SY.state = state;
  if (err !== undefined) SY.err = err;
  window.dispatchEvent(new CustomEvent('shopwise:sync-state'));
}

/* ---- Hash (reihenfolge-unabhängig), erkennt "lokal geändert seit letztem Abgleich" ---- */
function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}
function hash(v) {
  const s = stable(v);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h;
}

/* ---- Fremde Änderungen übernehmen ---- */
// Rückgabe: 'changed' (lokal geändert) | 'meta' (nur Stand notiert) | 'orphan' | 'ignored'
function applyRemote(type, id, doc) {
  if (!doc || typeof doc.u !== 'number') return 'ignored';
  const k = type + '/' + id, m = SY.meta[k];
  if (m && m.u >= doc.u) return 'ignored';                       // schon bekannt (auch eigenes Echo)

  if (m && !m.del) {
    const cur = exportAll()[type][id];
    if (cur && hash(cur) !== m.h) {                               // eigene, noch nicht hochgeladene Änderung hat Vorrang
      m.u = doc.u;                                                // fremden Stand merken, damit unser Upload neuer ist
      return 'ignored';
    }
  }
  if (doc.del) {
    const removed = removeDoc(type, id);
    delete SY.orphans[k];
    SY.meta[k] = { u: doc.u, h: null, del: true };
    return removed ? 'changed' : 'meta';
  }
  const r = importDoc(type, id, doc.d);
  if (r === 'orphan') { SY.orphans[k] = { type, id, doc }; return 'orphan'; }
  if (r !== 'ok') return 'ignored';
  delete SY.orphans[k];
  SY.meta[k] = { u: doc.u, h: hash(exportAll()[type][id]) };
  return 'changed';
}
function retryOrphans() {
  let changed = false;
  for (const { type, id, doc } of Object.values({ ...SY.orphans })) {
    if (applyRemote(type, id, doc) === 'changed') changed = true;
  }
  return changed;
}

/* ---- Eigene Änderungen ermitteln ---- */
function diff() {
  const now = Date.now(), ops = [], seen = new Set(), all = exportAll();
  for (const type of TYPES) {
    for (const [id, d] of Object.entries(all[type])) {
      const k = type + '/' + id;
      seen.add(k);
      const h = hash(d), m = SY.meta[k];
      if (!m || m.h !== h) {
        const u = Math.max(now, (m ? m.u : 0) + 1);
        ops.push({ type, id, k, doc: { d, u, del: false }, m: { u, h } });
      }
    }
  }
  for (const [k, m] of Object.entries(SY.meta)) {
    if (seen.has(k) || m.del) continue;                            // lokal gelöscht -> Löschmarke hochladen
    const i = k.indexOf('/');
    const u = Math.max(now, m.u + 1);
    ops.push({ type: k.slice(0, i), id: k.slice(i + 1), k, doc: { del: true, u }, m: { u, h: null, del: true } });
  }
  return ops;
}

async function push() {
  if (!SY.ready) return;
  if (SY.pushing) { SY.again = true; return; }
  const ops = diff();
  if (!ops.length) return;
  SY.pushing = true;
  try {
    const { fs, db } = SY.fb;
    for (let i = 0; i < ops.length; i += 400) {
      const part = ops.slice(i, i + 400), batch = fs.writeBatch(db);
      part.forEach((o) => batch.set(fs.doc(db, 'users', SY.uid, COLS[o.type], o.id), o.doc));
      await batch.commit();
      part.forEach((o) => { SY.meta[o.k] = o.m; });
    }
    SY.last = Date.now();
    persist();
    setState('live', '');
  } catch (e) {
    setState('error', 'Hochladen fehlgeschlagen: ' + (e.message || e));
  }
  SY.pushing = false;
  if (SY.again) { SY.again = false; schedulePush(); }
}
function schedulePush() {
  if (!SY.ready) return;
  clearTimeout(SY.timer);
  SY.timer = setTimeout(push, 1200);
}

/* ---- Verbindung ---- */
function stop() {
  SY.unsub.forEach((u) => { try { u(); } catch { /* egal */ } });
  SY.unsub = [];
  SY.ready = false;
  clearTimeout(SY.timer);
}

async function start(user) {
  stop();
  if (SY.uid !== user.uid) { SY.meta = {}; SY.orphans = {}; SY.uid = user.uid; persist(); }  // anderes Konto -> neu abgleichen
  setState('sync', '');
  const { fs, db } = SY.fb;
  let pending = TYPES.length, done;
  const first = new Promise((res) => { done = res; });

  TYPES.forEach((type) => {
    let got = false;
    const un = fs.onSnapshot(fs.collection(db, 'users', user.uid, COLS[type]), (snap) => {
      let changed = false;
      if (!got && RESETTABLE[type]) {
        // Neues Gerät mit unberührten Startdaten: den vorhandenen Stand übernehmen statt ihn zu verdoppeln.
        const live = snap.docs.some((d) => { const x = d.data(); return x && !x.del; });
        if (live && isPristine(type)) { resetType(type); changed = true; }
      }
      snap.docChanges().forEach((ch) => {
        if (ch.type !== 'removed' && applyRemote(type, ch.doc.id, ch.doc.data()) === 'changed') changed = true;
      });
      if (retryOrphans()) changed = true;
      persist();
      if (changed) {
        window.dispatchEvent(new CustomEvent('shopwise:stock-changed'));
        window.dispatchEvent(new CustomEvent('shopwise:remote-changed'));
      }
      if (!got) { got = true; if (--pending === 0) done(); }
    }, (err) => {
      setState('error', err.code === 'permission-denied'
        ? 'Keine Berechtigung – bitte die Firestore-Regeln im Firebase-Projekt prüfen.'
        : (err.message || 'Abgleich-Fehler'));
      if (!got) { got = true; if (--pending === 0) done(); }
    });
    SY.unsub.push(un);
  });

  await first;
  if (SY.state === 'error') return;
  SY.ready = true;
  await push();
  if (SY.state !== 'error') { SY.last = Date.now(); persist(); setState('live', ''); }
}

async function init() {
  if (SY.fb) return true;
  try {
    setState('connect', '');
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
    const [app, auth, fs] = await Promise.all([
      import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js'),
    ]);
    const a = app.initializeApp(FIREBASE_CONFIG);
    const au = auth.getAuth(a);
    const db = fs.initializeFirestore(a, { experimentalAutoDetectLongPolling: true });
    SY.fb = { auth, fs, au, db };
    auth.onAuthStateChanged(au, (u) => {
      SY.user = u;
      if (u) start(u);
      else { stop(); setState('login'); }
    });
    return true;
  } catch (e) {
    SY.fb = null;
    setState('error', 'Verbindung zu Firebase nicht möglich (offline?). ' + (e && e.message ? e.message : ''));
    return false;
  }
}

const MESSAGES = {
  'auth/invalid-email': 'Ungültige E-Mail-Adresse.',
  'auth/missing-password': 'Bitte Passwort eingeben.',
  'auth/weak-password': 'Das Passwort ist zu kurz (mindestens 6 Zeichen).',
  'auth/email-already-in-use': 'Für diese E-Mail gibt es schon ein Konto – bitte „Anmelden“.',
  'auth/invalid-credential': 'E-Mail oder Passwort stimmt nicht.',
  'auth/wrong-password': 'E-Mail oder Passwort stimmt nicht.',
  'auth/user-not-found': 'Dazu gibt es noch kein Konto – bitte „Konto erstellen“.',
  'auth/network-request-failed': 'Keine Verbindung. Bist du online?',
  'auth/operation-not-allowed': 'E-Mail/Passwort ist in Firebase nicht aktiviert.',
  'auth/too-many-requests': 'Zu viele Versuche – bitte kurz warten.',
};
const message = (code) => MESSAGES[code] || `Das hat nicht geklappt (${code || 'unbekannt'}).`;

/* ---- Öffentliche Funktionen für die Oberfläche ---- */
export function getSync() {
  return { state: SY.state, err: SY.err, email: SY.user ? SY.user.email || '' : '', signedIn: !!SY.user, last: SY.last };
}

export async function login(mail, pw, create = false) {
  if (!mail || !pw) return 'Bitte E-Mail und Passwort eingeben.';
  if (!(await init())) return SY.err || 'Keine Verbindung.';
  try {
    const { auth, au } = SY.fb;
    if (create) await auth.createUserWithEmailAndPassword(au, mail, pw);
    else await auth.signInWithEmailAndPassword(au, mail, pw);
    return '';
  } catch (e) {
    return message(e.code);
  }
}

export async function forgotPassword(mail) {
  if (!mail) return 'Gib oben deine E-Mail ein.';
  if (!(await init())) return SY.err || 'Keine Verbindung.';
  try {
    await SY.fb.auth.sendPasswordResetEmail(SY.fb.au, mail);
    return 'E-Mail zum Zurücksetzen gesendet.';
  } catch (e) {
    return message(e.code);
  }
}

export async function logout() {
  stop();
  try { await SY.fb.auth.signOut(SY.fb.au); } catch { /* egal */ }
  SY.meta = {}; SY.orphans = {}; SY.uid = ''; SY.user = null;
  persist();
  setState('login', '');
}

export async function syncNow() {
  if (!SY.ready) return 'Noch nicht verbunden.';
  await push();
  return SY.state === 'error' ? 'Abgleich unvollständig.' : 'Abgeglichen.';
}

export function initSync() {
  load();
  window.addEventListener('shopwise:data-changed', schedulePush);
  window.addEventListener('online', () => { if (!SY.fb && SY.uid) init(); });
  if (SY.uid) init();   // nur starten, wenn hier schon angemeldet; sonst erst beim Anmelden
}
