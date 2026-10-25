"use strict";
/* Wunschliste – Dinge, die ich mir kaufen möchte. Läuft ohne Server; Daten liegen im Browser (IndexedDB). */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const DAY = 864e5;
const ACCENTS = ["#6d5efc", "#12935f", "#ff4d2e", "#e8458b", "#0891b2", "#f59e0b"];
const CAT_COLORS = ["#6d5efc", "#12935f", "#ff4d2e", "#e8458b", "#0891b2", "#f59e0b", "#8b5cf6", "#64748b"];

/* Was die Zahlen 1–10 bedeuten */
const SCALE = [
  [1, "Kaum Interesse", "Spontaner Impuls – morgen schon vergessen."],
  [2, "Nett, aber unwichtig", "Gefällt mir kurz, ich würde es kaum vermissen."],
  [3, "Wäre ganz nett", "Kann ich haben, muss ich aber nicht."],
  [4, "Könnte ich mir vorstellen", "Ich denke ab und zu darüber nach."],
  [5, "Unentschlossen", "50 : 50 – ich weiß noch nicht, ob ich es wirklich will."],
  [6, "Gefällt mir schon", "Ich will es eher, habe aber noch Zweifel."],
  [7, "Will ich haben", "Ich denke öfter daran, es wäre eine echte Freude."],
  [8, "Will ich unbedingt", "Ich würde es sofort kaufen, wenn Geld und Zeit da wären."],
  [9, "Denke ständig daran", "Es geht mir kaum noch aus dem Kopf."],
  [10, "Brauche ich wirklich", "Es löst ein echtes Problem oder ist mir extrem wichtig."]
];

const DEFAULT_SETTINGS = { mode: "auto", accent: "#6d5efc", amoled: false, dense: false, remind: 14, filter: "open", sort: "new", cats: [], catFilter: "" };

/* ---------- Zustand + Speicher ---------- */
let settings = loadSettings();
let items = [];
let idb = null;

function loadSettings() {
  let s;
  try { s = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem("wl-settings") || "{}")); }
  catch (e) { s = Object.assign({}, DEFAULT_SETTINGS); }
  s.cats = normCats(s.cats);
  return s;
}
/* Kategorien: { id, name, color, exp } – exp = Ablaufdatum (Zeitstempel) oder null */
function normCats(a) {
  const seen = new Set();
  return (Array.isArray(a) ? a : []).map((c, i) => c && typeof c === "object" ? {
    id: String(c.id || uid()), name: String(c.name || "").trim().slice(0, 30),
    color: /^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : CAT_COLORS[i % CAT_COLORS.length], exp: Number(c.exp) || null
  } : null).filter(c => c && c.name && !seen.has(c.id) && seen.add(c.id));
}
function saveSettings() { try { localStorage.setItem("wl-settings", JSON.stringify(settings)); } catch (e) { /* voll/gesperrt */ } syHook(); }
/* Konto-Abgleich (sync.js) informieren, dass sich etwas geändert hat */
function syHook() { if (typeof syOnSave === "function") syOnSave(); }
let itemsReadyRes;
window.wlItemsReady = new Promise(r => { itemsReadyRes = r; });

function openDb() {
  return new Promise(res => {
    if (!window.indexedDB) return res(null);
    let rq;
    try { rq = indexedDB.open("wunschliste", 1); } catch (e) { return res(null); }
    rq.onupgradeneeded = () => rq.result.createObjectStore("items", { keyPath: "id" });
    rq.onsuccess = () => res(rq.result);
    rq.onerror = rq.onblocked = () => res(null);
  });
}
function dbAll() {
  return new Promise(res => {
    try {
      const rq = idb.transaction("items").objectStore("items").getAll();
      rq.onsuccess = () => res(rq.result || []);
      rq.onerror = () => res([]);
    } catch (e) { res([]); }
  });
}
function dbRun(fn) {
  return new Promise(res => {
    try {
      const tx = idb.transaction("items", "readwrite");
      fn(tx.objectStore("items"));
      tx.oncomplete = () => res(true);
      tx.onerror = tx.onabort = () => { toast("Speichern fehlgeschlagen (Speicher voll?)"); res(false); };
    } catch (e) { toast("Speichern fehlgeschlagen"); res(false); }
  });
}
function lsPersist() { try { localStorage.setItem("wl-items", JSON.stringify(items)); } catch (e) { toast("Speicher voll – bitte Bilder entfernen"); } }
function persist(it) { syHook(); return idb ? dbRun(s => s.put(it)) : (lsPersist(), Promise.resolve(true)); }
function persistMany(list) { syHook(); return idb ? dbRun(s => list.forEach(i => s.put(i))) : (lsPersist(), Promise.resolve(true)); }
function removeFromDb(id) { syHook(); return idb ? dbRun(s => s.delete(id)) : (lsPersist(), Promise.resolve(true)); }
function clearDb() { syHook(); return idb ? dbRun(s => s.clear()) : (lsPersist(), Promise.resolve(true)); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function normUrl(s) {
  s = String(s || "").trim();
  if (!s) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch (e) { return ""; }
}
function normItem(r) {
  if (!r || typeof r !== "object") return null;
  const created = Number(r.created) || Date.now();
  const clamp = v => Math.min(10, Math.max(1, Math.round(Number(v) || 5)));
  const ratings = (Array.isArray(r.ratings) ? r.ratings : []).map(x => ({ t: Number(x && x.t) || created, v: clamp(x && x.v) })).sort((a, b) => a.t - b.t);
  const wish = clamp(r.wish != null ? r.wish : (ratings.length ? ratings[ratings.length - 1].v : 5));
  if (!ratings.length) ratings.push({ t: created, v: wish });
  const out = {
    id: String(r.id || uid()),
    name: String(r.name || "").slice(0, 300),
    note: String(r.note || "").slice(0, 3000),
    price: String(r.price || "").slice(0, 30),
    links: [...new Set((Array.isArray(r.links) ? r.links : []).map(normUrl).filter(Boolean))],
    favLinks: [...new Set((Array.isArray(r.favLinks) ? r.favLinks : []).map(normUrl).filter(Boolean))],
    images: (Array.isArray(r.images) ? r.images : []).filter(i => i && /^data:image\//.test(i.f || "")).map(i => ({ id: String(i.id || uid()), f: i.f, t: /^data:image\//.test(i.t || "") ? i.t : i.f })),
    created, wish, ratings,
    bought: r.bought ? Number(r.bought) || Date.now() : null,
    cat: String(r.cat || "").slice(0, 40),
    exp: Number(r.exp) || null
  };
  fixFavs(out);
  return out;
}
function fixFavs(it) { it.favLinks = (it.favLinks || []).filter(u => it.links.includes(u)); }
const catById = id => (id && settings.cats.find(c => c.id === id)) || null;
const fromInputDate = v => { const [y, m, d] = String(v).split("-").map(Number); return new Date(y, m - 1, d, 12).getTime(); };
const reached = t => sod(t) <= sod(Date.now());
/* Archiviert = Ablaufdatum des Wunsches oder seiner Kategorie ist erreicht (wird beim Anzeigen berechnet, nichts wird gelöscht) */
function archReason(it) {
  if (it.exp && reached(it.exp)) return { t: it.exp, own: true, name: "" };
  const c = catById(it.cat);
  if (c && c.exp && reached(c.exp)) return { t: c.exp, own: false, name: c.name };
  return null;
}
const isArchived = it => !!archReason(it);
function addCat(name) {
  name = String(name || "").trim().slice(0, 30);
  if (!name) return null;
  const have = settings.cats.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (have) return have;
  const used = settings.cats.map(c => c.color);
  const c = { id: uid(), name, color: CAT_COLORS.find(x => !used.includes(x)) || CAT_COLORS[settings.cats.length % CAT_COLORS.length], exp: null };
  settings.cats.push(c); saveSettings();
  return c;
}

/* ---------- Zeit ---------- */
const sod = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const daysSince = t => Math.round((sod(Date.now()) - sod(t)) / DAY);
const fmtDate = t => { const d = new Date(t); return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear(); };
const fmtShort = t => { const d = new Date(t); return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "."; };
const toInputDate = t => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
function ago(t) {
  const n = daysSince(t);
  if (n <= 0) return "heute";
  if (n === 1) return "gestern";
  if (n < 14) return "vor " + n + " Tagen";
  if (n < 60) return "vor " + Math.round(n / 7) + " Wochen";
  return "vor " + Math.round(n / 30) + " Monaten";
}
const lastRating = it => it.ratings[it.ratings.length - 1];
const isDue = it => !it.bought && !isArchived(it) && settings.remind > 0 && daysSince(lastRating(it).t) >= settings.remind;

/* ---------- Icons ---------- */
const svg = (p, w = 22) => `<svg class="ic" width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = {
  check: p => svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', p),
  plus: p => svg('<path d="M12 5v14M5 12h14"/>', p),
  gear: p => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', p),
  info: p => svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>', p),
  link: p => svg('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>', p),
  image: p => svg('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>', p),
  trash: p => svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>', p),
  x: p => svg('<path d="M6 6l12 12M18 6L6 18"/>', p),
  chev: p => svg('<path d="M6 9l6 6 6-6"/>', p),
  clock: p => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', p),
  bag: p => svg('<path d="M6 8h12l1 12H5L6 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>', p),
  star: (p, on) => svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.250 4.100 1 5.800L12 16.900 6.750 19.600l1-5.800L3.500 9.700l5.900-.9z"' + (on ? ' fill="currentColor"' : '') + '/>', p),
  ext: p => svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', p)
};

/* ---------- Hilfen: Toast, Sheets ---------- */
let toastTimer = 0;
function toast(msg, action) {
  const t = $("#toast");
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button" id="toastAct">${esc(action.label)}</button>` : "");
  t.classList.add("show");
  if (action) $("#toastAct").onclick = () => { t.classList.remove("show"); action.fn(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), action ? 5000 : 2600);
}
function buzz(ms = 10) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* egal */ } }

const sheets = [];
let skipPop = 0;
function openSheet(html, opts = {}) {
  const el = document.createElement("div");
  el.className = "sheet-wrap";
  el.innerHTML = `<div class="scrim"></div><div class="sheet ${opts.cls || ""}" role="dialog" aria-modal="true">${html}</div>`;
  $("#sheetRoot").append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
  history.pushState({ wl: sheets.length + 1 }, "");
  const rec = { el, sheet: $(".sheet", el), onClose: opts.onClose };
  sheets.push(rec);
  $(".scrim", el).onclick = () => closeSheet();
  return rec;
}
function removeTop() {
  const rec = sheets.pop();
  if (!rec) return;
  rec.el.classList.remove("in");
  setTimeout(() => rec.el.remove(), 260);
  if (rec.onClose) rec.onClose();
}
function closeSheet() {
  if (!sheets.length) return;
  removeTop();
  skipPop++;
  history.back();
}
window.addEventListener("popstate", () => {
  if (skipPop > 0) { skipPop--; return; }
  removeTop();
});

/* ---------- Theme ---------- */
function applyTheme() {
  const root = document.documentElement;
  let mode = settings.mode;
  if (mode === "auto") mode = window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  root.dataset.mode = mode;
  root.dataset.amoled = settings.amoled ? "1" : "0";
  root.style.setProperty("--accent", settings.accent);
  const [r, g, b] = [1, 3, 5].map(i => parseInt(settings.accent.slice(i, i + 2), 16));
  root.style.setProperty("--on-accent", (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#10121a" : "#ffffff");
  const m = $('meta[name="theme-color"]');
  if (m) m.content = mode === "light" ? "#f4f4f8" : (settings.amoled ? "#000000" : "#0e0f14");
}

/* ---------- Ansicht ---------- */
const SORTS = [["new", "Neueste zuerst"], ["old", "Älteste zuerst"], ["wishDesc", "Wunsch: hoch → niedrig"], ["wishAsc", "Wunsch: niedrig → hoch"], ["due", "Neu bewerten zuerst"]];

function visibleItems() {
  let list = items.filter(i => {
    const arch = isArchived(i);
    if (settings.filter === "archive") return arch;
    if (arch) return false;
    return settings.filter === "all" || (settings.filter === "open" ? !i.bought : !!i.bought);
  });
  const cf = settings.catFilter;
  if (cf === "_none") list = list.filter(i => !catById(i.cat));
  else if (cf && catById(cf)) list = list.filter(i => i.cat === cf);
  const by = {
    new: (a, b) => b.created - a.created,
    old: (a, b) => a.created - b.created,
    wishDesc: (a, b) => b.wish - a.wish || b.created - a.created,
    wishAsc: (a, b) => a.wish - b.wish || b.created - a.created,
    due: (a, b) => (isDue(b) - isDue(a)) || (lastRating(a).t - lastRating(b).t)
  }[settings.sort] || ((a, b) => b.created - a.created);
  list.sort(by);
  if (settings.filter === "bought") list.sort((a, b) => (b.bought || 0) - (a.bought || 0));
  if (settings.filter === "archive") list.sort((a, b) => archReason(b).t - archReason(a).t);
  return list;
}

function trendOf(it) {
  if (it.ratings.length < 2) return "";
  const d = it.wish - it.ratings[0].v;
  if (!d) return `<span>± 0 seit Start</span>`;
  return `<span class="${d > 0 ? "up" : "down"}">${d > 0 ? "▲ +" : "▼ −"}${Math.abs(d)} seit Start</span>`;
}

function card(it) {
  const first = it.images[0];
  const due = isDue(it);
  const ar = archReason(it), c = catById(it.cat);
  const meta = [
    c ? `<span class="cat" style="--c:${c.color}"><i></i>${esc(c.name)}</span>` : "",
    ar ? `<span class="arch">Archiviert seit ${fmtShort(ar.t)}</span>` : (it.exp ? `<span>Läuft ab ${fmtShort(it.exp)}</span>` : ""),
    `<span>${it.bought ? "Gekauft " + ago(it.bought) : "Seit " + fmtShort(it.created) + " · " + ago(it.created)}</span>`,
    it.links.length ? `<span>${IC.link(13)}${it.links.length}${it.favLinks.length ? ` · <b class="favn">★ ${it.favLinks.length}</b>` : ""}</span>` : "",
    it.images.length ? `<span>${IC.image(13)}${it.images.length}</span>` : "",
    it.price ? `<span>${esc(it.price)}</span>` : "",
    it.bought ? "" : trendOf(it),
    due ? `<span class="due">${IC.clock(13)}Neu bewerten</span>` : ""
  ].join("");
  return `<article class="item ${it.bought ? "done" : ""} ${ar ? "archived" : ""}" data-id="${it.id}">
    <button type="button" class="chk ${it.bought ? "on" : ""}" data-act="toggle" aria-label="${it.bought ? "Als offen markieren" : "Als gekauft markieren"}">${IC.check(18)}</button>
    <div class="body" data-act="open">
      ${first ? `<img class="thumb" src="${first.t}" alt="" loading="lazy">` : ""}
      <div class="txt"><div class="name">${esc(it.name) || "<span class='muted'>Ohne Namen</span>"}</div><div class="meta">${meta}</div></div>
    </div>
    <button type="button" class="wish ${it.wish >= 6 ? "hi" : ""}" style="--k:${it.wish * 10}%" data-act="rate" aria-label="Wunsch ${it.wish} von 10, neu bewerten">${it.wish}</button>
  </article>`;
}

function catBar() {
  if (!settings.cats.length) return "";
  const cf = catById(settings.catFilter) || settings.catFilter === "_none" ? settings.catFilter : "";
  const chip = (v, label, col) => `<button type="button" class="chip ${cf === v ? "on" : ""}" ${col ? `style="--c:${col}"` : ""} data-act="catFilter" data-v="${v}">${col ? "<i></i>" : ""}${esc(label)}</button>`;
  return chip("", "Alle") + settings.cats.map(c => chip(c.id, c.name, c.color)).join("") + chip("_none", "Ohne");
}

function viewMain() {
  const active = items.filter(i => !isArchived(i)), archN = items.length - active.length;
  const open = active.filter(i => !i.bought), bought = active.length - open.length;
  const avg = open.length ? (open.reduce((s, i) => s + i.wish, 0) / open.length).toFixed(1).replace(".", ",") : "–";
  const dueN = open.filter(isDue).length;
  const list = visibleItems();
  let body;
  if (list.length) body = `<div class="list">${list.map(card).join("")}</div>`;
  else {
    const msg = items.length === 0 ? ["Noch nichts auf der Liste", "Schreib oben hinein, was du dir kaufen möchtest."]
      : settings.catFilter && settings.filter !== "archive" && !items.some(i => !isArchived(i) && (settings.catFilter === "_none" ? !catById(i.cat) : i.cat === settings.catFilter)) ? ["Nichts in dieser Kategorie", "Trag oben einen Wunsch ein – er landet automatisch hier."]
      : settings.filter === "archive" ? ["Archiv ist leer", "Wünsche und Kategorien mit erreichtem Ablaufdatum landen automatisch hier."]
      : settings.filter === "open" ? ["Alles erledigt", "Keine offenen Wünsche. Stark – oder Zeit für neue."]
        : settings.filter === "bought" ? ["Noch nichts gekauft", "Abgehakte Wünsche landen hier."] : ["Nichts gefunden", ""];
    body = `<div class="empty"><div class="big">${IC.bag(34)}</div><b>${msg[0]}</b>${msg[1]}</div>`;
  }
  return `
  <div class="top">
    <div><h1>Wunschliste</h1><div class="muted small sub">${open.length} offen · ${bought} gekauft${archN ? " · " + archN + " archiviert" : ""}${typeof SY !== "undefined" && SY.user && SY.err ? ` · <button type="button" class="syerr" data-act="settings">⚠ Sync-Problem</button>` : ""}</div></div>
    <div class="row">
      <button type="button" class="ghost" data-act="info" aria-label="Was bedeuten die Zahlen 1 bis 10?">${IC.info(21)}</button>
      <button type="button" class="ghost" data-act="settings" aria-label="Einstellungen">${IC.gear(21)}</button>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><b>${open.length}</b><span>Offen</span></div>
    <div class="stat"><b>${avg}</b><span>Ø Wunsch</span></div>
    <button type="button" class="stat ${dueN ? "hot" : ""}" data-act="sortDue"><b>${dueN}</b><span>Neu bewerten</span></button>
  </div>
  <form class="addbar" id="addForm" autocomplete="off">
    <input id="addIn" type="text" placeholder="Was möchtest du dir kaufen?" enterkeyhint="done" maxlength="300" aria-label="Neuer Wunsch">
    <button type="submit" class="addbtn" aria-label="Hinzufügen">${IC.plus(24)}</button>
  </form>
  <div class="seg full" role="tablist">
    ${[["open", "Offen"], ["bought", "Gekauft"], ["all", "Alle"], ["archive", "Archiv"]].map(([k, l]) => `<button type="button" class="${settings.filter === k ? "on" : ""}" data-act="filter" data-v="${k}">${l}${k === "archive" && archN ? " " + archN : ""}</button>`).join("")}
  </div>
  <div class="bar">
    <div class="chips">${catBar()}</div>
    <div class="sel"><select id="sortSel" aria-label="Sortierung">${SORTS.map(([k, l]) => `<option value="${k}" ${settings.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select>${IC.chev(15)}</div>
  </div>
  ${body}`;
}

function render() {
  const v = $("#view");
  const top = v.scrollTop;
  v.classList.toggle("dense", !!settings.dense);
  const ai = $("#addIn"), typed = ai ? ai.value : "", focused = !!ai && document.activeElement === ai;
  v.innerHTML = viewMain();
  v.scrollTop = top;
  if (typed) $("#addIn").value = typed; // Eingabe nicht verlieren, wenn im Hintergrund etwas abgeglichen wird
  if (focused) $("#addIn").focus();
}

/* ---------- Wunsch-Bewertung ---------- */
function setWish(it, n) {
  const now = Date.now(), last = lastRating(it);
  if (last && sod(last.t) === sod(now)) { last.v = n; last.t = now; }
  else it.ratings.push({ t: now, v: n });
  it.wish = n;
  persist(it);
}

function chartHtml(it) {
  const r = it.ratings;
  const W = 300, H = 96, px = 14, py = 12;
  const t0 = r[0].t, t1 = Math.max(Date.now(), r[r.length - 1].t);
  const X = t => px + (t1 === t0 ? 0 : (t - t0) / (t1 - t0)) * (W - 2 * px);
  const Y = v => H - py - ((v - 1) / 9) * (H - 2 * py);
  const pts = r.map(p => [X(p.t), Y(p.v)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const grid = [1, 5, 10].map(v => `<line x1="${px}" x2="${W - px}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="0" y="${Y(v) + 3.5}" font-size="9" fill="var(--muted)">${v}</text>`).join("");
  const ext = r.length && X(r[r.length - 1].t) < W - px - 2 ? `<line x1="${X(r[r.length - 1].t)}" y1="${Y(it.wish)}" x2="${W - px}" y2="${Y(it.wish)}" stroke="var(--accent)" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round" opacity=".55"/>` : "";
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf deines Wunsches">${grid}${r.length > 1 ? `<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ""}${ext}${pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5" fill="var(--card)" stroke="var(--accent)" stroke-width="2.5"/>`).join("")}</svg>`;
}

function ratingHtml(it) {
  const s = SCALE[it.wish - 1];
  const r = it.ratings;
  let trend;
  if (r.length < 2) trend = `Erste Bewertung ${ago(r[0].t)} (${fmtDate(r[0].t)}). Tippe später eine Zahl an, um festzuhalten, wie sehr du es noch willst.`;
  else {
    const d = it.wish - r[0].v;
    trend = `Seit ${fmtDate(r[0].t)}: ${r[0].v} → ${it.wish} (${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)}). Letzte Bewertung ${ago(lastRating(it).t)}.`;
  }
  return `<div class="rgrid">${SCALE.map(([n]) => `<button type="button" class="rb ${n === it.wish ? "on" : ""}" style="--k:${n * 10}%" data-n="${n}">${n}</button>`).join("")}</div>
    <div class="rdesc"><b>${s[0]} – ${s[1]}</b><br><span class="muted">${s[2]}</span></div>
    ${chartHtml(it)}
    <div class="hist">${r.map(p => `<span>${fmtShort(p.t)}<b>${p.v}</b></span>`).join("")}</div>
    <div class="trend">${trend}</div>`;
}

function rateSheet(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  const rec = openSheet(`<div class="grab"></div>
    <div class="sh-head"><h2>Wie sehr willst du es?</h2><button type="button" class="x" data-close aria-label="Schließen">${IC.x(20)}</button></div>
    <div class="muted small" style="margin:-6px 0 12px">${esc(it.name)}</div>
    <div class="panel" id="rBody">${ratingHtml(it)}</div>
    <div class="muted small">Tippe eine Zahl, um deine Bewertung für heute festzuhalten – auch wenn sie gleich geblieben ist.</div>`);
  rec.sheet.addEventListener("click", e => {
    if (e.target.closest("[data-close]")) return closeSheet();
    const b = e.target.closest(".rb");
    if (!b) return;
    const n = +b.dataset.n;
    setWish(it, n); buzz();
    closeSheet(); render();
    toast("Festgehalten: " + n + " von 10");
  });
}

/* ---------- Bilder ---------- */
function loadImage(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { URL.revokeObjectURL(u); res(im); };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("Bild nicht lesbar")); };
    im.src = u;
  });
}
function shrink(im, max, q) {
  const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}
async function processFile(file) {
  const im = await loadImage(file);
  let max = 1280, q = 0.82, f = shrink(im, max, q);
  while (f.length > 600000 && q > 0.45) { q -= 0.1; max = Math.round(max * 0.85); f = shrink(im, max, q); } // muss als Konto-Dokument unter 1 MB bleiben
  return { id: uid(), f, t: shrink(im, 220, 0.75) };
}

/* ---------- Wunsch bearbeiten ---------- */
function host(u) { try { const x = new URL(u); return x.hostname.replace(/^www\./, ""); } catch (e) { return u; } }
function linkPath(u) { try { const x = new URL(u); const p = (x.pathname + x.search).replace(/\/$/, ""); return p.length > 1 ? p : ""; } catch (e) { return ""; } }

function linksHtml(it) {
  return it.links.map((u, i) => { const fav = it.favLinks.includes(u); return `<div class="lnk ${fav ? "fav" : ""}"><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(host(u))}<small>${esc(linkPath(u) || u)}</small></a>
    <button type="button" class="mini star ${fav ? "on" : ""}" data-act="lnkFav" data-i="${i}" aria-pressed="${fav}" aria-label="${fav ? "Favorit entfernen" : "Als Favorit markieren"}">${IC.star(18, fav)}</button>
    <button type="button" class="mini" data-act="lnkOpen" data-i="${i}" aria-label="Link öffnen">${IC.ext(17)}</button>
    <button type="button" class="mini" data-act="lnkDel" data-i="${i}" aria-label="Link entfernen">${IC.trash(17)}</button></div>`; }).join("");
}
function imagesHtml(it) {
  return `<div class="imgs">${it.images.map((im, i) => `<div class="im"><img src="${im.t}" alt="Bild ${i + 1}" data-act="imgView" data-i="${i}"><button type="button" class="rm" data-act="imgDel" data-i="${i}" aria-label="Bild entfernen">${IC.x(14)}</button></div>`).join("")}
    <button type="button" class="im add" data-act="imgAdd">${IC.plus(22)}Bild</button></div>`;
}

function archBanner(it) {
  const r = archReason(it);
  if (!r) return "";
  return `<div class="tip" style="margin-bottom:12px"><b>Archiviert</b> – ${r.own ? "das Ablaufdatum (" + fmtDate(r.t) + ") ist erreicht. Ändere oder entferne das Datum, um den Wunsch zurückzuholen." : "die Kategorie „" + esc(r.name) + "“ ist seit " + fmtDate(r.t) + " abgelaufen. Wähle eine andere Kategorie oder ändere ihr Ablaufdatum in den Einstellungen."}</div>`;
}
function editCatChips(it) {
  const chip = (v, label, col) => `<button type="button" class="chip ${(it.cat || "") === v && (v || !catById(it.cat)) ? "on" : ""}" ${col ? `style="--c:${col}"` : ""} data-act="catSet" data-v="${v}">${col ? "<i></i>" : ""}${esc(label)}</button>`;
  return chip("", "Keine") + settings.cats.map(c => chip(c.id, c.name + (c.exp && reached(c.exp) ? " (abgelaufen)" : ""), c.color)).join("");
}

function editSheet(id) {
  const it = items.find(i => i.id === id);
  if (!it) return;
  const rec = openSheet(`<div class="grab"></div>
    <div class="sh-head"><h2>Wunsch</h2><button type="button" class="x" data-close aria-label="Fertig">${IC.x(20)}</button></div>
    <input class="nm" id="eName" value="${esc(it.name)}" placeholder="Was möchtest du kaufen?" maxlength="300">
    <div id="eArch">${archBanner(it)}</div>
    <div class="panel"><h3>Wie sehr willst du es? (1–10)</h3><div id="eRate">${ratingHtml(it)}</div></div>
    <div class="panel"><h3>Kategorie</h3><div class="chips wrap" id="eCats">${editCatChips(it)}</div>
      <div class="addrow" style="margin-top:10px"><input class="fld" id="eCatIn" placeholder="Neue Kategorie …" maxlength="30" autocomplete="off"><button type="button" class="btn pri" data-act="catAdd" aria-label="Kategorie hinzufügen">${IC.plus(20)}</button></div></div>
    <div class="panel"><h3>Links</h3><div id="eLinks">${linksHtml(it)}</div>
      <div class="addrow"><input class="fld" id="eLinkIn" type="url" inputmode="url" placeholder="Link einfügen (Shop, Test, Video …)" autocapitalize="off" autocomplete="off"><button type="button" class="btn pri" data-act="lnkAdd" aria-label="Link hinzufügen">${IC.plus(20)}</button></div></div>
    <div class="panel"><h3>Bilder & Screenshots</h3><div id="eImgs">${imagesHtml(it)}</div><input type="file" id="eFile" accept="image/*" multiple hidden>
      <div class="muted tiny" style="margin-top:8px">Auch Einfügen aus der Zwischenablage funktioniert.</div></div>
    <div class="panel"><h3>Details</h3>
      <div class="two"><div><label for="ePrice">Preis (optional)</label><input class="fld" id="ePrice" value="${esc(it.price)}" placeholder="z. B. 129 €" maxlength="30"></div>
      <div><label for="eDate">Eingetragen am</label><input class="fld" id="eDate" type="date" value="${toInputDate(it.created)}" max="${toInputDate(Date.now())}"></div></div>
      <div style="height:10px"></div><label class="lbl" for="eExp">Ablaufdatum (optional)</label>
      <div class="addrow"><input class="fld" id="eExp" type="date" value="${it.exp ? toInputDate(it.exp) : ""}"><button type="button" class="btn" data-act="expClear" aria-label="Ablaufdatum entfernen">${IC.x(18)}</button></div>
      <div class="muted tiny" style="margin:6px 0 10px">Ab diesem Tag wandert der Wunsch ins Archiv – dann brauchst du ihn nicht mehr.</div>
      <textarea class="fld" id="eNote" placeholder="Notiz (Farbe, Größe, wofür …)" maxlength="3000">${esc(it.note)}</textarea></div>
    <div class="row" style="gap:10px;margin-top:4px">
      <button type="button" class="btn grow" data-act="eBought">${IC.check(18)}${it.bought ? "Wieder offen" : "Als gekauft"}</button>
      <button type="button" class="btn dng" data-act="eDelete" aria-label="Löschen">${IC.trash(18)}</button>
    </div>`, { cls: "tall", onClose: () => { window.wlEditRefresh = null; render(); } });

  const sh = rec.sheet;
  const reRate = () => { $("#eRate", sh).innerHTML = ratingHtml(it); };
  const reLinks = () => { $("#eLinks", sh).innerHTML = linksHtml(it); };
  const reImgs = () => { $("#eImgs", sh).innerHTML = imagesHtml(it); };
  const reCats = () => { $("#eCats", sh).innerHTML = editCatChips(it); $("#eArch", sh).innerHTML = archBanner(it); };
  function addCatFromInput() {
    const inp = $("#eCatIn", sh), c = addCat(inp.value);
    if (!c) return;
    it.cat = c.id; inp.value = ""; persist(it); reCats();
  }
  window.wlEditRefresh = { id: it.id, fn: () => {
    reRate(); reLinks(); reImgs(); reCats();
    [["eName", it.name], ["ePrice", it.price], ["eNote", it.note]].forEach(([k, v]) => { const el = $("#" + k, sh); if (el && document.activeElement !== el) el.value = v; });
    const ex = $("#eExp", sh); if (ex) ex.value = it.exp ? toInputDate(it.exp) : "";
  } };
  let saveT = 0;
  const later = () => { clearTimeout(saveT); saveT = setTimeout(() => persist(it), 250); };

  async function addFiles(files) {
    const list = [...files].filter(f => /^image\//.test(f.type));
    if (!list.length) return;
    let n = 0;
    for (const f of list) {
      try { it.images.push(await processFile(f)); n++; } catch (e) { toast("Bild konnte nicht gelesen werden"); }
    }
    if (n) { await persist(it); reImgs(); toast(n === 1 ? "Bild hinzugefügt" : n + " Bilder hinzugefügt"); }
  }
  function addLink() {
    const inp = $("#eLinkIn", sh), u = normUrl(inp.value);
    if (!inp.value.trim()) return;
    if (!u) return toast("Das sieht nicht wie ein Link aus");
    if (it.links.includes(u)) return toast("Link ist schon drin");
    it.links.push(u); inp.value = ""; persist(it); reLinks();
  }

  sh.addEventListener("input", e => {
    const t = e.target;
    if (t.id === "eName") { it.name = t.value; later(); }
    else if (t.id === "ePrice") { it.price = t.value; later(); }
    else if (t.id === "eNote") { it.note = t.value; later(); }
  });
  sh.addEventListener("change", e => {
    const t = e.target;
    if (t.id === "eDate" && t.value) {
      const [y, m, d] = t.value.split("-").map(Number);
      let ts = new Date(y, m - 1, d, 12).getTime();
      if (sod(ts) === sod(Date.now())) ts = Math.min(ts, Date.now());
      if (ts > Date.now()) ts = Date.now();
      it.created = ts;
      it.ratings[0].t = ts;
      it.ratings.sort((a, b) => a.t - b.t);
      persist(it); reRate();
    } else if (t.id === "eExp") {
      it.exp = t.value ? fromInputDate(t.value) : null; persist(it); $("#eArch", sh).innerHTML = archBanner(it);
    } else if (t.id === "eFile") { addFiles(t.files).then(() => { t.value = ""; }); }
  });
  sh.addEventListener("keydown", e => { if (e.key !== "Enter") return; if (e.target.id === "eLinkIn") { e.preventDefault(); addLink(); } else if (e.target.id === "eCatIn") { e.preventDefault(); addCatFromInput(); } });
  sh.addEventListener("paste", e => {
    const files = [...(e.clipboardData ? e.clipboardData.files : [])];
    if (files.some(f => /^image\//.test(f.type))) { e.preventDefault(); addFiles(files); return; }
    if (e.target.id === "eLinkIn") { /* normaler Text-Paste */ }
  });
  sh.addEventListener("click", e => {
    if (e.target.closest("[data-close]")) return closeSheet();
    const rb = e.target.closest(".rb");
    if (rb) { setWish(it, +rb.dataset.n); buzz(); reRate(); return; }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const i = +b.dataset.i;
    switch (b.dataset.act) {
      case "lnkAdd": addLink(); break;
      case "lnkOpen": window.open(it.links[i], "_blank", "noopener"); break;
      case "lnkFav": { const u = it.links[i], k = it.favLinks.indexOf(u); if (k >= 0) it.favLinks.splice(k, 1); else it.favLinks.push(u); persist(it); reLinks(); buzz(); break; }
      case "lnkDel": it.favLinks = it.favLinks.filter(x => x !== it.links[i]); it.links.splice(i, 1); persist(it); reLinks(); break;
      case "imgAdd": $("#eFile", sh).click(); break;
      case "imgDel": it.images.splice(i, 1); persist(it); reImgs(); break;
      case "imgView": imageViewer(it.images[i].f); break;
      case "catSet": it.cat = b.dataset.v || ""; persist(it); reCats(); break;
      case "catAdd": addCatFromInput(); break;
      case "expClear": it.exp = null; $("#eExp", sh).value = ""; persist(it); reCats(); break;
      case "eBought": setBought(it, !it.bought); closeSheet(); break;
      case "eDelete": if (confirm("„" + (it.name || "Wunsch") + "“ wirklich löschen?")) { deleteItem(it); closeSheet(); } break;
    }
  });
  if (!it.name) setTimeout(() => $("#eName", sh).focus(), 300);
}

function imageViewer(src) {
  const rec = openSheet(`<button type="button" class="x" data-close aria-label="Schließen">${IC.x(20)}</button><img src="${src}" alt="">`, { cls: "full" });
  rec.sheet.addEventListener("click", () => closeSheet());
}

/* ---------- Aktionen ---------- */
function addItem(name, cat) {
  name = name.trim();
  if (!name) return null;
  const now = Date.now();
  const it = { id: uid(), name, note: "", price: "", links: [], favLinks: [], images: [], created: now, wish: 5, ratings: [{ t: now, v: 5 }], bought: null, cat: cat || "", exp: null };
  items.push(it);
  persist(it);
  return it;
}
function setBought(it, yes) {
  it.bought = yes ? Date.now() : null;
  persist(it); render(); buzz(14);
  if (yes) toast("„" + (it.name || "Wunsch") + "“ gekauft", { label: "Rückgängig", fn: () => { it.bought = null; persist(it); render(); } });
}
function deleteItem(it) {
  items = items.filter(i => i !== it);
  removeFromDb(it.id); render();
  toast("Gelöscht");
}

/* ---------- Info ---------- */
function infoSheet() {
  const rec = openSheet(`<div class="grab"></div>
    <div class="sh-head"><h2>Was die Zahlen bedeuten</h2><button type="button" class="x" data-close aria-label="Schließen">${IC.x(20)}</button></div>
    <div class="panel"><table class="itab">${SCALE.map(([n, t, d]) => `<tr><td><div class="nb ${n >= 6 ? "hi" : ""}" style="--k:${n * 10}%">${n}</div></td><td><b>${t}</b><span>${d}</span></td></tr>`).join("")}</table></div>
    <div class="tip"><b>So nutzt du die Liste:</b> Bewerte jeden Wunsch, wenn du ihn einträgst. Nach ${settings.remind > 0 ? Math.round(settings.remind / 7) + " Woche" + (settings.remind >= 14 ? "n" : "") : "1–3 Wochen"} erinnert dich die App, neu zu bewerten. Ist die Zahl dann immer noch hoch (7 oder mehr), ist es wahrscheinlich ein guter Kauf. Rutscht sie ab, hast du dir gerade Geld gespart.</div>`);
  rec.sheet.addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheet(); });
}

/* ---------- Einstellungen ---------- */
function catPanelHtml() {
  const rows = settings.cats.map(c => {
    const n = items.filter(i => i.cat === c.id).length, gone = c.exp && reached(c.exp);
    return `<div class="crow"><div class="ctop"><button type="button" class="cdot" style="background:${c.color}" data-act="catColor" data-id="${c.id}" aria-label="Farbe wechseln"></button>
      <input class="fld cname" data-id="${c.id}" value="${esc(c.name)}" maxlength="30" aria-label="Name der Kategorie"><button type="button" class="mini" data-act="catDel" data-id="${c.id}" aria-label="Kategorie löschen">${IC.trash(17)}</button></div>
      <div class="cexp"><span class="tiny muted">Läuft ab am</span><input class="fld cexpin" type="date" data-id="${c.id}" value="${c.exp ? toInputDate(c.exp) : ""}"><button type="button" class="mini" data-act="catExpClear" data-id="${c.id}" aria-label="Ablaufdatum entfernen">${IC.x(16)}</button></div>
      <div class="muted tiny">${n} Wunsch${n === 1 ? "" : "e"}${gone ? " · archiviert seit " + fmtDate(c.exp) : ""}</div></div>`;
  }).join("");
  return `<div class="panel"><h3>Kategorien</h3>${rows || `<div class="muted small" style="margin-bottom:10px">Noch keine Kategorien. Lege z. B. „Technik“, „Kleidung“ oder „Haushalt“ an.</div>`}
    <div class="addrow"><input class="fld" id="sCatIn" placeholder="Neue Kategorie …" maxlength="30" autocomplete="off"><button type="button" class="btn pri" data-act="catNew" aria-label="Kategorie hinzufügen">${IC.plus(20)}</button></div>
    <div class="muted tiny" style="margin-top:8px">Mit Ablaufdatum landen ab diesem Tag alle Wünsche der Kategorie automatisch im Archiv.</div></div>`;
}

function settingsHtml() {
  const seg = (act, cur, opts) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" class="${String(cur) === String(v) ? "on" : ""}" data-act="${act}" data-v="${v}">${l}</button>`).join("")}</div>`;
  const tg = (act, on, label) => `<div class="set"><span class="l">${label}</span><button type="button" class="tg ${on ? "on" : ""}" data-act="${act}" role="switch" aria-checked="${on}" aria-label="${label}"></button></div>`;
  return `<div class="grab"></div>
  <div class="sh-head"><h2>Einstellungen</h2><button type="button" class="x" data-close aria-label="Schließen">${IC.x(20)}</button></div>
  <div class="panel"><h3>Design</h3>
    <div class="set"><span class="l">Modus</span>${seg("mode", settings.mode, [["auto", "Auto"], ["light", "Hell"], ["dark", "Dunkel"]])}</div>
    <div class="set" style="align-items:flex-start;flex-direction:column"><span class="l">Akzentfarbe</span>
      <div class="swatches">${ACCENTS.map(c => `<button type="button" class="sw ${settings.accent.toLowerCase() === c ? "on" : ""}" style="background:${c}" data-act="accent" data-v="${c}" aria-label="Farbe ${c}"></button>`).join("")}<input type="color" id="sAccent" value="${settings.accent}" aria-label="Eigene Farbe"></div></div>
    ${tg("amoled", settings.amoled, "Tiefschwarz im dunklen Modus")}
    ${tg("dense", settings.dense, "Kompakte Liste")}
  </div>
  <div class="panel"><h3>Neu bewerten</h3>
    <div class="set"><span class="l">Erinnern nach</span>${seg("remind", settings.remind, [[7, "1 Wo."], [14, "2 Wo."], [21, "3 Wo."], [0, "Aus"]])}</div>
    <div class="muted small" style="margin-top:4px">Wünsche, die so lange nicht bewertet wurden, werden als „Neu bewerten“ markiert.</div>
  </div>
  ${catPanelHtml()}
  ${typeof syPanel === "function" ? syPanel() : ""}
  <div class="panel"><h3>Sicherung als Datei</h3>
    <div class="muted small" style="margin-bottom:10px">Zusätzlich zur Konto-Sicherung kannst du alles als Datei speichern.</div>
    <div class="row" style="flex-wrap:wrap"><button type="button" class="btn" data-act="export">Sicherung speichern</button><button type="button" class="btn" data-act="import">Sicherung laden</button></div>
    <input type="file" id="sImport" accept="application/json,.json" hidden>
    <div style="height:10px"></div><button type="button" class="btn dng" data-act="wipe">${IC.trash(17)}Alles löschen</button>
  </div>
  <div class="muted tiny" style="text-align:center">Wunschliste · ${items.length} Einträge</div>`;
}

function settingsSheet() {
  const rec = openSheet(settingsHtml(), { cls: "tall", onClose: () => { window.wlSettingsRedo = null; } });
  const sh = rec.sheet;
  const redo = () => { const top = sh.scrollTop; sh.innerHTML = settingsHtml(); sh.scrollTop = top; applyTheme(); render(); };
  window.wlSettingsRedo = redo;
  sh.addEventListener("click", e => {
    if (e.target.closest("[data-close]")) return closeSheet();
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const v = b.dataset.v;
    switch (b.dataset.act) {
      case "mode": settings.mode = v; saveSettings(); redo(); break;
      case "accent": settings.accent = v; saveSettings(); redo(); break;
      case "amoled": settings.amoled = !settings.amoled; saveSettings(); redo(); break;
      case "dense": settings.dense = !settings.dense; saveSettings(); redo(); break;
      case "remind": settings.remind = +v; saveSettings(); redo(); break;
      case "catNew": { const c = addCat($("#sCatIn", sh).value); if (c) redo(); break; }
      case "catColor": { const c = catById(b.dataset.id); if (c) { c.color = CAT_COLORS[(CAT_COLORS.indexOf(c.color) + 1) % CAT_COLORS.length]; saveSettings(); redo(); } break; }
      case "catExpClear": { const c = catById(b.dataset.id); if (c) { c.exp = null; saveSettings(); redo(); } break; }
      case "catDel": {
        const c = catById(b.dataset.id); if (!c) break;
        const used = items.filter(i => i.cat === c.id);
        if (!confirm("Kategorie „" + c.name + "“ löschen?" + (used.length ? " Die " + used.length + " Wünsche darin bleiben erhalten, haben dann aber keine Kategorie." : ""))) break;
        used.forEach(i => { i.cat = ""; }); if (used.length) persistMany(used);
        settings.cats = settings.cats.filter(x => x.id !== c.id);
        if (settings.catFilter === c.id) settings.catFilter = "";
        saveSettings(); redo(); break;
      }
      case "export": exportBackup(); break;
      case "import": $("#sImport", sh).click(); break;
      case "wipe": if (confirm("Wirklich ALLE Wünsche löschen? Wenn du angemeldet bist, werden sie auch im Konto und auf deinen anderen Geräten gelöscht. Das lässt sich nicht rückgängig machen.")) { items = []; clearDb(); closeSheet(); render(); toast("Alles gelöscht"); } break;
    }
  });
  sh.addEventListener("input", e => { if (e.target.id === "sAccent") { settings.accent = e.target.value; saveSettings(); applyTheme(); render(); } });
  sh.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "sCatIn") { e.preventDefault(); if (addCat(e.target.value)) redo(); } });
  sh.addEventListener("change", e => {
    const t = e.target, c = catById(t.dataset && t.dataset.id);
    if (c && t.classList.contains("cname")) { const nm = t.value.trim().slice(0, 30); if (nm) { c.name = nm; saveSettings(); render(); } else t.value = c.name; return; }
    if (c && t.classList.contains("cexpin")) { c.exp = t.value ? fromInputDate(t.value) : null; saveSettings(); redo(); return; }
    if (e.target.id === "sAccent") redo(); else if (e.target.id === "sImport") importBackup(e.target.files[0], () => { e.target.value = ""; closeSheet(); }); });
}

/* ---------- Sicherung ---------- */
function blobToBase64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
}
async function exportFile(name, blob) {
  let why = "";
  if (NATIVE) {
    try {
      const C = window.Capacitor;
      const p = (C.Plugins && C.Plugins.WlDownload) || (typeof C.registerPlugin === "function" ? C.registerPlugin("WlDownload") : null);
      if (!p || typeof p.save !== "function") throw new Error("Download-Funktion der App nicht gefunden");
      await p.save({ filename: name, data: await blobToBase64(blob), mime: blob.type || "application/octet-stream" });
      toast("In „Download“ gespeichert: " + name); return true;
    } catch (e) { why = (e && (e.message || e.errorMessage)) || String(e); }
  }
  try {
    const f = new File([blob], name, { type: blob.type || "application/octet-stream" });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      await navigator.share({ files: [f], title: name });
      toast("Datei geteilt/gespeichert"); return true;
    }
  } catch (e) { if (e && e.name === "AbortError") { toast("Abgebrochen"); return false; } why = why || (e && e.message) || ""; }
  if (NATIVE) { toast("Speichern nicht möglich" + (why ? ": " + why : "")); return false; }
  const u = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
  toast("Sicherung heruntergeladen"); return true;
}
function exportBackup() {
  const data = { app: "wunschliste", ver: 1, exported: new Date().toISOString(), settings, items };
  exportFile("wunschliste-" + toInputDate(Date.now()) + ".json", new Blob([JSON.stringify(data)], { type: "application/json" }));
}
async function importBackup(file, done) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const raw = Array.isArray(data) ? data : data && data.items;
    if (!Array.isArray(raw)) throw new Error("Keine Wunschliste-Sicherung");
    const list = raw.map(normItem).filter(Boolean);
    let added = 0, updated = 0;
    for (const n of list) {
      const i = items.findIndex(x => x.id === n.id);
      if (i >= 0) { items[i] = n; updated++; } else { items.push(n); added++; }
    }
    await persistMany(list);
    if (data && !Array.isArray(data) && data.settings && Array.isArray(data.settings.cats)) {
      normCats(data.settings.cats).forEach(c => { if (!catById(c.id)) settings.cats.push(c); });
      saveSettings();
    }
    render();
    toast(added + " neu, " + updated + " aktualisiert");
  } catch (e) { toast("Datei konnte nicht geladen werden: " + (e.message || e)); }
  if (done) done();
}

/* ---------- Ereignisse ---------- */
document.addEventListener("click", e => {
  if (e.target.closest(".sheet-wrap")) return; // Sheets behandeln ihre Klicks selbst
  const b = e.target.closest("[data-act]");
  if (!b || !$("#view").contains(b)) return;
  const art = b.closest("[data-id]");
  const it = art ? items.find(i => i.id === art.dataset.id) : null;
  switch (b.dataset.act) {
    case "info": infoSheet(); break;
    case "settings": settingsSheet(); break;
    case "filter": settings.filter = b.dataset.v; saveSettings(); render(); break;
    case "sortDue": settings.sort = "due"; settings.filter = "open"; saveSettings(); render(); break;
    case "catFilter": settings.catFilter = b.dataset.v; saveSettings(); render(); break;
    case "toggle": if (it) setBought(it, !it.bought); break;
    case "open": if (it) editSheet(it.id); break;
    case "rate": if (it) rateSheet(it.id); break;
  }
});
document.addEventListener("submit", e => {
  if (e.target.id !== "addForm") return;
  e.preventDefault();
  const inp = $("#addIn");
  const it = addItem(inp.value, catById(settings.catFilter) ? settings.catFilter : "");
  if (!it) return inp.focus();
  inp.value = ""; render(); buzz();
  editSheet(it.id);
});
document.addEventListener("change", e => {
  if (e.target.id === "sortSel") { settings.sort = e.target.value; saveSettings(); render(); }
});
if (window.matchMedia) matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => { if (settings.mode === "auto") applyTheme(); });

document.addEventListener("visibilitychange", () => { if (!document.hidden && idb !== null) render(); });

/* ---------- Start ---------- */
(async function init() {
  applyTheme();
  idb = await openDb();
  let raw;
  if (idb) raw = await dbAll();
  else { try { raw = JSON.parse(localStorage.getItem("wl-items") || "[]"); } catch (e) { raw = []; } }
  const needIds = raw.some(r => r && Array.isArray(r.images) && r.images.some(i => i && !i.id));
  items = raw.map(normItem).filter(Boolean);
  if (needIds) persistMany(items);
  render();
  itemsReadyRes();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* egal */ }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
})();
