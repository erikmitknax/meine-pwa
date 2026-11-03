/* Aufgaben – Konto & Abgleich zwischen Geräten (Firebase: Anmeldung + Firestore, kostenloser Spark-Tarif).
   Gleiches Firebase-Projekt und gleiches Konto wie FoodPro, Wunschliste und Lernwerkstatt.
   Klassisches Skript: teilt sich den Scope mit app.js (render, tick …). Lokal zuerst: alles liegt im Gerät,
   Firebase gleicht nur ab. Dokumente unter users/<uid>/au_tasks/<id> = { d: { title, due, rep, done, prevDue }, u: Zeitstempel, del }.
   Letzte Änderung gewinnt. Die bestehenden Firestore-Regeln (users/{uid}/**) gelten auch hierfür. */
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
const SY = { fb: null, user: null, unsub: null, state: "off", err: "", last: 0, pushing: false, again: false, chain: Promise.resolve(), retryT: null };

const syEsc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const syTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("Zeitüberschreitung")), ms))]);

async function syInit() {
  if (SY.fb) return;
  try {
    SY.state = "connect"; syUi();
    const base = `https://www.gstatic.com/firebasejs/${SY_V}/`;
    const [app, auth, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
    const a = app.initializeApp(SY_CFG);
    const au = auth.getAuth(a);
    const db = fs.initializeFirestore(a, { experimentalAutoDetectLongPolling: true });
    SY.fb = { auth, fs, au, db };
    auth.onAuthStateChanged(au, u => {
      SY.user = u;
      if (u) { try { localStorage.setItem("aufgaben.sync", "1"); } catch (e) { /* egal */ } syStart(u); }
      else { syStop(); SY.state = "login"; syUi(); }
    });
  } catch (e) {
    SY.fb = null; SY.state = "error"; SY.err = "Verbindung zu Firebase nicht möglich (offline?).";
    syUi();
  }
}

function syStop() {
  if (SY.unsub) { try { SY.unsub(); } catch (e) { /* egal */ } SY.unsub = null; }
  clearTimeout(SY.retryT);
}

function syStart(user) {
  syStop();
  SY.state = "sync"; SY.err = ""; syUi();
  const { fs, db } = SY.fb;
  SY.unsub = fs.onSnapshot(fs.collection(db, "users", user.uid, "au_tasks"), snap => {
    const changes = snap.docChanges();
    SY.chain = SY.chain.then(() => syApply(changes)).catch(e => { SY.err = e.message || "Abgleich-Fehler"; syUi(); });
  }, err => {
    SY.err = err.code === "permission-denied" ? "Keine Berechtigung – bitte die Firestore-Regeln im Firebase-Projekt prüfen." : (err.message || "Abgleich-Fehler");
    SY.state = "error"; syUi();
  });
}

/* Änderungen von anderen Geräten übernehmen (neuere Zeit gewinnt), danach eigene Änderungen hochladen. */
async function syApply(changes) {
  let changed = false;
  for (const ch of changes) {
    if (ch.type === "removed") continue;
    const d = ch.doc.data(), id = ch.doc.id;
    if (!d || typeof d.u !== "number" || !d.d) continue;
    const local = await getTask(id);
    if (local && (local.u || 0) >= d.u) continue;
    const due = Number(d.d.due) || Date.now();
    await putTask({ id, title: String(d.d.title || ""), due, rep: String(d.d.rep || ""), done: Number(d.d.done) || undefined, prevDue: Number(d.d.prevDue) || undefined, nextShow: local ? local.nextShow : due, u: d.u, del: !!d.del, dirty: false });
    changed = true;
  }
  if (changed) { await render(); await tick(); }
  await syPush();
  if (SY.state !== "error") SY.state = "live";
  syUi();
}

async function syPush() {
  if (!SY.user || !SY.fb) return;
  if (SY.pushing) { SY.again = true; return; }
  SY.pushing = true;
  let failed = false;
  try {
    const { fs, db } = SY.fb;
    const dirty = (await allTasks()).filter(t => t.dirty);
    for (const t of dirty) {
      await syTimeout(fs.setDoc(fs.doc(db, "users", SY.user.uid, "au_tasks", t.id), { d: { title: t.title, due: t.due, rep: t.rep || "", done: t.done || 0, prevDue: t.prevDue || 0 }, u: t.u, del: !!t.del }), 15000);
      const cur = await getTask(t.id);
      if (cur && cur.u === t.u) { cur.dirty = false; await putTask(cur); }
    }
    SY.err = ""; SY.last = Date.now();
  } catch (e) { failed = true; SY.err = "Hochladen fehlgeschlagen: " + (e.message || e); }
  SY.pushing = false;
  clearTimeout(SY.retryT);
  if (failed) SY.retryT = setTimeout(syPush, 60000);
  if (SY.again) { SY.again = false; syPush(); }
  syUi();
}
window.syPush = syPush;

const syMsg = c => ({
  "auth/invalid-email": "Ungültige E-Mail-Adresse.", "auth/missing-password": "Bitte Passwort eingeben.",
  "auth/weak-password": "Das Passwort ist zu kurz (mindestens 6 Zeichen).", "auth/email-already-in-use": "Für diese E-Mail gibt es schon ein Konto – bitte „Anmelden“.",
  "auth/invalid-credential": "E-Mail oder Passwort stimmt nicht.", "auth/wrong-password": "E-Mail oder Passwort stimmt nicht.", "auth/user-not-found": "Dazu gibt es noch kein Konto – bitte „Konto erstellen“.",
  "auth/network-request-failed": "Keine Verbindung. Bist du online?", "auth/operation-not-allowed": "E-Mail/Passwort ist in Firebase nicht aktiviert.", "auth/too-many-requests": "Zu viele Versuche – bitte kurz warten.",
}[c] || "Das hat nicht geklappt (" + c + ").");

/* ---- Oberfläche ---- */
function syUi() {
  const box = document.getElementById("syBox");
  if (!box) return;
  const a = document.activeElement;
  if (a && /INPUT/.test(a.tagName) && box.contains(a)) return; // nicht beim Tippen stören
  const err = SY.err ? `<div class="status err">${syEsc(SY.err)}</div>` : "";
  if (!SY.user) {
    const st = SY.state === "connect" ? `<div class="hint">Verbinde …</div>` : "";
    box.innerHTML = `<p class="hint">Melde dich mit deinem Konto an (dasselbe wie bei Wunschliste und FoodPro). Dann sind deine Aufgaben gesichert und auf allen Geräten gleich. Noch kein Konto? „Konto erstellen“.</p>
      <input id="syMail" type="email" placeholder="E-Mail" autocomplete="email" inputmode="email" autocapitalize="off">
      <input id="syPass" type="password" placeholder="Passwort (mind. 6 Zeichen)" autocomplete="current-password">
      <div class="row"><button type="button" data-act="syLogin">Anmelden</button><button type="button" class="ghost" data-act="syRegister">Konto erstellen</button></div>
      <button type="button" class="link" data-act="syForgot">Passwort vergessen?</button>${st}${err}`;
    return;
  }
  const ago = SY.last ? new Date(SY.last).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const label = SY.state === "live" && SY.err ? "⚠ Nicht vollständig gesichert" : SY.state === "live" ? "● Gesichert & live" : SY.state === "sync" ? "Gleiche ab …" : "Nicht verbunden";
  box.innerHTML = `<strong>${label}</strong>
    <div class="hint">Angemeldet als ${syEsc(SY.user.email || "")}${ago ? " · zuletzt abgeglichen " + ago : ""}</div>${err}
    <div class="row"><button type="button" data-act="syNow">Jetzt abgleichen</button><button type="button" class="ghost" data-act="syLogout">Abmelden</button></div>`;
  const sum = document.getElementById("sySum");
  if (sum) sum.textContent = SY.state === "live" && !SY.err ? "Konto & Sync · verbunden" : "Konto & Sync";
}

document.addEventListener("click", async ev => {
  const t = ev.target.closest("[data-act^=sy]"); if (!t) return;
  const a = t.dataset.act, val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  if (a === "syLogin" || a === "syRegister") {
    const mail = val("syMail"), pw = val("syPass");
    if (!mail || !pw) { SY.err = "Bitte E-Mail und Passwort eingeben."; syUi(); return; }
    if (!SY.fb) { await syInit(); if (!SY.fb) return; }
    try { SY.err = ""; a === "syLogin" ? await SY.fb.auth.signInWithEmailAndPassword(SY.fb.au, mail, pw) : await SY.fb.auth.createUserWithEmailAndPassword(SY.fb.au, mail, pw); }
    catch (e) { SY.err = syMsg(e.code); syUi(); }
  } else if (a === "syForgot") {
    const mail = val("syMail");
    if (!mail) { SY.err = "Gib oben deine E-Mail ein."; syUi(); return; }
    if (!SY.fb) { await syInit(); if (!SY.fb) return; }
    try { await SY.fb.auth.sendPasswordResetEmail(SY.fb.au, mail); SY.err = "E-Mail zum Zurücksetzen gesendet."; } catch (e) { SY.err = syMsg(e.code); }
    syUi();
  } else if (a === "syLogout") {
    syStop(); try { await SY.fb.auth.signOut(SY.fb.au); } catch (e) { /* egal */ }
    try { localStorage.removeItem("aufgaben.sync"); } catch (e) { /* egal */ }
    SY.err = ""; syUi();
  } else if (a === "syNow") {
    await syPush(); syUi();
  }
});
window.addEventListener("online", () => { if (!SY.fb && localStorage.getItem("aufgaben.sync")) syInit(); else syPush(); });

syUi();
if (localStorage.getItem("aufgaben.sync")) syInit(); // nur starten, wenn auf diesem Gerät schon angemeldet
