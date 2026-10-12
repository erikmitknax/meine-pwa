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
const ACCENTS = ["#ff4d2e", "#3d5afe", "#00a88f", "#f5a300", "#9b51e0", "#e5336d", "#2ecc71"];
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

const DEFAULTS = () => ({
  ver: 2, foods: [], recipes: [], entries: [], weights: {},
  settings: { kcal: 2200, pP: 30, pC: 40, pF: 30, mode: "auto", accent: "#ff4d2e", apiKey: "", model: "claude-sonnet-5-5", goalWeight: "" },
});
let D = load();
let ui = { tab: "today", date: iso(new Date()), weekOffset: 0, wRange: 90, meal: "b" };

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw) {
      const d = DEFAULTS(), out = { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}) } };
      if (!raw.ver && out.settings.accent === "#2ecc71") out.settings.accent = d.settings.accent; // altes Standardgrün -> neue Standardfarbe
      out.ver = 2;
      return out;
    }
  } catch (e) { /* kaputte Daten ignorieren */ }
  return DEFAULTS();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { toast("Speichern fehlgeschlagen (Speicher voll?)"); } }
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
    return `<section class="meal"><div class="mh"><h3>${m.name}</h3>${es.length ? `<span class="kc">${fmt(s.kcal)} kcal</span>` : ""}<button class="addbtn" data-act="add" data-meal="${m.id}" aria-label="${m.name} hinzufügen">${icon("plus", 18, 2.6)}</button></div>` +
      (es.length ? `<div class="list">${es.map(e => `<div class="entry" data-act="editEntry" data-id="${e.id}"><div class="nm"><div class="t">${esc(e.name)}</div>
        <div class="s"><span class="g">${r0(e.grams)} g</span><span class="cp">E ${r0(e.p)}</span><span class="cc">KH ${r0(e.c)}</span><span class="cf">F ${r0(e.f)}</span></div></div>
        <div class="kcal">${fmt(e.kcal)}<small>kcal</small></div></div>`).join("")}</div>${es.length > 1 ? `<button class="linkbtn" data-act="mealToRecipe" data-meal="${m.id}">Als Rezept speichern</button>` : ""}`
        : `<button class="empty" data-act="add" data-meal="${m.id}">${icon("plus", 18, 2.4)}${m.name} eintragen</button>`) + `</section>`;
  }).join("");
  const full = fromIso(ui.date).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  return `<header class="top"><div class="brand"><span class="logo"></span>Fuelwise</div><button class="ghost" data-act="pickDate" aria-label="Datum wählen">${icon("cal", 20)}</button></header>
  ${weekStrip()}
  <section class="hero"><div class="ht"><span>${niceDate(ui.date) === full ? full : niceDate(ui.date) + ", " + full}</span><span>Ziel ${fmt(g.kcal)}</span></div>
    <div class="hn"><b>${fmt(Math.abs(left))}</b><span>${left >= 0 ? "kcal übrig" : "kcal drüber"}</span></div>
    <div class="hbar"><i style="width:${pct}%"></i></div><div class="hf">${fmt(t.kcal)} kcal gegessen</div></section>
  <section class="macros">${macroCol("Eiweiß", t.p, g.p, "p")}${macroCol("Kohlenhydrate", t.c, g.c, "c")}${macroCol("Fett", t.f, g.f, "f")}</section>
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
    ${r.n ? `<text x="${x + bw / 2}" y="${H - pad - h - 6}" text-anchor="middle" style="fill:var(--text)">${fmt(r.kcal)}</text>` : ""}</g>`;
  }).join("");
  const chart = `<svg viewBox="0 0 ${W} ${H}" width="100%"><line x1="0" x2="${W}" y1="${y(g.kcal)}" y2="${y(g.kcal)}" stroke="var(--muted)" stroke-dasharray="3 5" opacity=".6"/>
    <text x="${W}" y="${y(g.kcal) - 5}" text-anchor="end">Ziel ${fmt(g.kcal)}</text>${bars}</svg>`;
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
  <h2 style="margin-top:6px">Tagesziele</h2><div class="panel">
    <label>Kalorien pro Tag</label><input type="text" inputmode="numeric" id="sKcal" value="${s.kcal}">
    <div class="grid3"><div><label>Eiweiß in %</label><input type="text" inputmode="numeric" id="sP" value="${s.pP}"></div>
    <div><label>Kohlenh. in %</label><input type="text" inputmode="numeric" id="sC" value="${s.pC}"></div>
    <div><label>Fett in %</label><input type="text" inputmode="numeric" id="sF" value="${s.pF}"></div></div>
    <div id="macroInfo" class="small ${tot === 100 ? "muted" : "warn"}" style="margin:10px 2px 0">${macroInfoText(s.pP, s.pC, s.pF, s.kcal)}</div>
    <label>Zielgewicht in kg (optional)</label><input type="text" inputmode="decimal" id="sGoalW" value="${esc(s.goalWeight)}">
    <button class="btn block" style="margin-top:16px" data-act="saveGoals">Ziele speichern</button></div>
  <h2>Design</h2><div class="panel">
    <label>Darstellung</label><div class="chips">${[["auto", "Automatisch"], ["dark", "Dunkel"], ["light", "Hell"]].map(([v, l]) => `<button class="chip ${s.mode === v ? "on" : ""}" data-act="mode" data-v="${v}">${l}</button>`).join("")}</div>
    <label>Akzentfarbe</label><div class="swatches">${ACCENTS.map(c => `<button class="sw ${s.accent.toLowerCase() === c ? "on" : ""}" style="background:${c}" data-act="accent" data-v="${c}" aria-label="Farbe ${c}"></button>`).join("")}<input type="color" id="sAccent" value="${s.accent}" aria-label="Eigene Farbe"></div></div>
  <h2>Foto-KI</h2><div class="panel">
    <div class="muted small" style="margin-top:14px">Für die Foto-Erkennung brauchst du einen eigenen Anthropic-API-Schlüssel. Er bleibt auf diesem Gerät und geht direkt an Anthropic.</div>
    <label>API-Schlüssel</label><input type="password" id="sKey" value="${esc(s.apiKey)}" placeholder="sk-ant-…" autocomplete="off">
    <label>Modell</label><input type="text" id="sModel" value="${esc(s.model)}">
    <button class="btn sec block" style="margin-top:16px" data-act="saveAI">Speichern</button></div>
  <h2>Rezepte</h2><div class="panel" style="padding-top:16px"><button class="btn sec block" data-act="recipes">Meine Rezepte (${D.recipes.length})</button></div>
  <h2>Meine Lebensmittel <span class="muted" style="font-weight:600">${D.foods.length}</span></h2><div class="panel" style="padding-top:16px">
    <div class="grid2"><button class="btn sec" data-act="foodsManage">Verwalten</button><button class="btn sec" data-act="foodNew">Neu anlegen</button>
    <button class="btn sec" data-act="csvImport">CSV importieren</button><button class="btn sec" data-act="csvExport">CSV exportieren</button></div>
    <button class="btn sec block" style="margin-top:10px" data-act="csvTemplate">CSV-Vorlage laden</button>
    <input type="file" id="csvFile" accept=".csv,text/csv,text/plain" hidden></div>
  <h2>Daten</h2><div class="panel" style="padding-top:16px">
    <div class="grid2"><button class="btn sec" data-act="backup">Backup speichern</button><button class="btn sec" data-act="restore">Backup laden</button></div>
    <input type="file" id="jsonFile" accept=".json,application/json" hidden>
    <button class="btn danger block" style="margin-top:10px" data-act="wipe">Alle Daten löschen</button></div>
  <div class="muted tiny center" style="margin-top:22px">Fuelwise · Nährwertdaten von Open Food Facts (ODbL)</div>`;
}
function macroInfoText(p, c, f, kcal) {
  const t = p + c + f;
  return t === 100 ? `Ziele: ${r0(kcal * p / 400)} g Eiweiß · ${r0(kcal * c / 400)} g Kohlenhydrate · ${r0(kcal * f / 900)} g Fett`
    : `Die Prozentwerte ergeben ${t} % – sie müssen zusammen 100 % ergeben.`;
}

/* ---------- Sheets ---------- */
function sheet(html, mount) {
  closeSheet();
  const bg = document.createElement("div");
  bg.className = "sheetbg";
  bg.innerHTML = `<div class="sheet">${html}</div>`;
  bg.addEventListener("click", e => { if (e.target === bg) closeSheet(); });
  $("#sheetRoot").append(bg);
  if (mount) mount(bg.firstElementChild);
  return bg.firstElementChild;
}
function closeSheet() { stopScan(); $("#sheetRoot").innerHTML = ""; }

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
  if (!D.settings.apiKey) {
    b.innerHTML = `<div class="card muted small">Für die Foto-Erkennung trägst du in den Einstellungen deinen Anthropic-API-Schlüssel ein. Die Werte sind Schätzungen – prüfe sie vor dem Speichern.</div>
      <button class="btn block" id="toSet">Zu den Einstellungen</button>`;
    $("#toSet", b).onclick = () => { closeSheet(); ui.tab = "settings"; render(); };
    return;
  }
  b.innerHTML = `<div class="muted small">Fotografiere dein Essen oder ein Nährwert-Etikett. Die KI schätzt Lebensmittel, Menge und Nährwerte.</div>
    <input type="file" id="img" accept="image/*" capture="environment" hidden>
    <div class="grid2" style="margin-top:10px"><button class="btn" id="cam">Foto aufnehmen</button><button class="btn sec" id="gal">Aus Galerie</button></div>
    <input type="file" id="img2" accept="image/*" hidden><div id="pres"></div>`;
  const run = async f => {
    if (!f) return;
    $("#pres", b).innerHTML = `<div class="muted" style="margin-top:14px"><span class="spin"></span>Analysiere Foto …</div>`;
    try { photoItems = await analyzePhoto(f); renderPhotoItems(); }
    catch (e) { $("#pres", b).innerHTML = `<div class="warn small" style="margin-top:14px">${esc(e.message)}</div>`; }
  };
  $("#cam", b).onclick = () => $("#img", b).click();
  $("#gal", b).onclick = () => $("#img2", b).click();
  $("#img", b).onchange = e => run(e.target.files[0]);
  $("#img2", b).onchange = e => run(e.target.files[0]);
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
async function analyzePhoto(file) {
  const data = await shrink(file);
  const prompt = `Analysiere dieses Foto (Mahlzeit, Lebensmittel oder Nährwert-Etikett). Erkenne jedes einzelne Lebensmittel, schätze die Menge in Gramm und nenne die Nährwerte pro 100 g. Wenn ein Nährwert-Etikett zu sehen ist, nutze dessen Werte. Antworte ausschließlich mit JSON ohne weiteren Text im Format: {"items":[{"name":"deutscher Name","grams":150,"kcal":120,"protein":5,"carbs":20,"fat":2,"sugar":1,"fiber":3}]}. Alle Nährwerte beziehen sich auf 100 g.`;
  let r;
  try {
    r = await fetchT("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": D.settings.apiKey.trim(), "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: D.settings.model || "claude-sonnet-5-5", max_tokens: 1200, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }, { type: "text", text: prompt }] }] }),
    }, 60000);
  } catch (e) { throw new Error("Keine Verbindung zur KI. Bist du online?"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || "KI-Fehler " + r.status);
  const txt = (j.content || []).map(c => c.text || "").join("");
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
  return `<label style="margin-top:0">Name</label><input type="text" id="fName" value="${v("name")}">
    <div class="grid2"><div><label>Marke</label><input type="text" id="fBrand" value="${v("brand")}"></div><div><label>Barcode</label><input type="text" inputmode="numeric" id="fBar" value="${v("barcode")}"></div></div>
    <div class="muted small" style="margin-top:12px">Nährwerte pro 100 g / 100 ml</div>
    <div class="grid2"><div><label>Kalorien (kcal)</label><input type="text" inputmode="decimal" id="fKcal" value="${v("kcal")}"></div><div><label>Eiweiß (g)</label><input type="text" inputmode="decimal" id="fP" value="${v("protein")}"></div>
    <div><label>Kohlenhydrate (g)</label><input type="text" inputmode="decimal" id="fC" value="${v("carbs")}"></div><div><label>Fett (g)</label><input type="text" inputmode="decimal" id="fF" value="${v("fat")}"></div>
    <div><label>davon Zucker (g)</label><input type="text" inputmode="decimal" id="fS" value="${v("sugar")}"></div><div><label>Ballaststoffe (g)</label><input type="text" inputmode="decimal" id="fFi" value="${v("fiber")}"></div></div>
    <label>Portionsgröße (g)</label><input type="text" inputmode="decimal" id="fServ" value="${v("serving") || 100}">`;
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
  const s = sheet(`<h3>Zutat hinzufügen</h3><div class="row"><input type="search" id="zq" placeholder="Name oder Marke …" autocomplete="off"><button class="btn" id="zGo" aria-label="Online suchen">${icon("search", 22)}</button></div>
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
  $("#zNew", s).onclick = () => {
    const f = sheet(`<h3>Neues Lebensmittel</h3>${foodForm({})}<button class="btn block" style="margin-top:14px" id="nSave">Speichern & Menge wählen</button><button class="btn sec block" style="margin-top:8px" id="nBack">Zurück</button>`);
    $("#nBack", f).onclick = again;
    $("#nSave", f).onclick = () => { const n = readFoodForm(f); if (!n) return; D.foods.push(n); save(); pickAmount(n, onPick, again); };
  };
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
  return "﻿" + [CSV_HEAD.join(";")].concat(foods.map(f => CSV_COLS.map(c => csvCell(f[c])).join(";"))).join("\r\n") + "\r\n";
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
  if (NATIVE) {
    try {
      const p = window.Capacitor.registerPlugin("ErnDownload");
      await p.save({ filename: name, data: await blobToBase64(blob), mime: blob.type || "application/octet-stream" });
      toast("In „Download“ gespeichert: " + name); return;
    } catch (e) { /* weiter mit Browser-Download */ }
  }
  const u = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
  toast("Datei erstellt: " + name);
}
const readText = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(f); });

/* ---------- Ereignisse ---------- */
document.addEventListener("click", async ev => {
  const t = ev.target.closest("[data-act]"); if (!t) return;
  const a = t.dataset.act;
  if (a === "day") { ui.date = addDays(ui.date, +t.dataset.d); render(); }
  else if (a === "setDay") { ui.date = t.dataset.d; render(); }
  else if (a === "pickDate") { const i = document.createElement("input"); i.type = "date"; i.value = ui.date; i.style.cssText = "position:fixed;opacity:0;top:0"; document.body.append(i); i.onchange = () => { if (i.value) { ui.date = i.value; render(); } i.remove(); }; i.onblur = () => setTimeout(() => i.remove(), 300); (i.showPicker ? i.showPicker() : i.click()); }
  else if (a === "add") openAdd(t.dataset.meal);
  else if (a === "editEntry") editEntry(t.dataset.id);
  else if (a === "wk") { ui.weekOffset = Math.min(0, ui.weekOffset + +t.dataset.d); render(); }
  else if (a === "goDay") { ui.date = t.dataset.d; ui.tab = "today"; render(); }
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
  else if (a === "saveAI") { D.settings.apiKey = $("#sKey").value.trim(); D.settings.model = $("#sModel").value.trim() || "claude-sonnet-5-5"; save(); toast("Gespeichert"); }
  else if (a === "mealToRecipe") mealToRecipe(t.dataset.meal);
  else if (a === "recipes") recipeManage();
  else if (a === "foodsManage") foodsManage();
  else if (a === "foodNew") foodEdit(null);
  else if (a === "csvImport") $("#csvFile").click();
  else if (a === "csvExport") { if (!D.foods.length) return toast("Noch keine Lebensmittel"); exportFile("meine-lebensmittel.csv", new Blob([foodsToCsv(D.foods)], { type: "text/csv" })); }
  else if (a === "csvTemplate") exportFile("lebensmittel-vorlage.csv", new Blob([foodsToCsv([
    { name: "Haferflocken", brand: "", barcode: "", kcal: 372, fat: 7, carbs: 59, sugar: 1, protein: 13.5, fiber: 10, serving: 40 },
    { name: "Hähnchenbrust roh", brand: "", barcode: "", kcal: 106, fat: 1.2, carbs: 0, sugar: 0, protein: 23.5, fiber: 0, serving: 150 }])], { type: "text/csv" }));
  else if (a === "backup") exportFile("fuelwise-backup-" + iso(new Date()) + ".json", new Blob([JSON.stringify(D)], { type: "application/json" }));
  else if (a === "restore") $("#jsonFile").click();
  else if (a === "wipe") { if (confirm("Wirklich ALLE Daten (Tagebuch, Gewicht, Lebensmittel, Einstellungen) löschen?")) { D = DEFAULTS(); save(); applyTheme(); render(); toast("Alles gelöscht"); } }
});
document.addEventListener("change", async ev => {
  const t = ev.target;
  if (t.id === "csvFile" && t.files[0]) {
    try { const r = importCsv(await readText(t.files[0])); save(); render(); toast(`${r.added} neu, ${r.updated} aktualisiert`); } catch (e) { toast(e.message); }
    t.value = "";
  } else if (t.id === "jsonFile" && t.files[0]) {
    try {
      const j = JSON.parse(await readText(t.files[0]));
      if (!j || !Array.isArray(j.entries) || !Array.isArray(j.foods)) throw new Error("Das ist kein gültiges Backup");
      if (!confirm("Aktuelle Daten durch das Backup ersetzen?")) return;
      const d = DEFAULTS(); D = { ...d, ...j, settings: { ...d.settings, ...(j.settings || {}) } }; save(); applyTheme(); render(); toast("Backup geladen");
    } catch (e) { toast(e.message || "Backup nicht lesbar"); }
    t.value = "";
  } else if (t.id === "sAccent") { D.settings.accent = t.value; save(); applyTheme(); render(); }
});
document.addEventListener("input", ev => {
  if (["sP", "sC", "sF", "sKcal"].includes(ev.target.id)) {
    const p = num($("#sP").value), c = num($("#sC").value), f = num($("#sF").value), k = num($("#sKcal").value);
    const el = $("#macroInfo"); el.textContent = macroInfoText(p, c, f, k); el.className = "small " + (p + c + f === 100 ? "muted" : "warn");
  }
});
$("#tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) { ui.tab = b.dataset.tab; render(); $("#view").scrollTop = 0; } });

/* ---------- Start ---------- */
const h = new Date().getHours();
ui.meal = h < 10 ? "b" : h < 15 ? "l" : h < 21 ? "d" : "s";
buildNav();
applyTheme();
if (window.matchMedia) matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => { if (D.settings.mode === "auto") applyTheme(); });
render();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => { });
window.__ern = { get D() { return D; }, importCsv, parseCsv, foodsToCsv, mapOff };
