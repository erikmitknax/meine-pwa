/* FoodPro – Echtzeit-Abgleich zwischen Geräten (Firebase: Anmeldung + Firestore, kostenloser Spark-Tarif).
   Klassisches Skript: teilt sich den Scope mit app.js (D, KEY, uid, render, toast, esc, $ …).
   Jeder Eintrag (Lebensmittel, Rezept, Tagebucheintrag, Gewicht, Einstellungen) ist ein eigenes Dokument
   unter users/<uid>/<typ>/<id> = { d: Daten, u: Zeitstempel, del: gelöscht? }. Letzte Änderung gewinnt. */
const SYK = "foodpro.sync";
const SY_V = "10.14.1";
/* Öffentliche Web-Konfiguration des Firebase-Projekts (kein Geheimnis – geschützt wird über Anmeldung + Firestore-Regeln). */
const SY_DEFAULT_CFG = {
  apiKey: "AIzaSyAlCKl6VVzqbLOoYMD1zlswFDLt47sI_2I",
  authDomain: "foodpro-e2a44.firebaseapp.com",
  projectId: "foodpro-e2a44",
  storageBucket: "foodpro-e2a44.firebasestorage.app",
  messagingSenderId: "803117480250",
  appId: "1:803117480250:web:0f54697c6e1ac470ae3803",
};
const SY = { cfg: null, uid: "", meta: {}, last: 0, user: null, fb: null, ready: false, pushing: false, again: false, unsub: [], err: "", state: "off", t: null, rt: null };
const SYT = {
  foods: () => D.foods.map(f => [f.id, f]),
  recipes: () => D.recipes.map(r => [r.id, r]),
  entries: () => D.entries.map(e => [e.id, e]),
  weights: () => Object.entries(D.weights),
};
const SY_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}`;

function syLoad() {
  try { const j = JSON.parse(localStorage.getItem(SYK) || "null"); if (j) { SY.cfg = j.cfg || null; SY.uid = j.uid || ""; SY.meta = j.meta || {}; SY.last = j.last || 0; } } catch (e) { /* leer */ }
}
function sySave() {
  try { localStorage.setItem(SYK, JSON.stringify({ cfg: SY.cfg, uid: SY.uid, meta: SY.meta, last: SY.last })); } catch (e) { /* Speicher voll */ }
}

/* ---- Hilfsfunktionen (reihenfolge-unabhängiger Hash, damit Firestore-Schlüsselreihenfolge egal ist) ---- */
function syStable(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(syStable).join(",") + "]";
  return "{" + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + syStable(v[k])).join(",") + "}";
}
function syH(v) { const s = syStable(v); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; }
const syClean = v => JSON.parse(JSON.stringify(v));
function sySettings() { const s = { ...D.settings }; delete s.geminiKey; delete s.apiKey; delete s.model; return syClean(s); }

/* ---- Abgleichslogik ---- */
function syApply(type, id, doc) {
  if (type === "settings") {
    if (doc.del) return;
    const key = D.settings.geminiKey;
    D.settings = { ...DEFAULTS().settings, ...doc.d, geminiKey: key || "" };
    return;
  }
  if (type === "weights") { if (doc.del) delete D.weights[id]; else D.weights[id] = doc.d; return; }
  const arr = D[type], i = arr.findIndex(x => x.id === id);
  if (doc.del) { if (i >= 0) arr.splice(i, 1); }
  else if (i >= 0) arr[i] = doc.d; else arr.push(doc.d);
}
function syLocalHash(type, id) {
  if (type === "settings") return syH(sySettings());
  if (type === "weights") return D.weights[id] === undefined ? undefined : syH(D.weights[id]);
  const it = D[type].find(x => x.id === id); return it ? syH(it) : undefined;
}
/* Dokument von einem anderen Gerät übernehmen. true = lokale Daten haben sich geändert. */
function syRemote(type, id, doc) {
  if (!doc || typeof doc.u !== "number") return false;
  const k = type + "/" + id, m = SY.meta[k];
  if (m && m.u >= doc.u) return false;
  if (m && !m.del && syLocalHash(type, id) !== m.h) return false; // eigene, noch nicht hochgeladene Änderung hat Vorrang
  syApply(type, id, doc);
  if (doc.del) SY.meta[k] = { u: doc.u, h: null, del: true };
  else SY.meta[k] = { u: doc.u, h: syH(type === "settings" ? sySettings() : doc.d) };
  return true;
}
/* Lokale Änderungen seit dem letzten Abgleich ermitteln. */
function syDiff() {
  const ops = [], now = Date.now(), seen = new Set();
  const consider = (type, id, item) => {
    const k = type + "/" + id; seen.add(k);
    const h = syH(item), m = SY.meta[k];
    if (!m || m.h !== h) { const u = Math.max(now, (m ? m.u : 0) + 1); ops.push({ type, id, k, doc: { d: syClean(item), u, del: false }, m: { u, h } }); }
  };
  Object.keys(SYT).forEach(t => SYT[t]().forEach(([id, item]) => consider(t, id, item)));
  consider("settings", "main", sySettings());
  Object.keys(SY.meta).forEach(k => {
    if (seen.has(k) || SY.meta[k].del) return;
    const [type, ...rest] = k.split("/"), u = Math.max(now, SY.meta[k].u + 1);
    ops.push({ type, id: rest.join("/"), k, doc: { del: true, u }, m: { u, h: null, del: true } });
  });
  return ops;
}

/* ---- Firebase laden & verbinden ---- */
async function syInit() {
  if (!SY.cfg || SY.fb) return;
  try {
    SY.state = "connect"; syPanelRefresh();
    const base = `https://www.gstatic.com/firebasejs/${SY_V}/`;
    const [app, auth, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
    const a = app.initializeApp(SY.cfg);
    const au = auth.getAuth(a);
    const db = fs.initializeFirestore(a, { experimentalAutoDetectLongPolling: true });
    SY.fb = { app, auth, fs, au, db };
    auth.onAuthStateChanged(au, u => { SY.user = u; if (u) syStart(u); else { syStop(); SY.state = "login"; syPanelRefresh(); } });
  } catch (e) {
    SY.fb = null; SY.state = "error"; SY.err = "Verbindung zu Firebase nicht möglich (offline?). " + (e && e.message ? e.message : "");
    syPanelRefresh();
  }
}
function syStop() { SY.unsub.forEach(u => { try { u(); } catch (e) { /* egal */ } }); SY.unsub = []; SY.ready = false; clearTimeout(SY.t); }
async function syStart(user) {
  syStop();
  if (SY.uid !== user.uid) { SY.meta = {}; SY.uid = user.uid; sySave(); } // anderes Konto -> neu abgleichen
  D.foods.forEach(f => { if (!f.id) f.id = uid(); }); D.recipes.forEach(r => { if (!r.id) r.id = uid(); }); D.entries.forEach(e => { if (!e.id) e.id = uid(); });
  SY.state = "sync"; SY.err = ""; syPanelRefresh();
  const { fs, db } = SY.fb, types = [...Object.keys(SYT), "settings"];
  let pending = types.length, done;
  const first = new Promise(res => { done = res; });
  types.forEach(t => {
    let got = false;
    const un = fs.onSnapshot(fs.collection(db, "users", user.uid, t), snap => {
      let changed = false;
      snap.docChanges().forEach(ch => { if (ch.type !== "removed" && syRemote(t, ch.doc.id, ch.doc.data())) changed = true; });
      if (changed) syChanged();
      if (!got) { got = true; if (--pending === 0) done(); }
    }, err => { SY.err = err.code === "permission-denied" ? "Keine Berechtigung – Firestore-Regeln prüfen (siehe Anleitung)." : (err.message || "Abgleich-Fehler"); SY.state = "error"; syPanelRefresh(); if (!got) { got = true; if (--pending === 0) done(); } });
    SY.unsub.push(un);
  });
  await first;
  if (SY.state === "error") return;
  SY.ready = true; SY.state = "live";
  await syPush();
  SY.last = Date.now(); sySave(); syPanelRefresh();
}
function syChanged() {
  try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* egal */ }
  sySave();
  if (typeof applyTheme === "function") applyTheme();
  syRender();
}
function syRender() {
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $("#view") && $("#view").contains(a)) { clearTimeout(SY.rt); SY.rt = setTimeout(syRender, 1500); return; }
  render();
}
async function syPush() {
  if (!SY.ready) return;
  if (SY.pushing) { SY.again = true; return; }
  const ops = syDiff();
  if (!ops.length) return;
  SY.pushing = true;
  try {
    const { fs, db } = SY.fb;
    for (let i = 0; i < ops.length; i += 400) {
      const batch = fs.writeBatch(db), part = ops.slice(i, i + 400);
      part.forEach(o => batch.set(fs.doc(db, "users", SY.uid, o.type, o.id), o.doc));
      await batch.commit();
      part.forEach(o => { SY.meta[o.k] = o.m; });
    }
    SY.last = Date.now(); SY.err = ""; sySave();
  } catch (e) { SY.err = "Hochladen fehlgeschlagen: " + (e.message || e); }
  SY.pushing = false;
  if (SY.again) { SY.again = false; syOnSave(); }
  syPanelRefresh();
}
/* wird von app.js bei jedem save() aufgerufen */
function syOnSave() {
  if (!SY.ready) return;
  clearTimeout(SY.t); SY.t = setTimeout(syPush, 1200);
}

/* ---- Oberfläche (Einstellungen → Echtzeit-Abgleich) ---- */
function syPanelRefresh() { if (typeof ui !== "undefined" && ui.tab === "settings") syRender(); }
const syMsg = c => ({
  "auth/invalid-email": "Ungültige E-Mail-Adresse.", "auth/missing-password": "Bitte Passwort eingeben.",
  "auth/weak-password": "Das Passwort ist zu kurz (mindestens 6 Zeichen).", "auth/email-already-in-use": "Für diese E-Mail gibt es schon ein Konto – bitte „Anmelden“.",
  "auth/invalid-credential": "E-Mail oder Passwort stimmt nicht.", "auth/wrong-password": "E-Mail oder Passwort stimmt nicht.", "auth/user-not-found": "Dazu gibt es noch kein Konto – bitte „Konto erstellen“.",
  "auth/network-request-failed": "Keine Verbindung. Bist du online?", "auth/operation-not-allowed": "E-Mail/Passwort ist in Firebase noch nicht aktiviert (Schritt 2).", "auth/too-many-requests": "Zu viele Versuche – bitte kurz warten.",
}[c] || "Das hat nicht geklappt (" + c + ").");
function syPanel() {
  const ago = SY.last ? new Date(SY.last).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  if (!SY.cfg) {
    return `<div class="panel"><div class="muted small" style="margin-top:14px">Damit deine Daten live auf allen Geräten (Handy, Tablet, PC-Browser) erscheinen, nutzt FoodPro einen kostenlosen Google-Firebase-Speicher. Einmal einrichten, dauert etwa 5 Minuten:</div>
      <div class="steps"><ol>
        <li>Öffne <a href="https://console.firebase.google.com" target="_blank" rel="noopener">console.firebase.google.com</a>, melde dich mit deinem Google-Konto an und tippe auf „Projekt erstellen“. Google Analytics kannst du ausschalten.</li>
        <li><b>Authentifizierung:</b> Build → Authentication → „Los geht’s“ → „E-Mail/Passwort“ aktivieren → Speichern.</li>
        <li><b>Datenbank:</b> Build → Firestore Database → „Datenbank erstellen“ → Standort z. B. europe-west3 → „Im Produktionsmodus starten“. Danach oben auf „Regeln“, alles ersetzen durch den Text unten (Kopieren-Knopf) und „Veröffentlichen“.</li>
        <li><b>App-Daten:</b> Zahnrad → Projekteinstellungen → „Allgemein“ → ganz unten „App hinzufügen“ → Web-Symbol &lt;/&gt; → Namen eingeben → „App registrieren“. Den Block <code>const firebaseConfig = {…}</code> kopieren und unten einfügen.</li>
      </ol><button class="btn sec block" style="margin-top:6px" data-act="syCopyRules">Regeln kopieren</button></div>
      <label>firebaseConfig einfügen</label><textarea id="syCfg" rows="9" style="min-height:190px;font-size:12px" placeholder='const firebaseConfig = { apiKey: "…", authDomain: "…", projectId: "…", … };'></textarea>
      <button class="btn block" style="margin-top:12px" data-act="syCfgSave">Weiter</button>${SY.err ? `<div class="status err">${esc(SY.err)}</div>` : ""}</div>`;
  }
  if (!SY.user) {
    const st = SY.state === "connect" ? `<div class="muted small" style="margin-top:12px"><span class="spin"></span>Verbinde …</div>` : "";
    return `<div class="panel"><div class="muted small" style="margin-top:14px">Melde dich mit E-Mail und Passwort an. Auf dem ersten Gerät erstellst du das Konto („Konto erstellen“), auf allen weiteren meldest du dich mit denselben Daten an („Anmelden“).</div>
      <label>E-Mail</label><input type="email" id="syMail" autocomplete="email" inputmode="email">
      <label>Passwort (mind. 6 Zeichen)</label><input type="password" id="syPass" autocomplete="current-password">
      <div class="grid2" style="margin-top:14px"><button class="btn" data-act="syLogin">Anmelden</button><button class="btn sec" data-act="syRegister">Konto erstellen</button></div>
      <button class="linkbtn" data-act="syForgot">Passwort vergessen?</button>${st}${SY.err ? `<div class="status err">${esc(SY.err)}</div>` : ""}
      </div>`;
  }
  const label = SY.state === "live" ? `<div class="dbx-state"><i></i>Echtzeit aktiv</div>` : SY.state === "sync" ? `<div class="muted"><span class="spin"></span>Gleiche ab …</div>` : `<div class="warn small">Nicht verbunden</div>`;
  return `<div class="panel"><div style="margin-top:14px">${label}</div>
    <div class="muted small" style="margin-top:6px">Angemeldet als ${esc(SY.user.email || "")}${ago ? " · zuletzt abgeglichen " + ago : ""}</div>
    <div class="muted small" style="margin-top:6px">Änderungen erscheinen in Sekunden auf allen angemeldeten Geräten. Der Gemini-Schlüssel wird nicht synchronisiert und bleibt auf diesem Gerät.</div>
    ${SY.err ? `<div class="status err">${esc(SY.err)}</div>` : ""}
    <div class="grid2" style="margin-top:14px"><button class="btn" data-act="syNow">Jetzt abgleichen</button><button class="btn sec" data-act="syLogout">Abmelden</button></div></div>`;
}
function syCfgFromText(txt) {
  const o = {};
  ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"].forEach(k => {
    const m = String(txt || "").match(new RegExp(k + "[\"'`]?\\s*[:=]\\s*[\"'`“”‘’]([^\"'`“”‘’]+)[\"'`“”‘’]"));
    if (m) o[k] = m[1];
  });
  return o.apiKey && o.projectId ? o : null;
}
document.addEventListener("click", async ev => {
  const t = ev.target.closest("[data-act^=sy]"); if (!t) return;
  const a = t.dataset.act, val = id => ($("#" + id) ? $("#" + id).value.trim() : "");
  if (a === "syCopyRules") toast((await copyText(SY_RULES)) ? "Regeln kopiert" : "Kopieren nicht möglich");
  else if (a === "syCfgSave") {
    const raw = val("syCfg"), c = syCfgFromText(raw);
    if (!raw) return toast("Das Feld ist leer – füge zuerst den firebaseConfig-Block ein");
    if (!c) return toast("Nicht erkannt: es fehlen apiKey und/oder projectId. Kopiere den ganzen Block von „const firebaseConfig“ bis „};“");
    SY.cfg = c; SY.err = ""; sySave(); syInit(); render();
  } else if (a === "syCfgReset") { syStop(); try { if (SY.fb) await SY.fb.auth.signOut(SY.fb.au); } catch (e) { /* egal */ } SY.cfg = null; SY.fb = null; SY.user = null; SY.state = "off"; sySave(); render(); }
  else if (a === "syLogin" || a === "syRegister") {
    const mail = val("syMail"), pw = val("syPass"); if (!mail || !pw) return toast("Bitte E-Mail und Passwort eingeben");
    if (!SY.fb) { await syInit(); if (!SY.fb) return toast(SY.err || "Keine Verbindung"); }
    try { SY.err = ""; a === "syLogin" ? await SY.fb.auth.signInWithEmailAndPassword(SY.fb.au, mail, pw) : await SY.fb.auth.createUserWithEmailAndPassword(SY.fb.au, mail, pw); }
    catch (e) { SY.err = syMsg(e.code); render(); }
  } else if (a === "syForgot") {
    const mail = val("syMail"); if (!mail) return toast("Gib oben deine E-Mail ein");
    try { await SY.fb.auth.sendPasswordResetEmail(SY.fb.au, mail); toast("E-Mail zum Zurücksetzen gesendet"); } catch (e) { toast(syMsg(e.code)); }
  } else if (a === "syLogout") { syStop(); try { await SY.fb.auth.signOut(SY.fb.au); } catch (e) { /* egal */ } SY.meta = {}; SY.uid = ""; sySave(); render(); toast("Abgemeldet – die Daten bleiben auf diesem Gerät"); }
  else if (a === "syNow") { if (!SY.ready) return toast("Noch nicht verbunden"); await syPush(); toast("Abgeglichen"); }
});
window.addEventListener("online", () => { if (SY.cfg && !SY.fb) syInit(); });
syLoad();
if (!SY.cfg) SY.cfg = SY_DEFAULT_CFG;
if (SY.uid) syInit(); // nur starten, wenn auf diesem Gerät schon angemeldet; sonst erst beim Anmelden
