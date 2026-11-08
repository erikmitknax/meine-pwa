/* Mobility Quest – App-Logik. Klassisches Skript (teilt den Scope mit data.js und sync.js). */
"use strict";
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, "0");
const dayKey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const wdIdx = d => (d.getDay() + 6) % 7; // Montag = 0
const parseDay = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const EX = Object.fromEntries(EXERCISES.map(e => [e.id, e]));

/* ================= Zustand & Speicher ================= */
const LSK = "mobility.v1";
const S = { plans: [], logs: [], tests: [], settings: {} };
const DEF_SET = () => ({ gym: DEFAULT_GYM.slice(), week: genWeek(DEFAULT_GYM), sound: true, goalMin: 90, vibe: true });

function load() {
  try {
    const j = JSON.parse(localStorage.getItem(LSK) || "null");
    if (j) { S.plans = j.plans || []; S.logs = j.logs || []; S.tests = j.tests || []; S.settings = j.settings || {}; }
  } catch (e) { /* leer */ }
  S.settings = Object.assign(DEF_SET(), S.settings);
}
function saveLocal() { try { localStorage.setItem(LSK, JSON.stringify(S)); } catch (e) { toast("Speicher voll!"); } }
function save() { saveLocal(); if (typeof syOnSave === "function") syOnSave(); }

/* ================= Programme & Dauer ================= */
function getProg(id) { return PROGRAMS.find(p => p.id === id) || S.plans.find(p => p.id === id) || null; }
function itemSecs(exId, v) {
  const e = EX[exId]; if (!e) return 0;
  const per = e.u === "s" ? v : v * (e.t === "cars" ? 12 : 3.5);
  return Math.round(per * (e.side ? 2 : 1));
}
function progSecs(p) { return p ? p.items.reduce((a, [id, v]) => a + itemSecs(id, v) + 8, 0) : 0; }
const mins = s => Math.max(1, Math.round(s / 60));
function progRegions(p) {
  const c = {};
  p.items.forEach(([id]) => (EX[id] ? EX[id].r : []).forEach(r => { c[r] = (c[r] || 0) + 1; }));
  return Object.keys(c).sort((a, b) => c[b] - c[a]);
}

/* Wochenplan aus den Gym-Tagen erzeugen */
function genWeek(gym) {
  const restFill = ["rest_full", "hip_dungeon", "shoulder_forge", "ham_boss", "ankle_quest"];
  let r = 0; const w = {};
  gym.forEach((g, i) => {
    if (g === "rest") w[i] = [restFill[r++ % restFill.length]];
    else w[i] = ["warm_" + g, "cool_" + g];
  });
  return w;
}
function weekPlanSecs() { return Object.values(S.settings.week).flat().reduce((a, id) => a + progSecs(getProg(id)), 0); }

/* ================= Fortschritt: XP, Rang, Serie ================= */
const totalXp = () => S.logs.reduce((a, l) => a + (l.xp || 0), 0);
function rankInfo(xp) {
  let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
  const cur = RANKS[i][0], next = RANKS[i + 1] ? RANKS[i + 1][0] : null;
  return { lvl: i + 1, name: RANKS[i][1], cur, next, pct: next ? (xp - cur) / (next - cur) : 1 };
}
function logDays() { const s = new Set(); S.logs.forEach(l => s.add(l.date)); return s; }
function streak() {
  const days = logDays(); const d = new Date(); let n = 0;
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function bestStreak() {
  const ds = Array.from(logDays()).sort(); let best = 0, cur = 0, prev = null;
  ds.forEach(k => { const d = parseDay(k); cur = prev && (d - prev) / 864e5 === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = d; });
  return best;
}
function weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - wdIdx(x)); return x; }
function weekMins(ref) {
  const a = weekStart(ref || new Date()), b = new Date(a); b.setDate(b.getDate() + 7);
  return Math.round(S.logs.filter(l => { const d = parseDay(l.date); return d >= a && d < b; }).reduce((s, l) => s + (l.secs || 0), 0) / 60);
}
function doneToday(progId) { const k = dayKey(new Date()); return S.logs.some(l => l.date === k && l.prog === progId); }

/* ================= Statuswerte aus den Tests ================= */
function testScore(t, v) { return t.kind === "pick" ? Number(v) : t.score(Number(v)); }
function latestTestVals() {
  const out = {}; // testId -> {vals:[...], date}
  S.tests.slice().sort((a, b) => a.ts - b.ts).forEach(s => {
    TESTS.forEach(t => {
      const keys = t.side ? [t.id + "_L", t.id + "_R"] : [t.id];
      const vs = keys.map(k => s.vals[k]).filter(v => v !== undefined && v !== "" && v !== null);
      if (vs.length) out[t.id] = { vals: vs, raw: keys.map(k => s.vals[k]), date: s.date };
    });
  });
  return out;
}
function statScores() {
  const lt = latestTestVals(), acc = {};
  TESTS.forEach(t => {
    const x = lt[t.id]; if (!x) return;
    const sc = x.vals.map(v => testScore(t, v)).reduce((a, b) => a + b, 0) / x.vals.length;
    (acc[t.stat] = acc[t.stat] || []).push(sc);
  });
  const res = {};
  Object.keys(STATS).forEach(k => { res[k] = acc[k] ? Math.round(acc[k].reduce((a, b) => a + b, 0) / acc[k].length) : null; });
  return res;
}
const BOSS_PROG = { FLEX: "ham_boss", HIPS: "hip_dungeon", SHLD: "shoulder_forge", SPINE: "shoulder_forge", ANKL: "ankle_quest" };

/* ================= Pixel-Sprites ================= */
const SPRITES = {
  hero: { p: { k: "#1a1626", s: "#f2c69b", h: "#5a3a22", b: "#3dd6c4", r: "#ff5e7a", w: "#ffffff", g: "#2b2540" }, m: [
    "....kkkk....", "...khhhhk...", "...ksssks...", "...kswswk...", "....kssk....", "..kkbbbbkk..", ".ksbbbbbbsk.", ".ks.bbbb.sk.",
    "....rrrr....", "....rkkr....", "...rr..rr...", "...kk..kk..."] },
  flame: { p: { k: "#1a1626", r: "#ff5e3a", o: "#ffb347", y: "#ffe66b" }, m: [
    "....r...", "...rr...", "..rror..", "..roor.r", ".rooyorr", ".royyyor", ".royyyor", "..rooor."] },
  star: { p: { y: "#ffe66b", o: "#ffb347" }, m: [
    "...y....", "...y....", "..yyy...", "yyyyyyy.", ".yyyyy..", ".yy.yy..", "y.....y.", "........"] },
  heart: { p: { r: "#ff5e7a", w: "#ffd1dc" }, m: [
    ".rr.rr..", "rwrrrrr.", "rrrrrrr.", "rrrrrrr.", ".rrrrr..", "..rrr...", "...r....", "........"] },
  chest: { p: { k: "#1a1626", b: "#a0612b", y: "#ffe66b", d: "#6b3d18" }, m: [
    "........", ".kkkkkk.", "kbbbbbbk", "kddyyddk", "kbbyybbk", "kbbbbbbk", "kddddddk", ".kkkkkk."] },
  skull: { p: { w: "#e8e6f0", k: "#1a1626" }, m: [
    "..wwww..", ".wwwwww.", "wwwwwwww", "wkkwwkkw", "wkkwwkkw", "wwwkkwww", ".wwwwww.", ".w.ww.w."] },
};
const spriteCache = {};
function sprite(name, scale) {
  const key = name + "@" + scale; if (spriteCache[key]) return spriteCache[key];
  const sp = SPRITES[name], h = sp.m.length, w = sp.m[0].length, c = document.createElement("canvas");
  c.width = w * scale; c.height = h * scale; const x = c.getContext("2d");
  sp.m.forEach((row, y) => [...row].forEach((ch, i) => { if (sp.p[ch]) { x.fillStyle = sp.p[ch]; x.fillRect(i * scale, y * scale, scale, scale); } }));
  return (spriteCache[key] = c.toDataURL());
}
const spr = (n, size, cls) => `<img class="spr ${cls || ""}" src="${sprite(n, 4)}" width="${size}" height="${size}" alt="">`;

/* ================= Ton & Vibration ================= */
let AC = null;
function beep(freq, dur, type) {
  if (!S.settings.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || "square"; o.frequency.value = freq; g.gain.value = 0.06;
    o.connect(g); g.connect(AC.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
    o.stop(AC.currentTime + dur + 0.02);
  } catch (e) { /* kein Ton */ }
}
const jingle = notes => notes.forEach(([f, t], i) => setTimeout(() => beep(f, 0.12), t != null ? t : i * 110));
function vib(p) { if (S.settings.vibe && navigator.vibrate) try { navigator.vibrate(p); } catch (e) { /* egal */ } }

/* ================= Toast & Sheets ================= */
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2400); }
function openSheet(html, cls) {
  const root = $("#sheetRoot"), wasOpen = root.classList.contains("on");
  root.innerHTML = `<div class="scrim" data-act="close"></div><div class="sheet ${cls || ""}" role="dialog">${html}</div>`;
  root.classList.add("on"); document.body.classList.add("noscroll");
  if (!wasOpen) history.pushState({ sheet: 1 }, "");
}
function closeSheet(fromPop) {
  const root = $("#sheetRoot"); if (!root.classList.contains("on")) return false;
  root.classList.remove("on"); root.innerHTML = ""; document.body.classList.remove("noscroll");
  window.mqSettingsRedo = null;
  if (!fromPop && history.state && history.state.sheet) { IGNORE_POP++; history.back(); }
  return true;
}
let IGNORE_POP = 0; // eigene history.back()-Aufrufe nicht als Zurück-Taste werten
window.addEventListener("popstate", () => { if (IGNORE_POP > 0) { IGNORE_POP--; return; } if (PL.on) { stopPlayer(true); return; } closeSheet(true); });

/* ================= Navigation ================= */
let TAB = "home";
const TABS = [["home", "QUEST", "⌂"], ["plan", "PLAN", "▤"], ["moves", "MOVES", "✦"], ["stats", "STATUS", "▲"], ["codex", "WISSEN", "?"]];
function render() {
  $("#nav").innerHTML = TABS.map(([id, l, i]) => `<button class="${TAB === id ? "on" : ""}" data-act="tab" data-id="${id}"><span>${i}</span>${l}</button>`).join("");
  const v = { home: vHome, plan: vPlan, moves: vMoves, stats: vStats, codex: vCodex }[TAB]();
  $("#view").innerHTML = v;
  const warn = typeof SY !== "undefined" && SY.user && SY.err ? `<span class="hdrwarn" title="${esc(SY.err)}">!</span>` : "";
  $("#hdrSync").innerHTML = warn;
}
function go(tab) { TAB = tab; render(); window.scrollTo(0, 0); }

/* ================= Ansicht: QUEST (Start) ================= */
function vHome() {
  const xp = totalXp(), rk = rankInfo(xp), st = streak(), now = new Date(), wd = wdIdx(now);
  const gym = S.settings.gym[wd], today = S.settings.week[wd] || [];
  const wm = weekMins(), goal = S.settings.goalMin, sc = statScores();
  const known = Object.entries(sc).filter(([, v]) => v !== null);
  const boss = known.length ? known.sort((a, b) => a[1] - b[1])[0] : null;
  const days = logDays(), ws = weekStart(now);
  const strip = WEEKDAYS.map((n, i) => {
    const d = new Date(ws); d.setDate(d.getDate() + i);
    const done = days.has(dayKey(d)), isT = i === wd;
    return `<div class="wd ${done ? "done" : ""} ${isT ? "today" : ""}"><b>${n}</b><i>${done ? "★" : (d < now && !isT ? "·" : "")}</i><small>${GYM_LABEL[S.settings.gym[i]].slice(0, 4)}</small></div>`;
  }).join("");
  const quests = today.map(id => {
    const p = getProg(id); if (!p) return "";
    const ok = doneToday(id);
    return `<div class="quest ${ok ? "ok" : ""}">
      <div class="qmain" data-act="prog" data-id="${p.id}"><div class="qt">${ok ? "✔ " : "► "}${esc(p.n)}</div><div class="qs">${mins(progSecs(p))} MIN · ${p.items.length} MOVES · ${kindLabel(p)}</div></div>
      <button class="btn ${ok ? "" : "pri"} sm" data-act="start" data-id="${p.id}">${ok ? "NOCHMAL" : "START"}</button></div>`;
  }).join("") || `<div class="muted">Heute nichts geplant. Leg im Plan etwas fest.</div>`;
  const first = !S.logs.length;
  return `
  ${first ? `<div class="box intro">${spr("chest", 40)}<div><b class="px">NEUES SPIEL</b><p>Willkommen, Held. Du trainierst 5× pro Woche – dein Bewegungsumfang hält noch nicht mit. Lies kurz <a href="#" data-act="codexgo" data-id="why">„Warum Mobilität?“</a>, mach unter <b>STATUS</b> deinen ersten Test und starte dann die Quest von heute.</p></div></div>` : ""}
  <div class="box hero">
    <div class="avatar">${spr("hero", 72)}</div>
    <div class="hinfo">
      <div class="px lvl">LV ${rk.lvl}</div>
      <div class="rank">${esc(rk.name)}</div>
      <div class="bar xpbar"><i style="width:${Math.round(rk.pct * 100)}%"></i></div>
      <div class="small muted">${xp} XP${rk.next ? " · noch " + (rk.next - xp) + " bis LV " + (rk.lvl + 1) : " · MAX"}</div>
    </div>
    <div class="streak">${spr("flame", 32)}<b class="px">${st}</b><small>TAGE</small></div>
  </div>
  <div class="box"><div class="bh"><span class="px">HEUTE · ${WEEKDAYS_LONG[wd].toUpperCase()}</span><span class="tag">${GYM_LABEL[gym]}</span></div>
    ${gym !== "rest" ? `<div class="small muted" style="margin:-4px 0 8px">Aufwärmen <b>vor</b> dem Gym, Abkühlen direkt <b>danach</b>.</div>` : `<div class="small muted" style="margin:-4px 0 8px">Ruhetag = beste Zeit für eine lange Session.</div>`}
    ${quests}
  </div>
  <div class="box"><div class="bh"><span class="px">DIESE WOCHE</span><span class="small">${wm} / ${goal} MIN</span></div>
    <div class="bar hp"><i style="width:${Math.min(100, Math.round(wm / goal * 100))}%"></i></div>
    <div class="week">${strip}</div>
  </div>
  ${boss ? `<div class="box boss" data-act="prog" data-id="${BOSS_PROG[boss[0]]}">${spr("skull", 36)}<div><div class="px small">NÄCHSTER BOSS</div><b>${STATS[boss[0]].n}</b> ist dein schwächster Wert (${boss[1]}/100).<div class="small muted">Empfehlung: ${esc(getProg(BOSS_PROG[boss[0]]).n)} – zusätzlich 1–2× pro Woche.</div></div></div>`
    : `<div class="box boss" data-act="tab" data-id="stats">${spr("skull", 36)}<div><div class="px small">BOSS UNBEKANNT</div>Mach die Beweglichkeits-Tests unter STATUS, dann zeigt dir die App deine Schwachstelle.</div></div>`}
  <div class="box"><div class="bh"><span class="px">SCHNELLSTART</span></div>
    <div class="chips">${["morning", "desk", "evening", "rest_full"].map(id => `<button class="chip" data-act="start" data-id="${id}">${esc(getProg(id).n)} · ${mins(progSecs(getProg(id)))}′</button>`).join("")}</div>
  </div>
  <div class="box tip"><span class="px small">TIPP</span> ${esc(dailyTip())}</div>`;
}
function kindLabel(p) { return { warm: "AUFWÄRMEN", cool: "ABKÜHLEN", deep: "SESSION", daily: "KURZ" }[p.kind] || "EIGENE"; }
const TIPS = [
  "Ausatmen = tiefer gehen. Halte nie die Luft an.", "5–7 von 10 Ziehen. Schmerz heißt: zu weit.", "Täglich 10 Minuten schlagen 1 Stunde am Sonntag.",
  "Gesäß anspannen beim Couch Stretch – doppelte Wirkung.", "Vor dem Training dynamisch, danach statisch.", "Alle 4 Wochen testen – sonst merkst du den Fortschritt nicht.",
  "Volle Bewegungsamplitude im Gym ist schon Mobility-Training.", "Tiefe Hocke beim Zähneputzen? Gilt als Training.", "Nach Bankdrücken: Brust dehnen und den oberen Rücken strecken.",
  "Kribbeln im Bein beim Dehnen = Nerv. Fußspitze locker lassen.",
];
function dailyTip() { const d = new Date(); return TIPS[(d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()) % TIPS.length]; }

/* ================= Ansicht: PLAN ================= */
function vPlan() {
  const ws = weekPlanSecs();
  const days = WEEKDAYS_LONG.map((n, i) => {
    const g = S.settings.gym[i], list = S.settings.week[i] || [];
    const secs = list.reduce((a, id) => a + progSecs(getProg(id)), 0);
    return `<div class="day">
      <div class="dh"><b class="px small">${n.toUpperCase()}</b>
        <select data-act="gymset" data-i="${i}">${Object.entries(GYM_LABEL).map(([k, l]) => `<option value="${k}" ${k === g ? "selected" : ""}>${l}</option>`).join("")}</select>
        <span class="small muted">${secs ? mins(secs) + "′" : ""}</span></div>
      <div class="chips">${list.map((id, j) => { const p = getProg(id); return p ? `<span class="chip k-${p.kind || "own"}"><span data-act="prog" data-id="${id}">${esc(p.n)}</span><b data-act="dayrm" data-i="${i}" data-j="${j}">×</b></span>` : ""; }).join("")}
      <button class="chip add" data-act="dayadd" data-i="${i}">+</button></div></div>`;
  }).join("");
  const own = S.plans.map(p => progCard(p, true)).join("") || `<div class="muted small">Noch keine eigenen Routinen. Baue eine oder kopiere eine fertige Quest und pass sie an.</div>`;
  const groups = [["warm", "AUFWÄRMEN (vor dem Gym)"], ["cool", "ABKÜHLEN (nach dem Gym)"], ["deep", "LANGE SESSIONS (Ruhetag)"], ["daily", "KURZ & TÄGLICH"]];
  return `
  <div class="box"><div class="bh"><span class="px">WOCHENPLAN</span><span class="small">≈ ${mins(ws)} MIN/WOCHE</span></div>
    <div class="small muted" style="margin-bottom:8px">Stell pro Tag ein, was du im Gym trainierst. Mit „Neu erzeugen“ verteilt die App passende Quests: Aufwärmen + Abkühlen an Gym-Tagen, lange Sessions an Ruhetagen.</div>
    ${days}
    <div class="two" style="margin-top:10px"><button class="btn" data-act="regen">NEU ERZEUGEN</button><button class="btn" data-act="goalset">ZIEL: ${S.settings.goalMin}′/WOCHE</button></div>
  </div>
  <div class="box"><div class="bh"><span class="px">MEINE ROUTINEN</span><button class="btn pri sm" data-act="newplan">+ NEU</button></div>${own}</div>
  ${groups.map(([k, l]) => `<div class="box"><div class="bh"><span class="px small">${l}</span></div>${PROGRAMS.filter(p => p.kind === k).map(p => progCard(p)).join("")}</div>`).join("")}`;
}
function progCard(p, own) {
  const regs = progRegions(p).slice(0, 4);
  return `<div class="pcard" data-act="prog" data-id="${p.id}">
    <div><b>${esc(p.n)}</b><div class="small muted">${mins(progSecs(p))} MIN · ${p.items.length} MOVES${own ? " · EIGENE" : ""}</div>
    <div class="dots">${regs.map(r => `<i style="background:${REGIONS[r].c}" title="${REGIONS[r].n}"></i>`).join("")}<span class="small muted">${regs.map(r => REGIONS[r].n).join(", ")}</span></div></div>
    <button class="btn sm" data-act="start" data-id="${p.id}">▶</button></div>`;
}

function sheetProg(id) {
  const p = getProg(id); if (!p) return;
  const own = !!S.plans.find(x => x.id === id);
  const cnt = S.logs.filter(l => l.prog === id).length;
  openSheet(`<div class="sh-h"><b class="px">${esc(p.n)}</b><button class="x" data-act="close">✕</button></div>
    ${p.d ? `<p>${esc(p.d)}</p>` : ""}
    <div class="small muted">${mins(progSecs(p))} Minuten · ${p.items.length} Übungen · ${cnt}× abgeschlossen</div>
    <ol class="plist">${p.items.map(([eid, v]) => { const e = EX[eid]; return e ? `<li data-act="ex" data-id="${eid}"><i style="background:${REGIONS[e.r[0]].c}"></i><span>${esc(e.n)}</span><b>${fmtVal(e, v)}</b></li>` : ""; }).join("")}</ol>
    <button class="btn pri big" data-act="start" data-id="${p.id}">▶ QUEST STARTEN</button>
    <div class="two"><button class="btn" data-act="quicklog" data-id="${p.id}">✔ SCHON GEMACHT</button>
    ${own ? `<button class="btn" data-act="editplan" data-id="${p.id}">BEARBEITEN</button>` : `<button class="btn" data-act="copyplan" data-id="${p.id}">KOPIEREN & ANPASSEN</button>`}</div>
    ${own ? `<button class="linkbtn danger" data-act="delplan" data-id="${p.id}">Routine löschen</button>` : ""}`);
}
const fmtVal = (e, v) => (e.u === "s" ? v + " s" : v + " ×") + (e.side ? " / Seite" : "");

/* ---- Routinen-Editor ---- */
let ED = null;
function editPlan(src) {
  ED = src ? JSON.parse(JSON.stringify(src)) : { id: uid(), n: "", items: [], kind: "own" };
  if (src && !S.plans.find(x => x.id === src.id)) { ED.id = uid(); ED.n = src.n + " (meine)"; ED.kind = "own"; delete ED.gym; }
  drawEditor();
}
function drawEditor() {
  openSheet(`<div class="sh-h"><b class="px">ROUTINE</b><button class="x" data-act="close">✕</button></div>
    <input class="fld" id="edName" placeholder="Name, z. B. Hüfte nach dem Laufen" value="${esc(ED.n)}">
    <div class="small muted" style="margin:8px 0">${ED.items.length} Übungen · ca. ${mins(progSecs(ED))} Minuten</div>
    <div class="edlist">${ED.items.map(([id, v], i) => { const e = EX[id]; return `<div class="edrow">
      <div class="edn"><b>${esc(e.n)}</b><small>${e.u === "s" ? "Sekunden" : "Wiederholungen"}${e.side ? " pro Seite" : ""}</small></div>
      <input class="fld num" type="number" inputmode="numeric" min="1" max="600" value="${v}" data-act="edval" data-i="${i}">
      <div class="edbtns"><button data-act="edup" data-i="${i}">▲</button><button data-act="eddown" data-i="${i}">▼</button><button data-act="edrm" data-i="${i}">✕</button></div></div>`; }).join("") || `<div class="muted">Noch leer. Füge Übungen hinzu.</div>`}</div>
    <button class="btn" data-act="edadd">+ ÜBUNG HINZUFÜGEN</button>
    <button class="btn pri big" data-act="edsave">SPEICHERN</button>`);
}
function pickExercise(onPick) {
  PICK = onPick;
  openSheet(`<div class="sh-h"><b class="px">ÜBUNG WÄHLEN</b><button class="x" data-act="pickback">←</button></div>
    <input class="fld" id="pickQ" placeholder="Suchen …" autocomplete="off">
    <div id="pickList" class="picklist">${pickRows("")}</div>`);
  $("#pickQ").addEventListener("input", e => { $("#pickList").innerHTML = pickRows(e.target.value); });
}
let PICK = null;
function pickRows(q) {
  q = q.trim().toLowerCase();
  return EXERCISES.filter(e => !q || (e.n + " " + e.r.map(r => REGIONS[r].n).join(" ")).toLowerCase().includes(q))
    .map(e => `<div class="prow" data-act="pick" data-id="${e.id}"><i style="background:${REGIONS[e.r[0]].c}"></i><b>${esc(e.n)}</b><small>${TYPES[e.t].s} · ${e.r.map(r => REGIONS[r].n).join(", ")}</small></div>`).join("");
}

/* ================= Ansicht: MOVES (Übungen) ================= */
const MF = { r: "", t: "", q: "" };
function vMoves() {
  const list = EXERCISES.filter(e => (!MF.r || e.r.includes(MF.r)) && (!MF.t || e.t === MF.t) && (!MF.q || e.n.toLowerCase().includes(MF.q.toLowerCase())));
  return `
  <div class="box"><div class="bh"><span class="px">BESTIARIUM</span><span class="small">${list.length}/${EXERCISES.length}</span></div>
    <input class="fld" id="mq" placeholder="Übung suchen …" value="${esc(MF.q)}" autocomplete="off">
    <div class="chips scroll" style="margin-top:8px"><button class="chip ${!MF.r ? "on" : ""}" data-act="mfr" data-id="">ALLE</button>${Object.entries(REGIONS).map(([k, r]) => `<button class="chip ${MF.r === k ? "on" : ""}" data-act="mfr" data-id="${k}"><i style="background:${r.c}"></i>${r.n}</button>`).join("")}</div>
    <div class="chips scroll"><button class="chip ${!MF.t ? "on" : ""}" data-act="mft" data-id="">ALLE ARTEN</button>${Object.entries(TYPES).map(([k, t]) => `<button class="chip ${MF.t === k ? "on" : ""}" data-act="mft" data-id="${k}">${t.s}</button>`).join("")}</div>
    ${MF.t ? `<div class="small muted">${esc(TYPES[MF.t].d)}</div>` : ""}
  </div>
  <div class="mgrid">${list.map(e => `<div class="mcard" data-act="ex" data-id="${e.id}">
    <div class="mt"><span class="tbadge t-${e.t}">${TYPES[e.t].s}</span><span class="lv">${"★".repeat(e.lvl)}</span></div>
    <b>${esc(e.n)}</b>
    <div class="small muted">${fmtVal(e, e.v)}</div>
    <div class="dots">${e.r.map(r => `<i style="background:${REGIONS[r].c}"></i>`).join("")}<span class="small muted">${e.r.map(r => REGIONS[r].n).join(", ")}</span></div></div>`).join("") || `<div class="muted">Nichts gefunden.</div>`}</div>`;
}
function sheetEx(id) {
  const e = EX[id]; if (!e) return;
  const inProgs = PROGRAMS.filter(p => p.items.some(([x]) => x === id));
  openSheet(`<div class="sh-h"><b class="px">${esc(e.n)}</b><button class="x" data-act="close">✕</button></div>
    <div class="exmeta"><span class="tbadge t-${e.t}">${TYPES[e.t].s}</span><span>${TYPES[e.t].n}</span><span class="lv">${"★".repeat(e.lvl)}${"☆".repeat(3 - e.lvl)}</span><span>${fmtVal(e, e.v)}</span></div>
    <div class="dots">${e.r.map(r => `<i style="background:${REGIONS[r].c}"></i><span class="small">${REGIONS[r].n}</span>`).join(" ")}</div>
    <h4>SO GEHT'S</h4><ol class="steps">${e.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
    ${e.cues.length ? `<h4>TIPPS</h4><ul class="cues">${e.cues.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
    ${e.err.length ? `<h4>FEHLER</h4><ul class="errs">${e.err.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
    <h4>DU SPÜRST ES</h4><p>${esc(e.feel)}</p>
    ${e.gym ? `<div class="small muted">Passt zu: ${e.gym.map(g => GYM_LABEL[g]).join(", ")}</div>` : ""}
    ${inProgs.length ? `<div class="small muted">Steckt in: ${inProgs.map(p => esc(p.n)).join(", ")}</div>` : ""}
    <div class="two" style="margin-top:12px"><button class="btn pri" data-act="exsolo" data-id="${id}">▶ EINZELN</button><button class="btn" data-act="exadd" data-id="${id}">+ ZU ROUTINE</button></div>`);
}

/* ================= Ansicht: STATUS ================= */
function vStats() {
  const sc = statScores(), xp = totalXp(), rk = rankInfo(xp);
  const totalMin = Math.round(S.logs.reduce((a, l) => a + (l.secs || 0), 0) / 60);
  const lastTest = S.tests.length ? S.tests.slice().sort((a, b) => b.ts - a.ts)[0] : null;
  const daysSince = lastTest ? Math.floor((Date.now() - lastTest.ts) / 864e5) : null;
  const bars = Object.entries(STATS).map(([k, s]) => {
    const v = sc[k];
    return `<div class="stat"><span class="px small sn">${k}</span><div class="bar seg" title="${s.n}"><i style="width:${v == null ? 0 : v}%;background:${s.c}"></i></div><b>${v == null ? "??" : v}</b><small>${s.n}</small></div>`;
  }).join("");
  return `
  <div class="box"><div class="bh"><span class="px">CHARAKTER</span><span class="small">LV ${rk.lvl} ${esc(rk.name)}</span></div>
    ${bars}
    <div class="small muted" style="margin-top:8px">${lastTest ? `Letzter Test vor ${daysSince} Tag${daysSince === 1 ? "" : "en"}${daysSince >= 28 ? " – <b class='warn'>Zeit für einen neuen!</b>" : ". Nächster in " + (28 - daysSince) + " Tagen."}` : "Noch kein Test. Dauert ca. 10 Minuten."}</div>
    <button class="btn pri big" data-act="testnew">⚔ BEWEGLICHKEITS-TEST</button>
  </div>
  <div class="box"><div class="bh"><span class="px">ERFOLGE</span></div>
    <div class="kpis">
      <div><b class="px">${S.logs.length}</b><small>QUESTS</small></div>
      <div><b class="px">${totalMin}</b><small>MINUTEN</small></div>
      <div><b class="px">${streak()}</b><small>SERIE</small></div>
      <div><b class="px">${bestStreak()}</b><small>REKORD</small></div>
    </div>
    ${achievements()}
  </div>
  <div class="box"><div class="bh"><span class="px">LETZTE 12 WOCHEN</span></div>${heatmap()}
    <div class="weekbars">${weekBars()}</div></div>
  ${testHistory()}
  <div class="box"><div class="bh"><span class="px">LOGBUCH</span></div>${S.logs.slice().sort((a, b) => b.ts - a.ts).slice(0, 25).map(l => `<div class="logrow"><span>${parseDay(l.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}</span><b>${esc(l.name)}</b><span>${mins(l.secs)}′</span><span class="xp">+${l.xp}</span><button class="x sm" data-act="dellog" data-id="${l.id}">✕</button></div>`).join("") || `<div class="muted">Noch keine Quests abgeschlossen.</div>`}</div>`;
}
function heatmap() {
  const days = {}; S.logs.forEach(l => { days[l.date] = (days[l.date] || 0) + (l.secs || 0); });
  const end = weekStart(new Date()); end.setDate(end.getDate() + 6);
  const start = new Date(end); start.setDate(start.getDate() - 83);
  let h = `<div class="heat">`;
  for (let w = 0; w < 12; w++) {
    h += `<div class="hcol">`;
    for (let d = 0; d < 7; d++) {
      const x = new Date(start); x.setDate(x.getDate() + w * 7 + d);
      const m = (days[dayKey(x)] || 0) / 60, lv = m === 0 ? 0 : m < 8 ? 1 : m < 16 ? 2 : m < 25 ? 3 : 4;
      h += `<i class="h${lv} ${x > new Date() ? "fut" : ""}" title="${dayKey(x)}: ${Math.round(m)} Min"></i>`;
    }
    h += `</div>`;
  }
  return h + `</div><div class="small muted">Jedes Kästchen = ein Tag (Spalten = Wochen, oben Montag).</div>`;
}
function weekBars() {
  const out = [], goal = S.settings.goalMin;
  for (let i = 7; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i * 7); out.push(weekMins(d)); }
  const mx = Math.max(goal * 1.25, ...out);
  return out.map((m, i) => `<div class="wb"><i style="height:${Math.round(m / mx * 100)}%" class="${m >= goal ? "ok" : ""}"></i><small>${i === 7 ? "JETZT" : "−" + (7 - i)}</small></div>`).join("") + `<div class="goalline" style="bottom:${Math.round(goal / mx * 100)}%"></div>`;
}
const ACH = [
  ["Erste Quest", () => S.logs.length >= 1], ["10 Quests", () => S.logs.length >= 10], ["50 Quests", () => S.logs.length >= 50], ["100 Quests", () => S.logs.length >= 100],
  ["3 Tage Serie", () => bestStreak() >= 3], ["7 Tage Serie", () => bestStreak() >= 7], ["30 Tage Serie", () => bestStreak() >= 30],
  ["Wochenziel geschafft", () => { for (let i = 0; i < 52; i++) { const d = new Date(); d.setDate(d.getDate() - i * 7); if (weekMins(d) >= S.settings.goalMin) return true; } return false; }],
  ["Erster Test", () => S.tests.length >= 1], ["Retest", () => S.tests.length >= 2], ["Eigene Routine", () => S.plans.length >= 1],
  ["Hüft-Dungeon besiegt", () => S.logs.some(l => l.prog === "hip_dungeon")], ["Schulter geschmiedet", () => S.logs.some(l => l.prog === "shoulder_forge")], ["Vorbeuge-Boss besiegt", () => S.logs.some(l => l.prog === "ham_boss")],
];
function achievements() {
  return `<div class="ach">${ACH.map(([n, f]) => { const ok = f(); return `<div class="${ok ? "got" : ""}">${ok ? spr("star", 18) : "<span class='lock'>?</span>"}<small>${n}</small></div>`; }).join("")}</div>`;
}
function testHistory() {
  if (!S.tests.length) return "";
  const sorted = S.tests.slice().sort((a, b) => a.ts - b.ts);
  const rows = TESTS.map(t => {
    const keys = t.side ? [["L", t.id + "_L"], ["R", t.id + "_R"]] : [["", t.id]];
    return keys.map(([s, k]) => {
      const pts = sorted.filter(x => x.vals[k] !== undefined && x.vals[k] !== "").map(x => ({ v: x.vals[k], d: x.date }));
      if (!pts.length) return "";
      const first = pts[0], last = pts[pts.length - 1];
      const show = v => t.kind === "pick" ? (t.opts.find(o => String(o[1]) === String(v)) || ["?"])[0].split(" ")[0] + "…" : v + " " + t.unit;
      const d = testScore(t, last.v) - testScore(t, first.v);
      return `<div class="threw"><span>${esc(t.n)}${s ? " " + s : ""}</span><b>${esc(show(last.v))}</b><span class="${d > 0 ? "up" : d < 0 ? "down" : ""}">${pts.length > 1 ? (d > 0 ? "▲" : d < 0 ? "▼" : "=") : ""}</span></div>`;
    }).join("");
  }).join("");
  return `<div class="box"><div class="bh"><span class="px">TESTWERTE</span><span class="small">${S.tests.length} Tests</span></div>${rows}
    <div class="small muted">Pfeil = Veränderung seit dem ersten Test.</div>
    <details><summary class="small">Alle Testtage</summary>${sorted.slice().reverse().map(x => `<div class="logrow"><span>${parseDay(x.date).toLocaleDateString("de-DE")}</span><b>${Object.keys(x.vals).length} Werte</b><button class="x sm" data-act="deltest" data-id="${x.id}">✕</button></div>`).join("")}</details></div>`;
}

/* ---- Test-Assistent ---- */
let TST = null;
function testStart() { TST = { i: 0, vals: {} }; drawTest(); }
function drawTest() {
  const t = TESTS[TST.i];
  const inp = k => t.kind === "pick"
    ? `<div class="opts">${t.opts.map(([l, v]) => `<button class="opt ${String(TST.vals[k]) === String(v) ? "on" : ""}" data-act="topt" data-k="${k}" data-v="${v}">${esc(l)}</button>`).join("")}</div>`
    : `<input class="fld num big" type="number" inputmode="decimal" step="0.5" data-act="tval" data-k="${k}" placeholder="${esc(t.ph)}" value="${TST.vals[k] != null ? esc(TST.vals[k]) : ""}"> <span>${t.unit}</span>`;
  const body = t.side ? `<div class="tside"><b>LINKS</b>${inp(t.id + "_L")}</div><div class="tside"><b>RECHTS</b>${inp(t.id + "_R")}</div>` : inp(t.id);
  openSheet(`<div class="sh-h"><b class="px">TEST ${TST.i + 1}/${TESTS.length}</b><button class="x" data-act="close">✕</button></div>
    <div class="bar"><i style="width:${Math.round(TST.i / TESTS.length * 100)}%"></i></div>
    <h3>${esc(t.n)} <span class="tag" style="background:${STATS[t.stat].c}">${t.stat}</span></h3>
    <p>${esc(t.how)}</p>${t.hint ? `<p class="small muted">${esc(t.hint)}</p>` : ""}
    ${body}
    <div class="two" style="margin-top:14px"><button class="btn" data-act="tprev" ${TST.i ? "" : "disabled"}>← ZURÜCK</button><button class="btn pri" data-act="tnext">${TST.i === TESTS.length - 1 ? "SPEICHERN" : "WEITER →"}</button></div>
    <button class="linkbtn" data-act="tnext">Test überspringen</button>`);
}
function testSave() {
  const vals = {}; Object.entries(TST.vals).forEach(([k, v]) => { if (v !== "" && v != null && !isNaN(Number(v))) vals[k] = Number(v); });
  closeSheet();
  if (!Object.keys(vals).length) return toast("Keine Werte eingetragen");
  const now = new Date();
  S.tests.push({ id: uid(), date: dayKey(now), ts: now.getTime(), vals });
  save(); jingle([[523], [659], [784], [1047]]); TAB = "stats"; render(); toast("Test gespeichert – Status aktualisiert");
}

/* ================= Ansicht: WISSEN ================= */
function vCodex() {
  const ws = weekPlanSecs();
  return `
  <div class="box plan-sum"><div class="bh"><span class="px">DEIN SPIELPLAN</span></div>
    <p>Du gehst 5× pro Woche ins Gym und machst bisher nichts für die Beweglichkeit. So baust du es ein, ohne dass es viel Zeit kostet:</p>
    <ol class="game">
      <li><b>Vor jedem Training (5–8 Min.):</b> das passende Aufwärmen – Push, Pull oder Beine. Dynamisch, macht dich direkt stärker in den Übungen.</li>
      <li><b>Nach jedem Training (5–8 Min.):</b> das passende Abkühlen. Statisch dehnen, solange die Muskeln warm sind.</li>
      <li><b>Ruhetage (15–25 Min.):</b> eine lange Session – Ganzkörper oder dein Boss (schwächster Statuswert).</li>
      <li><b>Optional täglich:</b> Morgen-Boot oder 60 Sek. tiefe Hocke.</li>
      <li><b>Alle 4 Wochen:</b> Tests wiederholen.</li>
    </ol>
    <p>Dein aktueller Plan: <b>≈ ${mins(ws)} Minuten pro Woche</b>. Das liegt im empfohlenen Bereich von 1,5–2 Stunden.</p>
    <button class="btn" data-act="tab" data-id="plan">PLAN ANSEHEN</button>
  </div>
  ${CODEX.map(c => `<details class="box codex" id="cx-${c.id}"><summary><span class="cico">${c.ico}</span><b class="px small">${esc(c.t.toUpperCase())}</b></summary><div class="cbody">${c.body}</div></details>`).join("")}`;
}

/* ================= Einstellungen ================= */
function sheetSettings() {
  const draw = () => {
    const panel = typeof syPanel === "function" ? syPanel() : "";
    openSheetInner(`<div class="sh-h"><b class="px">OPTIONEN</b><button class="x" data-act="close">✕</button></div>
      ${panel}
      <div class="panel"><h3>Spiel</h3>
        <label class="tg"><input type="checkbox" data-act="setsound" ${S.settings.sound ? "checked" : ""}> Töne (8-Bit-Pieptöne im Timer)</label>
        <label class="tg"><input type="checkbox" data-act="setvibe" ${S.settings.vibe ? "checked" : ""}> Vibration beim Wechsel</label>
        <button class="btn" data-act="goalset">Wochenziel: ${S.settings.goalMin} Min</button></div>
      <div class="panel"><h3>Daten</h3>
        <div class="small muted">${S.logs.length} Quests, ${S.tests.length} Tests, ${S.plans.length} eigene Routinen auf diesem Gerät.</div>
        <div class="two" style="margin-top:8px"><button class="btn" data-act="export">EXPORT (JSON)</button><button class="btn" data-act="import">IMPORT</button></div>
        <button class="linkbtn danger" data-act="reset">Alles auf diesem Gerät löschen</button></div>
      <div class="small muted" style="text-align:center;margin-top:10px">Mobility Quest · v${APP_V}</div>`);
  };
  window.mqSettingsRedo = draw;
  openSheet("");
  draw();
}
function openSheetInner(html) { const s = $("#sheetRoot .sheet"); if (s) { const top = s.scrollTop; s.innerHTML = html; s.scrollTop = top; } }
const APP_V = "1.0";

/* ================= PLAYER ================= */
const PL = { on: false };
function buildQueue(p) {
  const q = [];
  p.items.forEach(([id, v]) => {
    const e = EX[id]; if (!e) return;
    const sides = e.side ? ["LINKS", "RECHTS"] : [""];
    sides.forEach((s, si) => q.push({ e, v, side: s, first: si === 0 }));
  });
  return q;
}
async function startPlayer(id, solo) {
  const p = solo ? { id: "solo_" + solo, n: EX[solo].n, items: [[solo, EX[solo].v]], kind: "solo" } : getProg(id);
  if (!p || !p.items.length) return toast("Leere Routine");
  closeSheet();
  Object.assign(PL, { on: true, p, q: buildQueue(p), i: 0, phase: "prep", left: 5, paused: false, done: 0, t0: Date.now(), active: 0 });
  try { if (navigator.wakeLock) PL.lock = await navigator.wakeLock.request("screen"); } catch (e) { /* egal */ }
  history.pushState({ player: 1 }, "");
  $("#player").classList.add("on"); document.body.classList.add("noscroll");
  if (AC && AC.state === "suspended") AC.resume();
  setPhase("prep");
  clearInterval(PL.tick); PL.tick = setInterval(tick, 1000);
  drawPlayer();
}
function setPhase(ph) {
  const it = PL.q[PL.i];
  PL.phase = ph;
  if (ph === "prep") PL.left = it.first ? 6 : 4;
  else if (ph === "work") { PL.left = it.e.u === "s" ? it.v : 0; PL.up = 0; beep(880, 0.15); vib(120); }
}
function tick() {
  if (!PL.on || PL.paused) return;
  const it = PL.q[PL.i];
  if (PL.phase === "prep") {
    PL.left--;
    if (PL.left <= 3 && PL.left > 0) beep(440, 0.08);
    if (PL.left <= 0) setPhase("work");
  } else if (PL.phase === "work") {
    PL.active++;
    if (it.e.u === "s") {
      PL.left--;
      if (PL.left <= 3 && PL.left > 0) beep(660, 0.08);
      if (PL.left <= 0) { next(); return; }
    } else PL.up++;
  }
  drawPlayerTime();
}
function next() {
  beep(1046, 0.12); vib([60, 40, 60]);
  PL.done = Math.max(PL.done, PL.i + 1);
  if (PL.i + 1 >= PL.q.length) return finishPlayer();
  PL.i++; setPhase("prep"); drawPlayer();
}
function prev() { if (PL.i > 0) { PL.i--; setPhase("prep"); drawPlayer(); } }
function drawPlayer() {
  const it = PL.q[PL.i], e = it.e, nx = PL.q[PL.i + 1];
  const pct = Math.round(PL.i / PL.q.length * 100);
  $("#player").innerHTML = `
  <div class="ph"><button class="x" data-act="plquit">✕</button><span class="px small">${esc(PL.p.n.toUpperCase())}</span><span class="small">${PL.i + 1}/${PL.q.length}</span></div>
  <div class="bar"><i style="width:${pct}%"></i></div>
  <div class="pstage">
    <div class="pmeta"><span class="tbadge t-${e.t}">${TYPES[e.t].s}</span>${e.r.map(r => `<span class="rtag" style="border-color:${REGIONS[r].c};color:${REGIONS[r].c}">${REGIONS[r].n}</span>`).join("")}</div>
    <h2 class="pname">${esc(e.n)}</h2>
    ${it.side ? `<div class="pside px">${it.side === "LINKS" ? "◄ " : ""}${it.side}${it.side === "RECHTS" ? " ►" : ""}</div>` : ""}
    <div class="ptime" id="ptime"></div>
    <div class="plabel" id="plabel"></div>
    <ol class="psteps">${e.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
    ${e.cues[0] ? `<div class="pcue">★ ${esc(e.cues[0])}</div>` : ""}
  </div>
  <div class="pnext small">${nx ? `NÄCHSTES: ${esc(nx.e.n)}${nx.side ? " · " + nx.side : ""}` : "LETZTE ÜBUNG!"}</div>
  <div class="pctl"><button class="btn" data-act="plprev" ${PL.i ? "" : "disabled"}>◄◄</button><button class="btn pri big" id="plmain" data-act="plmain"></button><button class="btn" data-act="plnext">►►</button></div>`;
  drawPlayerTime();
}
function drawPlayerTime() {
  const it = PL.q[PL.i], e = it.e, t = $("#ptime"), l = $("#plabel"), m = $("#plmain"); if (!t) return;
  if (PL.phase === "prep") { t.textContent = PL.left; t.className = "ptime prep"; l.textContent = "IN POSITION GEHEN"; m.textContent = PL.paused ? "▶ WEITER" : "LOS!"; }
  else if (e.u === "s") { t.textContent = fmtT(PL.left); t.className = "ptime" + (PL.left <= 3 ? " hot" : ""); l.textContent = PL.paused ? "PAUSE" : (e.t === "pnf" ? "ANSPANNEN · LÖSEN · TIEFER" : "HALTEN & ATMEN"); m.textContent = PL.paused ? "▶ WEITER" : "❚❚ PAUSE"; }
  else { t.textContent = it.v + "×"; t.className = "ptime reps"; l.textContent = (PL.paused ? "PAUSE · " : "") + "LANGSAM & KONTROLLIERT · " + fmtT(PL.up); m.textContent = "✔ FERTIG"; }
}
const fmtT = s => Math.floor(s / 60) + ":" + pad(Math.max(0, s % 60));
function plMain() {
  if (PL.phase === "prep") { if (PL.paused) PL.paused = false; else setPhase("work"); }
  else if (PL.q[PL.i].e.u === "r") { next(); return; }
  else PL.paused = !PL.paused;
  drawPlayerTime();
}
function stopPlayer(fromPop) {
  clearInterval(PL.tick); PL.on = false;
  try { PL.lock && PL.lock.release(); } catch (e) { /* egal */ } PL.lock = null;
  $("#player").classList.remove("on"); $("#player").innerHTML = ""; document.body.classList.remove("noscroll");
  if (!fromPop && history.state && history.state.player) { IGNORE_POP++; history.back(); }
}
function quitPlayer() {
  const frac = PL.done / PL.q.length;
  if (frac >= 0.5 && confirm(`Du hast ${Math.round(frac * 100)} % geschafft. Als abgeschlossen speichern?`)) return finishPlayer();
  if (frac < 0.5 && !confirm("Quest abbrechen? Fortschritt wird nicht gespeichert.")) return;
  stopPlayer();
}
function finishPlayer() {
  const secs = Math.max(30, Math.round((Date.now() - PL.t0) / 1000));
  const before = rankInfo(totalXp());
  const xp = addLog(PL.p, Math.min(secs, progSecs(PL.p) * 2 + 120));
  const after = rankInfo(totalXp()), up = after.lvl > before.lvl;
  clearInterval(PL.tick);
  jingle(up ? [[523], [659], [784], [1047], [784], [1047], [1319]] : [[659], [784], [1047]]);
  vib([80, 60, 80, 60, 200]);
  $("#player").innerHTML = `<div class="win">
    <div class="px wint">${up ? "LEVEL UP!" : "QUEST CLEAR!"}</div>
    <div class="winspr">${spr("chest", 64)}</div>
    <div class="px">+${xp} XP</div>
    <p>${esc(PL.p.n)} · ${mins(secs)} Min</p>
    ${up ? `<p class="rankup">Neuer Rang: <b>${esc(after.name)}</b></p>` : ""}
    <div class="bar xpbar"><i style="width:${Math.round(after.pct * 100)}%"></i></div>
    <p class="small muted">Serie: ${streak()} Tag${streak() === 1 ? "" : "e"} · Woche: ${weekMins()}/${S.settings.goalMin} Min</p>
    <button class="btn pri big" data-act="plclose">WEITER</button></div>`;
}
function addLog(p, secs) {
  const xp = Math.round(secs / 60) * 2 + 10, now = new Date();
  S.logs.push({ id: uid(), date: dayKey(now), ts: now.getTime(), prog: p.id, name: p.n, secs, xp });
  save(); return xp;
}

/* ================= Ereignisse ================= */
document.addEventListener("click", ev => {
  const t = ev.target.closest("[data-act]"); if (!t) return;
  const a = t.dataset.act, id = t.dataset.id;
  if (a.startsWith("sy")) return; // sync.js
  if (t.tagName === "A") ev.preventDefault();
  switch (a) {
    case "tab": closeSheet(); go(id); break;
    case "close": closeSheet(); break;
    case "settings": sheetSettings(); break;
    case "prog": sheetProg(id); break;
    case "start": startPlayer(id); break;
    case "ex": sheetEx(id); break;
    case "exsolo": startPlayer(null, id); break;
    case "exadd": {
      if (!S.plans.length) { closeSheet(); editPlan(null); ED.items.push([id, EX[id].v]); drawEditor(); break; }
      openSheet(`<div class="sh-h"><b class="px">ZU WELCHER ROUTINE?</b><button class="x" data-act="close">✕</button></div>
        ${S.plans.map(p => `<div class="prow" data-act="exaddto" data-id="${p.id}" data-ex="${id}"><b>${esc(p.n)}</b><small>${p.items.length} Übungen</small></div>`).join("")}
        <div class="prow" data-act="exaddto" data-id="" data-ex="${id}"><b>+ Neue Routine</b></div>`);
      break;
    }
    case "exaddto": {
      const ex = t.dataset.ex;
      if (!id) { editPlan(null); ED.items.push([ex, EX[ex].v]); drawEditor(); break; }
      const p = S.plans.find(x => x.id === id); p.items.push([ex, EX[ex].v]); save(); closeSheet(); toast("Hinzugefügt zu " + p.n); break;
    }
    case "quicklog": { const p = getProg(id); const xp = addLog(p, progSecs(p)); closeSheet(); render(); jingle([[784], [1047]]); toast(`Eingetragen: +${xp} XP`); break; }
    case "copyplan": editPlan(getProg(id)); break;
    case "editplan": editPlan(getProg(id)); break;
    case "newplan": editPlan(null); break;
    case "delplan":
      if (!confirm("Routine wirklich löschen?")) break;
      S.plans = S.plans.filter(p => p.id !== id);
      Object.keys(S.settings.week).forEach(k => { S.settings.week[k] = S.settings.week[k].filter(x => x !== id); });
      save(); closeSheet(); render(); break;
    case "edadd": ED.n = ($("#edName") || {}).value || ED.n; pickExercise(eid => { ED.items.push([eid, EX[eid].v]); drawEditor(); }); break;
    case "pick": if (PICK) { const f = PICK; PICK = null; f(id); } break;
    case "pickback": if (PICK && ED) { PICK = null; drawEditor(); } else closeSheet(); break;
    case "edup": case "eddown": case "edrm": {
      ED.n = $("#edName").value; const i = +t.dataset.i;
      if (a === "edrm") ED.items.splice(i, 1);
      else { const j = a === "edup" ? i - 1 : i + 1; if (j >= 0 && j < ED.items.length) [ED.items[i], ED.items[j]] = [ED.items[j], ED.items[i]]; }
      drawEditor(); break;
    }
    case "edsave": {
      ED.n = $("#edName").value.trim();
      if (!ED.n) return toast("Bitte einen Namen eingeben");
      if (!ED.items.length) return toast("Mindestens eine Übung");
      const i = S.plans.findIndex(p => p.id === ED.id);
      if (i >= 0) S.plans[i] = ED; else S.plans.push(ED);
      save(); closeSheet(); TAB = "plan"; render(); toast("Routine gespeichert"); ED = null; break;
    }
    case "dayrm": { const i = t.dataset.i; S.settings.week[i].splice(+t.dataset.j, 1); save(); render(); break; }
    case "dayadd": {
      const i = t.dataset.i, all = PROGRAMS.concat(S.plans);
      openSheet(`<div class="sh-h"><b class="px">${WEEKDAYS_LONG[i].toUpperCase()}</b><button class="x" data-act="close">✕</button></div>
        ${all.map(p => `<div class="prow" data-act="dayaddto" data-i="${i}" data-id="${p.id}"><b>${esc(p.n)}</b><small>${mins(progSecs(p))} Min · ${kindLabel(p)}</small></div>`).join("")}`);
      break;
    }
    case "dayaddto": { const i = t.dataset.i; (S.settings.week[i] = S.settings.week[i] || []).push(id); save(); closeSheet(); render(); break; }
    case "regen":
      if (!confirm("Wochenplan aus den Gym-Tagen neu erzeugen? Deine Zuordnungen pro Tag werden ersetzt.")) break;
      S.settings.week = genWeek(S.settings.gym); save(); render(); toast("Plan erzeugt"); break;
    case "goalset": {
      const v = prompt("Wochenziel in Minuten (empfohlen 90–120):", S.settings.goalMin);
      if (v && +v > 0) { S.settings.goalMin = Math.round(+v); save(); render(); if (window.mqSettingsRedo) window.mqSettingsRedo(); }
      break;
    }
    case "mfr": MF.r = id; render(); break;
    case "mft": MF.t = id; render(); break;
    case "codexgo": go("codex"); setTimeout(() => { const d = $("#cx-" + id); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth" }); } }, 50); break;
    case "testnew": testStart(); break;
    case "topt": TST.vals[t.dataset.k] = t.dataset.v; drawTest(); break;
    case "tprev": TST.i--; drawTest(); break;
    case "tnext": if (TST.i === TESTS.length - 1) testSave(); else { TST.i++; drawTest(); } break;
    case "dellog": if (confirm("Eintrag löschen?")) { S.logs = S.logs.filter(l => l.id !== id); save(); render(); } break;
    case "deltest": if (confirm("Testtag löschen?")) { S.tests = S.tests.filter(l => l.id !== id); save(); render(); } break;
    case "plmain": plMain(); break;
    case "plnext": next(); break;
    case "plprev": prev(); break;
    case "plquit": quitPlayer(); break;
    case "plclose": stopPlayer(); render(); break;
    case "export": {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: "application/json" });
      const u = URL.createObjectURL(blob), l = document.createElement("a");
      l.href = u; l.download = "mobility-quest-" + dayKey(new Date()) + ".json"; document.body.appendChild(l); l.click(); l.remove();
      setTimeout(() => URL.revokeObjectURL(u), 3000); break;
    }
    case "import": {
      const f = document.createElement("input"); f.type = "file"; f.accept = "application/json,.json";
      f.onchange = async () => {
        try {
          const j = JSON.parse(await f.files[0].text());
          if (!j || !Array.isArray(j.logs)) throw new Error();
          const byId = (a, b) => { const m = new Map(a.map(x => [x.id, x])); (b || []).forEach(x => m.set(x.id, x)); return Array.from(m.values()); };
          S.logs = byId(S.logs, j.logs); S.tests = byId(S.tests, j.tests); S.plans = byId(S.plans, j.plans);
          if (j.settings) S.settings = Object.assign(S.settings, j.settings);
          save(); closeSheet(); render(); toast("Importiert");
        } catch (e) { toast("Datei nicht lesbar"); }
      };
      f.click(); break;
    }
    case "reset":
      if (!confirm("Wirklich alle Daten auf diesem Gerät löschen? (Mit Konto bleiben sie in der Cloud – aber gelöschte Einträge werden beim nächsten Abgleich auch dort gelöscht.)")) break;
      S.logs = []; S.tests = []; S.plans = []; S.settings = DEF_SET(); save(); closeSheet(); render(); break;
  }
});
document.addEventListener("change", ev => {
  const t = ev.target, a = t.dataset.act;
  if (a === "gymset") { S.settings.gym[t.dataset.i] = t.value; save(); toast("Gespeichert – „Neu erzeugen“ passt die Quests an"); render(); }
  else if (a === "edval") { const v = Math.max(1, Math.min(600, Math.round(+t.value || 1))); ED.items[+t.dataset.i][1] = v; ED.n = $("#edName").value; }
  else if (a === "setsound") { S.settings.sound = t.checked; save(); if (t.checked) beep(880, 0.1); }
  else if (a === "setvibe") { S.settings.vibe = t.checked; save(); vib(80); }
});
document.addEventListener("input", ev => {
  const t = ev.target;
  if (t.id === "mq") { MF.q = t.value; const pos = t.selectionStart; render(); const n = $("#mq"); n.focus(); n.setSelectionRange(pos, pos); }
  else if (t.dataset.act === "tval") TST.vals[t.dataset.k] = t.value.replace(",", ".");
});
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && PL.on && !PL.lock && navigator.wakeLock) { try { PL.lock = await navigator.wakeLock.request("screen"); } catch (e) { /* egal */ } }
});

/* ================= Start ================= */
load();
render();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
