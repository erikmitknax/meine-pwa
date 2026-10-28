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
  ver: 3, foods: [], recipes: [], entries: [], weights: {}, coffee: {},
  settings: { kcal: 2200, pP: 30, pC: 40, pF: 30, mode: "auto", accent: "#12935f", geminiKey: "", geminiModel: "gemini-2.5-flash-lite", goalWeight: "", weightGate: true, coffeeSleep: "23:00", coffeeGap: 3, coffeeMl: 200, coffeeMg100: 40, coffeeRest: 30 },
});
let D = load();
let ui = { setOpen: {}, tab: "today", date: iso(new Date()), weekOffset: 0, period: 7, wRange: 90, meal: "b", open: {} };

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
  if (typeof syOnSave === "function") syOnSave();
}
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
/* Zahl aus Text lesen, auch aus Eingaben wie "<0,1", "ca. 2,5 g", "~3" oder "1,2 g" (erste Zahl zählt; "Spuren", "-", "k. A." ergeben 0) */
const num = v => { const m = String(v ?? "").replace(",", ".").match(/-?\d*\.?\d+/); const n = m ? parseFloat(m[0]) : NaN; return isFinite(n) ? n : 0; };
const r0 = n => Math.round(n);
const r1 = n => Math.round(n * 10) / 10;
const r2 = n => Math.round(n * 100) / 100;
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
/* Uhrzeit neuer Einträge: jetzt, aber nur wenn der Tag heute ist (bei Nachträgen für andere Tage bleibt sie leer) */
const timeOk = t => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
function nowT() { const d = new Date(), z = n => String(n).padStart(2, "0"); return z(d.getHours()) + ":" + z(d.getMinutes()); }
const stamp = () => ui.date === iso(new Date()) ? { t: nowT() } : {};

/* ---- Weitere Nährstoffe (wie auf dem Etikett): Zucker, Ballaststoffe, gesättigte Fettsäuren, Salz ---- */
/* Lebensmittel/Zutaten: Feld fk pro 100 g · Tagebuch-Eintrag: Feld ek in g (Momentaufnahme) */
const MICRO = [
  { fk: "sugar", ek: "s", name: "Zucker" },
  { fk: "fiber", ek: "fi", name: "Ballaststoffe" },
  { fk: "sat", ek: "sa", name: "Gesättigte Fettsäuren" },
  { fk: "salt", ek: "sl", name: "Salz" },
];
const hasN = v => typeof v === "number" && isFinite(v);
function microOf(food, grams) { const o = {}, k = grams / 100; MICRO.forEach(m => { if (hasN(food[m.fk])) o[m.ek] = food[m.fk] * k; }); return o; }
function pick100(o) { const r = {}; MICRO.forEach(m => { if (hasN(o[m.fk])) r[m.fk] = o[m.fk]; }); return r; }
/* Summe aus Zutaten (nur wenn alle aktiven Zutaten den Wert kennen, sonst unbekannt) */
function microFromIngs(ings) {
  const on = (ings || []).filter(i => !i.off), o = {};
  MICRO.forEach(m => { if (on.length && on.every(i => hasN(i[m.fk]))) o[m.ek] = on.reduce((a, i) => a + i[m.fk] * i.grams / 100, 0); });
  return o;
}
function microSum(list) {
  const t = {}, miss = {};
  MICRO.forEach(m => { t[m.ek] = 0; miss[m.ek] = 0; });
  list.forEach(e => MICRO.forEach(m => { if (hasN(e[m.ek])) t[m.ek] += e[m.ek]; else miss[m.ek]++; }));
  return { ...t, miss };
}
function scaleMicro(e, k) { MICRO.forEach(m => { if (hasN(e[m.ek])) e[m.ek] *= k; }); }
/* Fehlende Werte älterer Einträge aus Zutaten, gespeicherten Lebensmitteln bzw. Rezepten nachtragen */
function fillMissingMicro(list) {
  let changed = 0;
  list.forEach(e => {
    const need = MICRO.filter(m => !hasN(e[m.ek])); if (!need.length || !(e.grams > 0)) return;
    let src = null;
    if (Array.isArray(e.ings) && e.ings.length) src = microFromIngs(e.ings);
    if (!src || !need.some(m => hasN(src[m.ek]))) {
      const nm = String(e.name || "").toLowerCase();
      const f = D.foods.find(x => x.name.toLowerCase() === nm && (!e.brand || (x.brand || "").toLowerCase() === String(e.brand).toLowerCase()));
      if (f) src = microOf(f, e.grams);
      else {
        const r = recipeFor(e), tt = r && r.items && r.items.length ? recipeTotals(r) : null;
        if (tt && tt.kcal > 0) { const k = e.kcal / tt.kcal, base = microFromIngs(r.items); src = {}; MICRO.forEach(m => { if (hasN(base[m.ek])) src[m.ek] = base[m.ek] * k; }); }
      }
    }
    if (!src) return;
    let got = false; need.forEach(m => { if (hasN(src[m.ek])) { e[m.ek] = src[m.ek]; got = true; } });
    if (got) changed++;
  });
  return changed;
}
function calc(food, grams) {
  const k = grams / 100;
  return { kcal: food.kcal * k, p: food.protein * k, c: food.carbs * k, f: food.fat * k };
}

/* Preis: food.price (€) gilt für food.priceG (g/ml) */
const eurFmt = v => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const hasPrice = f => f && f.price > 0 && f.priceG > 0;
const priceOf = (f, grams) => hasPrice(f) ? f.price * grams / f.priceG : undefined;

/* ---- Kaffee-Zähler in ml: D.coffee[datum] = Liste { t: Uhrzeit oder "", ml } (ältere Tage: Liste von Uhrzeiten = je eine Portion) ---- */
const CF_HALF = 5, CF_DAY_MAX = 400; // Halbwertszeit Koffein ca. 5 h, Tageslimit 400 mg (EFSA)
function cfCfg() {
  const s = D.settings, n = (v, def, lo, hi) => { const x = num(v); return x >= lo && x <= hi ? x : def; };
  return { sleep: timeOk(s.coffeeSleep) ? s.coffeeSleep : "23:00", gap: n(s.coffeeGap, 3, 0.5, 12), ml: n(s.coffeeMl, 200, 20, 1000), mg100: n(s.coffeeMg100, 40, 5, 300), rest: n(s.coffeeRest, 30, 5, 150) };
}
const cupsOf = d => (D.coffee && Array.isArray(D.coffee[d]) ? D.coffee[d] : []).map(x => typeof x === "string" ? { t: x, ml: cfCfg().ml } : { t: x.t || "", ml: num(x.ml) || cfCfg().ml });
const mlOf = d => cupsOf(d).reduce((a, c) => a + c.ml, 0);
const mgOfMl = ml => ml * cfCfg().mg100 / 100;
const fmtMl = ml => ml >= 1000 ? nde(ml / 1000, 2) + " l" : r0(ml) + " ml";
function coffeeLine(d) {
  const cu = cupsOf(d), tt = cu.filter(x => timeOk(x.t)); if (!cu.length) return "";
  return `Kaffee: ${r0(mlOf(d))} ml${tt.length ? " (" + tt.map(x => x.t + " " + r0(x.ml) + " ml").join(", ") + ")" : ""}, ca. ${r0(mgOfMl(mlOf(d)))} mg Koffein (Schätzung)`;
}
const CF_STEP = 100; // ml pro Tipp auf + / −
function coffeeAdd(d, ml) { D.coffee = D.coffee || {}; D.coffee[d] = cupsOf(d).concat([{ t: d === iso(new Date()) ? nowT() : "", ml: ml > 0 ? ml : CF_STEP }]); save(); render(); }
/* − nimmt 100 ml von der letzten Portion weg (ist sie kleiner, verschwindet sie) */
function coffeeRemove(d) {
  const l = cupsOf(d), x = l[l.length - 1]; if (!x) return;
  if (x.ml > CF_STEP + 0.5) x.ml -= CF_STEP; else l.pop();
  if (l.length) D.coffee[d] = l; else if (D.coffee) delete D.coffee[d]; save(); render();
}
/* Seite zum Bearbeiten aller Kaffee-Einträge eines Tages (Uhrzeit, Menge, Löschen, Hinzufügen) */
function coffeeEditSheet(d) {
  const rows = cupsOf(d).map(x => ({ t: x.t, ml: x.ml })), today = d === iso(new Date());
  const s = sheet(`<h3>Kaffee bearbeiten</h3><div class="muted small" style="margin:-6px 0 12px">${niceDate(d)}, ${fromIso(d).toLocaleDateString("de-DE", { day: "numeric", month: "long" })}. Ändere Uhrzeit und Menge oder lösche einen Eintrag.</div><div id="ceList"></div>
    <button class="btn sec block" style="margin-top:10px" id="ceAdd">+ Eintrag hinzufügen</button>
    <button class="btn block" style="margin-top:14px" id="ceSave">Speichern</button><button class="btn sec block" style="margin-top:8px" id="ceCancel">Abbrechen</button>`);
  const draw = () => {
    $("#ceList", s).innerHTML = rows.length ? rows.map((x, i) => `<div class="cerow" data-i="${i}"><input type="time" data-ce="t" value="${timeOk(x.t) ? x.t : ""}" aria-label="Uhrzeit"><div class="cemlw"><input type="text" inputmode="decimal" data-ce="ml" value="${String(Math.round(x.ml * 10) / 10).replace(".", ",")}" aria-label="Menge in ml"><span class="muted small">ml</span></div><button class="iconbtn" data-ce="del" aria-label="Eintrag löschen">${icon("trash", 18)}</button></div>`).join("") : `<div class="muted center" style="padding:18px 10px">Keine Einträge an diesem Tag.</div>`;
    $$(".cerow", s).forEach(r => {
      const i = +r.dataset.i;
      $('[data-ce="t"]', r).oninput = e => { rows[i].t = e.target.value; };
      $('[data-ce="ml"]', r).oninput = e => { rows[i].ml = num(e.target.value); };
      $('[data-ce="del"]', r).onclick = () => { rows.splice(i, 1); draw(); };
    });
  };
  draw();
  $("#ceAdd", s).onclick = () => { rows.push({ t: today ? nowT() : "", ml: CF_STEP }); draw(); const l = $$(".cerow", s); if (l.length) $('[data-ce="ml"]', l[l.length - 1]).focus(); };
  $("#ceCancel", s).onclick = closeSheet;
  $("#ceSave", s).onclick = () => {
    if (rows.some(x => !(x.ml > 0 && x.ml <= 2000))) return toast("Jede Menge muss zwischen 1 und 2000 ml liegen");
    const out = rows.map(x => ({ t: timeOk(x.t) ? x.t : "", ml: Math.round(x.ml * 10) / 10 })).sort((a, b) => (a.t || "99:99").localeCompare(b.t || "99:99"));
    D.coffee = D.coffee || {}; if (out.length) D.coffee[d] = out; else delete D.coffee[d];
    save(); closeSheet(); render(); toast("Gespeichert");
  };
}
function coffeeCustom(d) {
  const el = $("#cfCustom"), v = el ? num(el.value) : 0;
  if (!(v > 0) || v > 2000) return toast("Bitte eine Menge zwischen 1 und 2000 ml eingeben");
  coffeeAdd(d, Math.round(v * 10) / 10);
}
const hm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
/* Plan für heute: wann der nächste Kaffee okay ist, bis wann der letzte und wie viel noch passt,
   damit zur Schlafenszeit höchstens "Rest" mg Koffein im Körper sind (Abbau mit Halbwertszeit). */
function coffeePlan(d) {
  const c = cfCfg(), now = tMin(nowT()), cups = cupsOf(d), timed = cups.filter(x => timeOk(x.t)).map(x => ({ m: tMin(x.t), mg: mgOfMl(x.ml) })).sort((x, y) => x.m - y.m);
  let B = tMin(c.sleep); if (B < 360) B += 1440; // Schlafen nach Mitternacht
  const dec = (mg, from, to) => mg * Math.pow(0.5, (to - from) / (CF_HALF * 60)), mgP = mgOfMl(c.ml);
  let R = timed.reduce((a, x) => a + (x.m <= B ? dec(x.mg, x.m, B) : 0), 0), tot = cups.reduce((a, x) => a + mgOfMl(x.ml), 0);
  const level = timed.reduce((a, x) => a + (x.m <= now ? dec(x.mg, x.m, now) : 0), 0);
  const last = timed.length ? timed[timed.length - 1].m : null;
  const nextOk = last != null ? Math.max(now, last + c.gap * 60) : now;
  const ts = []; let t = Math.ceil(nextOk / 5) * 5;
  const R0 = R, tot0 = tot;
  while (t < B) { const add = dec(mgP, t, B); if (R + add > c.rest + 1e-9 || tot + mgP > CF_DAY_MAX) break; ts.push(t); R += add; tot += mgP; t += c.gap * 60; }
  let latest = null; const budget = c.rest - R0;
  if (tot0 + mgP <= CF_DAY_MAX && budget > 0) { latest = budget >= mgP ? B : B - CF_HALF * 60 * Math.log2(mgP / budget); if (latest < now) latest = null; }
  const why = tot0 + mgP > CF_DAY_MAX ? "limit" : ts.length ? "" : "sleep";
  return { c, B, level, nextOk, ts, latest, why, tot0 };
}
function coffeeCard(d) {
  const cups = cupsOf(d), ml = mlOf(d), ts = cups.filter(x => timeOk(x.t)).map(x => x.t), cf = cfCfg(), isToday = d === iso(new Date());
  let plan = "";
  if (isToday) {
    const P = coffeePlan(d), lv = P.level >= 5 ? `<div class="muted tiny">Aktuell etwa ${r0(P.level)} mg Koffein im Körper</div>` : "";
    if (P.ts.length) {
      const first = P.ts[0], nowM = tMin(nowT());
      plan = `<div class="cf-plan"><div class="cf-big ${first <= nowM + 4 ? "ok" : ""}">${first <= nowM + 4 ? "Jetzt wieder möglich" : "Nächster Kaffee ab " + hm(first)}</div>
        <div class="muted small">${P.latest != null && P.latest < P.B ? "Letzter Kaffee spätestens um " + hm(P.latest) + " (Schlafen " + cf.sleep + "). " : ""}Noch bis zu ${fmtMl(P.ts.length * cf.ml)} heute: ${P.ts.map(hm).join(" · ")} (je ${r0(cf.ml)} ml)</div>${lv}</div>`;
    } else plan = `<div class="cf-plan"><div class="cf-big stop">${P.why === "limit" ? "Tageslimit erreicht" : "Heute lieber kein Kaffee mehr"}</div>
      <div class="muted small">${P.why === "limit" ? "Mit " + r0(P.tot0) + " mg Koffein bist du beim Limit von " + CF_DAY_MAX + " mg pro Tag." : "Weiterer Kaffee ließe bis " + cf.sleep + " zu viel Koffein im Körper (mehr als " + cf.rest + " mg)."}</div>${lv}</div>`;
  }
  return `<section class="coffeecard"><div class="cf-top"><div class="cf-l"><span class="cf-ic" aria-hidden="true">☕</span><div><b>Kaffee</b><div class="muted tiny">${cups.length ? `${r0(ml)} ml · ca. ${r0(mgOfMl(ml))} mg Koffein${ts.length ? " · " + ts.join(", ") : ""}` : "Noch kein Kaffee an diesem Tag"}</div></div></div>
    <div class="cf-r"><button class="iconbtn" data-act="coffeeEdit" aria-label="Kaffee-Einträge bearbeiten">${icon("pen", 18)}</button><button class="iconbtn" data-act="coffeeDel" aria-label="100 ml weniger" ${cups.length ? "" : "disabled"}>−</button><b class="cf-n">${r0(ml)}<small>ml</small></b><button class="iconbtn" data-act="coffeeAdd" aria-label="100 ml mehr">+</button></div></div>
    <div class="cf-custom"><input type="text" inputmode="decimal" id="cfCustom" placeholder="Eigene Menge (ml)" autocomplete="off"><button class="btn sec" data-act="coffeeCustom">Hinzufügen</button></div>
    <div class="muted tiny" style="margin-top:6px">+ und − ändern um ${CF_STEP} ml, mit „Hinzufügen“ trägst du eine eigene Menge ein.</div>
    ${plan}
    <div class="cf-sleep"><label for="cfSleep">Schlafen um</label><input type="time" id="cfSleep" value="${cf.sleep}"></div>
    <details class="cf-set"><summary>Annahmen anpassen</summary>
      <div class="grid2"><div><label>Typische Menge pro Kaffee für die Planung (ml)</label><input type="text" inputmode="decimal" id="cfMl" value="${r0(cf.ml)}"></div><div><label>mg Koffein pro 100 ml</label><input type="text" inputmode="decimal" id="cfMg" value="${cf.mg100}"></div></div>
      <div class="grid2"><div><label>Pause zwischen zwei Kaffees (Std.)</label><input type="text" inputmode="decimal" id="cfGap" value="${String(cf.gap).replace(".", ",")}"></div><div><label>Erlaubter Koffein-Rest beim Einschlafen (mg)</label><input type="text" inputmode="decimal" id="cfRest" value="${cf.rest}"></div></div>
      <div class="muted tiny" style="margin-top:8px">Rechnung: Koffein wird mit einer Halbwertszeit von ca. ${CF_HALF} Stunden abgebaut. Die App plant Portionen so, dass zur Schlafenszeit höchstens der erlaubte Rest übrig ist und du ${CF_DAY_MAX} mg pro Tag nicht überschreitest. Nur Einträge mit Uhrzeit zählen für den Abbau. Filterkaffee hat grob 40 mg pro 100 ml, Espresso etwa 200 mg. Das ist eine grobe Orientierung, keine medizinische Beratung.</div></details></section>`;
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
  weightGate();
}

/* ---- Morgendliche Gewichts-Abfrage (ab 6 Uhr, bis Gewicht oder "Heute überspringen") ---- */
const GATE_HOUR = 6;
function gateSkipped() { try { return localStorage.getItem("foodpro.wskip") === iso(new Date()); } catch (e) { return false; } }
function weightGate() {
  const now = new Date(), t = iso(now), el = $("#wGate");
  const need = D.settings.weightGate !== false && now.getHours() >= GATE_HOUR && D.weights[t] == null && !gateSkipped();
  if (!need) { if (el) el.remove(); return; }
  if (el) return;
  const last = weightList().slice(-1)[0];
  const g = document.createElement("div");
  g.id = "wGate"; g.className = "wgate";
  g.innerHTML = `<div class="wgbox"><div class="wgico">${icon("weight", 30, 2)}</div>
    <h2>Gewicht eintragen</h2><p class="muted">Wie viel wiegst du heute? Am besten morgens nach dem Aufstehen.</p>
    <input type="text" inputmode="decimal" id="wgVal" placeholder="0,0" autocomplete="off">
    <div class="small muted" style="margin:6px 2px 0">kg${last ? ` · zuletzt ${nde(last.w)} kg am ${fromIso(last.d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}` : ""}</div>
    <button class="btn block" id="wgOk" style="margin-top:16px">Speichern</button>
    <button class="linkbtn" id="wgSkip" style="margin-top:12px">Heute überspringen</button></div>`;
  document.body.append(g);
  const ok = () => {
    const w = num($("#wgVal").value);
    if (!(w >= 20 && w <= 400)) { toast("Bitte ein gültiges Gewicht eingeben"); return; }
    D.weights[iso(new Date())] = r1(w); save(); render(); toast("Gewicht gespeichert");
  };
  $("#wgOk").onclick = ok;
  $("#wgVal").addEventListener("keydown", e => { if (e.key === "Enter") ok(); });
  $("#wgSkip").onclick = () => { try { localStorage.setItem("foodpro.wskip", iso(new Date())); } catch (e) { } g.remove(); };
  setTimeout(() => { try { $("#wgVal").focus(); } catch (e) { } }, 50);
}
setInterval(() => { if (typeof D !== "undefined") weightGate(); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) weightGate(); });

const IC = {
  today: '<path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  week: '<path d="M5 20v-8M12 20V4M19 20v-5"/>',
  weight: '<path d="M4.5 18a8 8 0 1 1 15 0"/><path d="m12 17 3.5-5"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M5 7h14M10 11v6M14 11v6M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2"/>',
};
const icon = (n, s = 22, w = 2) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${IC[n]}</svg>`;
const fmt = n => Math.round(n).toLocaleString("de-DE");
const TABS = [["today", "Heute"], ["week", "Zeitraum"], null, ["weight", "Gewicht"], ["settings", "Einstellungen"]];
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
        <div class="kcal">${fmt(e.kcal)}<small>kcal</small></div></div>`).join("")}</div><div class="mealtools">${es.length > 1 ? `<button class="linkbtn" data-act="mealToRecipe" data-meal="${m.id}">Als Rezept speichern</button>` : ""}<button class="linkbtn del" data-act="clearMeal" data-meal="${m.id}">${es.length > 1 ? "Alle " + es.length + " Einträge löschen" : "Eintrag löschen"}</button></div>` : "")
        : `<button class="empty" data-act="add" data-meal="${m.id}">${icon("plus", 18, 2.4)}${m.name} eintragen</button>`) + `</section>`;
  }).join("");
  const full = fromIso(ui.date).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  return `<header class="top"><div class="brand"><img class="logo" src="icons/logo.svg" alt="">FoodPro</div><button class="ghost" data-act="pickDate" aria-label="Datum wählen">${icon("cal", 20)}</button></header>
  ${weekStrip()}
  <section class="hero ${g.kcal > 0 && t.kcal >= g.kcal ? "over" : ""}" data-act="dayChart" role="button" tabindex="0" aria-label="Tagesübersicht öffnen"><div class="ht"><span>${niceDate(ui.date) === full ? full : niceDate(ui.date) + ", " + full}</span><span class="hchev">Ziel ${fmt(g.kcal)} ${icon("right", 16, 2.4)}</span></div>
    <div class="hn"><b>${fmt(Math.abs(left))}</b><span>${left >= 0 ? "kcal übrig" : "kcal drüber"}</span></div>
    <div class="hbar"><i style="width:${pct}%"></i></div><div class="hf">${fmt(t.kcal)} kcal gegessen</div></section>
  <section class="macros" data-act="dayChart" role="button" tabindex="0" aria-label="Tagesübersicht öffnen">${macroCol("Eiweiß", t.p, g.p, "p")}${macroCol("Kohlenhydrate", t.c, g.c, "c")}${macroCol("Fett", t.f, g.f, "f")}</section>
  ${meals}
  ${coffeeCard(ui.date)}
  <button class="btn sec block gapbtn" data-act="nutri">Nährstoffe im Detail</button>
  <button class="btn block gapbtn" data-act="gaps">${icon("plus", 18, 2.4)}KI-Vorschläge für eine Mahlzeit</button>
  <section class="exportcard"><b>Tag exportieren</b><div class="muted small">Alles, was du an diesem Tag gegessen hast, inkl. Rezept-Zutaten, als Textdatei – z. B. für eine KI-Analyse.</div>
    <div class="grid2"><button class="btn" data-act="exportDay">Als Datei</button><button class="btn sec" data-act="copyDay">Kopieren</button></div></section>
  <section class="exportcard"><b>Kosten des Tages</b><div class="muted small">Was dein Tag gekostet hat, berechnet aus den Preisen deiner Lebensmittel (bei Rezepten anteilig pro Zutat).</div>
    <button class="btn block" data-act="costDay">Kosten berechnen</button></section>`;
}

/* ---- Woche ---- */
function periodDays(offset, n) {
  const today = iso(new Date());
  const end = addDays(today, offset * n);
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}
/* Eigener Zeitraum (Von/Bis), höchstens 366 Tage, nie in der Zukunft */
function customRange() {
  const today = iso(new Date());
  let to = ui.cTo && ui.cTo <= today ? ui.cTo : today, from = ui.cFrom && ui.cFrom <= to ? ui.cFrom : addDays(to, -13);
  if (from < addDays(to, -365)) from = addDays(to, -365);
  ui.cFrom = from; ui.cTo = to; return { from, to };
}
function curDays() {
  if (ui.period !== 0) return periodDays(ui.weekOffset, ui.period);
  const { from, to } = customRange(), out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
function viewWeek() {
  const g = goals(), days = curDays(), N = days.length, custom = ui.period === 0, todayIso0 = iso(new Date());
  const rows = days.map(d => ({ d, ...sum(dayEntries(d)), n: dayEntries(d).length }));
  const logged = rows.filter(r => r.n), L = logged.length || 1;
  const avg = logged.reduce((a, r) => ({ kcal: a.kcal + r.kcal, p: a.p + r.p, c: a.c + r.c, f: a.f + r.f }), { kcal: 0, p: 0, c: 0, f: 0 });
  const hit = logged.filter(r => Math.abs(r.kcal - g.kcal) <= g.kcal * 0.1).length;
  const avgK = avg.kcal / L, diff = avgK - g.kcal;
  const W = 340, H = 190, pad = 24;
  const max = Math.max(g.kcal * 1.25, ...rows.map(r => r.kcal), 1);
  const y = v => H - pad - (v / max) * (H - pad - 16);
  const step = (W - 12) / N, bw = N <= 7 ? 30 : Math.max(N > 120 ? 1 : 2, step * 0.62), rx = Math.min(10, bw / 2.4);
  const todayIso = iso(new Date());
  const bars = rows.map((r, i) => {
    const x = 6 + i * step + (step - bw) / 2, h = Math.max(H - pad - y(r.kcal), r.n ? 4 : 0);
    const over = r.kcal > g.kcal * 1.1, dd = fromIso(r.d);
    let lab = "";
    if (N <= 7) lab = WD[dd.getDay()];
    else if (N <= 31) lab = (i % 5 === 0 || i === N - 1) ? String(dd.getDate()) : "";
    else if (N > 100 && N <= 366 && custom) lab = (dd.getDate() === 1 && dd.getMonth() % (N > 200 ? 2 : 1) === 0) ? dd.toLocaleDateString("de-DE", { month: "short" }) : "";
    else lab = (dd.getDate() === 1) ? dd.toLocaleDateString("de-DE", { month: "short" }) : "";
    const val = N <= 7 && r.n ? (h > 44 ? `<text x="${x + bw / 2}" y="${H - pad - h + 15}" text-anchor="middle" style="fill:#fff;font-weight:700;font-size:10px">${fmt(r.kcal)}</text>` : `<text x="${x + bw / 2}" y="${H - pad - h - 6}" text-anchor="middle" style="fill:var(--text)">${fmt(r.kcal)}</text>`) : "";
    return `<g data-act="goDay" data-d="${r.d}" style="cursor:pointer"><rect x="${x}" y="${H - pad - (r.n ? h : (N <= 7 ? 4 : 2))}" width="${bw}" height="${r.n ? h : (N <= 7 ? 4 : 2)}" rx="${rx}" fill="${r.n ? (over ? "var(--danger)" : "var(--accent)") : "var(--card2)"}"/>
    ${lab ? `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" ${r.d === todayIso ? 'style="fill:var(--text)"' : ""}>${lab}</text>` : ""}${val}</g>`;
  }).join("");
  const chart = `<svg viewBox="0 0 ${W} ${H}" width="100%"><line x1="0" x2="${W}" y1="${y(g.kcal)}" y2="${y(g.kcal)}" stroke="var(--muted)" stroke-dasharray="3 5" opacity=".6"/>${bars}</svg><div class="goalkey"><i></i>Ziel ${fmt(g.kcal)} kcal</div>`;
  // Typische Wochentage (letzte 8 Wochen)
  const today = iso(new Date()), byWd = {};
  for (let i = 0; i < 56; i++) { const d = addDays(today, -i), es = dayEntries(d); if (es.length) (byWd[fromIso(d).getDay()] = byWd[fromIso(d).getDay()] || []).push(sum(es).kcal); }
  const avgWd = w => byWd[w] ? byWd[w].reduce((a, b) => a + b, 0) / byWd[w].length : 0;
  const wdMax = Math.max(g.kcal * 1.2, ...WD_ORDER.map(avgWd), 1);
  const wdBars = WD_ORDER.map(w => { const v = avgWd(w); return `<div class="col ${v ? "" : "none"}">${v ? `<b>${fmt(v)}</b>` : ""}<i style="height:${v ? v / wdMax * 70 : 4}px;${v > g.kcal * 1.1 ? "background:var(--danger)" : ""}"></i>${WD[w]}</div>`; }).join("");
  const dl = x => fromIso(x).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  const dly = x => fromIso(x).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
  const label = custom ? (N === 1 ? dly(days[0]) : dly(days[0]) + " – " + dly(days[N - 1])) : ui.weekOffset === 0 ? "Letzte " + N + " Tage" : dl(days[0]) + " – " + dl(days[N - 1]);
  return `<h1>Zeitraum</h1>
  <div class="seg">${[[7, "7 Tage"], [30, "30 Tage"], [90, "90 Tage"], [0, "Eigener"]].map(([v, l]) => `<button data-act="period" data-v="${v}" class="${(custom ? v === 0 : N === v) ? "on" : ""}">${l}</button>`).join("")}</div>
  <div class="row between" style="margin-bottom:14px"><button class="iconbtn" data-act="wk" data-d="-1" aria-label="Vorheriger Zeitraum">${icon("left", 20)}</button><b>${label}</b><button class="iconbtn" data-act="wk" data-d="1" aria-label="Nächster Zeitraum" ${(custom ? ui.cTo >= todayIso0 : ui.weekOffset >= 0) ? "disabled" : ""}>${icon("right", 20)}</button></div>
  ${custom ? `<div class="grid2" style="margin:-4px 0 14px"><div><label style="margin-top:0">Von</label><input type="date" id="cFrom" value="${ui.cFrom}" max="${todayIso0}"></div><div><label style="margin-top:0">Bis</label><input type="date" id="cTo" value="${ui.cTo}" max="${todayIso0}"></div></div>
  <div class="row" style="gap:8px;flex-wrap:wrap;margin:-6px 0 14px">${[["Diese Woche", "w"], ["Dieser Monat", "m"], ["Letzte 14 Tage", "14"], ["Dieses Jahr", "y"]].map(([l, k]) => `<button class="tcchip" data-act="cpreset" data-k="${k}">${l}</button>`).join("")}</div>` : ""}
  ${logged.length ? `<div class="bignum"><b>${fmt(avgK)}</b><span>kcal pro Tag</span><span class="pill ${Math.abs(diff) <= g.kcal * .1 ? "good" : diff > 0 ? "bad" : ""}">${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff))} zum Ziel</span></div>` : `<div class="muted" style="margin:0 4px 14px">In diesem Zeitraum gibt es noch keine Einträge.</div>`}
  <div class="surface">${chart}</div>
  ${logged.length ? `<div class="muted small" style="margin:12px 4px 0">${hit} von ${logged.length} ${logged.length === 1 ? "Tag" : "Tagen"} im Zielbereich (±10 %)</div>
  ${(() => { const tot = days.reduce((a, d) => a + mlOf(d), 0); return tot ? `<div class="muted small" style="margin:6px 4px 0">☕ Kaffee: ${fmtMl(tot)} im Zeitraum, Ø ${r0(tot / L)} ml pro erfasstem Tag</div>` : ""; })()}
  <section class="macros" style="margin-top:20px">${macroCol("Ø Eiweiß", avg.p / L, g.p, "p")}${macroCol("Ø Kohlenh.", avg.c / L, g.c, "c")}${macroCol("Ø Fett", avg.f / L, g.f, "f")}</section>` : ""}
  <section class="exportcard"><b>Zeitraum exportieren</b><div class="muted small">${label}: alle Tage mit Mahlzeiten, Nährwerten und Rezept-Zutaten als Textdatei, z. B. für eine KI-Analyse.</div>
    <div class="grid2"><button class="btn" data-act="exportRange">Als Datei</button><button class="btn sec" data-act="copyRange">Kopieren</button></div></section>
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
    <label class="toggle"><span>Morgens nach Gewicht fragen (ab 6 Uhr)</span><input type="checkbox" id="wGateOn" ${s.weightGate !== false ? "checked" : ""}></label>
    <button class="btn block" style="margin-top:16px" data-act="saveGoals">Ziele speichern</button></div>
  `)}
  ${acc("design", `Design`, `<div class="panel">
    <label>Darstellung</label><div class="chips">${[["auto", "Automatisch"], ["dark", "Dunkel"], ["light", "Hell"]].map(([v, l]) => `<button class="chip ${s.mode === v ? "on" : ""}" data-act="mode" data-v="${v}">${l}</button>`).join("")}</div>
    <label>Akzentfarbe</label><div class="swatches">${ACCENTS.map(c => `<button class="sw ${s.accent.toLowerCase() === c ? "on" : ""}" style="background:${c}" data-act="accent" data-v="${c}" aria-label="Farbe ${c}"></button>`).join("")}<input type="color" id="sAccent" value="${s.accent}" aria-label="Eigene Farbe"></div></div>
  `)}
  ${acc("ai", `KI-Erkennung (Gemini)`, `<div class="panel">
    <div class="muted small" style="margin-top:14px">Die Foto-Erkennung nutzt Google Gemini. Das Gratis-Kontingent reicht für den Alltag, der Schlüssel bleibt nur auf diesem Gerät und geht direkt an Google. Bei kostenloser Nutzung kann Google Eingaben zur Verbesserung seiner Dienste verwenden.</div>
    <div class="steps"><b>So verknüpfst du Gemini:</b>
      <ol><li>Öffne <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> und melde dich mit deinem Google-Konto an.</li>
      <li>Tippe auf „API-Schlüssel erstellen“ und kopiere den Schlüssel (beginnt mit „AIza…“).</li>
      <li>Füge ihn unten ein und tippe auf „Speichern“. Fertig – im Reiter „KI“ beim Hinzufügen kannst du jetzt Essen per Text oder Foto analysieren.</li></ol></div>
    <label>Gemini-API-Schlüssel</label><input type="password" id="sKey" value="${esc(s.geminiKey)}" placeholder="AIza…" autocomplete="off">
    <label>Modell</label><input type="text" id="sModel" value="${esc(s.geminiModel)}">
    <button class="btn sec block" style="margin-top:16px" data-act="saveAI">Speichern</button></div>`)}
  ${acc("rec", `Rezepte`, `<div class="panel" style="padding-top:16px"><button class="btn sec block" data-act="recipes">Meine Rezepte (${D.recipes.length})</button></div>
  `)}
  ${acc("foods", `Meine Lebensmittel <span class="muted" style="font-weight:600">${D.foods.length}</span>`, `<div class="panel" style="padding-top:16px">
    <div class="grid2"><button class="btn sec" data-act="foodsManage">Verwalten</button><button class="btn sec" data-act="foodNew">Neu anlegen</button></div>
    <button class="btn sec block" style="margin-top:10px" data-act="csvTemplate">CSV-Vorlage laden</button></div>
  `)}
  ${acc("sync", `Echtzeit-Abgleich (mehrere Geräte)`, typeof syPanel === "function" ? syPanel() : "")}
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
  bg.innerHTML = `<div class="sheet"><button class="sclose" type="button" aria-label="Schließen">${icon("x", 18, 2.6)}</button>${html}</div>`;
  bg.querySelector(".sclose").onclick = () => closeSheet();
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
  const tabs = [["search", "Suchen"], ["scan", "Scannen"], ["photo", "KI"], ["recipes", "Rezepte"], ["manual", "Manuell"], ["multi", "Mehrere"]];
  const s = sheet(`<h3>Lebensmittel hinzufügen</h3>${mealSel}
    <div class="seg six">${tabs.map(([v, l]) => `<button data-at="${v}" class="${addTab === v ? "on" : ""}">${l}</button>`).join("")}</div><div id="addBody"></div>`);
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
  else if (addTab === "multi") bodyMulti(b);
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
    sugar: r1(n.sugars_100g || 0), fiber: r1(n.fiber_100g || 0), sat: r1(n["saturated-fat_100g"] || 0), salt: r2(n.salt_100g != null ? n.salt_100g : (n.sodium_100g || 0) * 2.5), serving: num(p.serving_quantity) || 100, used: 0,
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
    <div class="muted small" id="ppv" style="margin:6px 2px 0"></div>
    <label>Mahlzeit</label><select id="pm">${MEALS.map(m => `<option value="${m.id}" ${m.id === ui.meal ? "selected" : ""}>${m.name}</option>`).join("")}</select>
    <button class="btn block" style="margin-top:14px" id="pgo">Zum Tagebuch hinzufügen</button>
    <button class="btn sec block" style="margin-top:8px" id="pback">Zurück</button>`);
  const gr = $("#gr", s);
  const upd = () => { const c = calc(f, num(gr.value)); $("#pv", s).innerHTML = `<div class="row between"><b style="font-size:22px">${r0(c.kcal)} kcal</b><span class="small"><span class="dot" style="background:var(--p)"></span>E ${r1(c.p)} <span class="dot" style="background:var(--c)"></span>KH ${r1(c.c)} <span class="dot" style="background:var(--f)"></span>F ${r1(c.f)}</span></div>`; };
  const updP = () => { const pv = priceOf(f, num(gr.value)); $("#ppv", s).textContent = pv != null ? "≈ " + eurFmt(pv) + " für diese Menge" : ""; };
  gr.oninput = () => { upd(); updP(); }; upd(); updP();
  $$("[data-m]", s).forEach(b => b.onclick = () => { gr.value = r0(serving * +b.dataset.m); upd(); updP(); });
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
  D.entries.push({ id: uid(), date: ui.date, ...stamp(), meal, name: food.name, grams, kcal: c.kcal, p: c.p, c: c.c, f: c.f, ...microOf(food, grams) });
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
/* ---- Text sofort mit eigenen Lebensmitteln abgleichen (ohne KI) ---- */
const normTxt = x => String(x || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const NUMW = { ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, halbe: .5, halben: .5, halber: .5, halbes: .5 };
const UNIT_G = { g: 1, gr: 1, gramm: 1, kg: 1000, ml: 1, l: 1000, liter: 1000, cl: 10, dl: 100 };
const UNIT_PC = /^(stueck|stuecke|stk|scheibe|scheiben|portion|portionen|el|tl|becher|glas|glaeser|tasse|tassen|stange|stangen|packung|riegel|x)$/;
function parseSeg(seg) {
  let t = seg.trim().replace(/^(mit|und|plus)\s+/i, ""), grams = null, count = null, name = t;
  const tr = t.match(/^(.*?)\s*(\d+(?:[.,]\d+)?)\s*(g|gr|gramm|kg|ml|l)\s*$/i);
  const ld = t.match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-zÄÖÜäöüß]+)?\s*(.*)$/);
  if (tr && tr[1].trim()) { grams = num(tr[2]) * UNIT_G[tr[3].toLowerCase()]; name = tr[1]; }
  else if (ld) {
    const n = num(ld[1]), w = normTxt(ld[2] || ""), rest = ld[3];
    if (w && UNIT_G[w] && rest.trim()) { grams = n * UNIT_G[w]; name = rest; }
    else if (w && UNIT_PC.test(w) && rest.trim()) { count = n; name = rest; }
    else { name = ((ld[2] || "") + " " + rest).trim(); if (n <= 10) count = n; else grams = n; }
  } else {
    const m = t.match(/^(\S+)\s+(.+)$/);
    if (m && NUMW[normTxt(m[1])] != null) { count = NUMW[normTxt(m[1])]; name = m[2]; const m2 = name.match(/^(\S+)\s+(.+)$/); if (m2 && UNIT_PC.test(normTxt(m2[1]))) name = m2[2]; }
    else count = 1;
  }
  return { name: name.trim(), grams, count };
}
const wordEq = (x, w) => { if (x === w) return true; const [a, b] = x.length <= w.length ? [x, w] : [w, x]; if (b.startsWith(a) && ["e", "en", "er", "n"].includes(b.slice(a.length))) return true; if (a.length >= 4 && b === a + "s") return true; return Math.min(x.length, w.length) >= 4 && (stem(x).startsWith(stem(w)) || stem(w).startsWith(stem(x))); };
const stem = w => w.length > 4 ? w.replace(/(en|er|e|n|s)$/, "") : w;
function findOwnFood(name) {
  const q = normTxt(name).split(" ").filter(w => w && !["mit", "und", "von", "der", "die", "das", "etwas"].includes(w));
  if (!q.length) return null;
  let best = null, bs = 0;
  for (const f of D.foods) {
    const ft = normTxt(f.name + " " + (f.brand || "")).split(" ").filter(Boolean), fn = normTxt(f.name);
    const okAll = q.every(w => ft.some(x => wordEq(x, w)));
    if (!okAll) continue;
    const score = (fn === q.join(" ") ? 100 : 60) + 20 * (q.length / Math.max(ft.length, 1)) + Math.min(f.used || 0, 10) * .1;
    if (score > bs) { bs = score; best = f; }
  }
  return best;
}
function matchLocal(text) {
  const items = [], rest = [];
  text.split(/\s*(?:,|;|\n|\+|\bund\b|\bsowie\b)\s*/i).map(x => x.trim()).filter(Boolean).forEach(seg => {
    const p = parseSeg(seg), f = p.name ? findOwnFood(p.name) : null;
    if (!f) return rest.push(seg);
    const grams = Math.max(1, r1(p.grams != null ? p.grams : (p.count != null ? p.count : 1) * (num(f.serving) || 100)));
    items.push({ name: f.name, grams, kcal: num(f.kcal), protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat), sugar: num(f.sugar), fiber: num(f.fiber), sat: num(f.sat), salt: num(f.salt), on: true, fid: f.id });
  });
  return { items, rest };
}
let photoStatus = "";

function bodyPhoto(b) {
  if (!D.settings.geminiKey) {
    b.innerHTML = `<div class="card muted small">Für die KI-Erkennung trägst du in den Einstellungen deinen kostenlosen Gemini-Schlüssel ein. Die Werte sind Schätzungen – prüfe sie vor dem Speichern.</div>
      <button class="btn block" id="toSet">Zu den Einstellungen</button>`;
    $("#toSet", b).onclick = () => { closeSheet(); setTab("settings"); render(); };
    return;
  }
  b.innerHTML = `<div class="muted small">Beschreibe dein Essen als Text, mache ein Foto oder beides. Lebensmittel aus deiner Datenbank werden sofort erkannt, nur Unbekanntes fragt die KI. Danach kannst du alles selbst anpassen.</div>
    <label>Beschreibung</label>
    <textarea id="pNote" rows="3" placeholder="z. B. 2 Spiegeleier, 2 Scheiben Vollkornbrot mit Butter und eine Banane">${esc(ui.photoNote || "")}</textarea>
    <input type="file" id="img" accept="image/*" capture="environment" hidden><input type="file" id="img2" accept="image/*" hidden>
    <div class="grid2" style="margin-top:10px"><button class="btn sec" id="cam">Foto aufnehmen</button><button class="btn sec" id="gal">Aus Galerie</button></div>
    <div id="pres"></div>
    <button class="btn block" id="pGo" style="margin-top:14px">Analysieren</button>
    <div id="pout"></div>`;
  let file = null, thumb = null;
  $("#pNote", b).oninput = e => { ui.photoNote = e.target.value; };
  const setFile = f => {
    if (!f) return;
    if (thumb) URL.revokeObjectURL(thumb);
    file = f; thumb = URL.createObjectURL(f);
    $("#pres", b).innerHTML = `<img class="pthumb" src="${thumb}" alt="Vorschau"><button class="btn sec small" id="pDrop" style="margin-top:8px">Foto entfernen</button>`;
    $("#pDrop", b).onclick = () => { file = null; $("#pres", b).innerHTML = ""; };
  };
  const analyze = async () => {
    const note = $("#pNote", b).value.trim();
    if (!file && !note) return toast("Foto aufnehmen oder Beschreibung eingeben");
    const f = file;
    $("#pNote", b).value = ""; ui.photoNote = ""; // Beschreibung wird nach dem Abschicken geleert
    $("#pGo", b).disabled = true;
    // Text ohne Foto: erst sofort mit eigenen Lebensmitteln abgleichen, nur der Rest geht an die KI
    const loc = !f ? matchLocal(note) : { items: [], rest: [] };
    const rest = loc.items.length ? loc.rest.join(", ") : note;
    photoStatus = ""; lastAi = null;
    if (loc.items.length) { photoItems = loc.items; photoStatus = rest ? `<div class="muted small"><span class="spin"></span>Rest („${esc(rest)}“) wird von der KI ergänzt …</div>` : ""; renderPhotoItems(); }
    else $("#pout", b).innerHTML = `<div class="muted" style="margin-top:14px"><span class="spin"></span>${f ? "Analysiere Foto …" : "Analysiere Text …"}</div>`;
    if (!loc.items.length || rest) {
      try {
        const ai = await analyzePhoto(f, rest);
        photoItems = loc.items.concat(ai); photoStatus = ""; file = null; $("#pres", b).innerHTML = ""; renderPhotoItems();
      } catch (e) {
        $("#pNote", b).value = rest; ui.photoNote = rest; // bei Fehler Text zurück, damit nichts verloren geht
        if (loc.items.length) { photoStatus = `<div class="warn small">KI nicht erreichbar: ${esc(e.message)} Der Rest steht wieder im Textfeld.</div>`; renderPhotoItems(); }
        else $("#pout", b).innerHTML = `<div class="warn small" style="margin-top:14px">${esc(e.message)}</div>`;
      }
    }
    $("#pGo", b).disabled = false;
  };
  $("#pGo", b).onclick = analyze;
  $("#cam", b).onclick = () => liveCamera(b, setFile, () => $("#img", b).click());
  $("#gal", b).onclick = () => $("#img2", b).click();
  $("#img", b).onchange = e => setFile(e.target.files[0]);
  $("#img2", b).onchange = e => setFile(e.target.files[0]);
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
const PHOTO_SCHEMA = { type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "OBJECT", properties: {
  name: { type: "STRING" }, grams: { type: "NUMBER" }, kcal: { type: "NUMBER" }, protein: { type: "NUMBER" }, carbs: { type: "NUMBER" }, fat: { type: "NUMBER" }, sugar: { type: "NUMBER" }, fiber: { type: "NUMBER" }, sat: { type: "NUMBER" }, salt: { type: "NUMBER" } },
  required: ["name", "grams", "kcal", "protein", "carbs", "fat"] } } }, required: ["items"] };
/* tolerant: Dezimalkommas, hängende Kommas, abgeschnittene Antworten reparieren */
function parseAiJson(txt) {
  let t = String(txt || "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"); if (a < 0) throw new Error("Antwort der KI war nicht lesbar");
  t = t.slice(a);
  const tries = [t.slice(0, t.lastIndexOf("}") + 1)];
  const fixed = x => x.replace(/(\d),(\d)/g, "$1.$2").replace(/,\s*([}\]])/g, "$1");
  tries.push(fixed(tries[0]));
  // abgeschnitten: nach dem letzten vollständigen Eintrag schließen
  const cut = t.lastIndexOf("}");
  if (cut > 0) tries.push(fixed(t.slice(0, cut + 1)) + "]}", fixed(t.slice(0, cut + 1)) + "}");
  for (const c of tries) { try { const j = JSON.parse(c); if (j && Array.isArray(j.items)) return j; } catch (e) { /* nächster Versuch */ } }
  throw new Error("Antwort der KI war nicht lesbar. Bitte nochmal versuchen.");
}
let lastAi = null;
/* Gemini-Aufruf mit "Hedging": antwortet das erste Modell nach ~4 s nicht, startet parallel ein zweites,
   die schnellste gültige Antwort gewinnt. Fällt ein Modell aus (503/429/404), startet sofort das nächste. */
async function geminiCall(parts, { schema, maxOut = 1500, onWait } = {}) {
  const key = (D.settings.geminiKey || "").trim(), t0 = Date.now();
  const models = [...new Set([(D.settings.geminiModel || "gemini-2.5-flash-lite").trim(), "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-flash-latest"])];
  const ctls = new Set();
  const bodyFor = (model, lean) => JSON.stringify({ contents: [{ parts }], generationConfig: lean ? { responseMimeType: "application/json", maxOutputTokens: maxOut }
    : { responseMimeType: "application/json", responseSchema: schema, maxOutputTokens: maxOut, temperature: 0.2, ...(/2\.5-flash(?!-lite)/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) } });
  const one = async (model) => {
    let lean = false;
    for (let k = 0; k < 2; k++) {
      let r;
      const ctl = new AbortController(); ctls.add(ctl);
      const to = setTimeout(() => ctl.abort(), 30000);
      try { r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: bodyFor(model, lean), signal: ctl.signal }); }
      catch (e) { throw Object.assign(new Error(e && e.name === "AbortError" ? "Zeitüberschreitung" : "net"), { net: !(e && e.name === "AbortError"), abort: true }); }
      finally { clearTimeout(to); ctls.delete(ctl); }
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const text = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(c => c.text || "").join("");
        if (!text) throw Object.assign(new Error("leer"), { status: 0 });
        return { text, model };
      }
      const msg = r.status + ((j.error && j.error.message) ? ": " + j.error.message : "");
      if (r.status === 401 || r.status === 403 || (r.status === 400 && /API key/i.test(msg))) throw Object.assign(new Error("Der Gemini-Schlüssel wird nicht akzeptiert. Prüfe ihn in den Einstellungen."), { fatal: true });
      if (r.status === 400 && !lean) { lean = true; continue; }
      throw Object.assign(new Error(msg), { status: r.status });
    }
  };
  return new Promise((resolve, reject) => {
    let next = 0, running = 0, done = false, lastErr = null, hedge = null, net = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(hedge); ctls.forEach(c => c.abort()); fn(v); };
    const launch = () => {
      if (done || next >= models.length) return false;
      const m = models[next++]; running++;
      if (next > 1 && onWait) onWait("Gemini braucht länger – zweites Modell läuft parallel …");
      one(m).then(r => finish(resolve, { ...r, ms: Date.now() - t0 }), e => {
        if (done) return;
        running--; lastErr = e; if (e.net) net = true;
        if (e.fatal) return finish(reject, e);
        if (!launch() && running === 0) {
          const st = lastErr.status;
          finish(reject, new Error(net && !st ? "Keine Verbindung zur KI. Bist du online?" : lastErr.message === "Zeitüberschreitung" ? "Gemini antwortet gerade zu langsam. Bitte gleich nochmal versuchen." : st === 503 || st === 500 ? "Gemini ist gerade überlastet (Google-Seite). Bitte in ein bis zwei Minuten nochmal versuchen." : st === 429 ? "Das kostenlose Limit ist gerade erreicht. Warte kurz und versuche es erneut." : "KI-Fehler " + lastErr.message));
        }
      });
      if (!hedge && next < models.length) hedge = setTimeout(() => { hedge = null; launch(); }, 4000);
      return true;
    };
    launch();
  });
}
async function analyzePhoto(file, note) {
  const data = file ? await shrink(file, 1024) : null;
  const imgPart = data ? [{ inline_data: { mime_type: "image/jpeg", data } }] : [];
  const lead = file ? `Analysiere dieses Foto (Mahlzeit, Lebensmittel oder Nährwert-Etikett). Erkenne jedes einzelne Lebensmittel, schätze die Menge in Gramm und nenne die Nährwerte pro 100 g. Wenn ein Nährwert-Etikett zu sehen ist, nutze dessen Werte.`
    : `Der Nutzer beschreibt in Textform, was er gegessen hat oder welches Lebensmittel er eintragen möchte (es gibt kein Foto). Erkenne jedes einzelne Lebensmittel, rechne genannte Mengen (Stück, Scheiben, Gläser, Esslöffel …) in Gramm um bzw. nimm genannte Gramm-Angaben exakt, sonst schätze eine übliche Portion, und nenne die Nährwerte pro 100 g. Nennt der Nutzer selbst Nährwerte, rechne sie auf 100 g um und nutze sie.`;
  const prompt = `${lead} Antworte ausschließlich mit JSON ohne weiteren Text im Format: {"items":[{"name":"deutscher Name","grams":150,"kcal":120,"protein":5,"carbs":20,"fat":2,"sugar":1,"fiber":3,"sat":0.5,"salt":0.3}]}. Alle Nährwerte beziehen sich auf 100 g. "sat" = davon gesättigte Fettsäuren in g, "salt" = Salz in g (nicht Natrium). Zahlen immer als JSON-Zahlen mit Punkt als Dezimaltrennzeichen (z. B. 5.5, niemals 5,5).` + (note ? (file ? `\n\nZusatzinfos vom Nutzer (verlässlich, haben Vorrang vor deiner Schätzung aus dem Bild, z. B. Gewicht, Zutaten, Zubereitung, Marke): ${note}` : `\n\nBeschreibung des Nutzers: ${note}`) : "");
  const { text: txt, model: usedModel, ms } = await geminiCall([...imgPart, { text: prompt }], { schema: PHOTO_SCHEMA, maxOut: 1500, onWait: m => { const o = $("#pstat") || $("#pout"); if (o) o.innerHTML = `<div class="muted" style="margin-top:14px"><span class="spin"></span>${m}</div>`; } });
  lastAi = { model: usedModel, ms };
  const items = (parseAiJson(txt).items || []).filter(i => i && i.name);
  if (!items.length) throw new Error(file ? "Es wurde nichts erkannt. Versuche ein schärferes Foto." : "Es wurde nichts erkannt. Beschreibe das Essen etwas genauer.");
  return items.map(i => ({ name: String(i.name), grams: Math.max(1, num(i.grams) || 100), kcal: num(i.kcal), protein: num(i.protein), carbs: num(i.carbs), fat: num(i.fat), sugar: num(i.sugar), fiber: num(i.fiber), sat: num(i.sat), salt: num(i.salt), on: true }));
}
function renderPhotoItems() {
  const o = $("#pout");
  if (!o) return;
  const fld = (l, f, v) => `<div><label style="margin:8px 0 3px">${l}</label><input type="text" inputmode="decimal" value="${v}" data-f="${f}"></div>`;
  const sum = i => { const c = calc(i, i.grams); return `= ${r0(c.kcal)} kcal · E ${r1(c.p)} · KH ${r1(c.c)} · F ${r1(c.f)}`; };
  o.innerHTML = `<div id="pstat" style="margin-top:12px">${photoStatus}</div><h2 style="margin-top:10px">Erkannt</h2><div class="muted small" style="margin-bottom:8px">Alles ist änderbar, die Summe rechnet mit. Nährwerte gelten pro 100 g.${lastAi && photoItems.some(i => !i.fid) ? ` <span class="tiny">· ${(lastAi.ms / 1000).toFixed(1).replace(".", ",")} s, ${esc(lastAi.model)}</span>` : ""}</div>` + photoItems.map((i, k) => `<div class="card" data-k="${k}">
      <div class="row"><input type="checkbox" ${i.on ? "checked" : ""} data-f="on" style="width:22px;height:22px"><input type="text" value="${esc(i.name)}" data-f="name"></div>
      <div class="tiny muted" style="margin:6px 2px 0">${i.fid ? "aus deinen Lebensmitteln" : "KI-Schätzung"}</div>
      <div class="grid2"><div><label style="margin:8px 0 3px">Menge (g)</label><div class="row" style="gap:6px"><button type="button" class="chip" data-step="-1" aria-label="weniger">−</button><input type="text" inputmode="decimal" value="${r0(i.grams)}" data-f="grams"><button type="button" class="chip" data-step="1" aria-label="mehr">+</button></div></div>${""}${fld("Kalorien (kcal)", "kcal", r0(i.kcal))}
      ${fld("Eiweiß (g)", "protein", r1(i.protein))}${fld("Kohlenhydrate (g)", "carbs", r1(i.carbs))}
      ${fld("Fett (g)", "fat", r1(i.fat))}${fld("davon Zucker (g)", "sugar", r1(i.sugar))}
      ${fld("Ballaststoffe (g)", "fiber", r1(i.fiber))}${fld("davon gesättigt (g)", "sat", r1(i.sat))}
      ${fld("Salz (g)", "salt", r2(i.salt))}</div>
      <div class="muted small" style="margin-top:8px" data-sum>${sum(i)}</div></div>`).join("") + `<div class="grid2"><button class="btn" id="pDiary">Ins Tagebuch</button><button class="btn sec" id="pDb">In Datenbank</button></div>
    <button class="btn sec block" style="margin-top:8px" id="pCsv">Als CSV speichern</button>`;
  $$("[data-k]", o).forEach(card => {
    const it = photoItems[+card.dataset.k];
    $$("[data-step]", card).forEach(bt => bt.onclick = () => {
      const g = num($("[data-f=grams]", card).value) || it.grams, st = g < 30 ? 5 : 10;
      it.grams = Math.max(1, r1(g + st * +bt.dataset.step)); $("[data-f=grams]", card).value = r0(it.grams); $("[data-sum]", card).textContent = sum(it);
    });
    $$("[data-f]", card).forEach(inp => { const h = () => {
      const f = inp.dataset.f;
      it[f] = f === "on" ? inp.checked : f === "name" ? inp.value : num(inp.value);
      if (f === "grams") it.grams = Math.max(1, it.grams || 0);
      $("[data-sum]", card).textContent = sum(it);
    }; inp.onchange = h; inp.oninput = h; });
  });
  const chosen = () => photoItems.filter(i => i.on);
  const toFood = i => ({ id: uid(), name: i.name, brand: "", barcode: "", kcal: r1(i.kcal), protein: r1(i.protein), carbs: r1(i.carbs), fat: r1(i.fat), sugar: r1(i.sugar), fiber: r1(i.fiber), sat: r1(i.sat), salt: r2(i.salt), serving: r0(i.grams), used: 1 });
  const own = i => i.fid && D.foods.find(x => x.id === i.fid);
  const toDb = list => list.map(i => { if (own(i)) return own(i); const f = toFood(i); const ex = D.foods.find(x => x.name.toLowerCase() === f.name.toLowerCase() && !x.barcode); if (ex) return ex; D.foods.push(f); return f; });
  $("#pDiary", o).onclick = () => {
    const items = chosen(); if (!items.length) return toast("Nichts ausgewählt");
    const foods = toDb(items);
    // Werte aus der Karte (auch geänderte) gelten für den Tagebucheintrag; eigene Lebensmittel bleiben dabei unverändert
    items.forEach((i, k) => { foods[k].used = (foods[k].used || 0) + (i.fid ? 1 : 0); addEntry(ui.meal, own(i) ? { name: i.name, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat, sugar: i.sugar, fiber: i.fiber, sat: i.sat, salt: i.salt } : foods[k], i.grams); });
    closeSheet(); save(); render(); toast(items.length + (items.length === 1 ? " Eintrag" : " Einträge") + " hinzugefügt");
  };
  $("#pDb", o).onclick = () => {
    const items = chosen(); if (!items.length) return toast("Nichts ausgewählt");
    let upd = 0;
    items.forEach(i => { const f = own(i); if (f && (f.kcal !== r1(i.kcal) || f.protein !== r1(i.protein) || f.carbs !== r1(i.carbs) || f.fat !== r1(i.fat) || (f.sugar || 0) !== r1(i.sugar) || (f.fiber || 0) !== r1(i.fiber) || (f.sat || 0) !== r1(i.sat) || (f.salt || 0) !== r2(i.salt) || f.name !== i.name)) { Object.assign(f, { name: i.name, kcal: r1(i.kcal), protein: r1(i.protein), carbs: r1(i.carbs), fat: r1(i.fat), sugar: r1(i.sugar), fiber: r1(i.fiber), sat: r1(i.sat), salt: r2(i.salt) }); upd++; } });
    toDb(items.filter(i => !own(i))); save(); toast(upd ? upd + " Lebensmittel in der Datenbank geändert" : "In Datenbank gespeichert");
  };
  $("#pCsv", o).onclick = () => { if (!chosen().length) return toast("Nichts ausgewählt"); exportFile("lebensmittel-ki.csv", new Blob([foodsToCsv(chosen().map(toFood))], { type: "text/csv" })); };
}

/* Manuell */
let manualPrefill = null;
function foodForm(f) {
  f = f || {};
  const v = k => esc(f[k] ?? "");
  return `<div class="pastebox"><label style="margin-top:0">Aus Text einfügen</label>
    <textarea id="fPaste" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="Hier einfügen, z. B.&#10;name;marke;barcode;kcal;fett;gesaettigt;kohlenhydrate;zucker;eiweiss;ballaststoffe;salz;portion_g&#10;Banane medium;;;89;0,3;23;12;1,1;2,6;118"></textarea>
    <div class="grid2" style="margin-top:8px"><button class="btn sec small" type="button" id="fPasteGo">Felder füllen</button><button class="btn sec small" type="button" id="fPasteCopy">Auftrag für KI kopieren</button></div>
    <div class="muted tiny" style="margin-top:8px">CSV mit Semikolon, Tab oder JSON. Beim Einfügen füllt sich das Formular automatisch. Mehrere Zeilen speichern mehrere Lebensmittel auf einmal.</div></div>
    <label>Name</label><input type="text" id="fName" value="${v("name")}">
    <div class="grid2"><div><label>Marke</label><input type="text" id="fBrand" value="${v("brand")}"></div><div><label>Barcode</label><input type="text" inputmode="numeric" id="fBar" value="${v("barcode")}"></div></div>
    <div class="muted small" style="margin-top:12px">Nährwerte pro 100 g / 100 ml</div>
    <div class="grid2"><div><label>Kalorien (kcal)</label><input type="text" inputmode="decimal" id="fKcal" value="${v("kcal")}"></div><div><label>Eiweiß (g)</label><input type="text" inputmode="decimal" id="fP" value="${v("protein")}"></div>
    <div><label>Kohlenhydrate (g)</label><input type="text" inputmode="decimal" id="fC" value="${v("carbs")}"></div><div><label>Fett (g)</label><input type="text" inputmode="decimal" id="fF" value="${v("fat")}"></div>
    <div><label>davon Zucker (g)</label><input type="text" inputmode="decimal" id="fS" value="${v("sugar")}"></div><div><label>Ballaststoffe (g)</label><input type="text" inputmode="decimal" id="fFi" value="${v("fiber")}"></div>
    <div><label>davon gesättigte Fettsäuren (g)</label><input type="text" inputmode="decimal" id="fSat" value="${v("sat")}"></div><div><label>Salz (g)</label><input type="text" inputmode="decimal" id="fSalt" value="${v("salt")}"></div></div>
    <label>Portionsgröße (g)</label><input type="text" inputmode="decimal" id="fServ" value="${v("serving") || 100}">
    <div class="muted small" style="margin-top:14px">Preis (optional)</div>
    <div class="grid2"><div><label>Preis (€)</label><input type="text" inputmode="decimal" id="fPrice" placeholder="z. B. 1,29" value="${f.price > 0 ? String(f.price).replace(".", ",") : ""}"></div><div><label>für Menge (g oder ml)</label><input type="text" inputmode="decimal" id="fPriceG" placeholder="z. B. 500" value="${f.priceG > 0 ? String(f.priceG).replace(".", ",") : ""}"></div></div>
    <div class="muted tiny" id="fPriceHint" style="margin-top:6px">${hasPrice(f) ? "≈ " + eurFmt(f.price / f.priceG * 100) + " pro 100 g" : "Was kostet die Packung und wie viel ist drin? Daraus rechnet die App den Preis pro Menge aus."}</div>`;
}
/* Lebensmittel aus eingefügtem Text (CSV, Tab, JSON) */
const FOOD_KEYS = { name: "name", bezeichnung: "name", lebensmittel: "name", produkt: "name", marke: "brand", brand: "brand", barcode: "barcode", ean: "barcode",
  kcal: "kcal", kalorien: "kcal", calories: "kcal", energie: "kcal", fett: "fat", fat: "fat", kohlenhydrate: "carbs", carbs: "carbs", kh: "carbs",
  zucker: "sugar", sugar: "sugar", eiweiss: "protein", "eiweiß": "protein", protein: "protein", ballaststoffe: "fiber", fiber: "fiber",
  gesaettigt: "sat", "gesättigt": "sat", gesaettigte_fettsaeuren: "sat", "gesättigte_fettsäuren": "sat", gesaettigte_fettsaeure: "sat", saturated_fat: "sat", saturates: "sat", sat: "sat", davon_gesaettigt: "sat", "davon_gesättigt": "sat",
  salz: "salt", salt: "salt", preis: "price", preis_eur: "price", "preis_€": "price", price: "price", preis_menge_g: "priceG", preis_fuer_g: "priceG", "preis_für_g": "priceG", price_g: "priceG",
  portion_g: "serving", portion: "serving", portionsgroesse: "serving", serving: "serving" };
const foodKey = h => FOOD_KEYS[String(h).trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/_100g$/, "")];
function normFood(o) {
  const out = { name: "", brand: "", barcode: "", kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0, sat: 0, salt: 0, serving: 100 };
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
const FOOD_PROMPT = "Gib mir die Nährwerte pro 100 g für:\n(HIER LEBENSMITTEL EINTRAGEN, z. B. Banane medium)\n\nAntworte nur mit CSV, ohne weiteren Text: erste Zeile die Kopfzeile, danach eine Zeile pro Lebensmittel, Trennzeichen Semikolon.\nname;marke;barcode;kcal;fett;gesaettigt;kohlenhydrate;zucker;eiweiss;ballaststoffe;salz;portion_g\ngesaettigt = davon gesättigte Fettsäuren in g, salz = Salz in g (nicht Natrium).\nIn den Zahlenfeldern nur Zahlen ohne <, ca., g oder Einheiten (bei „weniger als 0,1“ bitte 0,05 schreiben, bei „Spuren“ 0).\nBei portion_g bitte das übliche Gewicht einer Portion in Gramm angeben (z. B. mittlere Banane ohne Schale: 118).";
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* weiter */ }
  try { const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0;top:0"; document.body.append(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; } catch (e) { return false; }
}
function bindPaste(root, onMulti) {
  bindPriceHint(root);
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
      set("#fS", n(f.sugar)); set("#fFi", n(f.fiber)); set("#fSat", n(f.sat)); set("#fSalt", n(f.salt)); if (f.price > 0 && f.priceG > 0) { set("#fPrice", n(f.price)); set("#fPriceG", n(f.priceG)); } set("#fServ", n(f.serving, true));
      ta.value = ""; toast("Felder ausgefüllt. Bitte kurz prüfen und speichern.");
    } else {
      list.forEach(upsertFood); save(); toast(list.length + " Lebensmittel gespeichert"); onMulti();
    }
  };
  $("#fPasteGo", root).onclick = go;
  ta.onpaste = () => setTimeout(go, 60);
  $("#fPasteCopy", root).onclick = async () => toast(await copyText(FOOD_PROMPT) ? "Auftrag kopiert. Schicke ihn an Claude oder eine andere KI und füge die Antwort hier ein." : "Kopieren nicht möglich");
}
/* Live-Hinweis zum Preis im Lebensmittelformular */
function bindPriceHint(root) {
  const a = $("#fPrice", root), b = $("#fPriceG", root), h = $("#fPriceHint", root); if (!a || !b || !h) return;
  const upd = () => { const p = num(a.value), g = num(b.value); if (p > 0 && g > 0) h.textContent = "≈ " + eurFmt(p / g * 100) + " pro 100 g"; else if (p > 0 || g > 0) h.textContent = "Bitte Preis und Menge angeben."; };
  a.oninput = b.oninput = upd;
}
function readFoodForm(root, base) {
  const name = $("#fName", root).value.trim();
  if (!name) { toast("Bitte einen Namen eingeben"); return null; }
  const pr = $("#fPrice", root) ? num($("#fPrice", root).value) : 0, pg = $("#fPriceG", root) ? num($("#fPriceG", root).value) : 0;
  const out = { ...(base || {}), id: (base && base.id) || uid(), name, brand: $("#fBrand", root).value.trim(), barcode: $("#fBar", root).value.replace(/\D/g, ""),
    kcal: num($("#fKcal", root).value), protein: num($("#fP", root).value), carbs: num($("#fC", root).value), fat: num($("#fF", root).value),
    sugar: num($("#fS", root).value), fiber: num($("#fFi", root).value), sat: num($("#fSat", root).value), salt: num($("#fSalt", root).value), serving: num($("#fServ", root).value) || 100, used: (base && base.used) || 0 };
  if (pr > 0 && pg > 0) { out.price = pr; out.priceG = pg; } else { delete out.price; delete out.priceG; }
  return out;
}
/* Mehrere Gerichte auf einmal (z. B. Buffet): CSV einfügen -> jede Zeile ein Tagebucheintrag, nichts landet in „Meine Lebensmittel“ */
const MULTI_PROMPT = "Ich habe folgendes gegessen (siehe Fotos/Beschreibung):\n(HIER BESCHREIBEN, z. B. Buffet-Teller mit …)\n\nSchätze pro Gericht die Nährwerte pro 100 g und das Gewicht, das ich tatsächlich gegessen habe. Antworte nur mit CSV, ohne weiteren Text: erste Zeile die Kopfzeile, danach eine Zeile pro Gericht, Trennzeichen Semikolon, Dezimalpunkt.\nname;marke;barcode;kcal;fett;gesaettigt;kohlenhydrate;zucker;eiweiss;ballaststoffe;salz;portion_g\ngesaettigt = davon gesättigte Fettsäuren in g, salz = Salz in g (nicht Natrium).\nIn den Zahlenfeldern nur Zahlen ohne <, ca., g oder Einheiten (bei „weniger als 0,1“ bitte 0,05 schreiben, bei „Spuren“ 0).\nBei portion_g das Gewicht der gegessenen Menge in Gramm angeben (die Nährwerte beziehen sich auf 100 g).";
function bodyMulti(b) {
  b.innerHTML = `<div class="muted small">Füge eine CSV mit mehreren Gerichten ein (z. B. von Claude oder einer anderen KI). Jede Zeile wird ein eigener Tagebucheintrag mit der Menge <b>portion_g</b>. Die Gerichte werden <b>nicht</b> in „Meine Lebensmittel“ gespeichert, erscheinen aber einzeln im Export.</div>
    <textarea id="mPaste" rows="8" style="margin-top:10px;min-height:150px;font-size:12px" placeholder="name;marke;barcode;kcal;fett;gesaettigt;kohlenhydrate;zucker;eiweiss;ballaststoffe;salz;portion_g&#10;Hähnchenfleisch (angebraten);Restaurant/Buffet;;165;6.0;1.8;2.0;0.5;26.0;0.0;0.9;80"></textarea>
    <div id="mPrev"></div>
    <label style="margin-top:14px">Alles zuordnen zu</label>
    <div class="chips" id="mMeal">${MEALS.map(m => `<button class="chip ${m.id === ui.meal ? "on" : ""}" data-m="${m.id}">${m.name}</button>`).join("")}</div>
    <div class="grid2" style="margin-top:12px"><button class="btn" id="mGo" disabled>Ins Tagebuch</button><button class="btn sec" id="mCopy">Auftrag für KI kopieren</button></div>`;
  let rows = [];
  const ta = $("#mPaste", b), prev = $("#mPrev", b), go = $("#mGo", b);
  const upd = () => {
    rows = []; prev.innerHTML = ""; go.disabled = true; go.textContent = "Ins Tagebuch";
    if (!ta.value.trim()) return;
    try { rows = parseFoodsText(ta.value); } catch (e) { prev.innerHTML = `<div class="warn small" style="margin-top:10px">Das Format wurde nicht erkannt. Erwartet: name;marke;barcode;kcal;fett;gesaettigt;kohlenhydrate;zucker;eiweiss;ballaststoffe;salz;portion_g</div>`; return; }
    if (!rows.length) { prev.innerHTML = `<div class="warn small" style="margin-top:10px">Keine Zeilen erkannt.</div>`; return; }
    const tot = rows.reduce((a, f) => { const c = calc(f, f.serving); return { kcal: a.kcal + c.kcal, p: a.p + c.p, c: a.c + c.c, f: a.f + c.f }; }, { kcal: 0, p: 0, c: 0, f: 0 });
    prev.innerHTML = `<div class="list" style="margin-top:10px">${rows.map(f => { const c = calc(f, f.serving); return `<div class="entry"><div class="nm"><div class="t">${esc(f.name)}</div><div class="s"><span class="g">${r0(f.serving)} g</span><span class="cp">E ${r0(c.p)}</span><span class="cc">KH ${r0(c.c)}</span><span class="cf">F ${r0(c.f)}</span></div></div><div class="kcal">${fmt(c.kcal)}<small>kcal</small></div></div>`; }).join("")}</div>
      <div class="muted small" style="margin:8px 4px 0"><b>${rows.length}</b> Einträge · zusammen <b>${fmt(tot.kcal)} kcal</b> · E ${r0(tot.p)} · KH ${r0(tot.c)} · F ${r0(tot.f)}</div>`;
    go.disabled = false; go.textContent = `${rows.length} Einträge → ${mealName(ui.meal)}`;
  };
  $$("#mMeal .chip", b).forEach(c => c.onclick = () => {
    ui.meal = c.dataset.m; $$("#mMeal .chip", b).forEach(x => x.classList.toggle("on", x === c));
    const sel = $("#aMeal"); if (sel) sel.value = ui.meal; upd();
  });
  ta.oninput = upd;
  go.onclick = () => {
    if (!rows.length) return;
    const meal = ui.meal;
    rows.forEach(f => { const c = calc(f, f.serving); D.entries.push({ id: uid(), date: ui.date, ...stamp(), meal, name: f.name, brand: f.brand || undefined, grams: f.serving, kcal: c.kcal, p: c.p, c: c.c, f: c.f, ...microOf(f, f.serving) }); });
    ui.open[meal] = true; closeSheet(); save(); render(); toast(rows.length + " Einträge zu " + mealName(meal) + " hinzugefügt");
  };
  $("#mCopy", b).onclick = async () => toast(await copyText(MULTI_PROMPT) ? "Auftrag kopiert. An die KI schicken (mit Fotos) und die Antwort hier einfügen." : "Kopieren nicht möglich");
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
const per100 = f => ({ kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, ...pick100(f) });
function recipeTotals(r) {
  const t = { kcal: 0, p: 0, c: 0, f: 0, grams: 0 };
  r.items.forEach(i => { const c = calc(i, i.grams); t.kcal += c.kcal; t.p += c.p; t.c += c.c; t.f += c.f; t.grams += i.grams; });
  return t;
}
const recipeWeight = r => (num(r.weight) > 0 ? num(r.weight) : recipeTotals(r).grams);
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
  const p = recipePortion(r), tot = recipeTotals(r), W0 = recipeWeight(r);
  let mode = "p";
  const s = sheet(`<h3>${esc(r.name)}</h3><div class="muted small">Pro Portion: ${r0(p.kcal)} kcal, Eiweiß ${r1(p.p)} g, Kohlenhydrate ${r1(p.c)} g, Fett ${r1(p.f)} g</div>
    <div class="seg" style="margin-top:14px"><button data-md="p" class="on">Portionen</button><button data-md="g">Gramm</button></div>
    <div id="mP"><label>Portionen</label><div class="row"><input type="text" inputmode="decimal" id="rp" value="1"><button class="chip" data-m="0.5">½</button><button class="chip" data-m="1">1</button><button class="chip" data-m="2">2</button></div></div>
    <div id="mG" style="display:none"><label>Gesamtgewicht des Gerichts (g)</label><input type="text" inputmode="decimal" id="rw" value="${r0(W0)}">
      <div class="row between" style="margin:6px 2px 0"><span class="muted tiny">${r.weight > 0 ? "aus dem Rezept" : "Summe der Zutaten – gekocht wiegt es oft anders"}</span><button class="linkbtn" id="rwSave" style="margin:0">Im Rezept speichern</button></div>
      <label>Davon genommen (g)</label><div class="row"><input type="text" inputmode="decimal" id="rg" placeholder="z. B. 350"><button class="chip" data-q="0.25">¼</button><button class="chip" data-q="0.5">½</button></div></div>
    <div class="card" style="margin-top:14px" id="rv"></div>
    <label>Mahlzeit</label><select id="rm">${MEALS.map(m => `<option value="${m.id}" ${m.id === ui.meal ? "selected" : ""}>${m.name}</option>`).join("")}</select>
    <button class="btn block" style="margin-top:14px" id="rgo">Zum Tagebuch hinzufügen</button>
    <button class="btn sec block" style="margin-top:8px" id="red">Rezept bearbeiten</button>
    <button class="btn sec block" style="margin-top:8px" id="rback">Zurück</button>`);
  const rp = $("#rp", s), rw = $("#rw", s), rg = $("#rg", s);
  // Anteil am ganzen Rezept (f) und tatsächliche Menge in g
  const calcF = () => {
    if (mode === "p") { const n = num(rp.value); return { f: n / Math.max(r.servings || 1, 0.01), g: W0 * n / Math.max(r.servings || 1, 0.01), n }; }
    const W = num(rw.value), g = num(rg.value); return { f: W > 0 ? g / W : 0, g, n: W > 0 ? (g / W) * (r.servings || 1) : 0, W };
  };
  const upd = () => {
    const { f, g, n } = calcF();
    $("#rv", s).innerHTML = `<div class="row between"><b style="font-size:22px">${r0(tot.kcal * f)} kcal</b><span class="small"><span class="cp">E ${r1(tot.p * f)}</span> &nbsp;<span class="cc">KH ${r1(tot.c * f)}</span> &nbsp;<span class="cf">F ${r1(tot.f * f)}</span></span></div>
      <div class="muted tiny" style="margin-top:6px">${mode === "g" ? `≈ ${nde(n, 2)} ${Math.abs(n - 1) < 0.005 ? "Portion" : "Portionen"} (${r0(f * 100)} % des Gerichts)` : `≈ ${r0(g)} g`}</div>`;
  };
  rp.oninput = upd; rw.oninput = upd; rg.oninput = upd; upd();
  $$("[data-m]", s).forEach(b => b.onclick = () => { rp.value = b.dataset.m; upd(); });
  $$("[data-q]", s).forEach(b => b.onclick = () => { rg.value = r0(num(rw.value) * +b.dataset.q); upd(); });
  $$("[data-md]", s).forEach(b => b.onclick = () => {
    mode = b.dataset.md; $$("[data-md]", s).forEach(x => x.classList.toggle("on", x === b));
    $("#mP", s).style.display = mode === "p" ? "" : "none"; $("#mG", s).style.display = mode === "g" ? "" : "none";
    if (mode === "g") rg.focus({ preventScroll: true }); upd();
  });
  $("#rwSave", s).onclick = () => { const W = num(rw.value); if (!(W > 0)) return toast("Bitte ein Gewicht eingeben"); r.weight = W; save(); toast("Gesamtgewicht im Rezept gespeichert"); };
  $("#rback", s).onclick = () => { addTab = "recipes"; openAdd(); };
  $("#red", s).onclick = () => recipeEditor(r, "add");
  $("#rgo", s).onclick = () => {
    const { f, g } = calcF();
    if (!(f > 0) || !(g > 0)) return toast(mode === "g" ? "Bitte Gramm eingeben" : "Bitte Portionen eingeben");
    ui.meal = $("#rm", s).value;
    const gf = tot.grams > 0 ? g / (tot.grams * f) : 1; // Verhältnis Waage (fertig) zu Summe der Zutaten
    D.entries.push({ id: uid(), date: ui.date, ...stamp(), meal: ui.meal, rid: r.id, name: r.name, grams: g, kcal: tot.kcal * f, p: tot.p * f, c: tot.c * f, f: tot.f * f, ...(Math.abs(gf - 1) > 1e-6 ? { gf } : {}),
      ...(() => { const mi = microFromIngs(r.items), o = {}; MICRO.forEach(m => { if (hasN(mi[m.ek])) o[m.ek] = mi[m.ek] * f; }); return o; })(),
      ings: r.items.map(i => ({ name: i.name, grams: i.grams * f, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat, ...pick100(i) })) });
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
    <label>Gesamtgewicht fertig (g, optional)</label><input type="text" inputmode="decimal" id="rw" value="${d.weight > 0 ? r0(d.weight) : ""}" placeholder="${r0(recipeTotals(d).grams) || "z. B. 850"}">
    <div class="muted tiny" style="margin:6px 2px 0">Gewicht des fertigen Gerichts auf der Waage. Damit trägst du später einfach ein, wie viel Gramm du genommen hast. Leer = Summe der Zutaten.</div>
    <h2 style="margin:20px 2px 6px">Zutaten</h2>
    <div id="ri">${d.items.length ? d.items.map((i, k) => `<div class="ing" data-k="${k}"><div class="grow"><div class="t">${esc(i.name)}</div><div class="muted tiny" data-kc></div></div>
      <input type="text" inputmode="decimal" value="${r0(i.grams)}" aria-label="Menge in Gramm"><span class="muted small">g</span><button class="iconbtn" data-del aria-label="Zutat entfernen">×</button></div>`).join("")
      : `<div class="muted small" style="padding:4px 2px 12px">Noch keine Zutaten. Füge unten die erste hinzu.</div>`}</div>
    <button class="btn sec block" id="rAdd">Zutat hinzufügen</button>
    <div class="card" style="margin-top:16px" id="rsum"></div>
    <button class="btn block" id="rSave">Rezept speichern</button>
    ${d.id ? `<button class="btn danger block" style="margin-top:8px" id="rDel">Rezept löschen</button>` : ""}
    <button class="btn sec block" style="margin-top:8px" id="rCancel">Abbrechen</button>`);
  const capture = () => { d.name = $("#rn", s).value.trim(); d.servings = num($("#rs", s).value) || 1; d.weight = Math.max(0, num($("#rw", s).value) || 0); };
  const sumUpd = () => {
    const t = recipeTotals(d), n = Math.max(num($("#rs", s).value) || 1, 0.01);
    $$(".ing", s).forEach(row => { const i = d.items[+row.dataset.k]; $("[data-kc]", row).textContent = r0(calc(i, i.grams).kcal) + " kcal"; });
    $("#rsum", s).innerHTML = `<div class="row between"><span class="muted small">Gesamt</span><b>${r0(t.kcal)} kcal</b></div>
      <div class="row between" style="margin-top:6px"><span class="muted small">Pro Portion</span><b style="font-size:22px">${r0(t.kcal / n)} kcal</b></div>
      <div class="small" style="margin-top:6px"><span class="cp">E ${r1(t.p / n)} g</span> &nbsp;<span class="cc">KH ${r1(t.c / n)} g</span> &nbsp;<span class="cf">F ${r1(t.f / n)} g</span></div>`;
  };
  const phUpd = () => { const g = recipeTotals(d).grams; $("#rw", s).placeholder = g ? r0(g) : "z. B. 850"; };
  sumUpd(); phUpd();
  $("#rs", s).oninput = sumUpd;
  $$(".ing", s).forEach(row => {
    const k = +row.dataset.k;
    $("input", row).oninput = e => { d.items[k].grams = num(e.target.value); sumUpd(); phUpd(); };
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
    const rec = { id: d.id || uid(), name: d.name, servings: d.servings, weight: d.weight > 0 ? d.weight : 0, items: d.items.map(i => ({ name: i.name, grams: i.grams, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat, ...pick100(i) })), used: 0 };
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
  rdraft.items = es.map(e => { const it = { name: e.name, grams: e.grams, kcal: e.kcal / e.grams * 100, protein: e.p / e.grams * 100, carbs: e.c / e.grams * 100, fat: e.f / e.grams * 100 }; MICRO.forEach(m => { if (hasN(e[m.ek])) it[m.fk] = e[m.ek] / e.grams * 100; }); return it; });
  drawRecipeEditor();
}

/* ---------- Nährstoff-Details pro Tag ---------- */
function microRefs() { const k = D.settings.kcal; return { s: { max: k * 0.10 / 4 }, fi: { min: 30 }, sa: { max: k * 0.10 / 9 }, sl: { max: 6 } }; }
function microMissNote(m) { const n = Math.max(...MICRO.map(x => m.miss[x.ek])); return n > 0 ? ` (bei bis zu ${n} Einträgen fehlt die Angabe)` : ""; }
const MICRO_HINT = { s: "Richtwert: unter 10 % der Kalorien (zählt auch Zucker aus Obst und Milch)", fi: "Richtwert: mindestens 30 g am Tag", sa: "Richtwert: unter 10 % der Kalorien", sl: "Richtwert: höchstens 6 g am Tag" };
/* Übersicht der Nährstoffe für eine Liste von Einträgen; dayList = ganzer Tag (für „Anteil am Tag“ bei einer Mahlzeit) */
function nutrientBody(list, dayList) {
  const t = sum(list), m = microSum(list), refs = microRefs(), dm = dayList ? microSum(dayList) : null;
  const rows = MICRO.map(x => {
    const v = m[x.ek], ref = refs[x.ek], isMin = ref.min != null, lim = isMin ? ref.min : ref.max;
    const pct = lim > 0 ? Math.min(v / lim * 100, 100) : 0, bad = !isMin && v > lim, good = isMin && v >= lim;
    const top = list.filter(e => hasN(e[x.ek]) && e[x.ek] > 0.05).sort((a, b) => b[x.ek] - a[x.ek]).slice(0, 3).map(e => `${esc(e.name)} ${nde(e[x.ek])} g`).join(" · ");
    const miss = m.miss[x.ek], share = dm && dm[x.ek] > 0 ? Math.round(v / dm[x.ek] * 100) : null;
    return `<div class="nrow"><div class="row between"><b>${x.name}</b><span><b ${bad ? 'class="warn"' : ""}>${nde(v, x.ek === "sl" ? 2 : 1)} g</b> <span class="muted small">${isMin ? "von mind." : "von max."} ${nde(lim, 0)} g</span></span></div>
      <div class="nbar"><i class="${bad ? "warn" : good ? "good" : ""}" style="width:${pct}%"></i></div>
      <div class="muted tiny">${dayList ? (share != null ? `${share} % des Tageswerts · ` : "") + (isMin ? "Tagesziel" : "Tageslimit") + " " + nde(lim, 0) + " g" : MICRO_HINT[x.ek]}</div>${top ? `<div class="muted tiny">Meist aus: ${top}</div>` : ""}
      ${miss ? `<div class="warn tiny">Für ${miss} von ${list.length} Einträgen ist diese Angabe nicht bekannt.</div><button class="linkbtn" data-miss="${x.ek}">Fehlende ansehen und nachtragen ›</button>` : ""}</div>`;
  }).join("");
  return `<div class="card nsum"><div><b>${fmt(t.kcal)}</b><span class="muted tiny">kcal</span></div><div><b>${r0(t.p)} g</b><span class="muted tiny">Eiweiß</span></div>
    <div><b>${r0(t.c)} g</b><span class="muted tiny">Kohlenh.${hasN(m.s) ? ", davon Zucker " + nde(m.s, 0) + " g" : ""}</span></div><div><b>${r0(t.f)} g</b><span class="muted tiny">Fett${hasN(m.sa) ? ", davon gesättigt " + nde(m.sa, 0) + " g" : ""}</span></div></div>${rows}`;
}
/* Einträge mit fehlender Angabe anzeigen und direkt nachtragen (Werte pro 100 g) */
function foodOfEntry(e) {
  const nm = String(e.name || "").toLowerCase();
  return D.foods.find(x => x.name.toLowerCase() === nm && (!e.brand || (x.brand || "").toLowerCase() === String(e.brand).toLowerCase()));
}
function missingSheet(list, ek, back) {
  const todo = list.filter(e => e.grams > 0 && !hasN(e[ek]));
  const lab = { s: "Zucker", fi: "Ballaststoffe", sa: "Gesättigte Fettsäuren", sl: "Salz" };
  const anyFood = todo.some(foodOfEntry);
  const items = todo.map(e => {
    const ms = MICRO.filter(m => !hasN(e[m.ek])).sort((a, b) => (b.ek === ek) - (a.ek === ek));
    return `<div class="card" style="margin-bottom:10px"><div class="row between"><b style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.name)}</b><span class="muted small">${r0(e.grams)} g</span></div>
      ${ms.map(m => `<div class="ing" style="padding:6px 0"><div class="grow"><div class="t">${m.name}</div><div class="muted tiny">pro 100 g · <span data-calc="${e.id}|${m.ek}">–</span></div></div><input type="text" inputmode="decimal" placeholder="–" data-me="${e.id}" data-mk="${m.ek}" aria-label="${m.name} pro 100 g für ${esc(e.name)}"></div>`).join("")}</div>`;
  }).join("");
  const s = sheet(`<button class="linkbtn" id="msBack" style="margin:-4px 0 6px">‹ Zurück</button><h3>${lab[ek]} nachtragen</h3>
    <div class="muted small" style="margin:-6px 0 12px">Trage die Werte pro 100 g von der Verpackung ein. Felder, die du leer lässt, bleiben unbekannt.</div>
    ${items || `<div class="muted center" style="padding:24px 10px">Hier fehlt nichts mehr.</div>`}
    ${anyFood ? `<label style="display:flex;gap:10px;align-items:center;margin:10px 2px"><input type="checkbox" id="msFood" checked style="width:auto"> Auch im Lebensmittel speichern (gilt dann für alle Einträge davon)</label>` : ""}
    <button class="btn block" style="margin-top:12px" id="msSave">Speichern</button><button class="btn sec block" style="margin-top:8px" id="msCancel">Abbrechen</button>`);
  const byId = id => list.find(e => e.id === id);
  $$("[data-me]", s).forEach(inp => inp.oninput = () => {
    const e = byId(inp.dataset.me), out = $(`[data-calc="${inp.dataset.me}|${inp.dataset.mk}"]`, s);
    out.textContent = inp.value.trim() === "" ? "–" : "= " + nde(num(inp.value) * e.grams / 100, inp.dataset.mk === "sl" ? 2 : 1) + " g im Eintrag";
  });
  $("#msBack", s).onclick = $("#msCancel", s).onclick = back;
  $("#msSave", s).onclick = () => {
    const toFood = $("#msFood", s) && $("#msFood", s).checked; let n = 0;
    $$("[data-me]", s).forEach(inp => {
      if (inp.value.trim() === "") return;
      const e = byId(inp.dataset.me), m = MICRO.find(x => x.ek === inp.dataset.mk), v = Math.max(0, num(inp.value));
      e[m.ek] = v * e.grams / 100; n++;
      const f = toFood && foodOfEntry(e); if (f && !hasN(f[m.fk])) f[m.fk] = v;
    });
    if (n) { fillMissingMicro(D.entries); save(); render(); toast(n + (n === 1 ? " Wert gespeichert" : " Werte gespeichert")); }
    back();
  };
  const first = $("[data-me]", s); if (first) first.focus();
}
function wireMiss(s, list, back) {
  $$("[data-miss]", s).forEach(b => b.onclick = () => missingSheet(list, b.dataset.miss, back));
}
function nutrientSheet(date) {
  date = date || ui.date;
  const list = dayEntries(date);
  if (fillMissingMicro(list)) save();
  const head = `<div class="row between" style="margin:-4px 0 12px"><button class="iconbtn" id="nvPrev" aria-label="Vorheriger Tag">${icon("left", 18)}</button><div style="text-align:center"><h3 style="margin:0">Nährstoffe</h3><div class="muted small">${niceDate(date)}, ${fromIso(date).toLocaleDateString("de-DE", { day: "numeric", month: "long" })}</div></div><button class="iconbtn" id="nvNext" aria-label="Nächster Tag">${icon("right", 18)}</button></div>`;
  const body = !list.length ? `<div class="muted center" style="padding:28px 10px">An diesem Tag ist noch nichts eingetragen.</div>`
    : nutrientBody(list) + `<div class="muted tiny" style="margin-top:12px">Richtwerte nach WHO/DGE sind eine Orientierung, keine Ernährungsberatung. Die Werte stammen aus deiner Datenbank, Scans, Rezepten oder KI-Schätzungen.</div>`;
  const s = sheet(head + body + `<button class="btn sec block" style="margin-top:16px" id="nvClose">Schließen</button>`);
  $("#nvClose", s).onclick = closeSheet;
  $("#nvPrev", s).onclick = () => nutrientSheet(addDays(date, -1));
  $("#nvNext", s).onclick = () => nutrientSheet(addDays(date, 1));
  wireMiss(s, list, () => nutrientSheet(date));
}
/* Detailansicht einer Mahlzeit (aus der Tagesübersicht) */
function mealSheet(mid, date) {
  date = date || ui.date;
  const day = dayEntries(date), list = day.filter(e => e.meal === mid || (!MEALS.some(m => m.id === e.meal) && mid === "s"));
  if (fillMissingMicro(list)) save();
  const t = sum(list), dt = sum(day), name = mealName(mid);
  const entries = list.map(e => `<div class="entry" data-eid="${e.id}" role="button" tabindex="0"><div class="nm"><div class="t">${esc(e.name)}</div>
    <div class="s"><span class="g">${r0(e.grams)} g</span><span class="cp">E ${r0(e.p)}</span><span class="cc">KH ${r0(e.c)}</span><span class="cf">F ${r0(e.f)}</span></div></div><div class="kcal">${fmt(e.kcal)}<small>kcal</small></div></div>`).join("");
  const s = sheet(`<button class="linkbtn" id="mvBack" style="margin:-4px 0 6px">‹ Tagesübersicht</button><h3>${name}</h3>
    <div class="muted small" style="margin:-6px 0 12px">${fmt(t.kcal)} kcal${dt.kcal > 0 ? ` · ${Math.round(t.kcal / dt.kcal * 100)} % des Tages` : ""} · ${list.length} ${list.length === 1 ? "Eintrag" : "Einträge"}</div>
    ${list.length ? nutrientBody(list, day) : `<div class="muted center" style="padding:24px 10px">In dieser Mahlzeit ist nichts eingetragen.</div>`}
    ${list.length ? `<h2 style="margin:18px 2px 4px">Einträge</h2><div class="list">${entries}</div><div class="muted tiny" style="margin:8px 4px 0">Tippe einen Eintrag an, um ihn genauer zu sehen oder zu ändern.</div>` : ""}
    <button class="btn sec block" style="margin-top:16px" id="mvClose">Schließen</button>`);
  $("#mvBack", s).onclick = () => dayChart();
  $("#mvClose", s).onclick = closeSheet;
  wireMiss(s, list, () => mealSheet(mid, date));
  $$("[data-eid]", s).forEach(el => el.onclick = () => editEntry(el.dataset.eid));
}

/* ---------- Verlauf über den Tag (kumuliert nach Uhrzeit) ---------- */
const TC_MET = { kcal: { n: "Kalorien", u: "kcal", k: "kcal", col: "var(--accent)" }, p: { n: "Eiweiß", u: "g", k: "p", col: "var(--p)" }, c: { n: "Kohlenhydrate", u: "g", k: "c", col: "var(--c)" }, f: { n: "Fett", u: "g", k: "f", col: "var(--f)" } };
const tMin = t => +t.slice(0, 2) * 60 + +t.slice(3);
function timeChartHtml(list, mk) {
  const M = TC_MET[mk], g = goals(), goal = mk === "kcal" ? g.kcal : g[mk], fmtv = v => M.u === "kcal" ? fmt(v) : nde(v, 0);
  const withT = list.filter(e => timeOk(e.t)).sort((a, b) => a.t.localeCompare(b.t)), noT = list.length - withT.length;
  const chips = `<div class="tcchips">${Object.entries(TC_MET).map(([k, m]) => `<button class="tcchip ${k === mk ? "on" : ""}" data-tcm="${k}" style="--cc:${m.col}">${m.n}</button>`).join("")}</div>`;
  const note = noT ? `<div class="muted tiny" style="margin-top:8px">${noT} ${noT === 1 ? "Eintrag hat" : "Einträge haben"} keine Uhrzeit und ${noT === 1 ? "fehlt" : "fehlen"} hier. Tippe den Eintrag an und stelle die Uhrzeit ein.</div>` : "";
  if (!withT.length) return chips + `<div class="muted center" style="padding:20px 10px">Noch keine Uhrzeiten an diesem Tag. Neue Einträge von heute bekommen automatisch die aktuelle Uhrzeit.</div>` + note;
  const today = ui.date === iso(new Date()), nowM = today ? tMin(nowT()) : 0;
  let cum = 0; const pts = withT.map(e => { cum += e[M.k]; return { m: tMin(e.t), v: cum, e }; });
  const total = cum, first = pts[0].m, last = Math.max(pts[pts.length - 1].m, nowM);
  let lo = Math.max(0, Math.floor(first / 60) - 1) * 60, hi = Math.min(1440, (Math.ceil(last / 60) + 1) * 60);
  if (hi - lo < 360) { hi = Math.min(1440, lo + 360); lo = Math.max(0, hi - 360); }
  const W = 340, H = 190, L = 40, R = 10, T = 12, B = 26, pw = W - L - R, ph = H - T - B;
  const ymax = Math.max(total, goal > 0 ? goal : 0, 1) * 1.08, X = m => L + (m - lo) / (hi - lo) * pw, Y = v => T + ph - v / ymax * ph;
  const step = hi - lo <= 480 ? 60 : hi - lo <= 840 ? 120 : 180;
  let xt = ""; for (let m = Math.ceil(lo / step) * step; m <= hi; m += step) xt += `<line x1="${X(m)}" x2="${X(m)}" y1="${T}" y2="${T + ph}" stroke="var(--line)"/><text x="${X(m)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${m / 60}</text>`;
  let yt = ""; for (let i = 0; i <= 4; i++) { const v = ymax / 1.08 * i / 4; yt += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 5}" y="${Y(v) + 3}" text-anchor="end" font-size="10" fill="var(--muted)">${fmtv(v)}</text>`; }
  const path = [{ m: lo, v: 0 }, ...pts, ...(today && nowM > pts[pts.length - 1].m ? [{ m: nowM, v: total }] : [])];
  const d = path.map((q, i) => (i ? "L" : "M") + X(q.m).toFixed(1) + " " + Y(q.v).toFixed(1)).join(" ");
  const area = d + ` L${X(path[path.length - 1].m).toFixed(1)} ${T + ph} L${X(lo)} ${T + ph}Z`;
  const goalLine = goal > 0 ? `<line x1="${L}" x2="${W - R}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="var(--muted)" stroke-dasharray="4 4"/><text x="${W - R}" y="${Y(goal) - 4}" text-anchor="end" font-size="10" fill="var(--muted)">Ziel ${fmtv(goal)}</text>` : "";
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Verlauf ${M.n} über den Tag">${yt}${xt}${goalLine}<path d="${area}" fill="${M.col}" opacity=".13"/><path d="${d}" fill="none" stroke="${M.col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${pts.map(q => `<circle cx="${X(q.m).toFixed(1)}" cy="${Y(q.v).toFixed(1)}" r="3.5" fill="${M.col}" stroke="var(--card)" stroke-width="1.5"/>`).join("")}</svg>`;
  const part = (a, b) => total > 0 ? Math.round(withT.filter(e => { const m = tMin(e.t); return m >= a && m < b; }).reduce((x, e) => x + e[M.k], 0) / total * 100) : 0;
  const pa = part(0, 720), pb = part(720, 1080), pc = part(1080, 1441);
  const split = `<div class="tcsplit"><div><b>${pa} %</b><span>vor 12 Uhr</span></div><div><b>${pb} %</b><span>12 bis 18 Uhr</span></div><div><b>${pc} %</b><span>nach 18 Uhr</span></div></div>`;
  const items = pts.map(q => `<div class="tcrow" data-eid="${q.e.id}" role="button" tabindex="0"><span class="tt">${q.e.t}</span><span class="tn">${esc(q.e.name)}</span><span class="tv">+${fmtv(q.e[M.k])} ${M.u}<small>Σ ${fmtv(q.v)}</small></span></div>`).join("");
  return chips + `<div class="muted small" style="margin:2px 2px 4px">${M.n} über den Tag: <b style="color:var(--text)">${fmtv(total)} ${M.u}</b>${goal > 0 ? ` von ${fmtv(goal)}` : ""}, Uhrzeit in Stunden</div>${svg}${split}<div class="list" style="padding:0 14px;margin-top:10px">${items}</div>${note}`;
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
  const gp = (v, goal) => goal > 0 ? Math.round(v / goal * 100) : 0;
  const leg = (name, col, grams, goal, kc) => `<div class="li"><i style="background:${col}"></i><div><b>${r0(grams)} g</b><div class="muted tiny">${name} · ${pc(kc)} %</div></div><span><b style="color:var(--text)">${gp(grams, goal)} %</b><br>von ${r0(goal)} g</span></div>`;
  const meals = MEALS.map(m => ({ m, es: list.filter(e => e.meal === m.id) })).filter(x => x.es.length).map(x => ({ ...x, s: sum(x.es) }));
  const maxK = Math.max(...meals.map(x => x.s.kcal), 1);
  const rows = meals.map(({ m, s }) => {
    const mk = s.p * 4 + s.c * 4 + s.f * 9 || 1, scale = s.kcal / maxK * 100;
    return `<div class="mrow tap" data-mrow="${m.id}" role="button" tabindex="0" aria-label="${m.name} im Detail"><div class="mt"><b>${m.name}</b><span>${fmt(s.kcal)} kcal${t.kcal > 0 ? ", " + Math.round(s.kcal / t.kcal * 100) + " % des Tages" : ""} ${icon("right", 14, 2.4)}</span></div>
      <div class="stack"><div style="display:flex;width:${scale}%;height:100%"><i class="p" style="width:${s.p * 4 / mk * 100}%"></i><i class="c" style="width:${s.c * 4 / mk * 100}%"></i><i class="f" style="width:${s.f * 9 / mk * 100}%"></i></div></div>
      <div class="mg"><span class="cp">Eiweiß ${r0(s.p)} g</span><span class="cc">Kohlenh. ${r0(s.c)} g</span><span class="cf">Fett ${r0(s.f)} g</span></div></div>`;
  }).join("");
  sheet(`<h3>${niceDate(ui.date)}</h3><div class="row between" style="margin:-6px 0 14px;gap:8px"><span class="muted small">${fmt(t.kcal)} von ${fmt(g.kcal)} kcal</span><span class="pill ${g.kcal > 0 && t.kcal > g.kcal * 1.1 ? "bad" : g.kcal > 0 && t.kcal >= g.kcal * 0.9 ? "good" : ""}" style="margin:0">${gp(t.kcal, g.kcal)} % vom Ziel</span></div>
    ${list.length ? `<div class="donutwrap"><div class="donut">${donut}<div class="mid"><b>${fmt(t.kcal)}</b><span>kcal</span></div></div>
      <div class="dleg">${leg("Eiweiß", "var(--p)", t.p, g.p, kP)}${leg("Kohlenh.", "var(--c)", t.c, g.c, kC)}${leg("Fett", "var(--f)", t.f, g.f, kF)}</div></div>
      <h2 style="margin:6px 2px 4px">Nach Mahlzeit</h2><div class="list" style="padding:0 16px">${rows}</div>
      <div class="muted tiny" style="margin:10px 4px 0">Die Balken zeigen, woher die Kalorien jeder Mahlzeit kommen. Tippe eine Mahlzeit an für alle Nährstoffe und Einträge. Neben dem Namen steht der Anteil an den Kalorien (Eiweiß, Kohlenhydrate, Fett), rechts wie viel Prozent deines Tagesziels in Gramm schon erreicht sind.</div>
      <h2 style="margin:18px 2px 6px">Verlauf über den Tag</h2><div id="tcBox"></div>
      <button class="btn sec block" style="margin-top:14px" id="dcNutri">Alle Nährstoffe des Tages</button>`
      : `<div class="muted center" style="padding:30px 10px">Heute ist noch nichts eingetragen. Sobald du etwas hinzufügst, siehst du hier die Verteilung.</div>`}
    <button class="btn sec block" style="margin-top:16px" id="dcClose">Schließen</button>`, s => {
    $("#dcClose", s).onclick = closeSheet;
    $$("[data-mrow]", s).forEach(el => { const go = () => mealSheet(el.dataset.mrow, ui.date); el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } }; });
    if ($("#dcNutri", s)) $("#dcNutri", s).onclick = () => nutrientSheet(ui.date);
    const box = $("#tcBox", s);
    if (box) {
      const draw = () => {
        box.innerHTML = timeChartHtml(list, ui.tcMetric || "kcal");
        $$("[data-tcm]", box).forEach(b => b.onclick = () => { ui.tcMetric = b.dataset.tcm; draw(); });
        $$("[data-eid]", box).forEach(el => { const go = () => editEntry(el.dataset.eid); el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } }; });
      };
      draw();
    }
  });
}

/* Eintrag bearbeiten */
/* Zutaten eines Rezept-Eintrags (Kopie am Eintrag, das Rezept selbst bleibt unverändert) */
function entryIngs(e) {
  if (Array.isArray(e.ings) && e.ings.length) return e.ings.map(i => ({ ...i }));
  const r = recipeFor(e); if (!r || !r.items || !r.items.length) return null;
  const tot = r.items.reduce((a, i) => a + i.grams, 0), k = tot > 0 ? e.grams / tot : 1;
  return r.items.map(i => ({ name: i.name, grams: i.grams * k, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat, ...pick100(i) }));
}
function editEntry(id) {
  const e = D.entries.find(x => x.id === id); if (!e) return;
  if (fillMissingMicro([e])) save();
  const ings = entryIngs(e), gf = e.gf > 0 ? e.gf : 1; // Waage fertig / Summe Zutaten
  let dirty = false;
  const tot = () => { const t = { g: 0, kcal: 0, p: 0, c: 0, f: 0 }; ings.forEach(i => { if (i.off) return; const c = calc(i, i.grams); t.g += i.grams; t.kcal += c.kcal; t.p += c.p; t.c += c.c; t.f += c.f; }); return t; };
  const line = t => `${r0(t.kcal)} kcal · E ${r1(t.p)} · KH ${r1(t.c)} · F ${r1(t.f)}`;
  const ingHtml = ings ? `<div class="mealtools" style="margin-top:16px"><b>Zutaten nur für diesen Eintrag</b></div>
    <div class="muted small" style="margin:2px 0 8px">Mengen ändern oder Zutaten abwählen. Das gespeicherte Rezept bleibt unverändert, beim nächsten Mal ist wieder alles wie im Rezept.</div>
    ${ings.map((i, k) => `<div class="row" data-i="${k}" style="gap:8px;margin-bottom:8px"><input type="checkbox" ${i.off ? "" : "checked"} data-o style="width:22px;height:22px"><div class="grow" style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.name)}</div></div><input type="text" inputmode="decimal" value="${r0(i.grams)}" data-g style="width:84px;flex:none"><span class="muted small">g</span></div>`).join("")}
    <div class="muted small" id="eiSum" style="margin-top:4px"></div>` : "";
  const s = sheet(`<h3>${esc(e.name)}</h3><div id="eNut"></div>
    ${ings ? "" : `<label>Menge (g)</label><input type="text" inputmode="decimal" id="eg" value="${r0(e.grams)}">`}${ings ? `<label>Menge gesamt (g)</label><input type="text" inputmode="decimal" id="eg" value="${r0(e.grams)}">` : ""}
    ${ingHtml}
    <label>Uhrzeit</label><input type="time" id="et" value="${timeOk(e.t) ? e.t : ""}">
    <label>Mahlzeit</label><select id="em">${MEALS.map(m => `<option value="${m.id}" ${m.id === e.meal ? "selected" : ""}>${m.name}</option>`).join("")}</select>
    <button class="btn block" style="margin-top:14px" id="es">Speichern</button>
    <button class="btn danger block" style="margin-top:8px" id="ed">Eintrag löschen</button>`);
  // Nährstoff-Aufschlüsselung dieses Eintrags (rechnet bei Änderungen live mit)
  const curVals = () => {
    if (ings && dirty) { const t = tot(), mi = microFromIngs(ings), v = { kcal: t.kcal, p: t.p, c: t.c, f: t.f }; MICRO.forEach(m => { v[m.ek] = hasN(mi[m.ek]) ? mi[m.ek] : (hasN(e[m.ek]) && e.kcal > 0 ? e[m.ek] * t.kcal / e.kcal : undefined); }); return v; }
    const g = num(($("#eg", s) || {}).value), k = g > 0 && e.grams > 0 ? g / e.grams : 1, v = { kcal: e.kcal * k, p: e.p * k, c: e.c * k, f: e.f * k };
    MICRO.forEach(m => { v[m.ek] = hasN(e[m.ek]) ? e[m.ek] * k : undefined; }); return v;
  };
  const drawNut = () => {
    const v = curVals(), kt = v.p * 4 + v.c * 4 + v.f * 9 || 1, refs = microRefs(), pc = x => Math.round(x / kt * 100);
    $("#eNut", s).innerHTML = `<div class="nsum" style="margin-top:6px"><div><b>${fmt(v.kcal)}</b><span class="muted tiny">kcal</span></div><div><b>${r1(v.p)} g</b><span class="muted tiny cp">Eiweiß · ${pc(v.p * 4)} % der kcal</span></div>
      <div><b>${r1(v.c)} g</b><span class="muted tiny cc">Kohlenhydrate · ${pc(v.c * 4)} %</span></div><div><b>${r1(v.f)} g</b><span class="muted tiny cf">Fett · ${pc(v.f * 9)} %</span></div></div>
      <div class="stack" style="margin:2px 0 10px"><div style="display:flex;width:100%;height:100%"><i class="p" style="width:${v.p * 4 / kt * 100}%"></i><i class="c" style="width:${v.c * 4 / kt * 100}%"></i><i class="f" style="width:${v.f * 9 / kt * 100}%"></i></div></div>
      ${MICRO.map(x => { const val = v[x.ek], ref = refs[x.ek], isMin = ref.min != null, lim = isMin ? ref.min : ref.max;
        return `<div class="row between" style="padding:5px 2px;font-size:14.5px"><span>${x.ek === "s" ? "davon Zucker" : x.ek === "sa" ? "davon gesättigt" : x.name}</span>${hasN(val) ? `<span><b>${nde(val, x.ek === "sl" ? 2 : 1)} g</b> <span class="muted tiny">${Math.round(val / lim * 100)} % ${isMin ? "des Tagesziels" : "des Tageslimits"}</span></span>` : `<span class="muted small">nicht bekannt</span>`}</div>`; }).join("")}`;
  };
  drawNut();
  if ($("#eg", s)) $("#eg", s).oninput = () => { if (!ings) drawNut(); };
  const refresh = () => { drawNut(); if (!ings) return; const t = tot(); $("#eiSum", s).textContent = "Summe: " + r0(t.g * gf) + " g · " + line(t); $("#eg", s).value = r0(t.g * gf); };
  if (ings) {
    refresh();
    $$("[data-i]", s).forEach(row => {
      const i = ings[+row.dataset.i];
      $("[data-o]", row).onchange = ev => { i.off = !ev.target.checked; dirty = true; refresh(); };
      $("[data-g]", row).oninput = ev => { i.grams = Math.max(0, num(ev.target.value)); dirty = true; refresh(); };
    });
    // Gesamtmenge ändern = alle Zutaten anteilig skalieren
    $("#eg", s).onchange = ev => { const g = num(ev.target.value), t = tot(); if (g > 0 && t.g > 0) { const k = g / (t.g * gf); ings.forEach(i => { if (!i.off) i.grams *= k; }); $$("[data-i]", s).forEach(row => { $("[data-g]", row).value = r0(ings[+row.dataset.i].grams); }); dirty = true; } refresh(); };
  }
  $("#es", s).onclick = () => {
    if (ings && dirty) {
      const t = tot(); if (t.g <= 0) return toast("Mindestens eine Zutat mit Menge");
      const old = e.kcal || 0, mi = microFromIngs(ings);
      MICRO.forEach(m => { if (hasN(mi[m.ek])) e[m.ek] = mi[m.ek]; else if (hasN(e[m.ek]) && old > 0) e[m.ek] *= t.kcal / old; });
      e.kcal = t.kcal; e.p = t.p; e.c = t.c; e.f = t.f; e.grams = t.g * gf; e.ings = ings;
    } else {
      const g = num($("#eg", s).value); if (g <= 0) return toast("Menge eingeben");
      const k = g / e.grams; e.kcal *= k; e.p *= k; e.c *= k; e.f *= k; scaleMicro(e, k); e.grams = g;
      if (Array.isArray(e.ings)) e.ings = e.ings.map(i => ({ ...i, grams: i.grams * k }));
    }
    e.meal = $("#em", s).value;
    const tv = $("#et", s).value; if (timeOk(tv)) e.t = tv; else delete e.t;
    save(); closeSheet(); render();
  };
  $("#ed", s).onclick = () => { D.entries = D.entries.filter(x => x.id !== id); save(); closeSheet(); render(); };
}

/* Lebensmittel verwalten */
function foodsManage() {
  const s = sheet(`<h3>Meine Lebensmittel</h3><input type="search" id="fq" placeholder="Filtern …">
    <div class="row between" style="margin:10px 2px 4px"><button class="linkbtn" id="fMode" style="margin:0">Auswählen</button><button class="linkbtn" id="fAll" style="margin:0;display:none">Alle auswählen</button></div>
    <div id="fl"></div><div id="fBar"></div>`);
  let selMode = false;
  const sel = new Set();
  const filtered = () => {
    const t = $("#fq", s).value.trim().toLowerCase();
    return D.foods.filter(f => !t || (f.name + " " + f.brand + " " + f.barcode).toLowerCase().includes(t)).sort((a, b) => a.name.localeCompare(b.name, "de"));
  };
  const draw = () => {
    const all = filtered(), list = all.slice(0, 100);
    $("#fl", s).innerHTML = list.length ? list.map(f => `<div class="res ${selMode ? "selrow" : ""}" data-id="${f.id}">${selMode ? `<span class="cbx ${sel.has(f.id) ? "on" : ""}">${sel.has(f.id) ? icon("check", 14, 3) : ""}</span>` : ""}${foodLine(f)}</div>`).join("") + (all.length > 100 ? `<div class="muted small center" style="padding:10px">${list.length} von ${all.length} angezeigt – Filter nutzen oder „Alle auswählen“</div>` : "") : `<div class="muted center" style="padding:18px">Keine Lebensmittel.</div>`;
    $$("[data-id]", s).forEach(el => el.onclick = () => {
      if (!selMode) return foodEdit(D.foods.find(f => f.id === el.dataset.id));
      const id = el.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); draw();
    });
    $("#fMode", s).textContent = selMode ? "Fertig" : "Auswählen";
    $("#fAll", s).style.display = selMode ? "" : "none";
    $("#fAll", s).textContent = all.length && all.every(f => sel.has(f.id)) ? "Auswahl aufheben" : "Alle auswählen (" + all.length + ")";
    $("#fBar", s).innerHTML = selMode && sel.size ? `<button class="btn danger block" style="margin-top:12px" id="fDel">${sel.size} ${sel.size === 1 ? "Lebensmittel" : "Lebensmittel"} löschen</button>` : "";
    const del = $("#fDel", s);
    if (del) del.onclick = () => {
      const n = sel.size, ids = new Set(sel);
      const c = sheet(`<h3>${n} ${n === 1 ? "Lebensmittel" : "Lebensmittel"} löschen?</h3><div class="muted small" style="margin-bottom:14px">Sie werden aus „Meine Lebensmittel“ entfernt. Bereits ins Tagebuch eingetragene Mahlzeiten und Rezepte bleiben unverändert.</div>
        <button class="btn danger block" id="fdGo">Endgültig löschen</button><button class="btn sec block" style="margin-top:8px" id="fdNo">Abbrechen</button>`);
      $("#fdNo", c).onclick = () => foodsManage();
      $("#fdGo", c).onclick = () => { D.foods = D.foods.filter(f => !ids.has(f.id)); save(); toast(n + " gelöscht"); render(); foodsManage(); };
    };
  };
  $("#fq", s).oninput = draw;
  $("#fMode", s).onclick = () => { selMode = !selMode; if (!selMode) sel.clear(); draw(); };
  $("#fAll", s).onclick = () => { const all = filtered(), every = all.every(f => sel.has(f.id)); all.forEach(f => every ? sel.delete(f.id) : sel.add(f.id)); draw(); };
  draw();
}
/* Geändertes Lebensmittel auch in Rezepten übernehmen (Zutaten werden über den Namen zugeordnet) */
function recipeSyncSheet(f, oldName, hits) {
  const cnt = hits.reduce((a, r) => a + r.items.filter(i => String(i.name).toLowerCase() === oldName).length, 0);
  const s = sheet(`<h3>Gespeichert</h3><p class="muted" style="margin:0 0 14px">„${esc(f.name)}“ steckt in ${hits.length} ${hits.length === 1 ? "Rezept" : "Rezepten"} (${cnt} ${cnt === 1 ? "Zutat" : "Zutaten"}):</p>
    <div class="card" style="margin-bottom:14px">${hits.map(r => `<div style="padding:3px 0">${esc(r.name)}</div>`).join("")}</div>
    <div class="muted small" style="margin-bottom:6px">Soll die Änderung dort auch gelten? Bereits eingetragene Mahlzeiten bleiben unverändert.</div>
    <button class="btn block" style="margin-top:10px" id="rsYes">In ${hits.length === 1 ? "dem Rezept" : "allen Rezepten"} übernehmen</button>
    <button class="btn sec block" style="margin-top:8px" id="rsNo">Nur das Lebensmittel ändern</button>`);
  $("#rsNo", s).onclick = () => { closeSheet(); render(); toast("Gespeichert"); };
  $("#rsYes", s).onclick = () => {
    hits.forEach(r => r.items.forEach(i => {
      if (String(i.name).toLowerCase() !== oldName) return;
      i.name = f.name; i.kcal = num(f.kcal); i.protein = num(f.protein); i.carbs = num(f.carbs); i.fat = num(f.fat);
      MICRO.forEach(m => { if (hasN(f[m.fk])) i[m.fk] = f[m.fk]; else delete i[m.fk]; });
    }));
    save(); closeSheet(); render(); toast(hits.length + (hits.length === 1 ? " Rezept aktualisiert" : " Rezepte aktualisiert"));
  };
}
/* after: wird nach Speichern/Abbrechen statt „Sheet schließen“ aufgerufen (z. B. zurück zur Kostenübersicht);
   draft: f ist ein Entwurf (neues Lebensmittel aus einem Eintrag), wird beim Speichern neu angelegt */
function foodEdit(f, after, draft) {
  const existing = f && !draft;
  const s = sheet(`<h3>${existing ? "Lebensmittel bearbeiten" : "Neues Lebensmittel"}</h3>${foodForm(f)}
    <button class="btn block" style="margin-top:14px" id="fs">Speichern</button>
    ${existing ? `<button class="btn danger block" style="margin-top:8px" id="fd">Löschen</button>` : ""}
    <button class="btn sec block" style="margin-top:8px" id="fb">Abbrechen</button>`);
  bindPaste(s, () => { closeSheet(); render(); });
  $("#fs", s).onclick = () => {
    const n = readFoodForm(s, existing ? f : null); if (!n) return;
    const oldName = existing ? String(f.name).toLowerCase() : "";
    const nutKey = x => [x.name, x.kcal || 0, x.protein || 0, x.carbs || 0, x.fat || 0, ...MICRO.map(m => x[m.fk] || 0)].join("|");
    const changed = existing && nutKey(f) !== nutKey(n);
    if (existing) { Object.assign(f, n); if (!(n.price > 0)) { delete f.price; delete f.priceG; } } else D.foods.push(n);
    save();
    const hits = changed ? D.recipes.filter(r => (r.items || []).some(i => String(i.name).toLowerCase() === oldName)) : [];
    if (hits.length) return recipeSyncSheet(f, oldName, hits);
    if (after) { render(); toast("Gespeichert"); return after(); }
    closeSheet(); render(); toast("Gespeichert");
  };
  if (existing) $("#fd", s).onclick = () => { D.foods = D.foods.filter(x => x !== f); save(); closeSheet(); render(); };
  $("#fb", s).onclick = () => { if (after) after(); else closeSheet(); };
  if (after && $("#fPrice", s)) setTimeout(() => $("#fPrice", s) && $("#fPrice", s).focus(), 250);
}

/* ---------- CSV ---------- */
const CSV_COLS = ["name", "brand", "barcode", "kcal", "fat", "sat", "carbs", "sugar", "protein", "fiber", "salt", "serving", "price", "priceG"];
const CSV_HEAD = ["name", "marke", "barcode", "kcal", "fett", "gesaettigt", "kohlenhydrate", "zucker", "eiweiss", "ballaststoffe", "salz", "portion_g", "preis_eur", "preis_menge_g"];
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
    kohlenhydrate: "carbs", carbs: "carbs", kh: "carbs", zucker: "sugar", sugar: "sugar", eiweiss: "protein", "eiweiß": "protein", protein: "protein", ballaststoffe: "fiber", fiber: "fiber", gesaettigt: "sat", "gesättigt": "sat", gesaettigte_fettsaeuren: "sat", "gesättigte_fettsäuren": "sat", sat: "sat", salz: "salt", salt: "salt", portion_g: "serving", portion: "serving", serving: "serving", preis_eur: "price", preis: "price", price: "price", preis_menge_g: "priceG", preis_fuer_g: "priceG", price_g: "priceG" };
  const idx = {};
  rows[0].forEach((h, i) => { const k = alias[h.trim().toLowerCase()]; if (k && idx[k] == null) idx[k] = i; });
  if (idx.name == null) throw new Error("Spalte „name“ fehlt in der CSV");
  let added = 0, updated = 0;
  rows.slice(1).forEach(r => {
    const g = k => idx[k] == null ? "" : (r[idx[k]] ?? "").trim();
    const name = g("name"); if (!name) return;
    const f = { name, brand: g("brand"), barcode: g("barcode").replace(/\D/g, ""), kcal: num(g("kcal")), protein: num(g("protein")), carbs: num(g("carbs")), fat: num(g("fat")), sugar: num(g("sugar")), fiber: num(g("fiber")), sat: num(g("sat")), salt: num(g("salt")), serving: num(g("serving")) || 100 };
    if (idx.sat == null) delete f.sat; if (idx.salt == null) delete f.salt;
    { const pr = num(g("price")), pg = num(g("priceG")); if (pr > 0 && pg > 0) { f.price = pr; f.priceG = pg; } }
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
/* ---- Protokoll für KI-Analyse (Tag/Zeitraum) ---- */
const nde = (v, d = 1) => (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString("de-DE", { maximumFractionDigits: d });
const dLong = x => fromIso(x).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
/* ---------- Kosten des Tages ---------- */
/* Preis je Eintrag: Einzel-Lebensmittel = Preis des Lebensmittels (gleicher Name) für die gegessene Menge.
   Rezept = Summe der Zutaten: jede Zutat (mit ihrer Menge in diesem Eintrag, also anteilig) zum Preis des gleichnamigen Lebensmittels. */
function foodByName(name, brand) {
  const nm = String(name || "").toLowerCase(), all = D.foods.filter(x => x.name.toLowerCase() === nm);
  return (brand && all.find(x => (x.brand || "").toLowerCase() === String(brand).toLowerCase())) || all.find(x => hasPrice(x)) || all[0] || null;
}
const rdObj = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * 100) / 100 : v]));
function dayCost(date) {
  const items = dayEntries(date).map(e => {
    const ings = entryIngs(e), parts = [];
    if (ings) ings.filter(i => !i.off).forEach(i => { const f = foodByName(i.name); parts.push({ name: i.name, grams: i.grams, food: f, cost: priceOf(f, i.grams), draft: rdObj({ name: i.name, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat, ...pick100(i), serving: 100 }) }); });
    else { const f = foodByName(e.name, e.brand), k = e.grams > 0 ? 100 / e.grams : 0; parts.push({ name: e.name, grams: e.grams, food: f, cost: priceOf(f, e.grams), draft: rdObj({ name: e.name, brand: e.brand || "", kcal: e.kcal * k, protein: e.p * k, carbs: e.c * k, fat: e.f * k, ...Object.fromEntries(MICRO.filter(m => hasN(e[m.ek])).map(m => [m.fk, e[m.ek] * k])), serving: 100 }) }); }
    const known = parts.filter(x => x.cost != null), missing = parts.filter(x => x.cost == null);
    return { e, ings: !!ings, parts, cost: known.reduce((a, x) => a + x.cost, 0), missing };
  });
  const total = items.reduce((a, x) => a + x.cost, 0), missing = items.reduce((a, x) => a + x.missing.length, 0);
  return { items, total, missing };
}
function costSheet(date) {
  date = date || ui.date;
  const C = dayCost(date), back = () => costSheet(date);
  const head = `<div class="row between" style="margin:-4px 0 12px"><button class="iconbtn" id="ksPrev" aria-label="Vorheriger Tag">${icon("left", 18)}</button><div style="text-align:center"><h3 style="margin:0">Kosten</h3><div class="muted small">${niceDate(date)}, ${fromIso(date).toLocaleDateString("de-DE", { day: "numeric", month: "long" })}</div></div><button class="iconbtn" id="ksNext" aria-label="Nächster Tag">${icon("right", 18)}</button></div>`;
  let body;
  if (!C.items.length) body = `<div class="muted center" style="padding:28px 10px">An diesem Tag ist noch nichts eingetragen.</div>`;
  else {
    const partRow = (x, k, j) => `<div class="ksrow ${x.cost == null ? "miss" : ""}" ${x.cost == null ? `data-fix="${k}.${j}" role="button" tabindex="0"` : ""}><span class="kn">${esc(x.name)} <span class="muted tiny">${r0(x.grams)} g</span></span><span class="kv">${x.cost != null ? eurFmt(x.cost) : "Preis fehlt ›"}</span></div>`;
    const rows = C.items.map((it, k) => {
      if (!it.ings) return partRow(it.parts[0], k, 0).replace('class="ksrow', 'class="ksrow main');
      return `<div class="ksrec"><div class="ksrow main"><span class="kn">${esc(it.e.name)} <span class="muted tiny">Rezept · ${r0(it.e.grams)} g</span></span><span class="kv">${eurFmt(it.cost)}${it.missing.length ? "*" : ""}</span></div>${it.parts.map((x, j) => partRow(x, k, j).replace('class="ksrow', 'class="ksrow sub')).join("")}</div>`;
    }).join("");
    body = `<div class="card nsum" style="grid-template-columns:1fr"><div><b>${eurFmt(C.total)}</b><span class="muted tiny">${C.missing ? `bisher berechnet, bei ${C.missing} ${C.missing === 1 ? "Zutat/Eintrag fehlt" : "Zutaten/Einträgen fehlt"} der Preis` : "Gesamtkosten des Tages"}</span></div></div>
      ${C.missing ? `<div class="muted small" style="margin:10px 2px 4px">Tippe auf „Preis fehlt“, um direkt zum Lebensmittel zu springen und den Preis einzutragen.</div>` : ""}
      <div class="list" style="padding:4px 14px;margin-top:10px">${rows}</div>
      <div class="muted tiny" style="margin:10px 4px 0">Der Preis kommt aus „Meine Lebensmittel“ (Preis für eine Menge). Bei Rezepten zählt jede Zutat anteilig für die Menge, die du gegessen hast. Zugeordnet wird über den Namen.${C.items.some(i => i.ings && i.missing.length) ? " * = unvollständig." : ""}</div>`;
  }
  const s = sheet(head + body + `<button class="btn sec block" style="margin-top:16px" id="ksClose">Schließen</button>`);
  $("#ksClose", s).onclick = closeSheet;
  $("#ksPrev", s).onclick = () => costSheet(addDays(date, -1));
  $("#ksNext", s).onclick = () => costSheet(addDays(date, 1));
  $$("[data-fix]", s).forEach(el => { const go = () => { const [k, j] = el.dataset.fix.split(".").map(Number), x = C.items[k].parts[j]; if (x.food) foodEdit(x.food, back); else foodEdit(x.draft, back, true); }; el.onclick = go; el.onkeydown = ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } }; });
}

function recipeFor(e) { return (e.rid && D.recipes.find(r => r.id === e.rid)) || D.recipes.find(r => r.name === e.name) || null; }
function buildReport(from, to) {
  for (let d = from; d <= to; d = addDays(d, 1)) fillMissingMicro(dayEntries(d));
  const g = goals(), s = D.settings, days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const rows = days.map(d => { const es = dayEntries(d); return { d, es, t: sum(es) }; });
  const logged = rows.filter(r => r.es.length);
  const out = [];
  out.push("# FoodPro – Ernährungsprotokoll");
  out.push(from === to ? `Tag: ${dLong(from)}` : `Zeitraum: ${dLong(from)} bis ${dLong(to)} (${days.length} Tage)`);
  out.push("Nährwerte stammen aus Datenbank, Rezepten oder KI-Schätzung und sind Näherungswerte.");
  if (D.entries.some(e => e.date >= from && e.date <= to && timeOk(e.t))) out.push("Uhrzeiten (HH:MM) geben an, wann der Eintrag erfasst wurde, also ungefähr wann gegessen wurde. Einträge ohne Uhrzeit sind ohne Angabe.");
  out.push("", "## Tagesziele");
  out.push(`- Kalorien: ${nde(g.kcal, 0)} kcal`);
  out.push(`- Eiweiß: ${nde(g.p, 0)} g (${s.pP} %) · Kohlenhydrate: ${nde(g.c, 0)} g (${s.pC} %) · Fett: ${nde(g.f, 0)} g (${s.pF} %)`);
  { const rf = microRefs(); out.push(`- Richtwerte (Orientierung): Zucker unter ${nde(rf.s.max, 0)} g · Ballaststoffe mindestens ${nde(rf.fi.min, 0)} g · gesättigte Fettsäuren unter ${nde(rf.sa.max, 0)} g · Salz höchstens ${nde(rf.sl.max, 0)} g pro Tag`); }
  if (s.goalWeight) out.push(`- Zielgewicht: ${s.goalWeight} kg`);
  if (days.length > 1) {
    const a = sum(logged.flatMap(r => r.es)), L = logged.length || 1;
    out.push("", "## Zusammenfassung");
    out.push(`- Erfasste Tage: ${logged.length} von ${days.length}`);
    if (logged.length) {
      out.push(`- Durchschnitt pro erfasstem Tag: ${nde(a.kcal / L, 0)} kcal · Eiweiß ${nde(a.p / L, 0)} g · Kohlenhydrate ${nde(a.c / L, 0)} g · Fett ${nde(a.f / L, 0)} g`);
      { const mm = microSum(logged.flatMap(r => r.es)); out.push(`- Durchschnitt weitere Nährstoffe pro erfasstem Tag: Zucker ${nde(mm.s / L)} g · Ballaststoffe ${nde(mm.fi / L)} g · gesättigte Fettsäuren ${nde(mm.sa / L)} g · Salz ${nde(mm.sl / L, 2)} g${microMissNote(mm)}`); }
      out.push(`- Tage im Zielbereich (±10 % vom Kalorienziel): ${logged.filter(r => Math.abs(r.t.kcal - g.kcal) <= g.kcal * 0.1).length}`);
    }
    const ws = days.filter(d => D.weights[d] != null);
    if (ws.length) out.push(`- Gewicht: ${nde(D.weights[ws[0]])} kg (${fromIso(ws[0]).toLocaleDateString("de-DE")}) → ${nde(D.weights[ws[ws.length - 1]])} kg (${fromIso(ws[ws.length - 1]).toLocaleDateString("de-DE")})`);
    out.push("", "| Datum | kcal | Eiweiß g | Kohlenh. g | Fett g | Zucker g | Ballaststoffe g | ges. Fett g | Salz g | Gewicht kg |", "|---|---|---|---|---|---|---|---|---|---|");
    rows.forEach(r => out.push(`| ${fromIso(r.d).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })} | ${r.es.length ? nde(r.t.kcal, 0) : "–"} | ${r.es.length ? nde(r.t.p, 0) : "–"} | ${r.es.length ? nde(r.t.c, 0) : "–"} | ${r.es.length ? nde(r.t.f, 0) : "–"} | ${(() => { if (!r.es.length) return "– | – | – | –"; const q = microSum(r.es); return [nde(q.s, 0), nde(q.fi, 0), nde(q.sa, 0), nde(q.sl, 1)].join(" | "); })()} | ${D.weights[r.d] != null ? nde(D.weights[r.d]) : ""} |`));
  }
  const order = MEALS.map(m => m.id);
  rows.forEach(r => {
    out.push("", `## ${dLong(r.d)}`);
    if (!r.es.length) { out.push("Keine Einträge."); if (D.weights[r.d] != null) out.push(`Gewicht: ${nde(D.weights[r.d])} kg`); { const cl = coffeeLine(r.d); if (cl) out.push(cl); } return; }
    out.push(`Summe: ${nde(r.t.kcal, 0)} kcal (Ziel ${nde(g.kcal, 0)}) · Eiweiß ${nde(r.t.p, 0)} g (Ziel ${nde(g.p, 0)}) · Kohlenhydrate ${nde(r.t.c, 0)} g (Ziel ${nde(g.c, 0)}) · Fett ${nde(r.t.f, 0)} g (Ziel ${nde(g.f, 0)})`);
    { const q = microSum(r.es); out.push(`Weitere Nährstoffe: Zucker ${nde(q.s)} g · Ballaststoffe ${nde(q.fi)} g · gesättigte Fettsäuren ${nde(q.sa)} g · Salz ${nde(q.sl, 2)} g${microMissNote(q)}`); }
    if (D.weights[r.d] != null) out.push(`Gewicht: ${nde(D.weights[r.d])} kg`);
    { const cl = coffeeLine(r.d); if (cl) out.push(cl); }
    { // Verteilung über den Tag nach Uhrzeit
      const te = r.es.filter(e => timeOk(e.t)).sort((a, b) => a.t.localeCompare(b.t));
      if (te.length) {
        const part = (k, a, b) => { const tot = te.reduce((x, e) => x + e[k], 0); return tot > 0 ? Math.round(te.filter(e => { const m = tMin(e.t); return m >= a && m < b; }).reduce((x, e) => x + e[k], 0) / tot * 100) : 0; };
        const sp = (n, k) => `${n} ${part(k, 0, 720)} % / ${part(k, 720, 1080)} % / ${part(k, 1080, 1441)} %`;
        out.push(`Uhrzeiten: erster Eintrag ${te[0].t}, letzter ${te[te.length - 1].t}${te.length < r.es.length ? ` (${te.length} von ${r.es.length} Einträgen mit Uhrzeit)` : ""}`);
        out.push(`Verteilung vor 12 Uhr / 12 bis 18 Uhr / nach 18 Uhr: ${sp("Kalorien", "kcal")} · ${sp("Eiweiß", "p")} · ${sp("Kohlenhydrate", "c")} · ${sp("Fett", "f")}`);
      }
    }
    order.forEach(mid => {
      const es = r.es.filter(e => e.meal === mid || (!order.includes(e.meal) && mid === "s")); if (!es.length) return;
      const ms = sum(es);
      out.push("", `### ${mealName(mid)} – ${nde(ms.kcal, 0)} kcal (Eiweiß ${nde(ms.p, 0)} g · KH ${nde(ms.c, 0)} g · Fett ${nde(ms.f, 0)} g)`);
      es.slice().sort((a, b) => (timeOk(a.t) ? a.t : "99:99").localeCompare(timeOk(b.t) ? b.t : "99:99")).forEach(e => {
        const rec = recipeFor(e);
        out.push(`- ${timeOk(e.t) ? e.t + " Uhr: " : ""}${rec ? "Rezept: " : ""}${e.name}${e.brand ? " (" + e.brand + ")" : ""}, ${nde(e.grams, 0)} g – ${nde(e.kcal, 0)} kcal · E ${nde(e.p)} · KH ${nde(e.c)} · F ${nde(e.f)}${hasN(e.s) ? " · Zucker " + nde(e.s) : ""}${hasN(e.fi) ? " · Ballaststoffe " + nde(e.fi) : ""}${hasN(e.sa) ? " · ges. Fettsäuren " + nde(e.sa) : ""}${hasN(e.sl) ? " · Salz " + nde(e.sl, 2) : ""}`);
        if (Array.isArray(e.ings) && e.ings.length) {
          e.ings.filter(i => !i.off).forEach(i => { const c = calc(i, i.grams); out.push(`  - Zutat: ${i.name}, ${nde(i.grams, 0)} g – ${nde(c.kcal, 0)} kcal · E ${nde(c.p)} · KH ${nde(c.c)} · F ${nde(c.f)}`); });
        } else if (rec && rec.items && rec.items.length) {
          const tot = rec.items.reduce((a, i) => a + i.grams, 0) || 1, k = e.grams / tot;
          rec.items.forEach(i => { const c = calc(i, i.grams * k); out.push(`  - Zutat: ${i.name}, ${nde(i.grams * k, 0)} g – ${nde(c.kcal, 0)} kcal · E ${nde(c.p)} · KH ${nde(c.c)} · F ${nde(c.f)}`); });
        }
      });
    });
  });
  return out.join("\n") + "\n";
}
async function exportReport(from, to, mode, name) {
  const txt = buildReport(from, to);
  if (!D.entries.some(e => e.date >= from && e.date <= to)) return toast("In diesem Zeitraum gibt es keine Einträge");
  if (mode === "copy") return toast((await copyText(txt)) ? "Kopiert – jetzt in die KI einfügen" : "Kopieren nicht möglich – nutze „Als Datei“");
  exportFile(name, new Blob([txt], { type: "text/plain" }));
}
const mealName = id => (MEALS.find(m => m.id === id) || MEALS[3]).name;
function diaryCsv() {
  const order = MEALS.map(m => m.id);
  const es = D.entries.slice().sort((a, b) => a.date.localeCompare(b.date) || order.indexOf(a.meal) - order.indexOf(b.meal));
  return csvOf(["datum", "uhrzeit", "mahlzeit", "name", "menge_g", "kcal", "eiweiss", "kohlenhydrate", "fett", "zucker", "ballaststoffe", "gesaettigt", "salz"], es.map(e => [e.date, timeOk(e.t) ? e.t : "", mealName(e.meal), e.name, csvNum(e.grams), csvNum(e.kcal), csvNum(e.p), csvNum(e.c), csvNum(e.f), ...MICRO.map(m => hasN(e[m.ek]) ? csvNum(e[m.ek]) : "")]));
}
function weightCsv() { return csvOf(["datum", "gewicht_kg"], weightList().map(w => [w.d, csvNum(w.w)])); }
function recipesCsv() {
  const rows = [];
  D.recipes.forEach(r => r.items.forEach(i => rows.push([r.name, csvNum(r.servings), i.name, csvNum(i.grams), csvNum(i.kcal), csvNum(i.protein), csvNum(i.carbs), csvNum(i.fat), r.weight > 0 ? csvNum(r.weight) : "", ...["sugar", "fiber", "sat", "salt"].map(k => hasN(i[k]) ? csvNum(i[k]) : "")])));
  return csvOf(["rezept", "portionen", "zutat", "menge_g", "kcal_100g", "eiweiss_100g", "kohlenhydrate_100g", "fett_100g", "gesamtgewicht_g", "zucker_100g", "ballaststoffe_100g", "gesaettigt_100g", "salz_100g"], rows);
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
    const iS = col("portionen"), iG = col("menge_g"), iK = col("kcal_100g"), iP = col("eiweiss_100g"), iC = col("kohlenhydrate_100g"), iF = col("fett_100g"), iW = col("gesamtgewicht_g"), iMi = ["zucker_100g", "ballaststoffe_100g", "gesaettigt_100g", "salz_100g"].map(n => col(n));
    const byName = new Map();
    rows.slice(1).forEach(r => {
      const n = get(r, iRec); if (!n || !get(r, iIng)) return;
      if (!byName.has(n)) byName.set(n, { id: uid(), name: n, servings: num(get(r, iS)) || 1, weight: num(get(r, iW)) || 0, items: [], used: 0 });
      const it = { name: get(r, iIng), grams: num(get(r, iG)) || 100, kcal: num(get(r, iK)), protein: num(get(r, iP)), carbs: num(get(r, iC)), fat: num(get(r, iF)) };
      MICRO.forEach((m, k) => { if (iMi[k] >= 0 && get(r, iMi[k]) !== "") it[m.fk] = num(get(r, iMi[k])); });
      byName.get(n).items.push(it);
    });
    let added = 0, updated = 0;
    byName.forEach(rec => { const ex = D.recipes.find(x => x.name.toLowerCase() === rec.name.toLowerCase()); if (ex) { rec.id = ex.id; rec.used = ex.used || 0; Object.assign(ex, rec); updated++; } else { D.recipes.push(rec); added++; } });
    return `${added} Rezepte neu, ${updated} aktualisiert`;
  }
  if (iDate >= 0 && iMeal >= 0) {
    const iN = col("name", "lebensmittel"), iT = col("uhrzeit"), iG = col("menge_g"), iK = col("kcal"), iP = col("eiweiss"), iC = col("kohlenhydrate"), iF = col("fett"), iMe = ["zucker", "ballaststoffe", "gesaettigt", "salz"].map(n => col(n));
    const key = e => [e.date, e.meal, e.name.toLowerCase(), Math.round(e.grams), Math.round(e.kcal)].join("|");
    const have = new Set(D.entries.map(key));
    let added = 0, skipped = 0;
    rows.slice(1).forEach(r => {
      const date = isoDate(get(r, iDate)), name = get(r, iN); if (!date || !name) return;
      const m = MEALS.find(x => x.name.toLowerCase() === get(r, iMeal).toLowerCase() || x.id === get(r, iMeal).toLowerCase());
      const e = { id: uid(), date, meal: m ? m.id : "s", name, grams: num(get(r, iG)), kcal: num(get(r, iK)), p: num(get(r, iP)), c: num(get(r, iC)), f: num(get(r, iF)) };
      MICRO.forEach((m, k) => { if (iMe[k] >= 0 && get(r, iMe[k]) !== "") e[m.ek] = num(get(r, iMe[k])); });
      if (iT >= 0) { const tm = get(r, iT).match(/^(\d{1,2}):(\d{2})/); if (tm) { const tt = tm[1].padStart(2, "0") + ":" + tm[2]; if (timeOk(tt)) e.t = tt; } }
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

/* ---------- „Was fehlt mir?“ : sofortige Rechnung + optionale KI-Ideen ---------- */
function gapAnalysis(date) {
  const g = goals(), list = dayEntries(date), t = sum(list);
  const left = { kcal: g.kcal - t.kcal, p: g.p - t.p, c: g.c - t.c, f: g.f - t.f };
  // Ballaststoffe nur dort, wo der Eintrag einem Lebensmittel aus der Liste zugeordnet werden kann
  let fiber = 0, matched = 0;
  list.forEach(e => { if (hasN(e.fi)) { fiber += e.fi; matched++; return; } const f = D.foods.find(x => x.name === e.name); if (f && num(f.fiber) > 0) { fiber += f.fiber * e.grams / 100; matched++; } });
  return { g, t, left, n: list.length, fiber, matched };
}
function gapSheetHtml() {
  if (!D.settings.geminiKey) return `<h3>KI-Vorschläge</h3><div class="muted small">Dafür trägst du in den Einstellungen deinen kostenlosen Gemini-Schlüssel ein. Danach wählst du hier eine Mahlzeit und bekommst Vorschläge, die zu dem passen, was dir heute noch fehlt.</div><button class="btn block" id="toSet" style="margin-top:14px">Zu den Einstellungen</button>`;
  return `<h3>Für welche Mahlzeit?</h3><div class="muted small">Die KI schaut, was du heute schon gegessen hast und was dir noch fehlt, und macht Vorschläge für die gewählte Mahlzeit.</div>
    <div class="chips" style="margin-top:12px" id="gapMeals">${MEALS.map(m => `<button class="chip" type="button" data-m="${m.id}">${m.icon} ${m.name}</button>`).join("")}</div>
    <div id="gapAiOut"></div><div class="muted tiny" style="margin-top:14px">Schätzungen, keine Ernährungsberatung. Vitamine und Mineralstoffe sind grob eingeschätzt.</div>`;
}
const GAP_SCHEMA = { type: "OBJECT", properties: { tips: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, why: { type: "STRING" } }, required: ["title", "why"] } }, note: { type: "STRING" } }, required: ["tips"] };
async function askGapAi(a, date, meal) {
  const eaten = dayEntries(date).map(e => `${e.name} ${r0(e.grams)} g`).join(", ") || "noch nichts";
  const prompt = `Du bist eine kurze, sachliche Ernährungs-Hilfe. Gegessen wurde heute: ${eaten}. Bisher ${r0(a.t.kcal)} kcal, Eiweiß ${r0(a.t.p)} g, Kohlenhydrate ${r0(a.t.c)} g, Fett ${r0(a.t.f)} g. Tagesziel ${r0(a.g.kcal)} kcal, Eiweiß ${r0(a.g.p)} g, Kohlenhydrate ${r0(a.g.c)} g, Fett ${r0(a.g.f)} g. Es ist ${new Date().getHours()} Uhr. Der Nutzer möchte Vorschläge für: ${meal.name}. Nenne bis zu 4 konkrete Ideen für genau diese Mahlzeit (deutsche Alltagslebensmittel mit Mengen und ungefähren Kalorien), die zu den restlichen Kalorien des Tages passen und Lücken bei Makros sowie wahrscheinlich knappen Vitaminen und Mineralstoffen schließen. Erkläre in "why" in einem Satz, was sie ergänzen. Mikronährstoffe sind nur grobe Einschätzungen, schreibe das im Feld "note" in einem kurzen Satz. Antworte nur mit JSON: {"tips":[{"title":"…","why":"…"}],"note":"…"}`;
  const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: GAP_SCHEMA, maxOutputTokens: 900, temperature: 0.5, thinkingConfig: { thinkingBudget: 0 } } });
  const leanBody = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: 900 } });
  const models = [...new Set([(D.settings.geminiModel || "gemini-2.5-flash").trim(), "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"])];
  let lastErr = "";
  for (const model of models) {
    for (const b of [body, leanBody]) {
      let r;
      try { r = await fetchT("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": D.settings.geminiKey.trim() }, body: b }, 20000); }
      catch (e) { if (e && e.name === "AbortError") { lastErr = "zu langsam"; break; } throw new Error("Keine Verbindung zur KI. Bist du online?"); }
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const txt = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(c => c.text || "").join("");
        const o = parseGapJson(txt);
        if (o) return o;
        lastErr = "unlesbar"; break;
      }
      lastErr = r.status + "";
      if (r.status === 401 || r.status === 403) throw new Error("Der Gemini-Schlüssel wird nicht akzeptiert. Prüfe ihn in den Einstellungen.");
      if (r.status !== 400) break;      // 400: gleiche Anfrage ohne Schema nochmal; sonst nächstes Modell
    }
  }
  throw new Error(lastErr === "429" ? "Das kostenlose KI-Limit ist gerade erreicht. Warte kurz." : "Die KI antwortet gerade nicht (" + lastErr + ").");
}
function parseGapJson(txt) {
  let t = String(txt || "").replace(/```(?:json)?/gi, ""); const i = t.indexOf("{"), k = t.lastIndexOf("}");
  if (i < 0 || k < i) return null;
  try { const o = JSON.parse(t.slice(i, k + 1)); return o && Array.isArray(o.tips) && o.tips.length ? o : null; } catch (e) { return null; }
}
/* Wechselt man während der KI-Suche in eine andere App, bricht das Handy die Verbindung ab (sieht aus wie „offline“).
   Dann wartet die App, bis du zurück bist, und startet die Suche automatisch neu. */
let bgMark = 0;
document.addEventListener("visibilitychange", () => { if (document.hidden) bgMark++; });
const whenVisible = () => new Promise(res => {
  const go = () => setTimeout(res, 600);   // kurz warten, bis das Netz wieder da ist
  if (!document.hidden) return go();
  const h = () => { if (!document.hidden) { document.removeEventListener("visibilitychange", h); go(); } };
  document.addEventListener("visibilitychange", h);
});
async function resumable(fn, onWait) {
  for (let i = 0; ; i++) {
    const mark = bgMark;
    try { return await fn(); }
    catch (e) {
      if (bgMark === mark || i >= 3 || /Schlüssel/.test(e && e.message || "")) throw e;
      if (onWait) onWait();
      await whenVisible();
    }
  }
}
function openGaps() {
  const date = ui.date, sh = sheet(gapSheetHtml());
  if ($("#toSet", sh)) { $("#toSet", sh).onclick = () => { closeSheet(); setTab("settings"); render(); }; return; }
  let busy = false;
  $("#gapMeals", sh).onclick = async ev => {
    const bt = ev.target.closest("[data-m]"); if (!bt || busy) return;
    const meal = MEALS.find(m => m.id === bt.dataset.m), out = $("#gapAiOut", sh);
    sh.querySelectorAll("#gapMeals .chip").forEach(c => c.classList.toggle("on", c === bt));
    busy = true;
    out.innerHTML = `<div class="muted" style="margin-top:14px"><span class="spin"></span>Die KI überlegt … (meist 2 bis 6 Sekunden)</div>`;
    try {
      const o = await resumable(() => askGapAi(gapAnalysis(date), date, meal), () => { out.innerHTML = `<div class="muted" style="margin-top:14px"><span class="spin"></span>Suche wird fortgesetzt …</div>`; });
      out.innerHTML = `<div class="list" style="margin-top:14px">${o.tips.slice(0, 4).map(x => `<div class="entry"><div class="nm"><div class="t">${esc(String(x.title))}</div><div class="s">${esc(String(x.why))}</div></div></div>`).join("")}</div>` +
        (o.note ? `<div class="muted tiny" style="margin-top:8px">${esc(String(o.note))}</div>` : "");
    } catch (e) { out.innerHTML = `<div class="status err" style="margin-top:14px">${esc(e.message || "Fehler")}</div>`; }
    busy = false;
  };
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
  else if (a === "gaps") openGaps();
  else if (a === "toggleMeal") { ui.open[t.dataset.meal] = !ui.open[t.dataset.meal]; render(); }
  else if (a === "add") openAdd(t.dataset.meal);
  else if (a === "editEntry") editEntry(t.dataset.id);
  else if (a === "costDay") costSheet(ui.date);
  else if (a === "coffeeAdd") coffeeAdd(ui.date, CF_STEP);
  else if (a === "coffeeCustom") coffeeCustom(ui.date);
  else if (a === "coffeeEdit") coffeeEditSheet(ui.date);
  else if (a === "coffeeDel") coffeeRemove(ui.date);
  else if (a === "period") { ui.period = +t.dataset.v; ui.weekOffset = 0; render(); }
  else if (a === "cpreset") {
    const td = iso(new Date()), d0 = fromIso(td), k = t.dataset.k;
    ui.cTo = td; ui.cFrom = k === "w" ? addDays(td, -((d0.getDay() + 6) % 7)) : k === "m" ? iso(new Date(d0.getFullYear(), d0.getMonth(), 1)) : k === "y" ? iso(new Date(d0.getFullYear(), 0, 1)) : addDays(td, -13);
    render();
  }
  else if (a === "exportDay" || a === "copyDay") exportReport(ui.date, ui.date, a === "copyDay" ? "copy" : "file", "foodpro-tag-" + ui.date + ".txt");
  else if (a === "exportRange" || a === "copyRange") { const dd = curDays(); exportReport(dd[0], dd[dd.length - 1], a === "copyRange" ? "copy" : "file", "foodpro-zeitraum-" + dd[0] + "_bis_" + dd[dd.length - 1] + ".txt"); }
  else if (a === "wk") {
    if (ui.period === 0) { const { from, to } = customRange(), n = Math.round((fromIso(to) - fromIso(from)) / 864e5) + 1, td = iso(new Date()); let nt = addDays(to, n * +t.dataset.d); if (nt > td) nt = td; ui.cTo = nt; ui.cFrom = addDays(nt, -(n - 1)); render(); }
    else { ui.weekOffset = Math.min(0, ui.weekOffset + +t.dataset.d); render(); }
  }
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
  else if (a === "clearMeal") {
    const meal = t.dataset.meal, ids = new Set(dayEntries(ui.date).filter(e => e.meal === meal).map(e => e.id)), sm = sum(D.entries.filter(e => ids.has(e.id)));
    if (!ids.size) return;
    const sh = sheet(`<h3>${mealName(meal)} leeren?</h3><div class="muted small" style="margin-bottom:14px">${ids.size} ${ids.size === 1 ? "Eintrag" : "Einträge"} (${fmt(sm.kcal)} kcal) am ${niceDate(ui.date)} werden gelöscht.</div>
      <button class="btn danger block" id="cmGo">${ids.size === 1 ? "Eintrag" : "Alle " + ids.size + " Einträge"} löschen</button><button class="btn sec block" style="margin-top:8px" id="cmNo">Abbrechen</button>`);
    $("#cmNo", sh).onclick = () => closeSheet();
    $("#cmGo", sh).onclick = () => { D.entries = D.entries.filter(e => !ids.has(e.id)); closeSheet(); save(); render(); toast(ids.size + " gelöscht"); };
  }
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
  else if (a === "nutri") nutrientSheet(ui.date);
  else if (a.startsWith("dbx")) dbxAction(a);
  else if (a === "wipe") {
    const sh = sheet(`<h3>Alle Daten löschen</h3>
      <div class="muted small" style="margin-bottom:14px">Tagebuch, Gewicht, Rezepte, Lebensmittel und Einstellungen werden unwiderruflich entfernt. Damit nichts versehentlich verloren geht, wird zuerst ein Backup gespeichert.${typeof SY !== "undefined" && SY.user ? " <b>Achtung:</b> Der Echtzeit-Abgleich ist aktiv – die Daten werden dann auch auf deinen anderen Geräten gelöscht." : ""}</div>
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
  const ct = ev.target;
  if (ct && ["cfSleep", "cfMl", "cfMg", "cfGap", "cfRest"].includes(ct.id)) {
    const k = { cfSleep: "coffeeSleep", cfMl: "coffeeMl", cfMg: "coffeeMg100", cfGap: "coffeeGap", cfRest: "coffeeRest" }[ct.id];
    if (ct.id === "cfSleep") { if (timeOk(ct.value)) D.settings.coffeeSleep = ct.value; } else D.settings[k] = num(ct.value);
    save(); render(); return;
  }
  if (ct && (ct.id === "cFrom" || ct.id === "cTo") && ct.value) {
    let f = ct.id === "cFrom" ? ct.value : ui.cFrom, t2 = ct.id === "cTo" ? ct.value : ui.cTo;
    if (f > t2) { if (ct.id === "cFrom") t2 = f; else f = t2; }
    ui.cFrom = f; ui.cTo = t2; render(); return;
  }
  const t = ev.target;
  if (t.id === "dataFile" && t.files[0]) {
    try { const m = await importFile(t.files[0]); if (m) toast(m); } catch (e) { toast(e.message || "Datei nicht lesbar"); }
    t.value = "";
  } else if (t.id === "dbxAuto") { DB.auto = t.checked; dbSave(); if (t.checked) queueBackup(); toast(t.checked ? "Automatische Sicherung an" : "Automatische Sicherung aus");
  } else if (t.id === "wGateOn") { D.settings.weightGate = t.checked; save(); weightGate(); toast(t.checked ? "Gewichts-Abfrage an" : "Gewichts-Abfrage aus");
  } else if (t.id === "sAccent") { D.settings.accent = t.value; save(); applyTheme(); render(); }
});
document.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target && ev.target.id === "cfCustom") { ev.preventDefault(); coffeeCustom(ui.date); } });
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
window.__ern = { parseFoodsText, get D() { return D; }, importCsv, importAny: importAnyCsv, parseCsv, foodsToCsv, mapOff, analyzePhoto, exportData, buildReport };
