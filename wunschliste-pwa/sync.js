/* Wunschliste – Konto-Sicherung & Abgleich zwischen Geräten (Firebase: Anmeldung + Firestore, kostenloser Spark-Tarif).
   Gleiches Firebase-Projekt und gleiches Konto wie FoodPro und Lernwerkstatt.
   Klassisches Skript: teilt sich den Scope mit app.js (items, settings, persistMany, render, toast …).
   Lokal zuerst: alles liegt weiter im Gerät, Firebase gleicht nur ab. Dokumente unter users/<uid>/:
     wl_items/<id>      = { d: Wunsch (Bilder nur als ID-Liste), u: Zeitstempel, del }
     wl_images/<bildId> = { d: { f: Vollbild, t: Vorschau }, u, del }   (eigene Dokumente: Firestore-Limit 1 MB)
     wl_settings/main   = { d: Design-Einstellungen, u }
   Letzte Änderung gewinnt. Die bestehenden Firestore-Regeln (users/{uid}/**) gelten auch hierfür. */
const SYK = "wunschliste.sync";
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
const SY_COLS = { items: "wl_items", images: "wl_images", settings: "wl_settings" };
const SY_SET_KEYS = ["mode", "accent", "amoled", "dense", "remind"];
const SY = { uid: "", meta: {}, last: 0, user: null, fb: null, ready: false, pushing: false, again: false, unsub: [], err: "", state: "off", t: null, imgs: {}, want: {} };

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
const syClean = v => JSON.parse(JSON.stringify(v));
const sySettings = () => { const o = {}; SY_SET_KEYS.forEach(k => { o[k] = settings[k]; }); return o; };
function syImgsCache() { items.forEach(it => it.images.forEach(im => { if (im.id) SY.imgs[im.id] = im; })); }

/* Wunsch in Sync-Form: Bilder nur als ID-Liste. Noch nicht eingetroffene Bilder bleiben in der Liste,
   damit ein Gerät, dem Bilder noch fehlen, die Liste nicht verkürzt. */
function syForm(it) {
  const ids = it.images.map(i => i.id);
  (SY.want[it.id] || []).forEach(id => { if (!SY.imgs[id] && !ids.includes(id)) ids.push(id); });
  return { ...it, images: ids };
}
function syBuildImages(id) {
  return (SY.want[id] || []).map(i => SY.imgs[i]).filter(Boolean).map(i => ({ id: i.id, f: i.f, t: i.t }));
}

/* ---- Abgleichslogik ---- */
/* Dokument von einem anderen Gerät übernehmen. Gibt true zurück, wenn sich lokal etwas geändert hat. */
function syRemote(type, id, doc, dirty) {
  if (!doc || typeof doc.u !== "number") return false;
  const k = type + "/" + id, m = SY.meta[k];
  if (m && m.u >= doc.u) return false;
  if (type === "items") {
    const i = items.findIndex(x => x.id === id);
    if (m && !m.del && i >= 0 && syH(syForm(items[i])) !== m.h) return false; // eigene, noch nicht hochgeladene Änderung hat Vorrang
    if (doc.del) {
      if (i >= 0) { items.splice(i, 1); dirty.rm.add(id); }
      delete SY.want[id];
      SY.meta[k] = { u: doc.u, h: null, del: true };
      return true;
    }
    SY.want[id] = Array.isArray(doc.d.images) ? doc.d.images.filter(x => typeof x === "string") : [];
    const n = normItem({ ...doc.d, id, images: [] });
    if (!n) return false;
    n.images = syBuildImages(id);
    if (i >= 0) items[i] = n; else items.push(n);
    dirty.put.add(id);
    SY.meta[k] = { u: doc.u, h: syH(syForm(n)) };
    return true;
  }
  if (type === "images") {
    if (m && !m.del && SY.imgs[id] && m.h !== syH({ id })) return false;
    if (doc.del) { delete SY.imgs[id]; SY.meta[k] = { u: doc.u, h: null, del: true }; }
    else {
      if (!doc.d || !/^data:image\//.test(doc.d.f || "")) return false;
      SY.imgs[id] = { id, f: doc.d.f, t: /^data:image\//.test(doc.d.t || "") ? doc.d.t : doc.d.f };
      SY.meta[k] = { u: doc.u, h: syH({ id }) };
    }
    items.forEach(it => { if ((SY.want[it.id] || []).includes(id)) { it.images = syBuildImages(it.id); dirty.put.add(it.id); } });
    return true;
  }
  if (type === "settings") {
    if (doc.del || !doc.d) return false;
    if (m && !m.del && syH(sySettings()) !== m.h) return false;
    SY_SET_KEYS.forEach(k2 => { if (doc.d[k2] !== undefined) settings[k2] = doc.d[k2]; });
    SY.meta[k] = { u: doc.u, h: syH(sySettings()) };
    dirty.set = true;
    return true;
  }
  return false;
}
/* Lokale Änderungen seit dem letzten Abgleich ermitteln. */
function syDiff() {
  const ops = [], now = Date.now(), seen = new Set();
  const consider = (type, id, hashOf, docOf) => {
    const k = type + "/" + id; seen.add(k);
    const h = syH(hashOf), m = SY.meta[k];
    if (!m || m.h !== h) { const u = Math.max(now, (m ? m.u : 0) + 1); ops.push({ type, id, k, doc: { d: docOf(), u, del: false }, m: { u, h }, size: type === "images" ? 1 : 0 }); }
  };
  syImgsCache();
  items.forEach(it => {
    const f = syForm(it);
    consider("items", it.id, f, () => syClean(f));
    it.images.forEach(im => { if (im.id) consider("images", im.id, { id: im.id }, () => ({ f: im.f, t: im.t })); });
  });
  consider("settings", "main", sySettings(), () => syClean(sySettings()));
  Object.keys(SY.meta).forEach(k => {
    if (seen.has(k) || SY.meta[k].del) return;
    const [type, ...rest] = k.split("/"), u = Math.max(now, SY.meta[k].u + 1);
    ops.push({ type, id: rest.join("/"), k, doc: { del: true, u }, m: { u, h: null, del: true }, size: 0 });
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
  syImgsCache();
  SY.state = "sync"; SY.err = ""; syPanelRefresh();
  const { fs, db } = SY.fb, types = ["images", "items", "settings"]; // Bilder zuerst, damit Wünsche sofort vollständig sind
  let pending = types.length, done;
  const first = new Promise(res => { done = res; });
  types.forEach(t => {
    let got = false;
    const un = fs.onSnapshot(fs.collection(db, "users", user.uid, SY_COLS[t]), snap => {
      const dirty = { put: new Set(), rm: new Set(), set: false };
      let changed = false;
      snap.docChanges().forEach(ch => { if (ch.type !== "removed" && syRemote(t, ch.doc.id, ch.doc.data(), dirty)) changed = true; });
      if (changed) syChanged(dirty);
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
async function syChanged(dirty) {
  sySave();
  if (dirty.set) { saveSettings(); applyTheme(); }
  const list = items.filter(i => dirty.put.has(i.id));
  if (list.length) await persistMany(list);
  for (const id of dirty.rm) await removeFromDb(id);
  syRender();
}
function syRender() {
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $("#sheetRoot") && $("#sheetRoot").contains(a)) { clearTimeout(SY.rt); SY.rt = setTimeout(syRender, 1500); return; }
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
    for (let i = 0; i < ops.length;) {
      const batch = fs.writeBatch(db), part = [];
      let imgs = 0;
      while (i < ops.length && part.length < 400 && imgs < 4) { const o = ops[i++]; part.push(o); imgs += o.size; }
      part.forEach(o => batch.set(fs.doc(db, "users", SY.uid, SY_COLS[o.type], o.id), o.doc));
      await batch.commit();
      part.forEach(o => { SY.meta[o.k] = o.m; });
    }
    SY.last = Date.now(); SY.err = ""; sySave();
  } catch (e) { SY.err = "Hochladen fehlgeschlagen: " + (e.message || e); }
  SY.pushing = false;
  if (SY.again) { SY.again = false; syOnSave(); }
  syPanelRefresh();
}
/* wird von app.js nach jeder Speicherung aufgerufen */
function syOnSave() {
  if (!SY.ready) return;
  clearTimeout(SY.t); SY.t = setTimeout(syPush, 1200);
}

/* ---- Oberfläche (Einstellungen → Konto & Sicherung) ---- */
function syPanelRefresh() {
  if (!window.wlSettingsRedo) return;
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA/.test(a.tagName) && $("#sheetRoot").contains(a)) return; // nicht beim Tippen stören
  window.wlSettingsRedo();
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
      <div class="muted small" style="margin-bottom:12px">Melde dich mit deinem Konto an (dasselbe wie bei FoodPro und Lernwerkstatt). Dann sind deine Wünsche gesichert und auf allen Geräten live gleich. Noch kein Konto? Einfach „Konto erstellen“.</div>
      <div class="stack"><input class="fld" type="email" id="syMail" placeholder="E-Mail" autocomplete="email" inputmode="email" autocapitalize="off">
      <input class="fld" type="password" id="syPass" placeholder="Passwort (mind. 6 Zeichen)" autocomplete="current-password"></div>
      <div class="two" style="margin-top:12px"><button type="button" class="btn pri" data-act="syLogin">Anmelden</button><button type="button" class="btn" data-act="syRegister">Konto erstellen</button></div>
      <button type="button" class="linkbtn" data-act="syForgot">Passwort vergessen?</button>${st}${err}</div>`;
  }
  const ago = SY.last ? new Date(SY.last).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const label = SY.state === "live" ? `<div class="live"><i></i>Gesichert &amp; live</div>` : SY.state === "sync" ? `<div class="muted"><span class="spin"></span>Gleiche ab …</div>` : `<div class="warn small">Nicht verbunden</div>`;
  return `<div class="panel"><h3>Konto &amp; Sicherung</h3>${label}
    <div class="muted small" style="margin-top:6px">Angemeldet als ${esc(SY.user.email || "")}${ago ? " · zuletzt abgeglichen " + ago : ""}</div>
    <div class="muted small" style="margin-top:6px">Änderungen erscheinen in Sekunden auf allen angemeldeten Geräten. Ohne Netz arbeitet die App weiter und gleicht später ab.</div>${err}
    <div class="two" style="margin-top:12px"><button type="button" class="btn pri" data-act="syNow">Jetzt abgleichen</button><button type="button" class="btn" data-act="syLogout">Abmelden</button></div></div>`;
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
    SY.meta = {}; SY.uid = ""; SY.want = {}; sySave(); syPanelRefresh(); toast("Abgemeldet – die Daten bleiben auf diesem Gerät");
  } else if (a === "syNow") {
    if (!SY.ready) return toast("Noch nicht verbunden");
    await syPush(); toast(SY.err ? "Abgleich unvollständig" : "Abgeglichen");
  }
});
window.addEventListener("online", () => { if (!SY.fb && SY.uid) syInit(); });
syLoad();
if (SY.uid) window.wlItemsReady.then(syInit); // nur starten, wenn auf diesem Gerät schon angemeldet; sonst erst beim Anmelden
