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
const ACCENTS = ["#2ecc71", "#3498db", "#e67e22", "#e84393", "#9b59b6", "#f1c40f", "#1abc9c"];
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

const DEFAULTS = () => ({
  foods: [], entries: [], weights: {},
  settings: { kcal: 2200, pP: 30, pC: 40, pF: 30, mode: "auto", accent: "#2ecc71", apiKey: "", model: "claude-sonnet-5-5", goalWeight: "" },
});
let D = load();
let ui = { tab: "today", date: iso(new Date()), weekOffset: 0, wRange: 90, meal: "b" };

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw) { const d = DEFAULTS(); return { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}) } }; }
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
  if (m) m.content = mode === "light" ? "#f3f6f4" : "#0f1714";
}

/* ---------- Rendering ---------- */
function render() {
  $$("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === ui.tab));
  const v = $("#view");
  const top = v.scrollTop;
  v.innerHTML = { today: viewToday, week: viewWeek, weight: viewWeight, settings: viewSettings }[ui.tab]();
  v.scrollTop = top;
}

function ring(value, goal, color) {
  const R = 46, C = 2 * Math.PI * R, pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  const over = value > goal * 1.05;
  return `<svg width="112" height="112" viewBox="0 0 112 112"><circle cx="56" cy="56" r="${R}" fill="none" stroke="var(--card2)" stroke-width="11"/>
  <circle cx="56" cy="56" r="${R}" fill="none" stroke="${over ? "var(--danger)" : color}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${C * pct} ${C}"/></svg>`;
}
function macroBar(label, val, goal, color) {
  const pct = goal > 0 ? Math.min(val / goal * 100, 100) : 0;
  return `<div class="bar"><div class="top"><span>${label}</span><span class="muted">${r0(val)} / ${r0(goal)} g</span></div>
  <div class="track"><div class="fill" style="width:${pct}%;background:${color}"></div></div></div>`;
}

function viewToday() {
  const g = goals(), list = dayEntries(ui.date), t = sum(list);
  const left = g.kcal - t.kcal;
  const meals = MEALS.map(m => {
    const es = list.filter(e => e.meal === m.id), s = sum(es);
    return `<div class="card meal"><div class="head"><b>${m.icon} ${m.name}</b><span class="muted small">${r0(s.kcal)} kcal</span></div>
    ${es.map(e => `<div class="entry" data-act="editEntry" data-id="${e.id}"><div class="nm"><div>${esc(e.name)}</div>
      <div class="muted tiny">${r0(e.grams)} g · <span class="dot" style="background:var(--p)"></span>${r0(e.p)} <span class="dot" style="background:var(--c)"></span>${r0(e.c)} <span class="dot" style="background:var(--f)"></span>${r0(e.f)}</div></div>
      <b>${r0(e.kcal)}</b></div>`).join("")}
    <button class="btn sec small block" style="margin-top:8px" data-act="add" data-meal="${m.id}">+ Hinzufügen</button></div>`;
  }).join("");
  return `<div class="datebar"><button class="iconbtn" data-act="day" data-d="-1">‹</button>
    <div class="title" data-act="pickDate">${niceDate(ui.date)}<div class="muted tiny" style="font-weight:400">${fromIso(ui.date).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}</div></div>
    <button class="iconbtn" data-act="day" data-d="1">›</button></div>
  <div class="card ringwrap"><div class="ring">${ring(t.kcal, g.kcal, "var(--accent)")}<div class="mid"><b>${r0(Math.abs(left))}</b><span class="muted tiny">${left >= 0 ? "kcal übrig" : "kcal drüber"}</span></div></div>
    <div class="bars">${macroBar("Eiweiß", t.p, g.p, "var(--p)")}${macroBar("Kohlenhydrate", t.c, g.c, "var(--c)")}${macroBar("Fett", t.f, g.f, "var(--f)")}</div></div>
  <div class="muted small center" style="margin:-4px 0 10px">${r0(t.kcal)} von ${r0(g.kcal)} kcal gegessen</div>${meals}`;
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
  const logged = rows.filter(r => r.n);
  const avg = logged.length ? sum(logged.map(r => ({ kcal: r.kcal, p: r.p, c: r.c, f: r.f }))) : { kcal: 0, p: 0, c: 0, f: 0 };
  const L = logged.length || 1;
  const hit = logged.filter(r => Math.abs(r.kcal - g.kcal) <= g.kcal * 0.1).length;
  // Balkendiagramm
  const W = 340, H = 170, pad = 22, bw = 28;
  const max = Math.max(g.kcal * 1.25, ...rows.map(r => r.kcal), 1);
  const y = v => H - pad - (v / max) * (H - pad - 10);
  const step = (W - 20) / 7;
  const bars = rows.map((r, i) => {
    const x = 10 + i * step + (step - bw) / 2, h = H - pad - y(r.kcal);
    const over = r.kcal > g.kcal * 1.1;
    return `<g data-act="goDay" data-d="${r.d}" style="cursor:pointer"><rect x="${x}" y="${H - pad - h}" width="${bw}" height="${Math.max(h, 0)}" rx="6" fill="${over ? "var(--danger)" : "var(--accent)"}" opacity="${r.n ? 1 : .25}"/>
    <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${WD[fromIso(r.d).getDay()]}</text>
    ${r.n ? `<text x="${x + bw / 2}" y="${H - pad - h - 4}" text-anchor="middle" style="fill:var(--text)">${r0(r.kcal)}</text>` : ""}</g>`;
  }).join("");
  const chart = `<svg viewBox="0 0 ${W} ${H}" width="100%"><line x1="6" x2="${W - 6}" y1="${y(g.kcal)}" y2="${y(g.kcal)}" stroke="var(--muted)" stroke-dasharray="4 4"/>
    <text x="${W - 6}" y="${y(g.kcal) - 4}" text-anchor="end">Ziel ${r0(g.kcal)}</text>${bars}</svg>`;
  // Schnitt je Wochentag, letzte 8 Wochen
  const today = iso(new Date());
  const byWd = {};
  for (let i = 0; i < 56; i++) {
    const d = addDays(today, -i), es = dayEntries(d);
    if (!es.length) continue;
    const wd = fromIso(d).getDay(), s = sum(es);
    (byWd[wd] = byWd[wd] || []).push(s);
  }
  const wdMax = Math.max(g.kcal * 1.2, ...Object.values(byWd).map(a => a.reduce((x, s) => x + s.kcal, 0) / a.length), 1);
  const wdRows = WD_ORDER.map(w => {
    const a = byWd[w];
    if (!a) return `<tr><td>${WD[w]}</td><td colspan="4" class="muted">keine Daten</td></tr>`;
    const m = a.reduce((x, s) => ({ kcal: x.kcal + s.kcal, p: x.p + s.p, c: x.c + s.c, f: x.f + s.f }), { kcal: 0, p: 0, c: 0, f: 0 });
    const n = a.length;
    return `<tr><td>${WD[w]} <span class="muted tiny">(${n}×)</span></td><td><b>${r0(m.kcal / n)}</b></td><td>${r0(m.p / n)}</td><td>${r0(m.c / n)}</td><td>${r0(m.f / n)}</td></tr>`;
  }).join("");
  const wdBars = WD_ORDER.map(w => {
    const a = byWd[w], v = a ? a.reduce((x, s) => x + s.kcal, 0) / a.length : 0;
    return `<div style="flex:1;text-align:center"><div style="height:70px;display:flex;align-items:flex-end;justify-content:center"><div style="width:70%;height:${v / wdMax * 100}%;background:${v > g.kcal * 1.1 ? "var(--danger)" : "var(--accent)"};border-radius:6px 6px 0 0;opacity:${a ? 1 : .2}"></div></div><div class="tiny muted">${WD[w]}</div></div>`;
  }).join("");
  const label = ui.weekOffset === 0 ? "Letzte 7 Tage" : fromIso(days[0]).toLocaleDateString("de-DE", { day: "numeric", month: "short" }) + " – " + fromIso(days[6]).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  return `<h1>Wochenrückblick</h1>
  <div class="datebar"><button class="iconbtn" data-act="wk" data-d="-1">‹</button><div class="title">${label}</div><button class="iconbtn" data-act="wk" data-d="1" ${ui.weekOffset >= 0 ? "disabled" : ""}>›</button></div>
  <div class="card">${chart}<div class="muted tiny center">Tippe auf einen Tag, um ihn zu öffnen</div></div>
  <div class="card"><div class="grid2"><div><div class="muted small">Ø Kalorien (${logged.length} Tage)</div><b style="font-size:24px">${r0(avg.kcal / L)}</b> <span class="muted small">/ ${r0(g.kcal)}</span></div>
    <div><div class="muted small">Im Zielbereich (±10 %)</div><b style="font-size:24px">${hit}</b> <span class="muted small">von ${logged.length}</span></div></div>
    <div style="margin-top:12px">${macroBar("Ø Eiweiß", avg.p / L, g.p, "var(--p)")}</div>
    <div style="margin-top:8px">${macroBar("Ø Kohlenhydrate", avg.c / L, g.c, "var(--c)")}</div>
    <div style="margin-top:8px">${macroBar("Ø Fett", avg.f / L, g.f, "var(--f)")}</div></div>
  <div class="card"><table class="t"><tr><th>Tag</th><th>kcal</th><th>E</th><th>KH</th><th>F</th></tr>
    ${rows.map(r => `<tr data-act="goDay" data-d="${r.d}" style="cursor:pointer"><td>${WD[fromIso(r.d).getDay()]} ${fromIso(r.d).getDate()}.</td>${r.n ? `<td><b>${r0(r.kcal)}</b></td><td>${r0(r.p)}</td><td>${r0(r.c)}</td><td>${r0(r.f)}</td>` : `<td colspan="4" class="muted">–</td>`}</tr>`).join("")}</table></div>
  <h2>Typische Wochentage (letzte 8 Wochen)</h2>
  <div class="card"><div class="row" style="align-items:flex-end">${wdBars}</div>
  <table class="t" style="margin-top:10px"><tr><th>Tag</th><th>Ø kcal</th><th>E</th><th>KH</th><th>F</th></tr>${wdRows}</table></div>`;
}

/* ---- Gewicht ---- */
function weightList() { return Object.entries(D.weights).map(([d, w]) => ({ d, w })).sort((a, b) => a.d.localeCompare(b.d)); }
function viewWeight() {
  const all = weightList(), today = iso(new Date());
  const from = ui.wRange ? addDays(today, -ui.wRange) : "0000-00-00";
  const pts = all.filter(p => p.d >= from);
  const goal = num(D.settings.goalWeight);
  let chart = `<div class="muted center small" style="padding:30px 0">Trage dein erstes Gewicht ein, dann erscheint hier der Verlauf.</div>`;
  if (pts.length >= 1) {
    const W = 340, H = 190, px = 30, py = 18;
    const ws = pts.map(p => p.w).concat(goal ? [goal] : []);
    let lo = Math.min(...ws), hi = Math.max(...ws);
    if (hi - lo < 2) { lo -= 1; hi += 1; }
    lo = Math.floor(lo - .5); hi = Math.ceil(hi + .5);
    const t0 = fromIso(pts[0].d).getTime(), t1 = fromIso(pts[pts.length - 1].d).getTime();
    const X = d => pts.length === 1 || t1 === t0 ? W / 2 : px + (fromIso(d).getTime() - t0) / (t1 - t0) * (W - px - 12);
    const Y = w => H - py - (w - lo) / (hi - lo) * (H - py - 12);
    const line = pts.map((p, i) => (i ? "L" : "M") + X(p.d).toFixed(1) + " " + Y(p.w).toFixed(1)).join(" ");
    // gleitender Schnitt (7 Messungen)
    const ma = pts.map((p, i) => { const s = pts.slice(Math.max(0, i - 6), i + 1); return { d: p.d, w: s.reduce((a, b) => a + b.w, 0) / s.length }; });
    const maLine = ma.map((p, i) => (i ? "L" : "M") + X(p.d).toFixed(1) + " " + Y(p.w).toFixed(1)).join(" ");
    const ticks = [lo, (lo + hi) / 2, hi].map(v => `<line x1="${px}" x2="${W - 8}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${px - 4}" y="${Y(v) + 4}" text-anchor="end">${r1(v)}</text>`).join("");
    chart = `<svg viewBox="0 0 ${W} ${H}" width="100%">${ticks}
      ${goal ? `<line x1="${px}" x2="${W - 8}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="var(--c)" stroke-dasharray="5 4"/><text x="${W - 8}" y="${Y(goal) - 4}" text-anchor="end" style="fill:var(--c)">Ziel ${goal}</text>` : ""}
      <path d="${line}" fill="none" stroke="var(--muted)" stroke-width="1.5" opacity=".7"/>
      <path d="${maLine}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>
      ${pts.map(p => `<circle cx="${X(p.d)}" cy="${Y(p.w)}" r="3.5" fill="var(--accent)"/>`).join("")}
      <text x="${px}" y="${H - 2}">${fromIso(pts[0].d).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}</text>
      <text x="${W - 8}" y="${H - 2}" text-anchor="end">${fromIso(pts[pts.length - 1].d).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}</text></svg>
      <div class="legend"><span><span class="dot" style="background:var(--accent)"></span>Trend (Ø 7 Messungen)</span><span><span class="dot" style="background:var(--muted)"></span>Messwerte</span></div>`;
  }
  const cur = all.length ? all[all.length - 1] : null, first = all.length ? all[0] : null;
  const wAgo = d => { const t = addDays(today, -d); const c = all.filter(p => p.d <= t); return c.length ? c[c.length - 1].w : null; };
  const diff = (a, b) => a == null || b == null ? "–" : (a - b > 0 ? "+" : "") + r1(a - b) + " kg";
  const stats = cur ? `<div class="grid3 center"><div><div class="muted tiny">Aktuell</div><b style="font-size:20px">${r1(cur.w)}</b></div>
    <div><div class="muted tiny">7 Tage</div><b style="font-size:20px">${diff(cur.w, wAgo(7))}</b></div>
    <div><div class="muted tiny">30 Tage</div><b style="font-size:20px">${diff(cur.w, wAgo(30))}</b></div></div>
    <div class="grid3 center" style="margin-top:10px"><div><div class="muted tiny">Seit Start</div><b>${diff(cur.w, first.w)}</b></div>
    <div><div class="muted tiny">Zielgewicht</div><b>${goal ? goal + " kg" : "–"}</b></div>
    <div><div class="muted tiny">Noch bis Ziel</div><b>${goal ? diff(cur.w, goal).replace("+", "") : "–"}</b></div></div>` : "";
  const rev = all.slice().reverse().slice(0, 30);
  return `<h1>Gewicht</h1>
  <div class="card"><div class="row"><div class="grow"><label style="margin-top:0">Datum</label><input type="date" id="wDate" value="${today}"></div>
    <div class="grow"><label style="margin-top:0">Gewicht (kg)</label><input type="text" inputmode="decimal" id="wVal" placeholder="${cur ? r1(cur.w) : "z. B. 80,5"}"></div></div>
    <button class="btn block" style="margin-top:12px" data-act="saveWeight">Speichern</button></div>
  <div class="seg">${[[30, "30 Tage"], [90, "90 Tage"], [365, "1 Jahr"], [0, "Alles"]].map(([v, l]) => `<button data-act="wRange" data-v="${v}" class="${ui.wRange === v ? "on" : ""}">${l}</button>`).join("")}</div>
  <div class="card">${chart}</div>
  ${stats ? `<div class="card">${stats}</div>` : ""}
  ${rev.length ? `<h2>Einträge</h2><div class="card">${rev.map(p => `<div class="entry" data-act="editWeight" data-d="${p.d}"><div class="nm">${fromIso(p.d).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div><b>${r1(p.w)} kg</b></div>`).join("")}</div>` : ""}`;
}

/* ---- Einstellungen ---- */
function viewSettings() {
  const s = D.settings, g = goals(), tot = s.pP + s.pC + s.pF;
  return `<h1>Einstellungen</h1>
  <h2>Tagesziele</h2><div class="card">
    <label style="margin-top:0">Kalorienziel (kcal)</label><input type="text" inputmode="numeric" id="sKcal" value="${s.kcal}">
    <div class="grid3"><div><label>Eiweiß %</label><input type="text" inputmode="numeric" id="sP" value="${s.pP}"></div>
    <div><label>Kohlenh. %</label><input type="text" inputmode="numeric" id="sC" value="${s.pC}"></div>
    <div><label>Fett %</label><input type="text" inputmode="numeric" id="sF" value="${s.pF}"></div></div>
    <div id="macroInfo" class="small ${tot === 100 ? "muted" : "warn"}" style="margin-top:8px">${macroInfoText(s.pP, s.pC, s.pF, s.kcal)}</div>
    <label>Zielgewicht (kg, optional)</label><input type="text" inputmode="decimal" id="sGoalW" value="${esc(s.goalWeight)}">
    <button class="btn block" style="margin-top:12px" data-act="saveGoals">Ziele speichern</button></div>
  <h2>Design</h2><div class="card">
    <label style="margin-top:0">Darstellung</label><div class="chips">${[["auto", "Automatisch"], ["dark", "Dunkel"], ["light", "Hell"]].map(([v, l]) => `<button class="chip ${s.mode === v ? "on" : ""}" data-act="mode" data-v="${v}">${l}</button>`).join("")}</div>
    <label>Akzentfarbe</label><div class="swatches">${ACCENTS.map(c => `<button class="sw ${s.accent.toLowerCase() === c ? "on" : ""}" style="background:${c}" data-act="accent" data-v="${c}"></button>`).join("")}<input type="color" id="sAccent" value="${s.accent}"></div></div>
  <h2>Foto-KI</h2><div class="card">
    <div class="muted small">Für die Foto-Erkennung wird ein eigener Anthropic-API-Schlüssel benötigt. Er wird nur auf diesem Gerät gespeichert und direkt an die Anthropic-API gesendet.</div>
    <label>API-Schlüssel</label><input type="password" id="sKey" value="${esc(s.apiKey)}" placeholder="sk-ant-…" autocomplete="off">
    <label>Modell</label><input type="text" id="sModel" value="${esc(s.model)}">
    <button class="btn sec block" style="margin-top:12px" data-act="saveAI">Speichern</button></div>
  <h2>Meine Lebensmittel (${D.foods.length})</h2><div class="card">
    <div class="grid2"><button class="btn sec" data-act="foodsManage">Verwalten</button><button class="btn sec" data-act="foodNew">+ Neu</button>
    <button class="btn sec" data-act="csvImport">CSV importieren</button><button class="btn sec" data-act="csvExport">CSV exportieren</button></div>
    <button class="btn sec block" style="margin-top:10px" data-act="csvTemplate">CSV-Vorlage herunterladen</button>
    <input type="file" id="csvFile" accept=".csv,text/csv,text/plain" hidden></div>
  <h2>Daten</h2><div class="card">
    <div class="grid2"><button class="btn sec" data-act="backup">Backup (JSON)</button><button class="btn sec" data-act="restore">Backup laden</button></div>
    <input type="file" id="jsonFile" accept=".json,application/json" hidden>
    <button class="btn danger block" style="margin-top:10px" data-act="wipe">Alle Daten löschen</button></div>
  <div class="muted tiny center">Nährwertdaten: Open Food Facts (ODbL)</div>`;
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
  const mealSel = `<select id="aMeal" style="margin-bottom:12px">${MEALS.map(m => `<option value="${m.id}" ${m.id === ui.meal ? "selected" : ""}>${m.icon} ${m.name} – ${niceDate(ui.date)}</option>`).join("")}</select>`;
  const tabs = [["search", "Suchen"], ["scan", "Scannen"], ["photo", "Foto-KI"], ["manual", "Manuell"]];
  const s = sheet(`<h3>Lebensmittel hinzufügen</h3>${mealSel}
    <div class="seg">${tabs.map(([v, l]) => `<button data-at="${v}" class="${addTab === v ? "on" : ""}">${l}</button>`).join("")}</div><div id="addBody"></div>`);
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
  else bodyManual(b);
}

function foodLine(f) {
  return `<div class="grow"><div>${esc(f.name)}</div><div class="muted tiny">${f.brand ? esc(f.brand) + " · " : ""}${r0(f.kcal)} kcal · E ${r1(f.protein)} · KH ${r1(f.carbs)} · F ${r1(f.fat)} <span class="tiny">/100 g</span></div></div>`;
}
function bodySearch(b) {
  b.innerHTML = `<div class="row"><input type="search" id="q" placeholder="Name oder Marke …" autocomplete="off"><button class="btn" id="qGo">🔍</button></div>
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
      o.innerHTML = `<h2>Open Food Facts</h2>` + (list.length ? list.map((f, i) => `<div class="res" data-oi="${i}">${foodLine(f)}</div>`).join("") : `<div class="muted small">Nichts gefunden.</div>`);
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
    <label>Mahlzeit</label><select id="pm">${MEALS.map(m => `<option value="${m.id}" ${m.id === ui.meal ? "selected" : ""}>${m.icon} ${m.name}</option>`).join("")}</select>
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
    <div class="grid2" style="margin-top:10px"><button class="btn" id="cam">📷 Foto aufnehmen</button><button class="btn sec" id="gal">🖼️ Aus Galerie</button></div>
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

/* Eintrag bearbeiten */
function editEntry(id) {
  const e = D.entries.find(x => x.id === id); if (!e) return;
  const s = sheet(`<h3>${esc(e.name)}</h3><div class="muted small">${r0(e.kcal)} kcal · E ${r1(e.p)} · KH ${r1(e.c)} · F ${r1(e.f)}</div>
    <label>Menge (g)</label><input type="text" inputmode="decimal" id="eg" value="${r0(e.grams)}">
    <label>Mahlzeit</label><select id="em">${MEALS.map(m => `<option value="${m.id}" ${m.id === e.meal ? "selected" : ""}>${m.icon} ${m.name}</option>`).join("")}</select>
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
  else if (a === "foodsManage") foodsManage();
  else if (a === "foodNew") foodEdit(null);
  else if (a === "csvImport") $("#csvFile").click();
  else if (a === "csvExport") { if (!D.foods.length) return toast("Noch keine Lebensmittel"); exportFile("meine-lebensmittel.csv", new Blob([foodsToCsv(D.foods)], { type: "text/csv" })); }
  else if (a === "csvTemplate") exportFile("lebensmittel-vorlage.csv", new Blob([foodsToCsv([
    { name: "Haferflocken", brand: "", barcode: "", kcal: 372, fat: 7, carbs: 59, sugar: 1, protein: 13.5, fiber: 10, serving: 40 },
    { name: "Hähnchenbrust roh", brand: "", barcode: "", kcal: 106, fat: 1.2, carbs: 0, sugar: 0, protein: 23.5, fiber: 0, serving: 150 }])], { type: "text/csv" }));
  else if (a === "backup") exportFile("ernaehrung-backup-" + iso(new Date()) + ".json", new Blob([JSON.stringify(D)], { type: "application/json" }));
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
applyTheme();
if (window.matchMedia) matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => { if (D.settings.mode === "auto") applyTheme(); });
render();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => { });
window.__ern = { get D() { return D; }, importCsv, parseCsv, foodsToCsv, mapOff };
