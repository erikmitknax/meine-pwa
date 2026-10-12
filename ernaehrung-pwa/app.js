"use strict";
/* Ernährung – lokale Kalorien-/Makro-App. Alle Daten bleiben im Gerät (localStorage). */

/* ---------- Grundlagen ---------- */
const KEY = "ern.v1";
const MEALS = [
  { id: "b", name: "Frühstück", icon: "🌅" },
  { id: "l", name: "Mittagessen", icon: "🍝" },
  { id: "d", name: "Abendessen", icon: "🌙" },
  { id: "s", name: "Snacks", icon: "🍎" },
];
const ACCENTS = ["#12935f", "#3d5afe", "#ff4d2e", "#e8458b", "#9b51e0", "#0891b2", "#f59e0b"];
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

const DEFAULTS = () => ({
  ver: 3, foods: [], recipes: [], entries: [], weights: {},
  settings: { kcal: 2200, pP: 30, pC: 40, pF: 30, mode: "auto", accent: "#12935f", geminiKey: "", geminiModel: "gemini-2.5-flash", goalWeight: "" },
});
let D = load();
let ui = { setOpen: {}, tab: "today", date: iso(new Date()), weekOffset: 0, wRange: 90, meal: "b", open: {} };

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw) {
      const d = DEFAULTS(), out = { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}) } };
      // frühere Standardfarben (Grün, Orange-Rot) auf die neue Logo-Farbe umstellen
      if ((raw.ver || 0) < 3 && ["#2ecc71", "#ff4d2e"].includes(String(out.settings.accent).toLowerCase())) out.settings.accent = d.settings.accent;
      delete out.settings.apiKey; delete out.settings.model; // alter Claude-Schlüssel wird entfernt
      out.ver = 3;
      return out;
    }
  } catch (e) { /* kaputte Daten ignorieren */ }
  return DEFAULTS();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { toast("Speichern fehlgeschlagen (Speicher voll?)"); }
  if (typeof queueBackup === "function") queueBackup();
}
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : 0; };
const r0 = n => Math.round(n);
const r1 = n => Math.round(n * 10) / 10;
function iso(d) { const z = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); }
function fromIso(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = fromIso(s); d.setDate(d.getDate() + n); return iso(d); }
function niceDate(s) {
  const t = iso(new Date());
  if (s === t) return "Heute";
  if (s === addDays(t, -1)) return "Gestern";
  if (s === addDays(t, 1)) return "Morgen";
  return fromIso(s).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
}
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2400); }

/* ---------- Ziele & Summen ---------- */
function goals() {
  const s = D.settings;
  return { kcal: s.kcal, p: s.kcal * s.pP / 100 / 4, c: s.kcal * s.pC / 100 / 4, f: s.kcal * s.pF / 100 / 9 };
}
function sum(list) {
  return list.reduce((a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c, f: a.f + e.f }), { kcal: 0, p: 0, c: 0, f: 0 });
}
const dayEntries = d => D.entries.filter(e => e.date === d);
function calc(food, grams) {
  const k = grams / 100;
  return { kcal: food.kcal * k, p: food.protein * k, c: food.carbs * k, f: food.fat * k };
}

/* ---------- Theme ---------- */
function applyTheme() {
  const s = D.settings, root = document.documentElement;
  let mode = s.mode;
  if (mode === "auto") mode = window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  root.dataset.mode = mode;
  root.style.setProperty("--accent", s.accent);
  const [r, g, b] = [1, 3, 5].map(i => parseInt(s.accent.slice(i, i + 2), 16));
  root.style.setProperty("--on-accent", (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#0a1410" : "#ffffff");
  const m = $('meta[name="theme-color"]');
  if (m) m.content = mode === "light" ? "#f3f4f6" : "#0b0d11";
}

/* ---------- Rendering ---------- */
function render() {
  $$("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === ui.tab));
  const v = $("#view");
  const top = v.scrollTop;
  v.innerHTML = { today: viewToday, week: viewWeek, weight: viewWeight, settings: viewSettings }[ui.tab]();
  v.scrollTop = top;
}

const IC = {
  today: '<path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  week: '<path d="M5 20v-8M12 20V4M19 20v-5"/>',
  weight: '<path d="M4.5 18a8 8 0 1 1 15 0"/><path d="m12 17 3.5-5"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>',
};
const icon = (n, s = 22, w = 2) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${IC[n]}</svg>`;
const fmt = n => Math.round(n).toLocaleString("de-DE");
const TABS = [["today", "Heute"], ["week", "Woche"], null, ["weight", "Gewicht"], ["settings", "Einstellungen"]];
function buildNav() {
  $("#tabs").innerHTML = TABS.map(t => t ? `<button class="tab" data-tab="${t[0]}">${icon(t[0])}<span>${t[1]}</span></button>` : `<button class="fab" data-act="add" aria-label="Lebensmittel hinzufügen">${icon("plus", 28, 2.4)}</button>`).join("");
}

function macroCol(label, val, goal, k) {
  const pct = goal > 0 ? Math.min(val / goal * 100, 100) : 0;
  return `<div class="mc"><div class="mv"><b>${r0(val)}</b><span>/ ${r0(goal)} g</span></div><div class="track"><i class="${k}" style="width:${pct}%"></i></div><div class="ml">${label}</div></div>`;
}

function weekStrip() {
  const d = fromIso(ui.date), mon = addDays(ui.date, -((d.getDay() + 6) % 7)), today = iso(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  return `<div class="strip"><button class="sn" data-act="day" data-d="-7" aria-label="Vorherige Woche">${icon("left", 18)}</button>` +
    days.map(x => {
      const dd = fromIso(x), has = D.entries.some(e => e.date === x);
      return `<button class="sd ${x === ui.date ? "on" : ""} ${x === today ? "td" : ""}" data-act="setDay" data-d="${x}"><span>${WD[dd.getDay()]}</span><b>${dd.getDate()}</b><i class="${has ? "has" : ""}"></i></button>`;
    }).join("") +
    `<button class="sn" data-act="day" data-d="7" aria-label="Nächste Woche">${icon("right", 18)}</button></div>`;
}

function viewToday() {
  const g = goals(), list = dayEntries(ui.date), t = sum(list);
  const left = g.kcal - t.kcal, pct = g.kcal > 0 ? Math.min(t.kcal / g.kcal * 100, 100) : 0;
  const meals = MEALS.map(m => {
    const es = list.filter(e => e.meal === m.id), s = sum(es);
    const op = !!ui.open[m.id] && es.length > 0;
    return `<section class="meal ${op ? "open" : ""}"><div class="mh ${es.length ? "tg" : ""}" ${es.length ? `data-act="toggleMeal" data-meal="${m.id}" role="button" tabindex="0" aria-expanded="${op}"` : ""}><h3>${m.name}${es.length ? `<span class="cnt">${es.length}</span>` : ""}</h3>${es.length ? `<span class="kc">${fmt(s.kcal)} kcal</span><span class="chev">${icon("right", 16, 2.4)}</span>` : ""}<button class="addbtn" data-act="add" data-meal="${m.id}" aria-label="${m.name} hinzufügen">${icon("plus", 18, 2.6)}</button></div>` +
      (es.length ? (op ? `<div class="list">${es.map(e => `<div class="entry" data-act="editEntry" data-id="${e.id}"><div class="nm"><div class="t">${esc(e.name)}</div>
        <div class="s"><span class="g">${r0(e.grams)} g</span><span class="cp">E ${r0(e.p)}</span><span class="cc">KH ${r0(e.c)}</span><span class="cf">F ${r0(e.f)}</span></div></div>
        <div class="kcal">${fmt(e.kcal)}<small>kcal</small></div></div>`).join("")}</div>${es.length > 1 ? `<button class="linkbtn" data-act="mealToRecipe" data-meal="${m.id}">Als Rezept speichern</button>` : ""}` : "")
        : `<button class="empty" data-act="add" data-meal="${m.id}">${icon("plus", 18, 2.4)}${m.name} eintragen</button>`) + `</section>`;
  }).join("");
  const full = fromIso(ui.date).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  return `<header class="top"><div class="brand"><img class="logo" src="icons/logo.svg" alt="">FoodPro</div><button class="ghost" data-act="pickDate" aria-label="Datum wählen">${icon("cal", 20)}</button></header>
  ${weekStrip()}
  <section class="hero ${g.kcal > 0 && t.kcal >= g.kcal ? "over" : ""}" data-act="dayChart" role="button" tabindex="0" aria-label="Tagesübersicht öffnen"><div class="ht"><span>${niceDate(ui.date) === full ? full : niceDate(ui.date) + ", " + full}</span><span class="hchev">Ziel ${fmt(g.kcal)} ${icon("right", 16, 2.4)}</span></div>
    <div class="hn"><b>${fmt(Math.abs(left))}</b><span>${left >= 0 ? "kcal übrig" : "kcal drüber"}</span></div>
    <div class="hbar"><i style="width:${pct}%"></i></div><div class="hf">${fmt(t.kcal)} kcal gegessen</div></section>
  <section class="macros" data-act="dayChart" role="button" tabindex="0" aria-label="Tagesübersicht öffnen">${macroCol("Eiweiß", t.p, g.p, "p")}${macroCol("Kohlenhydrate", t.c, g.c, "c")}${macroCol("Fett", t.f, g.f, "f")}</section>
  ${meals}`;
}

/* ---- Woche ---- */
function weekDays(offset) {
  const today = iso(new Date());
  const end = addDays(today, offset * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
}
function viewWeek() {
  const g = goals(), days = weekDays(ui.weekOffset);
  const rows = days.map(d => ({ d, ...sum(dayEntries(d)), n: dayEntries(d).length }));
  const logged = rows.filter(r => r.n), L = logged.length || 1;
  const avg = logged.reduce((a, r) => ({ kcal: a.kcal + r.kcal, p: a.p + r.p, c: a.c + r.c, f: a.f + r.f }), { kcal: 0, p: 0, c: 0, f: 0 });
  const hit = logged.filter(r => Math.abs(r.kcal - g.kcal) <= g.kcal * 0.1).length;
  const avgK = avg.kcal / L, diff = avgK - g.kcal;
  const W = 340, H = 190, pad = 24, bw = 30;
  const max = Math.max(g.kcal * 1.25, ...rows.map(r => r.kcal), 1);
  const y = v => H - pad - (v / max) * (H - pad - 16);
  const step = (W - 12) / 7;
  const bars = rows.map((r, i) => {
    const x = 6 + i * step + (step - bw) / 2, h = Math.max(H - pad - y(r.kcal), r.n ? 4 : 0);
    const over = r.kcal > g.kcal * 1.1;
    return `<g data-act="goDay" data-d="${r.d}" style="cursor:pointer"><rect x="${x}" y="${H - pad - (r.n ? h : 4)}" width="${bw}" height="${r.n ? h : 4}" rx="10" fill="${r.n ? (over ? "var(--danger)" : "var(--accent)") : "var(--card2)"}"/>
    <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" ${r.d === iso(new Date()) ? 'style="fill:var(--text)"' : ""}>${WD[fromIso(r.d).getDay()]}</text>
    ${r.n ? (h > 44 ? `<text x="${x + bw / 2}" y="${H - pad - h + 15}" text-anchor="middle" style="fill:#fff;font-weight:700;font-size:10px">${fmt(r.kcal)}</text>` : `<text x="${x + bw / 2}" y="${H - pad - h - 6}" text-anchor="middle" style="fill:var(--text)">${fmt(r.kcal)}</text>`) : ""}</g>`;
  }).join("");
  const chart = `<svg viewBox="0 0 ${W} ${H}" width="100%"><line x1="0" x2="${W}" y1="${y(g.kcal)}" y2="${y(g.kcal)}" stroke="var(--muted)" stroke-dasharray="3 5" opacity=".6"/>
${bars}</svg><div class="goalkey"><i></i>Ziel ${fmt(g.kcal)} kcal</div>`;
  // Typische Wochentage (letzte 8 Wochen)
  const today = iso(new Date()), byWd = {};
  for (let i = 0; i < 56; i++) { const d = addDays(today, -i), es = dayEntries(d); if (es.length) (byWd[fromIso(d).getDay()] = byWd[fromIso(d).getDay()] || []).push(sum(es).kcal); }
  const avgWd = w => byWd[w] ? byWd[w].reduce((a, b) => a + b, 0) / byWd[w].length : 0;
  const wdMax = Math.max(g.kcal * 1.2, ...WD_ORDER.map(avgWd), 1);
  const wdBars = WD_ORDER.map(w => { const v = avgWd(w); return `<div class="col ${v ? "" : "none"}">${v ? `<b>${fmt(v)}</b>` : ""}<i style="height:${v ? v / wdMax * 70 : 4}px;${v > g.kcal * 1.1 ? "background:var(--danger)" : ""}"></i>${WD[w]}</div>`; }).join("");
  const label = ui.weekOffset === 0 ? "Letzte 7 Tage" : fromIso(days[0]).toLocaleDateString("de-DE", { day: "numeric", month: "short" }) + " – " + fromIso(days[6]).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  return `<h1>Woche</h1>
  <div class="row between" style="margin-bottom:14px"><button class="iconbtn" data-act="wk" data-d="-1" aria-label="Vorherige Woche">${icon("left", 20)}</button><b>${label}</b><button class="iconbtn" data-act="wk" data-d="1" aria-label="Nächste Woche" ${ui.weekOffset >= 0 ? "disabled" : ""}>${icon("right", 20)}</button></div>
  ${logged.length ? `<div class="bignum"><b>${fmt(avgK)}</b><span>kcal pro Tag</span><span class="pill ${Math.abs(diff) <= g.kcal * .1 ? "good" : diff > 0 ? "bad" : ""}">${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff))} zum Ziel</span></div>` : `<div class="muted" style="margin:0 4px 14px">In diesem Zeitraum gibt es noch keine Einträge.</div>`}
  <div class="surface">${chart}</div>
  ${logged.length ? `<div class="muted small" style="margin:12px 4px 0">${hit} von ${logged.length} ${logged.length === 1 ? "Tag" : "Tagen"} im Zielbereich (±10 %)</div>
  <section class="macros" style="margin-top:20px">${macroCol("Ø Eiweiß", avg.p / L, g.p, "p")}${macroCol("Ø Kohlenh.", avg.c / L, g.c, "c")}${macroCol("Ø Fett", avg.f / L, g.f, "f")}</section>` : ""}
  <h2>Typische Wochentage</h2><div class="muted small" style="margin:-6px 4px 12px">Durchschnitt der letzten 8 Wochen</div>
  <div class="surface"><div class="wdbars">${wdBars}</div></div>`;
}

/* ---- Gewicht ---- */
function weightList() { return Object.entries(D.weights).map(([d, w]) => ({ d, w })).sort((a, b) => a.d.localeCompare(b.d)); }
function viewWeight() {
  const all = weightList(), today = iso(new Date());
  const from = ui.wRange ? addDays(today, -ui.wRange) : "0000-00-00";
  const pts = all.filter(p => p.d >= from);
  const goal = num(D.settings.goalWeight);
  const cur = all.length ? all[all.length - 1] : null, first = all.length ? all[0] : null;
  const wAgo = d => { const t = addDays(today, -d); const c = all.filter(p => p.d <= t); return c.length ? c[c.length - 1].w : null; };
  const diff = (a, b) => a == null || b == null ? "–" : (a - b > 0 ? "+" : a - b < 0 ? "−" : "") + Math.abs(r1(a - b)).toLocaleString("de-DE") + " kg";
  let chart = `<div class="muted center small" style="padding:34px 10px">Trage dein erstes Gewicht ein, dann erscheint hier dein Verlauf.</div>`;
  if (pts.length >= 1) {
    const W = 340, H = 200, px = 30, py = 20;
    const ws = pts.map(p => p.w).concat(goal ? [goal] : []);
    let lo = Math.min(...ws), hi = Math.max(...ws);
    if (hi - lo < 2) { lo -= 1; hi += 1; }
    lo = Math.floor(lo - .5); hi = Math.ceil(hi + .5);
    const t0 = fromIso(pts[0].d).getTime(), t1 = fromIso(pts[pts.length - 1].d).getTime();
    const X = d => pts.length === 1 || t1 === t0 ? W / 2 : px + (fromIso(d).getTime() - t0) / (t1 - t0) * (W - px - 14);
    const Y = w => H - py - (w - lo) / (hi - lo) * (H - py - 14);
    const pathOf = a => a.map((p, i) => (i ? "L" : "M") + X(p.d).toFixed(1) + " " + Y(p.w).toFixed(1)).join(" ");
    const ma = pts.map((p, i) => { const s = pts.slice(Math.max(0, i - 6), i + 1); return { d: p.d, w: s.reduce((a, b) => a + b.w, 0) / s.length }; });
    const ticks = [lo, (lo + hi) / 2, hi].map(v => `<line x1="${px}" x2="${W - 4}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${px - 6}" y="${Y(v) + 4}" text-anchor="end">${r1(v)}</text>`).join("");
    const area = pts.length > 1 ? `<path d="${pathOf(ma)} L${X(ma[ma.length - 1].d)} ${H - py} L${X(ma[0].d)} ${H - py}Z" fill="var(--accent)" opacity=".09"/>` : "";
    chart = `<svg viewBox="0 0 ${W} ${H}" width="100%">${ticks}${area}
      ${goal ? `<line x1="${px}" x2="${W - 4}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="var(--c)" stroke-width="2" stroke-dasharray="5 5"/><text x="${W - 4}" y="${Y(goal) - 6}" text-anchor="end" style="fill:var(--c)">Ziel ${goal}</text>` : ""}
      <path d="${pathOf(ma)}" fill="none" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map(p => `<circle cx="${X(p.d)}" cy="${Y(p.w)}" r="3" fill="var(--card)" stroke="var(--accent)" stroke-width="2"/>`).join("")}
      <text x="${px}" y="${H - 2}">${fromIso(pts[0].d).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}</text>
      <text x="${W - 4}" y="${H - 2}" text-anchor="end">${fromIso(pts[pts.length - 1].d).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}</text></svg>
      <div class="legend"><span><span class="dot" style="background:var(--accent)"></span>Trend</span><span><span class="dot" style="background:var(--muted);opacity:.6"></span>Messwerte</span></div>`;
  }
  const d7 = cur ? wAgo(7) : null, trendDown = cur && d7 != null ? cur.w - d7 : 0;
  const hero = cur ? `<div class="bignum"><b>${r1(cur.w).toLocaleString("de-DE")}</b><span>kg</span>${d7 != null ? `<span class="pill ${trendDown <= 0 ? "good" : ""}">${diff(cur.w, d7)} in 7 Tagen</span>` : ""}</div>`
    : `<div class="bignum"><b>–</b><span>kg</span></div>`;
  const kpis = cur ? `<div class="kpis"><div class="kpi"><b>${diff(cur.w, wAgo(30))}</b><span>30 Tage</span></div><div class="kpi"><b>${diff(cur.w, first.w)}</b><span>seit Start</span></div>
    <div class="kpi"><b>${goal ? diff(cur.w, goal).replace("+", "") : "–"}</b><span>bis zum Ziel</span></div></div>` : "";
  const rev = all.slice().reverse().slice(0, 30);
  return `<h1>Gewicht</h1>${hero}
  <div class="surface"><div class="seg">${[[30, "30 Tage"], [90, "90 Tage"], [365, "1 Jahr"], [0, "Alles"]].map(([v, l]) => `<button data-act="wRange" data-v="${v}" class="${ui.wRange === v ? "on" : ""}">${l}</button>`).join("")}</div>${chart}${kpis}</div>
  <h2>Neuer Eintrag</h2>
  <div class="panel"><div class="row" style="gap:10px"><div class="grow"><label>Datum</label><input type="date" id="wDate" value="${today}"></div>
    <div class="grow"><label>Gewicht in kg</label><input type="text" inputmode="decimal" id="wVal" placeholder="${cur ? r1(cur.w).toLocaleString("de-DE") : "z. B. 80,5"}"></div></div>
    <button class="btn block" style="margin-top:16px" data-act="saveWeight">Gewicht speichern</button></div>
  ${rev.length ? `<h2>Verlauf</h2><div class="list">${rev.map(p => `<div class="entry" data-act="editWeight" data-d="${p.d}"><div class="nm"><div class="t">${fromIso(p.d).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</div></div><div class="kcal">${r1(p.w).toLocaleString("de-DE")}<small>kg</small></div></div>`).join("")}</div>` : ""}`;
}

/* ---- Einstellungen ---- */
function viewSettings() {
  const s = D.settings, tot = s.pP + s.pC + s.pF;
  return `<h1>Einstellungen</h1>
  ${acc("goals", `Tagesziele`, `<div class="panel">
    <label>Kalorien pro Tag</label><input type="text" inputmode="numeric" id="sKcal" value="${s.kcal}">
    <div class="grid3"><div><label>Eiweiß in %</label><input type="text" inputmode="numeric" id="sP" value="${s.pP}"></div>
    <div><label>Kohlenh. in %</label><input type="text" inputmode="numeric" id="sC" value="${s.pC}"></div>
    <div><label>Fett in %</label><input type="text" inputmode="numeric" id="sF" value="${s.pF}"></div></div>
    <div id="macroInfo" class="small ${tot === 100 ? "muted" : "warn"}" style="margin:10px 2px 0">${macroInfoText(s.pP, s.pC, s.pF, s.kcal)}</div>
    <label>Zielgewicht in kg (optional)</label><input type="text" inputmode="decimal" id="sGoalW" value="${esc(s.goalWeight)}">
    <button class="btn block" style="margin-top:16px" data-act="saveGoals">Ziele speichern</button></div>
  `)}
  ${acc("design", `Design`, `<div class="panel">
    <label>Darstellung</label><div class="chips">${[["auto", "Automatisch"], ["dark", "Dunkel"], ["light", "Hell"]].map(([v, l]) => `<button class="chip ${s.mode === v ? "on" : ""}" data-act="mode" data-v="${v}">${l}</button>`).join("")}</div>
    <label>Akzentfarbe</label><div class="swatches">${ACCENTS.map(c => `<button class="sw ${s.accent.toLowerCase() === c ? "on" : ""}" style="background:${c}" data-act="accent" data-v="${c}" aria-label="Farbe ${c}"></button>`).join("")}<input type="color" id="sAccent" value="${s.accent}" aria-label="Eigene Farbe"></div></div>
  `)}
  ${acc("ai", `Foto-KI (Gemini)`, `<div class="panel">
    <div class="muted small" style="margin-top:14px">Die Foto-Erkennung nutzt Google Gemini. Das Gratis-Kontingent reicht für den Alltag, der Schlüssel bleibt nur auf diesem Gerät und geht direkt an Google. Bei kostenloser Nutzung kann Google Eingaben zur Verbesserung seiner Dienste verwenden.</div>
    <div class="steps"><b>So verknüpfst du Gemini:</b>
      <ol><li>Öffne <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> und melde dich mit deinem Google-Konto an.</li>
      <li>Tippe auf „API-Schlüssel erstellen“ und kopiere den Schlüssel (beginnt mit „AIza…“).</li>
      <li>Füge ihn unten ein und tippe auf „Speichern“. Fertig – im Reiter „Foto-KI“ beim Hinzufügen kannst du jetzt Fotos analysieren.</li></ol></div>
    <label>Gemini-API-Schlüssel</label><input type="password" id="sKey" value="${esc(s.geminiKey)}" placeholder="AIza…" autocomplete="off">
    <label>Modell</label><input type="text" id="sModel" value="${esc(s.geminiModel)}">
    <button class="btn sec block" style="margin-top:16px" data-act="saveAI">Speichern</button></div>`)}
  ${acc("rec", `Rezepte`, `<div class="panel" style="padding-top:16px"><button class="btn sec block" data-act="recipes">Meine Rezepte (${D.recipes.length})</button></div>
  `)}
  ${acc("foods", `Meine Lebensmittel <span class="muted" style="font-weight:600">${D.foods.length}</span>`, `<div class="panel" style="padding-top:16px">
    <div class="grid2"><button class="btn sec" data-act="foodsManage">Verwalten</button><button class="btn sec" data-act="foodNew">Neu anlegen</button></div>
    <button class="btn sec block" style="margin-top:10px" data-act="csvTemplate">CSV-Vorlage laden</button></div>
  `)}
  ${acc("exp", `Export`, `<div class="panel" style="padding-top:16px">
    <button class="btn block" data-act="backup">Alles sichern (Backup-Datei)</button>
    <div class="muted small" style="margin:8px 2px 12px">Enthält Tagebuch, Gewicht, Rezepte, Lebensmittel und Einstellungen.</div>
    <div class="grid2"><button class="btn sec" data-act="exDiary">Tagebuch (CSV)</button><button class="btn sec" data-act="exWeight">Gewicht (CSV)</button>
    <button class="btn sec" data-act="exRecipes">Rezepte (CSV)</button><button class="btn sec" data-act="csvExport">Lebensmittel (CSV)</button></div></div>
  `)}
  ${acc("imp", `Import`, `<div class="panel" style="padding-top:16px">
    <button class="btn block" data-act="importPick">Datei importieren</button>
    <div class="muted small" style="margin:8px 2px 0">Backup-Datei (ersetzt alle Daten) oder CSV für Tagebuch, Gewicht, Rezepte und Lebensmittel (ergänzt vorhandene Daten). Die Art erkennt FoodPro automatisch.</div>
    <input type="file" id="dataFile" accept=".json,.csv,application/json,text/csv,text/plain" hidden></div>
  `)}
  ${acc("dbx", `Dropbox`, `${dbxPanel()}
  `)}
  ${acc("danger", `Gefahrenzone`, `<div class="panel" style="padding-top:16px"><button class="btn danger block" data-act="wipe">Alle Daten löschen</button></div>
  `)}
  <div class="muted tiny center" style="margin-top:22px">FoodPro · Nährwertdaten von Open Food Facts (ODbL)</div>`;
}
function acc(id, title, inner) {
  return `<details class="acc" data-acc="${id}" ${ui.setOpen[id] ? "open" : ""}><summary><span>${title}</span><i class="chev">${icon("right", 18, 2.4)}</i></summary><div class="accb">${inner}</div></details>`;
}
function macroInfoText(p, c, f, kcal) {
  const t = p + c + f;
  return t === 100 ? `Ziele: ${r0(kcal * p / 400)} g Eiweiß · ${r0(kcal * c / 400)} g Kohlenhydrate · ${r0(kcal * f / 900)} g Fett`
    : `Die Prozentwerte ergeben ${t} % – sie müssen zusammen 100 % ergeben.`;
}

/* ---------- Sheets ---------- */
/* Zurück-Taste/-Geste: schließt zuerst Fenster, dann geht es zur Startseite, erst dann verlässt man die App */
const hist = { sheet: false, tab: false, skip: 0 };
function histBack() { hist.skip++; history.back(); }
function setTab(t) {
  ui.tab = t;
  if (t !== "today" && !hist.tab) { try { history.pushState({ ern: "tab" }, ""); hist.tab = true; } catch (e) { } }
  else if (t === "today" && hist.tab) { hist.tab = false; histBack(); }
}
window.addEventListener("popstate", () => {
  if (hist.skip > 0) { hist.skip--; return; }
  if (hist.sheet) { hist.sheet = false; clearSheet(); return; }
  if (hist.tab) { hist.tab = false; ui.tab = "today"; render(); $("#view").scrollTop = 0; }
});
function clearSheet() { stopScan(); $("#sheetRoot").innerHTML = ""; }
function sheet(html, mount) {
  clearSheet();
  if (!hist.sheet) { try { history.pushState({ ern: "sheet" }, ""); hist.sheet = true; } catch (e) { } }
  const bg = document.createElement("div");
  bg.className = "sheetbg";
  bg.innerHTML = `<div class="sheet">${html}</div>`;
  bg.addEventListener("click", e => { if (e.target === bg) closeSheet(); });
  $("#sheetRoot").append(bg);
  if (mount) mount(bg.firstElementChild);
  return bg.firstElementChild;
}
function closeSheet() {
  clearSheet();
  if (hist.sheet && !hist.timer) hist.timer = setTimeout(() => { hist.timer = 0; if (hist.sheet && !$("#sheetRoot").firstChild) { hist.sheet = false; histBack(); } }, 0);
}

/* ---- Hinzufügen ---- */
let addTab = "search";
function openAdd(meal) {
  if (meal) ui.meal = meal;
  const mealSel = `<select id="aMeal" style="margin-bottom:12px">${MEALS.map(m => `<option value="${m.id}" ${m.id === ui.meal ? "selected" : ""}>${m.name} – ${niceDate(ui.date)}</option>`).join("")}</select>`;
  const tabs = [["search", "Suchen"], ["scan", "Scannen"], ["photo", "Foto-KI"], ["recipes", "Rezepte"], ["manual", "Manuell"]];
  const s = sheet(`<h3>Lebensmittel hinzufügen</h3>${mealSel}
    <div class="seg five">${tabs.map(([v, l]) => `<button data-at="${v}" class="${addTab === v ? "on" : ""}">${l}</button>`).join("")}</div><div id="addBody"></div>`);
  $("#aMeal", s).onchange = e => ui.meal = e.target.value;
  $$("[data-at]", s).forEach(b => b.onclick = () => { addTab = b.dataset.at; stopScan(); $$("[data-at]", s).forEach(x => x.classList.toggle("on", x === b)); addBody(); });
  addBody();
}
function addBody() {
  stopScan();
  const b = $("#addBody");
  if (!b) return;
  if (addTab === "search") bodySearch(b);
  else if (addTab === "scan") bodyScan(b);
  else if (addTab === "photo") bodyPhoto(b);
  else if (addTab === "recipes") bodyRecipes(b);
  else bodyManual(b);
}

function foodLine(f) {
  return `<div class="grow"><div>${esc(f.name)}</div><div class="muted tiny">${f.brand ? esc(f.brand) + " · " : ""}${r0(f.kcal)} kcal · E ${r1(f.protein)} · KH ${r1(f.carbs)} · F ${r1(f.fat)} <span class="tiny">/100 g</span></div></div>`;
}
function bodySearch(b) {
  b.innerHTML = `<div class="row"><input type="search" id="q" placeholder="Name oder Marke …" autocomplete="off"><button class="btn" id="qGo" aria-label="Online suchen">${icon("search", 22)}</button></div>
    <div id="localRes"></div><div id="onlineRes"></div>`;
  const q = $("#q", b);
  const showLocal = () => {
    const t = q.value.trim().toLowerCase();
    const list = (t ? D.foods.filter(f => (f.name + " " + f.brand).toLowerCase().includes(t)) : D.foods.slice().sort((a, c) => (c.used || 0) - (a.used || 0))).slice(0, 25);
    $("#localRes", b).innerHTML = (list.length ? `<h2>${t ? "In meiner Datenbank" : "Zuletzt / häufig genutzt"}</h2>` : (t ? "" : `<div class="muted small center" style="padding:16px">Noch keine Lebensmittel gespeichert. Suche online, scanne einen Barcode oder lege selbst eines an.</div>`)) +
      list.map(f => `<div class="res" data-fid="${f.id}">${foodLine(f)}</div>`).join("");
    $$("[data-fid]", b).forEach(el => el.onclick = () => pickFood(D.foods.find(f => f.id === el.dataset.fid)));
  };
  showLocal();
  q.oninput = showLocal;
  const online = async () => {
    const t = q.value.trim();
    if (t.length < 2) return;
    const o = $("#onlineRes", b);
    o.innerHTML = `<h2>Open Food Facts</h2><div class="muted"><span class="spin"></span>Suche …</div>`;
    try {
      const list = await offSearch(t);
      o.innerHTML = `<h2>Open Food Facts</h2>` + (list.length ? list.map((f, i) => `<div class="res" data-oi="${i}">${foodLine(f)}</div>`).join("") : `<div class="muted small">Nichts gefunden. Probiere einen anderen Begriff oder lege das Lebensmittel selbst an.</div>`);
      $$("[data-oi]", o).forEach(el => el.onclick = () => pickFood(list[+el.dataset.oi], true));
    } catch (e) { o.innerHTML = `<h2>Open Food Facts</h2><div class="warn small">Online-Suche nicht möglich (${esc(e.message)}). Lokale Treffer gehen weiter offline.</div>`; }
  };
  $("#qGo", b).onclick = online;
  q.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); online(); } };
}

/* Open Food Facts */
function mapOff(p) {
  const n = p.nutriments || {};
  let kcal = n["energy-kcal_100g"];
  if (kcal == null && n["energy_100g"] != null) kcal = n["energy_100g"] / 4.184;
  if (!p.product_name || kcal == null) return null;
  return {
    id: uid(), name: p.product_name.trim(), brand: (p.brands || "").split(",")[0].trim(), barcode: String(p.code || ""),
    kcal: r1(kcal), protein: r1(n.proteins_100g || 0), carbs: r1(n.carbohydrates_100g || 0), fat: r1(n.fat_100g || 0),
    sugar: r1(n.sugars_100g || 0), fiber: r1(n.fiber_100g || 0), serving: num(p.serving_quantity) || 100, used: 0,
  };
}
const OFF_FIELDS = "code,product_name,brands,nutriments,serving_quantity";
async function offSearch(t) {
  const u = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(t)}&search_simple=1&action=process&json=1&page_size=25&lc=de&fields=${OFF_FIELDS}`;
  const r = await fetchT(u);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  return (j.products || []).map(mapOff).filter(Boolean);
}
async function offBarcode(code) {
  const r = await fetchT(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (!r.ok && r.status !== 404) throw new Error("HTTP " + r.status);
  const j = await r.json();
  return j.status === 1 && j.product ? mapOff({ ...j.product, code }) : null;
}
function fetchT(url, opt = {}, ms = 15000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...opt, signal: c.signal }).finally(() => clearTimeout(t));
}

/* Lebensmittel wählen -> Menge -> Eintrag */
function pickFood(f, fromOnline) {
  if (!f) return;
  const serving = f.serving || 100;
  const s = sheet(`<h3>${esc(f.name)}</h3><div class="muted small">${f.brand ? esc(f.brand) + " · " : ""}pro 100 g: ${r0(f.kcal)} kcal · E ${r1(f.protein)} · KH ${r1(f.carbs)} · F ${r1(f.fat)}</div>
    <label>Menge (g oder ml)</label><div class="row"><input type="text" inputmode="decimal" id="gr" value="${r0(serving)}">
    <button class="chip" data-m="0.5">½</button><button class="chip" data-m="1">1×</button><button class="chip" data-m="2">2×</button></div>
    <div class="muted tiny">1× = Portion ${r0(serving)} g</div>
    <div class="card" style="margin-top:12px" id="pv"></div>
    <label>Mahlzeit</label><select id="pm">${MEALS.map(m => `<option value="${m.id}" ${m.id === ui.meal ? "selected" : ""}>${m.name}</option>`).join("")}</select>
    <button class="btn block" style="margin-top:14px" id="pgo">Zum Tagebuch hinzufügen</button>
    <button class="btn sec block" style="margin-top:8px" id="pback">Zurück</button>`);
  const gr = $("#gr", s);
  const upd = () => { const c = calc(f, num(gr.value)); $("#pv", s).innerHTML = `<div class="row between"><b style="font-size:22px">${r0(c.kcal)} kcal</b><span class="small"><span class="dot" style="background:var(--p)"></span>E ${r1(c.p)} <span class="dot" style="background:var(--c)"></span>KH ${r1(c.c)} <span class="dot" style="background:var(--f)"></span>F ${r1(c.f)}</span></div>`; };
  gr.oninput = upd; upd();
  $$("[data-m]", s).forEach(b => b.onclick = () => { gr.value = r0(serving * +b.dataset.m); upd(); });
  $("#pback", s).onclick = () => openAdd();
  $("#pgo", s).onclick = () => {
    const grams = num(gr.value);
    if (grams <= 0) return toast("Bitte eine Menge eingeben");
    let stored = D.foods.find(x => x.id === f.id);
    if (!stored) {
      stored = D.foods.find(x => f.barcode && x.barcode === f.barcode) || f;
      if (!D.foods.includes(stored)) D.foods.push(stored);
    }
    stored.used = (stored.used || 0) + 1;
    ui.meal = $("#pm", s).value;
    addEntry(ui.meal, stored, grams);
    closeSheet(); save(); render(); toast("Hinzugefügt");
  };
}
function addEntry(meal, food, grams) {
  const c = calc(food, grams);
  D.entries.push({ id: uid(), date: ui.date, meal, name: food.name, grams, kcal: c.kcal, p: c.p, c: c.c, f: c.f });
}

/* Scannen */
let scanStop = null;
function stopScan() { if (scanStop) { try { scanStop(); } catch (e) { /* egal */ } scanStop = null; } }
function bodyScan(b) {
  b.innerHTML = `<video id="vid" playsinline muted></video><div class="muted small center" id="scanMsg" style="margin:8px 0">Kamera wird gestartet …</div>
    <label>Oder Barcode eintippen</label><div class="row"><input type="text" inputmode="numeric" id="bc" placeholder="EAN, z. B. 4001234567890"><button class="btn" id="bcGo">Suchen</button></div>`;
  const handle = async code => {
    stopScan();
    $("#scanMsg", b).innerHTML = `<span class="spin"></span>Suche ${esc(code)} …`;
    await lookupBarcode(code);
  };
  $("#bcGo", b).onclick = () => { const c = $("#bc", b).value.replace(/\D/g, ""); if (c.length >= 6) handle(c); else toast("Barcode zu kurz"); };
  startScan($("#vid", b), handle, msg => { const m = $("#scanMsg", b); if (m) m.textContent = msg; });
}
async function lookupBarcode(code) {
  let f = D.foods.find(x => x.barcode === code);
  if (f) return pickFood(f);
  try {
    f = await offBarcode(code);
    if (f) return pickFood(f, true);
    toast("Nicht in Open Food Facts – bitte selbst anlegen");
  } catch (e) { toast("Offline oder Fehler – bitte selbst anlegen"); }
  addTab = "manual"; manualPrefill = { barcode: code }; openAdd();
}
async function startScan(video, onCode, setMsg) {
  let stream, alive = true, timer = null, zx = null;
  scanStop = () => { alive = false; clearTimeout(timer); if (zx) { try { zx.reset(); } catch (e) { /* egal */ } } if (stream) stream.getTracks().forEach(t => t.stop()); };
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Kamera nicht verfügbar");
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
    if (!alive) return stream.getTracks().forEach(t => t.stop());
    video.srcObject = stream; await video.play();
    setMsg("Barcode in den Rahmen halten");
    if ("BarcodeDetector" in window) {
      const det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
      const loop = async () => {
        if (!alive) return;
        try { const r = await det.detect(video); if (r.length) { alive = false; return onCode(r[0].rawValue); } } catch (e) { /* weiter */ }
        timer = setTimeout(loop, 200);
      };
      loop();
    } else if (window.ZXing) {
      zx = new ZXing.BrowserMultiFormatReader();
      zx.decodeFromVideoElement(video, res => { if (res && alive) { alive = false; onCode(res.getText()); } });
    } else setMsg("Kein Scanner verfügbar – bitte Nummer eintippen");
  } catch (e) {
    setMsg("Kamera nicht nutzbar (" + (e.message || e.name) + "). Bitte Nummer eintippen.");
  }
}

/* Foto-KI */
let photoItems = [];
function bodyPhoto(b) {
  if (!D.settings.geminiKey) {
    b.innerHTML = `<div class="card muted small">Für die Foto-Erkennung trägst du in den Einstellungen deinen kostenlosen Gemini-Schlüssel ein. Die Werte sind Schätzungen – prüfe sie vor dem Speichern.</div>
      <button class="btn block" id="toSet">Zu den Einstellungen</button>`;
    $("#toSet", b).onclick = () => { closeSheet(); setTab("settings"); render(); };
    return;
  }
  b.innerHTML = `<div class="muted small">Fotografiere dein Essen oder ein Nährwert-Etikett. Die KI schätzt Lebensmittel, Menge und Nährwerte.</div>
    <label style="margin-top:12px">Notiz für die KI (optional)</label>
    <textarea id="pNote" rows="2" placeholder="z. B. 250 g Hähnchenbrust gebraten, Reis ca. 180 g gekocht, Soße ist Joghurtdressing">${esc(ui.photoNote || "")}</textarea>
    <input type="file" id="img" accept="image/*" capture="environment" hidden>
    <div class="grid2" style="margin-top:10px"><button class="btn" id="cam">Foto aufnehmen</button><button class="btn sec" id="gal">Aus Galerie</button></div>
    <input type="file" id="img2" accept="image/*" hidden><div id="pres"></div>`;
  $("#pNote", b).oninput = e => { ui.photoNote = e.target.value; };
  const run = async f => {
    if (!f) return;
    $("#pres", b).innerHTML = `<div class="muted" style="margin-top:14px"><span class="spin"></span>Analysiere Foto …</div>`;
    try { photoItems = await analyzePhoto(f, ($("#pNote", b).value || "").trim()); renderPhotoItems(); }
    catch (e) { $("#pres", b).innerHTML = `<div class="warn small" style="margin-top:14px">${esc(e.message)}</div>`; }
  };
  $("#cam", b).onclick = () => liveCamera(b, run, () => $("#img", b).click());
  $("#gal", b).onclick = () => $("#img2", b).click();
  $("#img", b).onchange = e => run(e.target.files[0]);
  $("#img2", b).onchange = e => run(e.target.files[0]);
}
/* Eigene Kamera-Ansicht (öffnet direkt die Kamera, unabhängig vom Datei-Dialog des Handys) */
async function liveCamera(b, onPhoto, fallback) {
  stopScan();
  const box = $("#pres", b);
  box.innerHTML = `<video id="pvid" playsinline muted style="margin-top:12px"></video>
    <div class="grid2" style="margin-top:10px"><button class="btn" id="pShot">Foto aufnehmen</button><button class="btn sec" id="pClose">Abbrechen</button></div>
    <div class="muted small center" id="pMsg" style="margin-top:8px">Kamera wird gestartet …</div>`;
  const video = $("#pvid", b);
  let stream;
  scanStop = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Kamera nicht verfügbar");
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false });
    if (!$("#pvid", b)) return scanStop();
    video.srcObject = stream; await video.play();
    $("#pMsg", b).textContent = "Essen oder Etikett im Bild halten";
  } catch (e) {
    scanStop(); scanStop = null; box.innerHTML = "";
    toast("Kamera nicht erlaubt – nutze die Foto-App des Handys");
    return fallback();
  }
  $("#pClose", b).onclick = () => { stopScan(); box.innerHTML = ""; };
  $("#pShot", b).onclick = () => {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w) return toast("Kamera noch nicht bereit");
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(video, 0, 0, w, h);
    stopScan();
    c.toBlob(bl => bl ? onPhoto(bl) : toast("Foto konnte nicht erstellt werden"), "image/jpeg", 0.9);
  };
}
function shrink(file, max = 1280) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      res(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = () => rej(new Error("Bild konnte nicht gelesen werden"));
    img.src = u;
  });
}
async function analyzePhoto(file, note) {
  const data = await shrink(file);
  const prompt = `Analysiere dieses Foto (Mahlzeit, Lebensmittel oder Nährwert-Etikett). Erkenne jedes einzelne Lebensmittel, schätze die Menge in Gramm und nenne die Nährwerte pro 100 g. Wenn ein Nährwert-Etikett zu sehen ist, nutze dessen Werte. Antworte ausschließlich mit JSON ohne weiteren Text im Format: {"items":[{"name":"deutscher Name","grams":150,"kcal":120,"protein":5,"carbs":20,"fat":2,"sugar":1,"fiber":3}]}. Alle Nährwerte beziehen sich auf 100 g.` + (note ? `\n\nZusatzinfos vom Nutzer (verlässlich, haben Vorrang vor deiner Schätzung aus dem Bild, z. B. Gewicht, Zutaten, Zubereitung, Marke): ${note}` : "");
  const body = JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data } }, { text: prompt }] }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2000 } });
  // Bei Überlastung (503), unbekanntem Modell (404) oder Limit (429) automatisch erneut bzw. mit anderem Modell versuchen
  const models = [...new Set([(D.settings.geminiModel || "gemini-2.5-flash").trim(), "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"])];
  let r, j, lastErr = "", net = false;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        r = await fetchT("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
          method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": D.settings.geminiKey.trim() }, body,
        }, 60000);
      } catch (e) { net = true; r = null; break; }
      j = await r.json().catch(() => ({}));
      if (r.ok) break;
      lastErr = r.status + ((j.error && j.error.message) ? ": " + j.error.message : "");
      if (r.status === 401 || r.status === 403 || (r.status === 400 && /API key/i.test(lastErr))) throw new Error("Der Gemini-Schlüssel wird nicht akzeptiert. Prüfe ihn in den Einstellungen.");
      if (r.status === 400) throw new Error("KI-Fehler " + lastErr);
      if (r.status === 503 || r.status === 500 || r.status === 502 || r.status === 504) { if (attempt === 0) { $("#pres") && ($("#pres").innerHTML = `<div class="muted" style="margin-top:14px"><span class="spin"></span>Gemini ist ausgelastet – neuer Versuch …</div>`); await new Promise(res => setTimeout(res, 1800)); continue; } }
      break; // 404/429/anderes: nächstes Modell
    }
    if (r && r.ok) break;
    if (net) break;
  }
  if (net && !(r && r.ok)) throw new Error("Keine Verbindung zur KI. Bist du online?");
  if (!r || !r.ok) throw new Error(r && (r.status === 503 || r.status === 500) ? "Gemini ist gerade überlastet (Google-Seite). Bitte in ein bis zwei Minuten nochmal versuchen." : r && r.status === 429 ? "Das kostenlose Limit ist gerade erreicht. Warte kurz und versuche es erneut." : "KI-Fehler " + lastErr);
  const txt = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(c => c.text || "").join("");
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Antwort der KI war nicht lesbar");
  const items = (JSON.parse(m[0]).items || []).filter(i => i && i.name);
  if (!items.length) throw new Error("Es wurde nichts erkannt. Versuche ein schärferes Foto.");
  return items.map(i => ({ name: String(i.name), grams: Math.max(1, num(i.grams) || 100), kcal: num(i.kcal), protein: num(i.protein), carbs: num(i.carbs), fat: num(i.fat), sugar: num(i.sugar), fiber: num(i.fiber), on: true }));
}
function renderPhotoItems() {
  const o = $("#pres");
  if (!o) return;
  o.innerHTML = `<h2>Erkannt (Schätzung)</h2>` + photoItems.map((i, k) => {
    const c = calc(i, i.grams);
    return `<div class="card" data-k="${k}"><div class="row"><input type="checkbox" ${i.on ? "checked" : ""} data-f="on" style="width:22px;height:22px"><input type="text" value="${esc(i.name)}" data-f="name"></div>
      <div class="row" style="margin-top:8px"><div class="grow"><label style="margin:0 0 3px">Menge g</label><input type="text" inputmode="decimal" value="${r0(i.grams)}" data-f="grams"></div>
      <div class="grow"><label style="margin:0 0 3px">kcal/100 g</label><input type="text" inputmode="decimal" value="${r0(i.kcal)}" data-f="kcal"></div></div>
      <div class="muted small" style="margin-top:6px">= ${r0(c.kcal)} kcal · E ${r1(c.p)} · KH ${r1(c.c)} · F ${r1(c.f)}</div></div>`;
  }).join("") + `<div class="grid2"><button class="btn" id="pDiary">Ins Tagebuch</button><button class="btn sec" id="pDb">In Datenbank</button></div>
    <button class="btn sec block" style="margin-top:8px" id="pCsv">Als CSV speichern</button>`;
  $$("[data-k]", o).forEach(card => {
    const it = photoItems[+card.dataset.k];
    $$("[data-f]", card).forEach(inp => inp.onchange = () => {
      const f = inp.dataset.f;
      it[f] = f === "on" ? inp.checked : f === "name" ? inp.value : num(inp.value);
      if (f === "grams" || f === "kcal") renderPhotoItems();
    });
  });
  const chosen = () => photoItems.filter(i => i.on);
  const toFood = i => ({ id: uid(), name: i.name, brand: "", barcode: "", kcal: r1(i.kcal), protein: r1(i.protein), carbs: r1(i.carbs), fat: r1(i.fat), sugar: r1(i.sugar), fiber: r1(i.fiber), serving: r0(i.grams), used: 1 });
  const toDb = () => chosen().map(i => { const f = toFood(i); const ex = D.foods.find(x => x.name.toLowerCase() === f.name.toLowerCase() && !x.barcode); if (ex) return ex; D.foods.push(f); return f; });
  $("#pDiary", o).onclick = () => {
    const items = chosen(); if (!items.length) return toast("Nichts ausgewählt");
    const foods = toDb(); items.forEach((i, k) => addEntry(ui.meal, foods[k], i.grams));
    closeSheet(); save(); render(); toast(items.length + " Einträge hinzugefügt");
  };
  $("#pDb", o).onclick = () => { if (!chosen().length) return toast("Nichts ausgewählt"); toDb(); save(); toast("In Datenbank gespeichert"); };
  $("#pCsv", o).onclick = () => { if (!chosen().length) return toast("Nichts ausgewählt"); exportFile("lebensmittel-foto.csv", new Blob([foodsToCsv(chosen().map(toFood))], { type: "text/csv" })); };
}

/* Manuell */
let manualPrefill = null;
function foodForm(f) {
  f = f || {};
  const v = k => esc(f[k] ?? "");
  return `<div class="pastebox"><label style="margin-top:0">Aus Text einfügen</label>
    <textarea id="fPaste" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Hier einfügen, z. B.&#10;name;marke;barcode;kcal;fett;kohlenhydrate;zucker;eiweiss;ballaststoffe;portion_g&#10;Banane medium;;;89;0,3;23;12;1,1;2,6;118"></textarea>
    <div class="grid2" style="margin-top:8px"><button class="btn sec small" type="button" id="fPasteGo">Felder füllen</button><button class="btn sec small" type="button" id="fPasteCopy">Auftrag für KI kopieren</button></div>
    <div class="muted tiny" style="margin-top:8px">CSV mit Semikolon, Tab oder JSON. Beim Einfügen füllt sich das Formular automatisch. Mehrere Zeilen speichern mehrere Lebensmittel auf einmal.</div></div>
    <label>Name</label><input type="text" id="fName" value="${v("name")}">
    <div class="grid2"><div><label>Marke</label><input type="text" id="fBrand" value="${v("brand")}"></div><div><label>Barcode</label><input type="text" inputmode="numeric" id="fBar" value="${v("barcode")}"></div></div>
    <div class="muted small" style="margin-top:12px">Nährwerte pro 100 g / 100 ml</div>
    <div class="grid2"><div><label>Kalorien (kcal)</label><input type="text" inputmode="decimal" id="fKcal" value="${v("kcal")}"></div><div><label>Eiweiß (g)</label><input type="text" inputmode="decimal" id="fP" value="${v("protein")}"></div>
    <div><label>Kohlenhydrate (g)</label><input type="text" inputmode="decimal" id="fC" value="${v("carbs")}"></div><div><label>Fett (g)</label><input type="text" inputmode="decimal" id="fF" value="${v("fat")}"></div>
    <div><label>davon Zucker (g)</label><input type="text" inputmode="decimal" id="fS" value="${v("sugar")}"></div><div><label>Ballaststoffe (g)</label><input type="text" inputmode="decimal" id="fFi" value="${v("fiber")}"></div></div>
    <label>Portionsgröße (g)</label><input type="text" inputmode="decimal" id="fServ" value="${v("serving") || 100}">`;
}
/* Lebensmittel aus eingefügtem Text (CSV, Tab, JSON) */
const FOOD_KEYS = { name: "name", bezeichnung: "name", lebensmittel: "name", produkt: "name", marke: "brand", brand: "brand", barcode: "barcode", ean: "barcode",
  kcal: "kcal", kalorien: "kcal", calories: "kcal", energie: "kcal", fett: "fat", fat: "fat", kohlenhydrate: "carbs", carbs: "carbs", kh: "carbs",
  zucker: "sugar", sugar: "sugar", eiweiss: "protein", "eiweiß": "protein", protein: "protein", ballaststoffe: "fiber", fiber: "fiber",
  portion_g: "serving", portion: "serving", portionsgroesse: "serving", serving: "serving" };
const foodKey = h => FOOD_KEYS[String(h).trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/_100g$/, "")];
function normFood(o) {
  const out = { name: "", brand: "", barcode: "", kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0, serving: 100 };
  Object.entries(o).forEach(([k, v]) => {
    const key = foodKey(k); if (!key) return;
    out[key] = ["name", "brand", "barcode"].includes(key) ? String(v ?? "").trim() : num(String(v ?? ""));
  });
  out.barcode = out.barcode.replace(/\D/g, ""); out.serving = out.serving || 100;
  return out.name ? out : null;
}
function parseFoodsText(raw) {
  const t0 = String(raw || "").trim().replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
  if (!t0) return [];
  if (t0[0] === "{" || t0[0] === "[") {
    let j = JSON.parse(t0);
    if (!Array.isArray(j)) j = Array.isArray(j.foods) ? j.foods : Array.isArray(j.lebensmittel) ? j.lebensmittel : [j];
    return j.map(o => o && typeof o === "object" ? normFood(o) : null).filter(Boolean);
  }
  const first = t0.split(/\r?\n/)[0];
  const best = [";", "\t", "|", ","].map(d => [d, first.split(d).length - 1]).sort((a, b) => b[1] - a[1])[0];
  if (!best[1]) throw new Error("kein Trennzeichen");
  const t = best[0] === ";" || best[0] === "," ? t0 : t0.split(best[0]).join(";");
  const rows = parseCsv(t);
  if (!rows.length) return [];
  const hasHead = rows[0].filter(foodKey).length >= 2;
  const order = ["name", "brand", "barcode", "kcal", "fat", "carbs", "sugar", "protein", "fiber", "serving"];
  const head = hasHead ? rows[0].map(foodKey) : order;
  return rows.slice(hasHead ? 1 : 0).map(r => { const o = {}; head.forEach((k, i) => { if (k && r[i] != null) o[k] = r[i]; }); return normFood(o); }).filter(Boolean);
}
function upsertFood(f) {
  const ex = D.foods.find(x => (f.barcode && x.barcode === f.barcode) || (!f.barcode && !x.barcode && x.name.toLowerCase() === f.name.toLowerCase() && (x.brand || "") === (f.brand || "")));
  if (ex) { Object.assign(ex, f, { id: ex.id, used: ex.used || 0 }); return "updated"; }
  D.foods.push({ ...f, id: uid(), used: 0 }); return "added";
}
const FOOD_PROMPT = "Gib mir die Nährwerte pro 100 g für:\n(HIER LEBENSMITTEL EINTRAGEN, z. B. Banane medium)\n\nAntworte nur mit CSV, ohne weiteren Text: erste Zeile die Kopfzeile, danach eine Zeile pro Lebensmittel, Trennzeichen Semikolon.\nname;marke;barcode;kcal;fett;kohlenhydrate;zucker;eiweiss;ballaststoffe;portion_g\nBei portion_g bitte das übliche Gewicht einer Portion in Gramm angeben (z. B. mittlere Banane ohne Schale: 118).";
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* weiter */ }
  try { const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0;top:0"; document.body.append(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; } catch (e) { return false; }
}
function bindPaste(root, onMulti) {
  const ta = $("#fPaste", root); if (!ta) return;
  const go = () => {
    if (!ta.value.trim()) return toast("Füge zuerst Text ein");
    let list;
    try { list = parseFoodsText(ta.value); } catch (e) { return toast("Format nicht erkannt. Nutze CSV mit Semikolon oder JSON."); }
    if (!list.length) return toast("Es wurde kein Lebensmittel gefunden");
    if (list.length === 1) {
      const f = list[0], set = (id, v) => { const el = $(id, root); if (el) el.value = v; };
      const n = (v, keep) => v || keep ? String(v).replace(".", ",") : "";
      set("#fName", f.name); set("#fBrand", f.brand); if (f.barcode) set("#fBar", f.barcode);
      set("#fKcal", n(f.kcal, true)); set("#fP", n(f.protein, true)); set("#fC", n(f.carbs, true)); set("#fF", n(f.fat, true));
      set("#fS", n(f.sugar)); set("#fFi", n(f.fiber)); set("#fServ", n(f.serving, true));
      ta.value = ""; toast("Felder ausgefüllt. Bitte kurz prüfen und speichern.");
    } else {
      list.forEach(upsertFood); save(); toast(list.length + " Lebensmittel gespeichert"); onMulti();
    }
  };
  $("#fPasteGo", root).onclick = go;
  ta.onpaste = () => setTimeout(go, 60);
  $("#fPasteCopy", root).onclick = async () => toast(await copyText(FOOD_PROMPT) ? "Auftrag kopiert. Schicke ihn an Claude oder eine andere KI und füge die Antwort hier ein." : "Kopieren nicht möglich");
}
function readFoodForm(root, base) {
  const name = $("#fName", root).value.trim();
  if (!name) { toast("Bitte einen Namen eingeben"); return null; }
  return { ...(base || {}), id: (base && base.id) || uid(), name, brand: $("#fBrand", root).value.trim(), barcode: $("#fBar", root).value.replace(/\D/g, ""),
    kcal: num($("#fKcal", root).value), protein: num($("#fP", root).value), carbs: num($("#fC", root).value), fat: num($("#fF", root).value),
    sugar: num($("#fS", root).value), fiber: num($("#fFi", root).value), serving: num($("#fServ", root).value) || 100, used: (base && base.used) || 0 };
}
function bodyManual(b) {
  b.innerHTML = foodForm(manualPrefill) + `<button class="btn block" style="margin-top:14px" id="fSave">Speichern & Menge wählen</button>`;
  manualPrefill = null;
  bindPaste(b, () => { addTab = "search"; openAdd(); });
  $("#fSave", b).onclick = () => {
    const f = readFoodForm(b); if (!f) return;
    D.foods.push(f); save(); pickFood(f);
  };
}

/* ---------- Rezepte ---------- */
let rdraft = null;
const per100 = f => ({ kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat });
function recipeTotals(r) {
  const t = { kcal: 0, p: 0, c: 0, f: 0, grams: 0 };
  r.items.forEach(i => { const c = calc(i, i.grams); t.kcal += c.kcal; t.p += c.p; t.c += c.c; t.f += c.f; t.grams += i.grams; });
  return t;
}
function recipePortion(r) {
  const t = recipeTotals(r), n = Math.max(r.servings || 1, 0.01);
  return { kcal: t.kcal / n, p: t.p / n, c: t.c / n, f: t.f / n, grams: t.grams / n };
}
function recipeLine(r) {
  const p = recipePortion(r);
  return `<div class="grow"><div style="font-weight:600">${esc(r.name)}</div><div class="muted tiny">${r.items.length} ${r.items.length === 1 ? "Zutat" : "Zutaten"}, pro Portion ${r0(p.kcal)} kcal (E ${r0(p.p)} / KH ${r0(p.c)} / F ${r0(p.f)})</div></div>`;
}
function storeFood(f) {
  let st = D.foods.find(x => x.id === f.id) || (f.barcode && D.foods.find(x => x.barcode === f.barcode));
  if (!st) { D.foods.push(f); st = f; }
  st.used = (st.used || 0) + 1;
  return st;
}

function bodyRecipes(b) {
  const list = D.recipes.slice().sort((a, c) => (c.used || 0) - (a.used || 0));
  b.innerHTML = (list.length ? list.map(r => `<div class="res" data-rid="${r.id}">${recipeLine(r)}</div>`).join("")
    : `<div class="muted small center" style="padding:16px 8px">Noch keine Rezepte. Lege ein Gericht aus mehreren Zutaten an, danach trägst du es mit einem Tipp ein.</div>`) +
    `<button class="btn block" style="margin-top:14px" id="rNew">Neues Rezept</button>`;
  $$("[data-rid]", b).forEach(el => el.onclick = () => pickRecipe(D.recipes.find(r => r.id === el.dataset.rid)));
  $("#rNew", b).onclick = () => recipeEditor(null, "add");
}

function pickRecipe(r) {
  if (!r) return;
  const p = recipePortion(r);
  const s = sheet(`<h3>${esc(r.name)}</h3><div class="muted small">Pro Portion: ${r0(p.kcal)} kcal, Eiweiß ${r1(p.p)} g, Kohlenhydrate ${r1(p.c)} g, Fett ${r1(p.f)} g</div>
    <label>Portionen</label><div class="row"><input type="text" inputmode="decimal" id="rp" value="1"><button class="chip" data-m="0.5">½</button><button class="chip" data-m="1">1</button><button class="chip" data-m="2">2</button></div>
    <div class="card" style="margin-top:14px" id="rv"></div>
    <label>Mahlzeit</label><select id="rm">${MEALS.map(m => `<option value="${m.id}" ${m.id === ui.meal ? "selected" : ""}>${m.name}</option>`).join("")}</select>
    <button class="btn block" style="margin-top:14px" id="rgo">Zum Tagebuch hinzufügen</button>
    <button class="btn sec block" style="margin-top:8px" id="red">Rezept bearbeiten</button>
    <button class="btn sec block" style="margin-top:8px" id="rback">Zurück</button>`);
  const rp = $("#rp", s);
  const upd = () => { const n = num(rp.value); $("#rv", s).innerHTML = `<div class="row between"><b style="font-size:22px">${r0(p.kcal * n)} kcal</b><span class="small"><span class="cp">E ${r1(p.p * n)}</span> &nbsp;<span class="cc">KH ${r1(p.c * n)}</span> &nbsp;<span class="cf">F ${r1(p.f * n)}</span></span></div>`; };
  rp.oninput = upd; upd();
  $$("[data-m]", s).forEach(b => b.onclick = () => { rp.value = b.dataset.m; upd(); });
  $("#rback", s).onclick = () => { addTab = "recipes"; openAdd(); };
  $("#red", s).onclick = () => recipeEditor(r, "add");
  $("#rgo", s).onclick = () => {
    const n = num(rp.value); if (n <= 0) return toast("Bitte Portionen eingeben");
    ui.meal = $("#rm", s).value;
    D.entries.push({ id: uid(), date: ui.date, meal: ui.meal, name: r.name, grams: p.grams * n, kcal: p.kcal * n, p: p.p * n, c: p.c * n, f: p.f * n });
    r.used = (r.used || 0) + 1;
    closeSheet(); save(); render(); toast("Hinzugefügt");
  };
}

function recipeEditor(r, back) {
  rdraft = r ? JSON.parse(JSON.stringify(r)) : { id: null, name: "", servings: 1, items: [] };
  rdraft.back = back || "add";
  drawRecipeEditor();
}
function recipeExit() {
  const b = rdraft.back;
  if (b === "add") { addTab = "recipes"; openAdd(); }
  else if (b === "manage") recipeManage();
  else { closeSheet(); render(); }
}
function drawRecipeEditor() {
  const d = rdraft;
  const s = sheet(`<h3>${d.id ? "Rezept bearbeiten" : "Neues Rezept"}</h3>
    <label style="margin-top:0">Name</label><input type="text" id="rn" value="${esc(d.name)}" placeholder="z. B. Overnight Oats">
    <label>Ergibt Portionen</label><input type="text" inputmode="decimal" id="rs" value="${d.servings}">
    <h2 style="margin:20px 2px 6px">Zutaten</h2>
    <div id="ri">${d.items.length ? d.items.map((i, k) => `<div class="ing" data-k="${k}"><div class="grow"><div class="t">${esc(i.name)}</div><div class="muted tiny" data-kc></div></div>
      <input type="text" inputmode="decimal" value="${r0(i.grams)}" aria-label="Menge in Gramm"><span class="muted small">g</span><button class="iconbtn" data-del aria-label="Zutat entfernen">×</button></div>`).join("")
      : `<div class="muted small" style="padding:4px 2px 12px">Noch keine Zutaten. Füge unten die erste hinzu.</div>`}</div>
    <button class="btn sec block" id="rAdd">Zutat hinzufügen</button>
    <div class="card" style="margin-top:16px" id="rsum"></div>
    <button class="btn block" id="rSave">Rezept speichern</button>
    ${d.id ? `<button class="btn danger block" style="margin-top:8px" id="rDel">Rezept löschen</button>` : ""}
    <button class="btn sec block" style="margin-top:8px" id="rCancel">Abbrechen</button>`);
  const capture = () => { d.name = $("#rn", s).value.trim(); d.servings = num($("#rs", s).value) || 1; };
  const sumUpd = () => {
    const t = recipeTotals(d), n = Math.max(num($("#rs", s).value) || 1, 0.01);
    $$(".ing", s).forEach(row => { const i = d.items[+row.dataset.k]; $("[data-kc]", row).textContent = r0(calc(i, i.grams).kcal) + " kcal"; });
    $("#rsum", s).innerHTML = `<div class="row between"><span class="muted small">Gesamt</span><b>${r0(t.kcal)} kcal</b></div>
      <div class="row between" style="margin-top:6px"><span class="muted small">Pro Portion</span><b style="font-size:22px">${r0(t.kcal / n)} kcal</b></div>
      <div class="small" style="margin-top:6px"><span class="cp">E ${r1(t.p / n)} g</span> &nbsp;<span class="cc">KH ${r1(t.c / n)} g</span> &nbsp;<span class="cf">F ${r1(t.f / n)} g</span></div>`;
  };
  sumUpd();
  $("#rs", s).oninput = sumUpd;
  $$(".ing", s).forEach(row => {
    const k = +row.dataset.k;
    $("input", row).oninput = e => { d.items[k].grams = num(e.target.value); sumUpd(); };
    $("[data-del]", row).onclick = () => { capture(); d.items.splice(k, 1); drawRecipeEditor(); };
  });
  $("#rAdd", s).onclick = () => {
    capture();
    foodPicker((food, grams) => { d.items.push({ name: food.name, grams, ...per100(food) }); drawRecipeEditor(); }, drawRecipeEditor);
  };
  $("#rCancel", s).onclick = recipeExit;
  if (d.id) $("#rDel", s).onclick = () => { D.recipes = D.recipes.filter(x => x.id !== d.id); save(); toast("Rezept gelöscht"); recipeExit(); };
  $("#rSave", s).onclick = () => {
    capture();
    if (!d.name) return toast("Bitte einen Namen eingeben");
    if (!d.items.length) return toast("Füge mindestens eine Zutat hinzu");
    if (d.items.some(i => i.grams <= 0)) return toast("Jede Zutat braucht eine Menge");
    const rec = { id: d.id || uid(), name: d.name, servings: d.servings, items: d.items.map(i => ({ name: i.name, grams: i.grams, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat })), used: 0 };
    const ex = D.recipes.find(x => x.id === rec.id);
    if (ex) { rec.used = ex.used || 0; Object.assign(ex, rec); } else D.recipes.push(rec);
    save(); toast("Rezept gespeichert"); recipeExit();
  };
}

/* Zutat wählen: Suche in eigener Datenbank und Open Food Facts */
function foodPicker(onPick, onBack) {
  const s = sheet(`<h3>Zutat hinzufügen</h3><div class="row"><input type="search" id="zq" placeholder="Name oder Marke …" autocomplete="off"><button class="btn" id="zGo" aria-label="Online suchen">${icon("search", 22)}</button><button class="btn sec" id="zScan" aria-label="Barcode scannen">${icon("scan", 22)}</button></div>
    <div id="zl"></div><div id="zo"></div>
    <button class="btn sec block" style="margin-top:14px" id="zNew">Neues Lebensmittel anlegen</button>
    <button class="btn sec block" style="margin-top:8px" id="zBack">Zurück zum Rezept</button>`);
  const q = $("#zq", s), again = () => foodPicker(onPick, onBack);
  const showLocal = () => {
    const t = q.value.trim().toLowerCase();
    const list = (t ? D.foods.filter(f => (f.name + " " + f.brand).toLowerCase().includes(t)) : D.foods.slice().sort((a, c) => (c.used || 0) - (a.used || 0))).slice(0, 20);
    $("#zl", s).innerHTML = (list.length ? `<h2>${t ? "In meiner Datenbank" : "Zuletzt genutzt"}</h2>` : "") + list.map(f => `<div class="res" data-fid="${f.id}">${foodLine(f)}</div>`).join("");
    $$("[data-fid]", s).forEach(el => el.onclick = () => pickAmount(D.foods.find(f => f.id === el.dataset.fid), onPick, again));
  };
  showLocal(); q.oninput = showLocal;
  const online = async () => {
    const t = q.value.trim(); if (t.length < 2) return;
    const o = $("#zo", s);
    o.innerHTML = `<h2>Open Food Facts</h2><div class="muted"><span class="spin"></span>Suche …</div>`;
    try {
      const list = await offSearch(t);
      o.innerHTML = `<h2>Open Food Facts</h2>` + (list.length ? list.map((f, i) => `<div class="res" data-oi="${i}">${foodLine(f)}</div>`).join("") : `<div class="muted small">Nichts gefunden.</div>`);
      $$("[data-oi]", o).forEach(el => el.onclick = () => pickAmount(list[+el.dataset.oi], onPick, again));
    } catch (e) { o.innerHTML = `<h2>Open Food Facts</h2><div class="warn small">Online-Suche nicht möglich (${esc(e.message)}).</div>`; }
  };
  $("#zGo", s).onclick = online;
  q.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); online(); } };
  $("#zBack", s).onclick = onBack;
  $("#zScan", s).onclick = () => pickerScan(onPick, onBack);
  $("#zNew", s).onclick = () => newFoodSheet(onPick, again, "");
}
function newFoodSheet(onPick, again, barcode) {
  const f = sheet(`<h3>Neues Lebensmittel</h3>${foodForm({ barcode })}<button class="btn block" style="margin-top:14px" id="nSave">Speichern & Menge wählen</button><button class="btn sec block" style="margin-top:8px" id="nBack">Zurück</button>`);
  $("#nBack", f).onclick = again;
  bindPaste(f, again);
  $("#nSave", f).onclick = () => { const n = readFoodForm(f); if (!n) return; D.foods.push(n); save(); pickAmount(n, onPick, again); };
}
/* Zutat per Barcode: Kamera oder Nummer eintippen */
function pickerScan(onPick, onBack) {
  const again = () => foodPicker(onPick, onBack);
  const s = sheet(`<h3>Zutat scannen</h3><video id="vid" playsinline muted></video><div class="muted small center" id="scanMsg" style="margin:8px 0">Kamera wird gestartet …</div>
    <label>Oder Barcode eintippen</label><div class="row"><input type="text" inputmode="numeric" id="bc" placeholder="EAN, z. B. 4001234567890"><button class="btn" id="bcGo">Suchen</button></div>
    <button class="btn sec block" style="margin-top:14px" id="sBack">Zurück zur Suche</button>`);
  const handle = async code => {
    stopScan();
    const m = $("#scanMsg", s); if (m) m.innerHTML = `<span class="spin"></span>Suche ${esc(code)} …`;
    let f = D.foods.find(x => x.barcode === code), offline = false;
    if (!f) { try { f = await offBarcode(code); } catch (e) { offline = true; } }
    if (f) return pickAmount(f, onPick, again);
    toast(offline ? "Offline oder Fehler. Bitte selbst anlegen." : "Nicht in Open Food Facts. Bitte selbst anlegen.");
    newFoodSheet(onPick, again, code);
  };
  $("#bcGo", s).onclick = () => { const c = $("#bc", s).value.replace(/\D/g, ""); if (c.length >= 6) handle(c); else toast("Barcode zu kurz"); };
  $("#sBack", s).onclick = again;
  startScan($("#vid", s), handle, msg => { const m = $("#scanMsg", s); if (m) m.textContent = msg; });
}
function pickAmount(food, onPick, onBack) {
  if (!food) return;
  const serving = food.serving || 100;
  const s = sheet(`<h3>${esc(food.name)}</h3><div class="muted small">Pro 100 g: ${r0(food.kcal)} kcal, E ${r1(food.protein)} / KH ${r1(food.carbs)} / F ${r1(food.fat)}</div>
    <label>Menge in g oder ml</label><input type="text" inputmode="decimal" id="za" value="${r0(serving)}">
    <div class="card" style="margin-top:12px" id="zv"></div>
    <button class="btn block" id="zOk">Zur Zutatenliste</button><button class="btn sec block" style="margin-top:8px" id="zBk">Zurück</button>`);
  const za = $("#za", s);
  const upd = () => { const c = calc(food, num(za.value)); $("#zv", s).innerHTML = `<b style="font-size:20px">${r0(c.kcal)} kcal</b> <span class="small muted">E ${r1(c.p)} / KH ${r1(c.c)} / F ${r1(c.f)}</span>`; };
  za.oninput = upd; upd();
  $("#zBk", s).onclick = onBack;
  $("#zOk", s).onclick = () => { const g = num(za.value); if (g <= 0) return toast("Bitte eine Menge eingeben"); onPick(storeFood(food), g); };
}

function recipeManage() {
  const s = sheet(`<h3>Meine Rezepte</h3><div id="rl"></div><button class="btn block" style="margin-top:14px" id="rNew">Neues Rezept</button>`);
  const list = D.recipes.slice().sort((a, b) => a.name.localeCompare(b.name, "de"));
  $("#rl", s).innerHTML = list.length ? list.map(r => `<div class="res" data-rid="${r.id}">${recipeLine(r)}</div>`).join("") : `<div class="muted small center" style="padding:16px 8px">Noch keine Rezepte.</div>`;
  $$("[data-rid]", s).forEach(el => el.onclick = () => recipeEditor(D.recipes.find(r => r.id === el.dataset.rid), "manage"));
  $("#rNew", s).onclick = () => recipeEditor(null, "manage");
}
function mealToRecipe(meal) {
  const es = dayEntries(ui.date).filter(e => e.meal === meal && e.grams > 0);
  if (!es.length) return;
  recipeEditor(null, "close");
  rdraft.items = es.map(e => ({ name: e.name, grams: e.grams, kcal: e.kcal / e.grams * 100, protein: e.p / e.grams * 100, carbs: e.c / e.grams * 100, fat: e.f / e.grams * 100 }));
  drawRecipeEditor();
}

/* ---------- Tages-Diagramm: Mahlzeiten und Makros ---------- */
function dayChart() {
  const g = goals(), list = dayEntries(ui.date), t = sum(list);
  const kP = t.p * 4, kC = t.c * 4, kF = t.f * 9, kt = kP + kC + kF;
  const pc = v => kt > 0 ? Math.round(v / kt * 100) : 0;
  const R = 52, C = 2 * Math.PI * R;
  let off = 0;
  const seg = (v, col) => { const len = kt > 0 ? v / kt * C : 0; const el = `<circle cx="66" cy="66" r="${R}" fill="none" stroke="${col}" stroke-width="16" stroke-dasharray="${Math.max(len - 2, 0)} ${C}" stroke-dashoffset="${-off}"/>`; off += len; return el; };
  const donut = `<svg width="132" height="132" viewBox="0 0 132 132" style="transform:rotate(-90deg)"><circle cx="66" cy="66" r="${R}" fill="none" stroke="var(--card2)" stroke-width="16"/>${kt > 0 ? seg(kP, "var(--p)") + seg(kC, "var(--c)") + seg(kF, "var(--f)") : ""}</svg>`;
  const leg = (name, col, grams, goal, kc) => `<div class="li"><i style="background:${col}"></i><div><b>${r0(grams)} g</b><div class="muted tiny">${name}</div></div><span>${pc(kc)} %<br>Ziel ${r0(goal)} g</span></div>`;
  const meals = MEALS.map(m => ({ m, es: list.filter(e => e.meal === m.id) })).filter(x => x.es.length).map(x => ({ ...x, s: sum(x.es) }));
  const maxK = Math.max(...meals.map(x => x.s.kcal), 1);
  const rows = meals.map(({ m, s }) => {
    const mk = s.p * 4 + s.c * 4 + s.f * 9 || 1, scale = s.kcal / maxK * 100;
    return `<div class="mrow"><div class="mt"><b>${m.name}</b><span>${fmt(s.kcal)} kcal${t.kcal > 0 ? ", " + Math.round(s.kcal / t.kcal * 100) + " % des Tages" : ""}</span></div>
      <div class="stack"><div style="display:flex;width:${scale}%;height:100%"><i class="p" style="width:${s.p * 4 / mk * 100}%"></i><i class="c" style="width:${s.c * 4 / mk * 100}%"></i><i class="f" style="width:${s.f * 9 / mk * 100}%"></i></div></div>
      <div class="mg"><span class="cp">Eiweiß ${r0(s.p)} g</span><span class="cc">Kohlenh. ${r0(s.c)} g</span><span class="cf">Fett ${r0(s.f)} g</span></div></div>`;
  }).join("");
  sheet(`<h3>${niceDate(ui.date)}</h3><div class="muted small" style="margin:-6px 0 14px">${fmt(t.kcal)} von ${fmt(g.kcal)} kcal</div>
    ${list.length ? `<div class="donutwrap"><div class="donut">${donut}<div class="mid"><b>${fmt(t.kcal)}</b><span>kcal</span></div></div>
      <div class="dleg">${leg("Eiweiß", "var(--p)", t.p, g.p, kP)}${leg("Kohlenhydrate", "var(--c)", t.c, g.c, kC)}${leg("Fett", "var(--f)", t.f, g.f, kF)}</div></div>
      <h2 style="margin:6px 2px 4px">Nach Mahlzeit</h2><div class="list" style="padding:0 16px">${rows}</div>
      <div class="muted tiny" style="margin:10px 4px 0">Die Balken zeigen, woher die Kalorien jeder Mahlzeit kommen. Prozentwerte beziehen sich auf die Kalorien aus Eiweiß, Kohlenhydraten und Fett.</div>`
      : `<div class="muted center" style="padding:30px 10px">Heute ist noch nichts eingetragen. Sobald du etwas hinzufügst, siehst du hier die Verteilung.</div>`}
    <button class="btn sec block" style="margin-top:16px" id="dcClose">Schließen</button>`, s => { $("#dcClose", s).onclick = closeSheet; });
}

/* Eintrag bearbeiten */
function editEntry(id) {
  const e = D.entries.find(x => x.id === id); if (!e) return;
  const s = sheet(`<h3>${esc(e.name)}</h3><div class="muted small">${r0(e.kcal)} kcal · E ${r1(e.p)} · KH ${r1(e.c)} · F ${r1(e.f)}</div>
    <label>Menge (g)</label><input type="text" inputmode="decimal" id="eg" value="${r0(e.grams)}">
    <label>Mahlzeit</label><select id="em">${MEALS.map(m => `<option value="${m.id}" ${m.id === e.meal ? "selected" : ""}>${m.name}</option>`).join("")}</select>
    <button class="btn block" style="margin-top:14px" id="es">Speichern</button>
    <button class="btn danger block" style="margin-top:8px" id="ed">Eintrag löschen</button>`);
  $("#es", s).onclick = () => {
    const g = num($("#eg", s).value); if (g <= 0) return toast("Menge eingeben");
    const k = g / e.grams; e.kcal *= k; e.p *= k; e.c *= k; e.f *= k; e.grams = g; e.meal = $("#em", s).value;
    save(); closeSheet(); render();
  };
  $("#ed", s).onclick = () => { D.entries = D.entries.filter(x => x.id !== id); save(); closeSheet(); render(); };
}

/* Lebensmittel verwalten */
function foodsManage() {
  const s = sheet(`<h3>Meine Lebensmittel</h3><input type="search" id="fq" placeholder="Filtern …"><div id="fl"></div>`);
  const draw = () => {
    const t = $("#fq", s).value.trim().toLowerCase();
    const list = D.foods.filter(f => !t || (f.name + " " + f.brand + " " + f.barcode).toLowerCase().includes(t)).sort((a, b) => a.name.localeCompare(b.name, "de")).slice(0, 100);
    $("#fl", s).innerHTML = list.length ? list.map(f => `<div class="res" data-id="${f.id}">${foodLine(f)}</div>`).join("") : `<div class="muted center" style="padding:18px">Keine Lebensmittel.</div>`;
    $$("[data-id]", s).forEach(el => el.onclick = () => foodEdit(D.foods.find(f => f.id === el.dataset.id)));
  };
  $("#fq", s).oninput = draw; draw();
}
function foodEdit(f) {
  const s = sheet(`<h3>${f ? "Lebensmittel bearbeiten" : "Neues Lebensmittel"}</h3>${foodForm(f)}
    <button class="btn block" style="margin-top:14px" id="fs">Speichern</button>
    ${f ? `<button class="btn danger block" style="margin-top:8px" id="fd">Löschen</button>` : ""}
    <button class="btn sec block" style="margin-top:8px" id="fb">Abbrechen</button>`);
  bindPaste(s, () => { closeSheet(); render(); });
  $("#fs", s).onclick = () => {
    const n = readFoodForm(s, f); if (!n) return;
    if (f) Object.assign(f, n); else D.foods.push(n);
    save(); closeSheet(); render(); toast("Gespeichert");
  };
  if (f) $("#fd", s).onclick = () => { D.foods = D.foods.filter(x => x !== f); save(); closeSheet(); render(); };
  $("#fb", s).onclick = () => { closeSheet(); };
}

/* ---------- CSV ---------- */
const CSV_COLS = ["name", "brand", "barcode", "kcal", "fat", "carbs", "sugar", "protein", "fiber", "serving"];
const CSV_HEAD = ["name", "marke", "barcode", "kcal", "fett", "kohlenhydrate", "zucker", "eiweiss", "ballaststoffe", "portion_g"];
const csvCell = v => { const s = String(v ?? ""); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function foodsToCsv(foods) {
  return "﻿" + [CSV_HEAD.join(";")].concat(foods.map(f => CSV_COLS.map(c => csvCell(typeof f[c] === "number" ? String(f[c]).replace(".", ",") : f[c])).join(";"))).join("\r\n") + "\r\n";
}
function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/)[0] || "";
  const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some(c => c.trim())) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some(c => c.trim())) rows.push(row);
  return rows;
}
function importCsv(text) {
  const rows = parseCsv(text); if (rows.length < 2) return { added: 0, updated: 0 };
  const alias = { name: "name", bezeichnung: "name", lebensmittel: "name", marke: "brand", brand: "brand", barcode: "barcode", ean: "barcode", kcal: "kcal", kalorien: "kcal", fett: "fat", fat: "fat",
    kohlenhydrate: "carbs", carbs: "carbs", kh: "carbs", zucker: "sugar", sugar: "sugar", eiweiss: "protein", "eiweiß": "protein", protein: "protein", ballaststoffe: "fiber", fiber: "fiber", portion_g: "serving", portion: "serving", serving: "serving" };
  const idx = {};
  rows[0].forEach((h, i) => { const k = alias[h.trim().toLowerCase()]; if (k && idx[k] == null) idx[k] = i; });
  if (idx.name == null) throw new Error("Spalte „name“ fehlt in der CSV");
  let added = 0, updated = 0;
  rows.slice(1).forEach(r => {
    const g = k => idx[k] == null ? "" : (r[idx[k]] ?? "").trim();
    const name = g("name"); if (!name) return;
    const f = { name, brand: g("brand"), barcode: g("barcode").replace(/\D/g, ""), kcal: num(g("kcal")), protein: num(g("protein")), carbs: num(g("carbs")), fat: num(g("fat")), sugar: num(g("sugar")), fiber: num(g("fiber")), serving: num(g("serving")) || 100 };
    const ex = D.foods.find(x => (f.barcode && x.barcode === f.barcode) || (!f.barcode && !x.barcode && x.name.toLowerCase() === f.name.toLowerCase() && x.brand === f.brand));
    if (ex) { Object.assign(ex, f); updated++; } else { D.foods.push({ ...f, id: uid(), used: 0 }); added++; }
  });
  return { added, updated };
}

/* ---------- Dateien exportieren / importieren ---------- */
function blobToBase64(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
}
async function exportFile(name, blob) {
  let why = "";
  if (NATIVE) {
    try {
      const C = window.Capacitor;
      const p = (C.Plugins && C.Plugins.ErnDownload) || (typeof C.registerPlugin === "function" ? C.registerPlugin("ErnDownload") : null);
      if (!p || typeof p.save !== "function") throw new Error("Download-Funktion der App nicht gefunden");
      await p.save({ filename: name, data: await blobToBase64(blob), mime: blob.type || "application/octet-stream" });
      toast("In „Download“ gespeichert: " + name); return true;
    } catch (e) { why = (e && (e.message || e.errorMessage)) || String(e); }
  }
  // Teilen-Menü (Handy): „In Dateien/Drive speichern“, an sich selbst senden usw.
  try {
    const f = new File([blob], name, { type: blob.type || "application/octet-stream" });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      await navigator.share({ files: [f], title: name });
      toast("Datei geteilt/gespeichert: " + name); return true;
    }
  } catch (e) { if (e && e.name === "AbortError") { toast("Abgebrochen – nichts gespeichert"); return false; } why = why || (e && e.message) || ""; }
  if (NATIVE) { toast("Speichern nicht möglich" + (why ? ": " + why : "")); return false; }
  const u = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
  toast("Datei heruntergeladen: " + name); return true;
}
const readText = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(f); });

/* ---------- Export, Import und Dropbox ---------- */
/* Den Gemini-Schlüssel nehmen wir nie in Sicherungen auf. */
const exportData = () => ({ ...D, settings: { ...D.settings, geminiKey: "", apiKey: undefined, model: undefined } });
const csvNum = n => String(Math.round(n * 100) / 100).replace(".", ",");
const csvOf = (head, rows) => "﻿" + [head.join(";")].concat(rows.map(r => r.map(csvCell).join(";"))).join("\r\n") + "\r\n";
const mealName = id => (MEALS.find(m => m.id === id) || MEALS[3]).name;
function diaryCsv() {
  const order = MEALS.map(m => m.id);
  const es = D.entries.slice().sort((a, b) => a.date.localeCompare(b.date) || order.indexOf(a.meal) - order.indexOf(b.meal));
  return csvOf(["datum", "mahlzeit", "name", "menge_g", "kcal", "eiweiss", "kohlenhydrate", "fett"], es.map(e => [e.date, mealName(e.meal), e.name, csvNum(e.grams), csvNum(e.kcal), csvNum(e.p), csvNum(e.c), csvNum(e.f)]));
}
function weightCsv() { return csvOf(["datum", "gewicht_kg"], weightList().map(w => [w.d, csvNum(w.w)])); }
function recipesCsv() {
  const rows = [];
  D.recipes.forEach(r => r.items.forEach(i => rows.push([r.name, csvNum(r.servings), i.name, csvNum(i.grams), csvNum(i.kcal), csvNum(i.protein), csvNum(i.carbs), csvNum(i.fat)])));
  return csvOf(["rezept", "portionen", "zutat", "menge_g", "kcal_100g", "eiweiss_100g", "kohlenhydrate_100g", "fett_100g"], rows);
}
const csvBlob = t => new Blob([t], { type: "text/csv" });

function applyBackup(j) {
  if (!j || !Array.isArray(j.entries) || !Array.isArray(j.foods)) throw new Error("Das ist kein gültiges Backup");
  const d = DEFAULTS(), key = D.settings.geminiKey;
  D = { ...d, ...j, recipes: Array.isArray(j.recipes) ? j.recipes : [], settings: { ...d.settings, ...(j.settings || {}), geminiKey: key || "" } };
  delete D.settings.apiKey; delete D.settings.model;
  save(); applyTheme(); render();
}
const isoDate = s => {
  s = String(s || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
};
function importAnyCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("Die Datei enthält keine Daten");
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/^﻿/, ""));
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const get = (r, i) => i < 0 ? "" : (r[i] ?? "").trim();
  const iRec = col("rezept"), iIng = col("zutat"), iDate = col("datum"), iMeal = col("mahlzeit"), iKg = col("gewicht_kg", "gewicht", "kg");
  if (iRec >= 0 && iIng >= 0) {
    const iS = col("portionen"), iG = col("menge_g"), iK = col("kcal_100g"), iP = col("eiweiss_100g"), iC = col("kohlenhydrate_100g"), iF = col("fett_100g");
    const byName = new Map();
    rows.slice(1).forEach(r => {
      const n = get(r, iRec); if (!n || !get(r, iIng)) return;
      if (!byName.has(n)) byName.set(n, { id: uid(), name: n, servings: num(get(r, iS)) || 1, items: [], used: 0 });
      byName.get(n).items.push({ name: get(r, iIng), grams: num(get(r, iG)) || 100, kcal: num(get(r, iK)), protein: num(get(r, iP)), carbs: num(get(r, iC)), fat: num(get(r, iF)) });
    });
    let added = 0, updated = 0;
    byName.forEach(rec => { const ex = D.recipes.find(x => x.name.toLowerCase() === rec.name.toLowerCase()); if (ex) { rec.id = ex.id; rec.used = ex.used || 0; Object.assign(ex, rec); updated++; } else { D.recipes.push(rec); added++; } });
    return `${added} Rezepte neu, ${updated} aktualisiert`;
  }
  if (iDate >= 0 && iMeal >= 0) {
    const iN = col("name", "lebensmittel"), iG = col("menge_g"), iK = col("kcal"), iP = col("eiweiss"), iC = col("kohlenhydrate"), iF = col("fett");
    const key = e => [e.date, e.meal, e.name.toLowerCase(), Math.round(e.grams), Math.round(e.kcal)].join("|");
    const have = new Set(D.entries.map(key));
    let added = 0, skipped = 0;
    rows.slice(1).forEach(r => {
      const date = isoDate(get(r, iDate)), name = get(r, iN); if (!date || !name) return;
      const m = MEALS.find(x => x.name.toLowerCase() === get(r, iMeal).toLowerCase() || x.id === get(r, iMeal).toLowerCase());
      const e = { id: uid(), date, meal: m ? m.id : "s", name, grams: num(get(r, iG)), kcal: num(get(r, iK)), p: num(get(r, iP)), c: num(get(r, iC)), f: num(get(r, iF)) };
      if (have.has(key(e))) { skipped++; return; }
      have.add(key(e)); D.entries.push(e); added++;
    });
    return `${added} Einträge hinzugefügt${skipped ? `, ${skipped} schon vorhanden` : ""}`;
  }
  if (iDate >= 0 && iKg >= 0) {
    let n = 0;
    rows.slice(1).forEach(r => { const d = isoDate(get(r, iDate)), w = num(get(r, iKg)); if (d && w >= 20 && w <= 400) { D.weights[d] = r1(w); n++; } });
    return `${n} Gewichtswerte übernommen`;
  }
  const r = importCsv(text);
  return `${r.added} Lebensmittel neu, ${r.updated} aktualisiert`;
}
async function importFile(file) {
  const text = await readText(file);
  if (/\.json$/i.test(file.name) || text.trim().startsWith("{")) {
    const j = JSON.parse(text);
    if (!confirm("Alle aktuellen Daten durch dieses Backup ersetzen?")) return null;
    applyBackup(j); return "Backup geladen";
  }
  const msg = importAnyCsv(text); save(); render(); return msg;
}

/* Dropbox: eigener App-Key, Zugangsdaten bleiben nur auf diesem Gerät */
const DBX_LS = "foodpro.dropbox", BK_PATH = "/foodpro-backup.json";
let DB = (() => { try { return JSON.parse(localStorage.getItem(DBX_LS)) || {}; } catch (e) { return {}; } })();
const dbSave = () => { try { localStorage.setItem(DBX_LS, JSON.stringify(DB)); } catch (e) { /* egal */ } };
const dbConnected = () => !!(DB.key && DB.refresh) || !!(DB.access && DB.exp > Date.now());
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const asciiJson = o => JSON.stringify(o).replace(/[\u007f-￿]/g, c => "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4));
const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h + ":" + s.length; };
const fmtWhen = t => new Date(t).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
async function dbStartAuth(key) {
  const verifier = b64u(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const url = "https://www.dropbox.com/oauth2/authorize?client_id=" + encodeURIComponent(key) + "&response_type=code&code_challenge=" + challenge + "&code_challenge_method=S256&token_access_type=offline";
  DB.pending = { key, verifier, url }; dbSave();
  return url;
}
async function dbTokenCall(params) {
  let r;
  try { r = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", body: new URLSearchParams(params) }); }
  catch (e) { throw new Error("Keine Verbindung zu Dropbox. Prüfe dein Internet."); }
  let j = {}; try { j = await r.json(); } catch (e) { /* leer */ }
  if (!r.ok) throw new Error(j.error === "invalid_grant" ? "Der Code ist ungültig oder abgelaufen. Hole dir einen neuen." : "Dropbox hat die Anmeldung abgelehnt" + (j.error_description ? ": " + j.error_description : "."));
  return j;
}
async function dbFinishAuth(code) {
  const p = DB.pending; if (!p) throw new Error("Starte zuerst die Anmeldung bei Dropbox.");
  const j = await dbTokenCall({ code: code.trim(), grant_type: "authorization_code", code_verifier: p.verifier, client_id: p.key });
  if (!j.refresh_token) throw new Error("Dropbox hat keinen dauerhaften Zugang geliefert. Prüfe, ob die App „Scoped access“ nutzt.");
  DB.key = p.key; DB.refresh = j.refresh_token; DB.access = j.access_token; DB.exp = Date.now() + Math.max(60, (j.expires_in || 14400) - 120) * 1000;
  delete DB.pending; DB.err = ""; dbSave();
}
async function dbToken() {
  if (DB.access && DB.exp > Date.now()) return DB.access;
  if (!(DB.key && DB.refresh)) { DB.err = "Die Dropbox-Verbindung ist abgelaufen. Verbinde neu."; dbSave(); throw new Error(DB.err); }
  const j = await dbTokenCall({ grant_type: "refresh_token", refresh_token: DB.refresh, client_id: DB.key });
  DB.access = j.access_token; DB.exp = Date.now() + Math.max(60, (j.expires_in || 14400) - 120) * 1000; dbSave();
  return DB.access;
}
async function dbErr(r) {
  let t = ""; try { t = await r.text(); } catch (e) { /* leer */ }
  if (r.status === 401) return new Error("Dropbox hat den Zugang abgelehnt. Verbinde neu.");
  if (r.status === 429) return new Error("Dropbox bittet um eine Pause. Versuche es gleich noch einmal.");
  if (/insufficient_scope|missing_scope/.test(t)) return new Error("In deiner Dropbox-App fehlt eine Berechtigung. Aktiviere files.content.write und files.content.read, dann verbinde neu.");
  if (/insufficient_space/.test(t)) return new Error("Dein Dropbox-Speicher ist voll.");
  return new Error("Dropbox-Fehler " + r.status + ".");
}
async function dbFetch(url, opts) {
  try { return await fetch(url, opts); } catch (e) { throw new Error("Keine Verbindung zu Dropbox. Prüfe dein Internet."); }
}
async function dbUpload(path, body) {
  const tok = await dbToken();
  const r = await dbFetch("https://content.dropboxapi.com/2/files/upload", { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/octet-stream", "Dropbox-API-Arg": asciiJson({ path, mode: "overwrite", mute: true, autorename: false }) }, body });
  if (!r.ok) throw await dbErr(r);
}
async function dbDownload(path) {
  const tok = await dbToken();
  const r = await dbFetch("https://content.dropboxapi.com/2/files/download", { method: "POST", headers: { Authorization: "Bearer " + tok, "Dropbox-API-Arg": asciiJson({ path }) } });
  if (r.status === 409) throw new Error("In deiner Dropbox liegt noch keine Sicherung.");
  if (!r.ok) throw await dbErr(r);
  return r.text();
}
async function dbBackupNow() {
  const body = JSON.stringify(exportData());
  await dbUpload(BK_PATH, body);
  DB.hash = hashStr(body); DB.last = Date.now(); DB.err = ""; dbSave();
}
let dbTimer = null;
function queueBackup() {
  if (!DB.auto || !dbConnected()) return;
  clearTimeout(dbTimer);
  dbTimer = setTimeout(async () => {
    const body = JSON.stringify(exportData());
    if (hashStr(body) === DB.hash) return;
    try { await dbUpload(BK_PATH, body); DB.hash = hashStr(body); DB.last = Date.now(); DB.err = ""; }
    catch (e) { DB.err = e.message; }
    dbSave();
  }, 45000);
}
function dbxPanel() {
  const msg = ui.dbxMsg ? `<div class="status ${ui.dbxMsg.err ? "err" : "ok"}">${esc(ui.dbxMsg.text)}</div>` : "";
  if (dbConnected()) {
    const perm = DB.key && DB.refresh;
    return `<div class="panel"><div class="dbx-state"><i></i>Mit Dropbox verbunden</div>
      ${perm ? "" : `<div class="muted small" style="margin-top:6px">Zugriffstoken: läuft nach etwa 4 Stunden ab. Mit App-Key bleibt die Verbindung dauerhaft.</div>`}
      <div class="muted small" style="margin-top:6px">${DB.last ? "Letzte Sicherung: " + fmtWhen(DB.last) : "Noch keine Sicherung gemacht."}</div>
      ${DB.err ? `<div class="status err">${esc(DB.err)}</div>` : ""}${msg}
      <div class="grid2" style="margin-top:14px"><button class="btn" data-act="dbxBackup">Jetzt sichern</button><button class="btn sec" data-act="dbxRestore">Wiederherstellen</button></div>
      <label class="toggle"><span>Bei Änderungen automatisch sichern</span><input type="checkbox" id="dbxAuto" ${DB.auto ? "checked" : ""}></label>
      <button class="btn danger block" style="margin-top:14px" data-act="dbxOff">Verbindung trennen</button></div>`;
  }
  const p = DB.pending;
  return `<div class="panel"><div class="muted small" style="margin-top:14px">Sichere alles in deiner Dropbox: Tagebuch, Gewicht, Rezepte und Lebensmittel. Dafür brauchst du einen eigenen App-Key von Dropbox. Er bleibt nur auf diesem Gerät.</div>
    <details class="help"><summary>So bekommst du den App-Key</summary><ol>
      <li>Öffne dropbox.com/developers/apps und tippe auf „Create app“.</li>
      <li>Wähle „Scoped access“ und „App folder“ und vergib einen Namen.</li>
      <li>Aktiviere unter „Permissions“ die Rechte files.content.write und files.content.read, dann „Submit“.</li>
      <li>Kopiere unter „Settings“ den „App key“ und füge ihn hier ein.</li></ol></details>
    <label>App-Key (oder Zugriffstoken)</label><input type="text" id="dbxKey" value="${esc(p ? p.key : "")}" placeholder="App-Key" autocomplete="off" autocapitalize="off" spellcheck="false">
    <button class="btn block" style="margin-top:12px" data-act="dbxStart">1. Bei Dropbox anmelden</button>
    ${p ? `<a class="linkbtn" href="${esc(p.url)}" target="_blank" rel="noopener">Dropbox-Anmeldung erneut öffnen</a>
      <label>Code aus Dropbox</label><input type="text" id="dbxCode" placeholder="Code einfügen" autocomplete="off" spellcheck="false">
      <button class="btn block" style="margin-top:12px" data-act="dbxFinish">2. Verbinden</button>` : ""}${msg}</div>`;
}
async function dbxAction(a) {
  const say = (text, err) => { ui.dbxMsg = text ? { text, err: !!err } : null; render(); };
  try {
    if (a === "dbxStart") {
      const k = ($("#dbxKey").value || "").trim();
      if (!k) return say("Füge zuerst deinen App-Key ein.", true);
      if (/^sl\./.test(k)) { DB.access = k; DB.exp = Date.now() + 3.5 * 3600 * 1000; DB.key = ""; DB.refresh = ""; DB.err = ""; delete DB.pending; dbSave(); return say("Mit Zugriffstoken verbunden. Er läuft nach etwa 4 Stunden ab."); }
      const url = await dbStartAuth(k);
      try { window.open(url, "_blank", "noopener"); } catch (e) { /* Link unten */ }
      say("Melde dich bei Dropbox an, erlaube den Zugriff und kopiere den angezeigten Code hierher.");
    } else if (a === "dbxFinish") {
      const code = ($("#dbxCode").value || "").trim();
      if (!code) return say("Füge den Code aus Dropbox ein.", true);
      await dbFinishAuth(code); DB.auto = true; dbSave(); ui.dbxMsg = null; render(); toast("Dropbox verbunden");
      try { await dbBackupNow(); render(); toast("Erste Sicherung gemacht"); } catch (e) { say(e.message, true); }
    } else if (a === "dbxBackup") {
      toast("Sichere …"); await dbBackupNow(); say("Sicherung in Dropbox gespeichert."); toast("Gesichert");
    } else if (a === "dbxRestore") {
      const text = await dbDownload(BK_PATH);
      if (!confirm("Alle aktuellen Daten durch die Sicherung aus Dropbox ersetzen?")) return;
      applyBackup(JSON.parse(text)); say("Sicherung aus Dropbox geladen."); toast("Wiederhergestellt");
    } else if (a === "dbxOff") {
      if (!confirm("Dropbox-Verbindung auf diesem Gerät trennen? Die Sicherung in Dropbox bleibt erhalten.")) return;
      DB = {}; dbSave(); say("");
    }
  } catch (e) { say(e.message || "Das hat nicht geklappt.", true); }
}

/* ---------- Ereignisse ---------- */
document.addEventListener("toggle", ev => { const d = ev.target; if (d && d.matches && d.matches("details.acc")) ui.setOpen[d.dataset.acc] = d.open; }, true);
document.addEventListener("click", async ev => {
  const t = ev.target.closest("[data-act]"); if (!t) return;
  const a = t.dataset.act;
  if (a === "day") { ui.date = addDays(ui.date, +t.dataset.d); render(); }
  else if (a === "setDay") { ui.date = t.dataset.d; render(); }
  else if (a === "pickDate") {
    const sh = sheet(`<h3>Tag wählen</h3><div class="muted small" style="margin-bottom:10px">Springe zu einem beliebigen Datum, um Einträge anzusehen oder nachzutragen.</div>
      <input type="date" id="pdDate" value="${ui.date}" max="2100-12-31"><div class="grid2" style="margin-top:14px"><button class="btn sec" id="pdToday">Heute</button><button class="btn" id="pdGo">Anzeigen</button></div>`);
    const go = v => { if (v) { ui.date = v; closeSheet(); render(); } };
    $("#pdGo", sh).onclick = () => go($("#pdDate", sh).value);
    $("#pdToday", sh).onclick = () => go(iso(new Date()));
    $("#pdDate", sh).onchange = e => go(e.target.value);
  }
  else if (a === "toggleMeal") { ui.open[t.dataset.meal] = !ui.open[t.dataset.meal]; render(); }
  else if (a === "add") openAdd(t.dataset.meal);
  else if (a === "editEntry") editEntry(t.dataset.id);
  else if (a === "wk") { ui.weekOffset = Math.min(0, ui.weekOffset + +t.dataset.d); render(); }
  else if (a === "goDay") { ui.date = t.dataset.d; setTab("today"); render(); }
  else if (a === "wRange") { ui.wRange = +t.dataset.v; render(); }
  else if (a === "saveWeight") {
    const w = num($("#wVal").value), d = $("#wDate").value || iso(new Date());
    if (w < 20 || w > 400) return toast("Bitte ein gültiges Gewicht eingeben");
    D.weights[d] = r1(w); save(); render(); toast("Gewicht gespeichert");
  }
  else if (a === "editWeight") {
    const d = t.dataset.d;
    const s = sheet(`<h3>${fromIso(d).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}</h3><label>Gewicht (kg)</label><input type="text" inputmode="decimal" id="ew" value="${D.weights[d]}">
      <button class="btn block" style="margin-top:14px" id="ews">Speichern</button><button class="btn danger block" style="margin-top:8px" id="ewd">Löschen</button>`);
    $("#ews", s).onclick = () => { const w = num($("#ew", s).value); if (w < 20 || w > 400) return toast("Ungültiges Gewicht"); D.weights[d] = r1(w); save(); closeSheet(); render(); };
    $("#ewd", s).onclick = () => { delete D.weights[d]; save(); closeSheet(); render(); };
  }
  else if (a === "saveGoals") {
    const k = num($("#sKcal").value), p = r0(num($("#sP").value)), c = r0(num($("#sC").value)), f = r0(num($("#sF").value));
    if (k < 800 || k > 8000) return toast("Kalorienziel zwischen 800 und 8000");
    if (p + c + f !== 100) return toast("Prozentwerte müssen 100 % ergeben");
    Object.assign(D.settings, { kcal: r0(k), pP: p, pC: c, pF: f, goalWeight: $("#sGoalW").value.trim() ? String(num($("#sGoalW").value)) : "" });
    save(); render(); toast("Ziele gespeichert");
  }
  else if (a === "mode") { D.settings.mode = t.dataset.v; save(); applyTheme(); render(); }
  else if (a === "accent") { D.settings.accent = t.dataset.v; save(); applyTheme(); render(); }
  else if (a === "saveAI") { D.settings.geminiKey = $("#sKey").value.trim(); D.settings.geminiModel = $("#sModel").value.trim() || "gemini-2.5-flash"; save(); toast("Gespeichert"); }
  else if (a === "mealToRecipe") mealToRecipe(t.dataset.meal);
  else if (a === "recipes") recipeManage();
  else if (a === "foodsManage") foodsManage();
  else if (a === "foodNew") foodEdit(null);
  else if (a === "csvExport") { if (!D.foods.length) return toast("Noch keine Lebensmittel"); exportFile("meine-lebensmittel.csv", new Blob([foodsToCsv(D.foods)], { type: "text/csv" })); }
  else if (a === "csvTemplate") exportFile("lebensmittel-vorlage.csv", new Blob([foodsToCsv([
    { name: "Haferflocken", brand: "", barcode: "", kcal: 372, fat: 7, carbs: 59, sugar: 1, protein: 13.5, fiber: 10, serving: 40 },
    { name: "Hähnchenbrust roh", brand: "", barcode: "", kcal: 106, fat: 1.2, carbs: 0, sugar: 0, protein: 23.5, fiber: 0, serving: 150 }])], { type: "text/csv" }));
  else if (a === "backup") exportFile("foodpro-backup-" + iso(new Date()) + ".json", new Blob([JSON.stringify(exportData())], { type: "application/json" }));
  else if (a === "importPick") $("#dataFile").click();
  else if (a === "exDiary") { if (!D.entries.length) return toast("Noch keine Einträge"); exportFile("foodpro-tagebuch.csv", csvBlob(diaryCsv())); }
  else if (a === "exWeight") { if (!Object.keys(D.weights).length) return toast("Noch kein Gewicht eingetragen"); exportFile("foodpro-gewicht.csv", csvBlob(weightCsv())); }
  else if (a === "exRecipes") { if (!D.recipes.length) return toast("Noch keine Rezepte"); exportFile("foodpro-rezepte.csv", csvBlob(recipesCsv())); }
  else if (a === "dayChart") dayChart();
  else if (a.startsWith("dbx")) dbxAction(a);
  else if (a === "wipe") {
    const sh = sheet(`<h3>Alle Daten löschen</h3>
      <div class="muted small" style="margin-bottom:14px">Tagebuch, Gewicht, Rezepte, Lebensmittel und Einstellungen werden unwiderruflich entfernt. Damit nichts versehentlich verloren geht, wird zuerst ein Backup gespeichert.</div>
      <div class="steps" style="margin:0 0 14px"><b>Schritt 1:</b> Backup erstellen<div style="margin-top:10px"><button class="btn block" id="wBk">Backup jetzt speichern</button></div><div id="wBkState" class="small muted" style="margin-top:8px">Noch kein Backup erstellt.</div></div>
      <div class="steps" style="margin:0 0 14px"><b>Schritt 2:</b> Löschen bestätigen<label style="margin-top:8px">Tippe LÖSCHEN zur Bestätigung</label><input type="text" id="wTxt" autocomplete="off" autocapitalize="characters" placeholder="LÖSCHEN" disabled></div>
      <button class="btn danger block" id="wGo" disabled>Alles endgültig löschen</button>
      <button class="btn sec block" style="margin-top:8px" id="wNo">Abbrechen</button>`);
    let done = false;
    const chk = () => { $("#wGo", sh).disabled = !(done && $("#wTxt", sh).value.trim().toUpperCase() === "LÖSCHEN"); };
    $("#wBk", sh).onclick = async () => {
      try {
        const saved = await exportFile("foodpro-backup-" + iso(new Date()) + ".json", new Blob([JSON.stringify(exportData())], { type: "application/json" }));
        if (!saved) throw new Error("nicht gespeichert");
        done = true; $("#wBkState", sh).innerHTML = "✓ Backup gespeichert. Prüfe kurz, dass die Datei da ist."; $("#wTxt", sh).disabled = false; $("#wTxt", sh).focus();
      } catch (e) { $("#wBkState", sh).textContent = "Backup wurde nicht gespeichert – es wird nichts gelöscht. Versuche es nochmal."; }
      chk();
    };
    $("#wTxt", sh).oninput = chk;
    $("#wNo", sh).onclick = () => closeSheet();
    $("#wGo", sh).onclick = () => { if (!done) return; D = DEFAULTS(); save(); applyTheme(); closeSheet(); render(); toast("Alles gelöscht"); };
  }
});
document.addEventListener("keydown", ev => { if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches && ev.target.matches("[role=button][data-act]")) { ev.preventDefault(); ev.target.click(); } });
document.addEventListener("change", async ev => {
  const t = ev.target;
  if (t.id === "dataFile" && t.files[0]) {
    try { const m = await importFile(t.files[0]); if (m) toast(m); } catch (e) { toast(e.message || "Datei nicht lesbar"); }
    t.value = "";
  } else if (t.id === "dbxAuto") { DB.auto = t.checked; dbSave(); if (t.checked) queueBackup(); toast(t.checked ? "Automatische Sicherung an" : "Automatische Sicherung aus");
  } else if (t.id === "sAccent") { D.settings.accent = t.value; save(); applyTheme(); render(); }
});
document.addEventListener("input", ev => {
  if (["sP", "sC", "sF", "sKcal"].includes(ev.target.id)) {
    const p = num($("#sP").value), c = num($("#sC").value), f = num($("#sF").value), k = num($("#sKcal").value);
    const el = $("#macroInfo"); el.textContent = macroInfoText(p, c, f, k); el.className = "small " + (p + c + f === 100 ? "muted" : "warn");
  }
});
$("#tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) { setTab(b.dataset.tab); render(); $("#view").scrollTop = 0; } });

/* ---------- Start ---------- */
const h = new Date().getHours();
ui.meal = h < 10 ? "b" : h < 15 ? "l" : h < 21 ? "d" : "s";
buildNav();
applyTheme();
if (window.matchMedia) matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => { if (D.settings.mode === "auto") applyTheme(); });
render();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const had = !!navigator.serviceWorker.controller; let rl = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (had && !rl) { rl = true; location.reload(); } });
  navigator.serviceWorker.register("sw.js").then(r => r.update()).catch(() => { });
}
window.__ern = { parseFoodsText, get D() { return D; }, importCsv, importAny: importAnyCsv, parseCsv, foodsToCsv, mapOff, analyzePhoto, exportData };
