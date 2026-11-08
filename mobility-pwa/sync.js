/* Mobility Quest – Konto-Sicherung & Abgleich zwischen Geräten (Firebase: Anmeldung + Firestore, kostenloser Spark-Tarif).
   Gleiches Firebase-Projekt und gleiches Konto wie Wunschliste, FoodPro und Lernwerkstatt.
   Klassisches Skript: teilt sich den Scope mit app.js (S, save, saveLocal, render, toast …).
   Lokal zuerst: alles liegt weiter im Gerät, Firebase gleicht nur ab. Dokumente unter users/<uid>/:
     mq_plans/<id>    = { d: eigene Routine, u: Zeitstempel, del }
     mq_logs/<id>     = { d: abgeschlossene Quest, u, del }
     mq_tests/<id>    = { d: Testtag, u, del }
     mq_settings/main = { d: Einstellungen & Wochenplan, u }
   Letzte Änderung gewinnt. Die bestehenden Firestore-Regeln (users/{uid}/**) gelten auch hierfür. */
const SYK = "mobility.sync";
const SY_V = "10.14.1";
/* Öffentliche Web-Konfiguration des Firebase-Projekts (kein Geheimnis – geschützt wird über Anmeldung + Firestore-Regeln). */
const SY_CFG = {
  apiKey: "AIzaSyAlCKl6VVzqbLOoYMD1zlswFDLt47sI_2I",
  authDomain: "foodpro-e2a44.firebaseapp.com",
  projectId: "foodpro-e2a44",
  storageBucket: "foodpro-e2a44.firebasestorage.app",
  messagingSenderId: "803117480250",
  appId: "1:803117480250:web:0f54697c6e1ac470ae3803",
};
const SY_COLS = { plans: "mq_plans", logs: "mq_logs", tests: "mq_tests", settings: "mq_settings" };
const SY_LISTS = ["plans", "logs", "tests"];
const SY = { uid: "", meta: {}, last: 0, user: null, fb: null, ready: false, pushing: false, again: false, unsub: [], err: "", state: "off", t: null };

function syLoad() {
  try { const j = JSON.parse(localStorage.getItem(SYK) || "null"); if (j) { SY.uid = j.uid || ""; SY.meta = j.meta || {}; SY.last = j.last || 0; } } catch (e) { /* leer */ }
}
function sySave() {
  try { localStorage.setItem(SYK, JSON.stringify({ uid: SY.uid, meta: SY.meta, last: SY.last })); } catch (e) { /* Speicher voll */ }
}

/* ---- Hilfsfunktionen (reihenfolge-unabhängiger Hash) ---- */
function syStable(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(syStable).join(",") + "]";
  return "{" + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + syStable(v[k])).join(",") + "}";
}
function syH(v) { const s = syStable(v); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; }
/* Firestore mag keine verschachtelten Arrays – Routinen-Einträge [id, wert] daher als Objekte speichern */
const syOut = (type, x) => {
  const c = JSON.parse(JSON.stringify(x));
  if (type === "plans") c.items = (c.items || []).map(([e, v]) => ({ e, v }));
  return c;
};
const syIn = (type, x) => {
  if (type === "plans") x.items = (x.items || []).map(o => Array.isArray(o) ? o : [o.e, o.v]);
  return x;
};

/* ---- Abgleichslogik ---- */
function syRemote(type, id, doc) {
  if (!doc || typeof doc.u !== "number") return false;
  const k = type + "/" + id, m = SY.meta[k];
  if (m && m.u === doc.u) return false; // eigene Echos
  if (type === "settings") {
    if (doc.del || !doc.d) return false;
    if (m && !m.del && syH(S.settings) !== m.h) return false; // lokale, noch nicht hochgeladene Änderung hat Vorrang
    S.settings = Object.assign(S.settings, doc.d);
    SY.meta[k] = { u: doc.u, h: syH(S.settings) };
    return true;
  }
  const arr = S[type], i = arr.findIndex(x => x.id === id);
  if (m && !m.del && i >= 0 && syH(arr[i]) !== m.h) return false;
  if (doc.del) {
    if (i >= 0) arr.splice(i, 1);
    SY.meta[k] = { u: doc.u, h: null, del: true };
    return true;
  }
  if (!doc.d) return false;
  const n = syIn(type, { ...doc.d, id });
  if (i >= 0) arr[i] = n; else arr.push(n);
  SY.meta[k] = { u: doc.u, h: syH(n) };
  return true;
}
function syDiff() {
  const ops = [], now = Date.now(), seen = new Set();
  const consider = (type, id, obj) => {
    const k = type + "/" + id; seen.add(k);
    const h = syH(obj), m = SY.meta[k];
    if (!m || m.h !== h) { const u = Math.max(now, (m ? m.u : 0) + 1); ops.push({ type, id, k, doc: { d: syOut(type, obj), u, del: false }, m: { u, h } }); }
  };
  SY_LISTS.forEach(t => S[t].forEach(x => consider(t, x.id, x)));
  consider("settings", "main", S.settings);
  Object.keys(SY.meta).forEach(k => {
    if (seen.has(k) || SY.meta[k].del) return;
    const [type, ...rest] = k.split("/"), u = Math.max(now, SY.meta[k].u + 1);
    ops.push({ type, id: rest.join("/"), k, doc: { del: true, u }, m: { u, h: null, del: true } });
  });
  return ops;
}

/* ---- Firebase laden & verbinden ---- */
async function syInit() {
  if (SY.fb) return;
  try {
    SY.state = "connect"; syPanelRefresh();
    const base = `https://www.gstatic.com/firebasejs/${SY_V}/`;
    const [app, auth, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
    const a = app.initializeApp(SY_CFG);
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
  SY.state = "sync"; SY.err = ""; syPanelRefresh();
  const { fs, db } = SY.fb, types = Object.keys(SY_COLS);
  let pending = types.length, done;
  const first = new Promise(res => { done = res; });
  types.forEach(t => {
    let got = false;
    const un = fs.onSnapshot(fs.collection(db, "users", user.uid, SY_COLS[t]), snap => {
      let changed = false;
      snap.docChanges().forEach(ch => { if (ch.type !== "removed" && syRemote(t, ch.doc.id, ch.doc.data())) changed = true; });
      if (changed) { sySave(); saveLocal(); syRender(); }
      if (!got) { got = true; if (--pending === 0) done(); }
    }, err => {
      SY.err = err.code === "permission-denied" ? "Keine Berechtigung – bitte die Firestore-Regeln im Firebase-Projekt prüfen." : (err.message || "Abgleich-Fehler");
      SY.state = "error"; syPanelRefresh();
      if (!got) { got = true; if (--pending === 0) done(); }
    });
    SY.unsub.push(un);
  });
  await first;
  if (SY.state === "error") return;
  SY.ready = true; SY.state = "live";
  await syPush();
  SY.last = Date.now(); sySave(); syPanelRefresh();
}
function syRender() {
  if (typeof PL !== "undefined" && PL.on) return; // Timer nicht stören
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { clearTimeout(SY.rt); SY.rt = setTimeout(syRender, 1500); return; }
  if ($("#sheetRoot").classList.contains("on") && !window.mqSettingsRedo) { clearTimeout(SY.rt); SY.rt = setTimeout(syRender, 1500); return; }
  render(); syPanelRefresh();
}
async function syPush() {
  if (!SY.ready) return;
  if (SY.pushing) { SY.again = true; return; }
  SY.pushing = true;
  const fails = [], { fs, db } = SY.fb;
  const ref = o => fs.doc(db, "users", SY.uid, SY_COLS[o.type], o.id);
  try {
    const ops = syDiff();
    for (let i = 0; i < ops.length; i += 400) {
      const part = ops.slice(i, i + 400);
      try { const b = fs.writeBatch(db); part.forEach(o => b.set(ref(o), o.doc)); await b.commit(); part.forEach(o => { SY.meta[o.k] = o.m; }); }
      catch (e) { for (const o of part) { try { await fs.setDoc(ref(o), o.doc); SY.meta[o.k] = o.m; } catch (e2) { fails.push(e2); } } }
      sySave();
    }
    if (fails.length) SY.err = fails.length + " Eintrag/Einträge konnten nicht hochgeladen werden: " + (fails[0].message || fails[0]);
    else { SY.err = ""; SY.last = Date.now(); sySave(); }
  } catch (e) { SY.err = "Hochladen fehlgeschlagen: " + (e.message || e); fails.push(e); }
  SY.pushing = false;
  clearTimeout(SY.retryT);
  if (fails.length) SY.retryT = setTimeout(syPush, 60000);
  if (SY.again) { SY.again = false; syOnSave(); }
  syPanelRefresh();
}
/* wird von app.js nach jeder Speicherung aufgerufen */
function syOnSave() {
  if (!SY.ready) return;
  clearTimeout(SY.t); SY.t = setTimeout(syPush, 1200);
}

/* ---- Oberfläche (Optionen → Konto & Sicherung) ---- */
function syPanelRefresh() {
  if (!window.mqSettingsRedo) return;
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA/.test(a.tagName) && $("#sheetRoot").contains(a)) return;
  window.mqSettingsRedo();
}
const syMsg = c => ({
  "auth/invalid-email": "Ungültige E-Mail-Adresse.", "auth/missing-password": "Bitte Passwort eingeben.",
  "auth/weak-password": "Das Passwort ist zu kurz (mindestens 6 Zeichen).", "auth/email-already-in-use": "Für diese E-Mail gibt es schon ein Konto – bitte „Anmelden“.",
  "auth/invalid-credential": "E-Mail oder Passwort stimmt nicht.", "auth/wrong-password": "E-Mail oder Passwort stimmt nicht.", "auth/user-not-found": "Dazu gibt es noch kein Konto – bitte „Konto erstellen“.",
  "auth/network-request-failed": "Keine Verbindung. Bist du online?", "auth/operation-not-allowed": "E-Mail/Passwort ist in Firebase nicht aktiviert.", "auth/too-many-requests": "Zu viele Versuche – bitte kurz warten.",
}[c] || "Das hat nicht geklappt (" + c + ").");

function syPanel() {
  const err = SY.err ? `<div class="status err">${esc(SY.err)}</div>` : "";
  if (!SY.user) {
    const st = SY.state === "connect" ? `<div class="muted small" style="margin-top:12px"><span class="spin"></span>Verbinde …</div>` : "";
    return `<div class="panel"><h3>Konto &amp; Sicherung</h3>
      <div class="muted small" style="margin-bottom:12px">Melde dich mit deinem Konto an (dasselbe wie bei Wunschliste, FoodPro und Lernwerkstatt). Dann sind Plan, Quests und Tests gesichert und auf Handy, APK und Browser gleich.</div>
      <div class="stack"><input class="fld" type="email" id="syMail" placeholder="E-Mail" autocomplete="email" inputmode="email" autocapitalize="off">
      <input class="fld" type="password" id="syPass" placeholder="Passwort (mind. 6 Zeichen)" autocomplete="current-password"></div>
      <div class="two" style="margin-top:14px"><button type="button" class="btn pri" data-act="syLogin">ANMELDEN</button><button type="button" class="btn" data-act="syRegister">KONTO NEU</button></div>
      <button type="button" class="linkbtn" data-act="syForgot">Passwort vergessen?</button>${st}${err}</div>`;
  }
  const ago = SY.last ? new Date(SY.last).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const label = SY.state === "live" && SY.err ? `<div class="warn">⚠ Nicht vollständig gesichert</div>` : SY.state === "live" ? `<div class="live"><i></i>Gesichert &amp; live</div>` : SY.state === "sync" ? `<div class="muted"><span class="spin"></span>Gleiche ab …</div>` : `<div class="warn small">Nicht verbunden</div>`;
  return `<div class="panel"><h3>Konto &amp; Sicherung</h3>${label}
    <div class="muted small" style="margin-top:6px">Angemeldet als ${esc(SY.user.email || "")}${ago ? " · zuletzt abgeglichen " + ago : ""}</div>${err}
    <div class="two" style="margin-top:14px"><button type="button" class="btn pri" data-act="syNow">ABGLEICHEN</button><button type="button" class="btn" data-act="syLogout">ABMELDEN</button></div></div>`;
}

document.addEventListener("click", async ev => {
  const t = ev.target.closest("[data-act^=sy]"); if (!t) return;
  const a = t.dataset.act, val = id => ($("#" + id) ? $("#" + id).value.trim() : "");
  if (a === "syLogin" || a === "syRegister") {
    const mail = val("syMail"), pw = val("syPass"); if (!mail || !pw) return toast("Bitte E-Mail und Passwort eingeben");
    if (!SY.fb) { await syInit(); if (!SY.fb) return toast(SY.err || "Keine Verbindung"); }
    try { SY.err = ""; a === "syLogin" ? await SY.fb.auth.signInWithEmailAndPassword(SY.fb.au, mail, pw) : await SY.fb.auth.createUserWithEmailAndPassword(SY.fb.au, mail, pw); }
    catch (e) { SY.err = syMsg(e.code); syPanelRefresh(); }
  } else if (a === "syForgot") {
    const mail = val("syMail"); if (!mail) return toast("Gib oben deine E-Mail ein");
    if (!SY.fb) { await syInit(); if (!SY.fb) return toast(SY.err || "Keine Verbindung"); }
    try { await SY.fb.auth.sendPasswordResetEmail(SY.fb.au, mail); toast("E-Mail zum Zurücksetzen gesendet"); } catch (e) { toast(syMsg(e.code)); }
  } else if (a === "syLogout") {
    syStop(); try { await SY.fb.auth.signOut(SY.fb.au); } catch (e) { /* egal */ }
    SY.meta = {}; SY.uid = ""; sySave(); syPanelRefresh(); toast("Abgemeldet – die Daten bleiben auf diesem Gerät");
  } else if (a === "syNow") {
    if (!SY.ready) return toast("Noch nicht verbunden");
    await syPush(); toast(SY.err ? "Abgleich unvollständig" : "Abgeglichen");
  }
});
window.addEventListener("online", () => { if (!SY.fb && SY.uid) syInit(); });
syLoad();
if (SY.uid) syInit(); // nur starten, wenn auf diesem Gerät schon angemeldet; sonst erst beim Anmelden
