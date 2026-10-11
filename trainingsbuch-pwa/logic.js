/* Reine Logik des Trainingsbuchs (ohne DOM, ohne Speicher).
   Läuft im Browser als window.TBLogic und in Node per require() für die Tests (tests/logic.test.js). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TBLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UNITS = ['Bauch', 'Unterer Rücken', 'Pull', 'Push', 'Beine'];
  const SLUG = { 'Bauch': 'bauch', 'Unterer Rücken': 'ruecken', 'Pull': 'pull', 'Push': 'push', 'Beine': 'beine' };

  /* ---------- Hilfen ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const pad = n => String(n).padStart(2, '0');
  const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);

  /* Zahl aus Eingabe: "10", "10,5", "10 kg", "+10", "-20". Alles andere ist keine Zahl (NaN). */
  const num = v => {
    const s = String(v ?? '').trim().replace(/\s*(kg|kilo)$/i, '').replace(',', '.');
    return /^[+-]?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  };
  /* Gewicht für die Anzeige und fürs Speichern: "10 kg" -> "10", Text bleibt Text. */
  const cleanW = w => {
    const s = String(w ?? '').trim();
    return isNaN(num(s)) ? s : s.replace(/\s*(kg|kilo)$/i, '');
  };

  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const parseISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const isISODate = s => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    if (!m) return false;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
  };
  const fmtLong = s => parseISO(s).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtDay = s => parseISO(s).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const fmtShort = s => { const p = String(s).split('-'); return `${p[2]}.${p[1]}.`; };
  const daysAgo = s => Math.round((parseISO(todayISO()) - parseISO(s)) / 864e5);
  const agoText = n => n <= 0 ? 'heute' : n === 1 ? 'gestern' : `vor ${n} T.`;
  const fmtNum = v => Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');

  function setStr(st) {
    const w = cleanW(st.w), r = String(st.r ?? '').trim() || '–';
    if (!w) return r;
    return isNaN(num(w)) ? `${w} ${r}` : `${w}×${r}`;
  }

  /* ---------- Daten abfragen (sessions = Liste von Trainings, plans = Liste von Plänen) ---------- */
  function weightKinds(sessions, name) {
    let numeric = false, seen = false; const text = new Set();
    for (const s of sessions) for (const e of s.exercises || []) if (e.name === name) {
      seen = true;
      for (const st of e.sets || []) {
        const w = String(st.w ?? '').trim(); if (!w) continue;
        if (!isNaN(num(w))) numeric = true; else text.add(w);
      }
    }
    return { seen, numeric, text: [...text].sort() };
  }
  /* Wie das Gewichtsfeld einer Übung standardmäßig arbeitet: 'var' = Varianten antippen (Gummiband rot ...),
     'num' = Zahl tippen. Nur wenn es ausschließlich Text-Gewichte gibt, ist es 'var'. */
  const defaultWMode = k => (k.text.length && !k.numeric) ? 'var' : 'num';

  function catalog(sessions, plans, unit) {
    const c = new Map();
    for (const s of sessions) if (!unit || s.unit === unit) for (const e of s.exercises || []) c.set(e.name, (c.get(e.name) || 0) + 1);
    for (const p of plans) if (!unit || p.unit === unit) for (const n of p.exercises || []) c.set(n, (c.get(n) || 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(x => x[0]);
  }
  function unitOf(sessions, plans, name) {
    const c = new Map();
    for (const s of sessions) for (const e of s.exercises || []) if (e.name === name) c.set(s.unit, (c.get(s.unit) || 0) + 1);
    for (const p of plans) if ((p.exercises || []).includes(name)) c.set(p.unit, (c.get(p.unit) || 0) + 1);
    let best = 'Sonstige', n = 0; for (const [u, k] of c) if (k > n) { best = u; n = k; } return best;
  }
  /* sessionsDesc: neueste zuerst, wie in der App */
  function lastFor(sessionsDesc, name, excludeId, beforeDate) {
    for (const s of sessionsDesc) {
      if (s.id === excludeId) continue;
      if (beforeDate && s.date > beforeDate) continue;
      const ex = (s.exercises || []).find(e => e.name === name);
      if (ex) return { date: s.date, ex };
    }
    return null;
  }

  /* ---------- Fortschritt ---------- */
  const numsOf = (e, key) => (e.sets || []).map(s => num(s[key])).filter(x => !isNaN(x));
  const METRICS = {
    // Alle Sätze: je Training ein Punkt pro Satz, die Linie folgt dem schwersten Satz (bzw. den meisten Wiederholungen)
    sets: { label: 'Alle Sätze', unit: 'kg', all: e => numsOf(e, 'w'), f: e => { const v = numsOf(e, 'w'); return v.length ? Math.max(...v) : NaN; } },
    setsR: { label: 'Alle Sätze', unit: 'Wdh', all: e => numsOf(e, 'r'), f: e => { const v = numsOf(e, 'r'); return v.length ? Math.max(...v) : NaN; } },
    top: { label: 'Top-Gewicht', unit: 'kg', f: e => { const v = (e.sets || []).map(s => num(s.w)).filter(x => !isNaN(x)); return v.length ? Math.max(...v) : NaN; } },
    vol: { label: 'Volumen', unit: 'kg', f: e => { let t = 0, ok = false; for (const s of e.sets || []) { const w = num(s.w), r = num(s.r); if (!isNaN(w) && !isNaN(r)) { t += w * r; ok = true; } } return ok ? t : NaN; } },
    best: { label: 'Beste Wdh', unit: 'Wdh', f: e => { const v = (e.sets || []).map(s => num(s.r)).filter(x => !isNaN(x)); return v.length ? Math.max(...v) : NaN; } },
    total: { label: 'Wdh gesamt', unit: 'Wdh', f: e => { const v = (e.sets || []).map(s => num(s.r)).filter(x => !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) : NaN; } }
  };
  function niceTicks(min, max, n) {
    if (min === max) { min = min - 1; max = max + 1; }
    const step0 = (max - min) / n, mag = Math.pow(10, Math.floor(Math.log10(step0))), norm = step0 / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(6));
    return out;
  }

  /* ---------- CSV ---------- */
  function splitCSVLine(line, delim) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === delim) { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur); return out.map(s => s.trim());
  }
  function normKey(k) { return k.toLowerCase().replace(/^﻿/, '').replace('ü', 'ue').replace(/[^a-z_]/g, ''); }
  const KEYMAP = { datum: 'date', date: 'date', uebung: 'ex', exercise: 'ex', satz: 'set', set: 'set', gewicht_kg: 'w', gewicht: 'w', kg: 'w', wiederholungen: 'r', wdh: 'r', reps: 'r', einheit: 'unit', unit: 'unit', trainingseinheit: 'unit', weste: 'weste', griffe: 'griffe', pushupgriffe: 'griffe', notiz: 'note', notizen: 'note', note: 'note', notes: 'note' };
  function parseDate(s, year) {
    s = String(s).trim(); let m;
    if (m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    if (m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})?$/)) { const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(year || new Date().getFullYear()); return `${y}-${pad(m[2])}-${pad(m[1])}`; }
    return null;
  }
  function parseCSV(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return { rows: [], hasUnit: false, error: 'Datei ist leer.' };
    const delim = (lines[0].split(';').length >= lines[0].split(',').length) ? ';' : ',';
    const head = splitCSVLine(lines[0], delim).map(h => KEYMAP[normKey(h)] || null);
    if (!head.includes('date') || !head.includes('ex')) return { rows: [], hasUnit: false, error: 'Spalten „Datum“ und „Übung“ fehlen.' };
    const rows = [];
    for (const l of lines.slice(1)) {
      const c = splitCSVLine(l, delim); const r = {}; head.forEach((k, i) => { if (k) r[k] = c[i] ?? ''; });
      r.date = parseDate(r.date); if (!r.date || !String(r.ex || '').trim()) continue; rows.push(r);
    }
    return { rows, hasUnit: head.includes('unit') };
  }
  function guessUnit(fn) { fn = fn.toLowerCase(); if (fn.includes('push')) return 'Push'; if (fn.includes('pull')) return 'Pull'; if (fn.includes('bein')) return 'Beine'; if (fn.includes('bauch') || fn.includes('abs')) return 'Bauch'; if (fn.includes('rueck') || fn.includes('rück')) return 'Unterer Rücken'; return ''; }
  const truthy = v => /^(1|ja|x|true|yes|j)$/i.test(String(v || '').trim());
  function matchUnit(v) { v = String(v || '').trim().toLowerCase(); return UNITS.find(u => u.toLowerCase() === v) || ''; }

  /* sessions: Liste von Trainings (beliebige Reihenfolge) */
  function buildCSV(sessions) {
    const q = v => { v = String(v ?? ''); return /[;"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const asc = [...sessions].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.updatedAt || 0) - (b.updatedAt || 0));
    const out = ['Datum;Einheit;Übung;Satz;Gewicht_kg;Wiederholungen;Weste;Griffe;Notiz'];
    for (const s of asc) (s.exercises || []).forEach((e, ei) => (e.sets || []).forEach((st, i) => out.push([s.date, s.unit, e.name, i + 1, cleanW(st.w), st.r, e.weste ? 'ja' : '', e.griffe ? 'ja' : '', ei === 0 && i === 0 ? s.note || '' : ''].map(q).join(';'))));
    return out.join('\n') + '\n';
  }

  /* CSV-Zeilen -> Trainings. files: [{rows, hasUnit, unit}], existing: Map id -> Training.
     Liefert {ops:[{id,doc}], replaced}. Gleiches Datum + gleiche Einheit ersetzt das vorhandene Training. */
  function planImport(files, existing, now) {
    const groups = new Map();
    for (const f of files) for (const r of f.rows) {
      const unit = (f.hasUnit && matchUnit(r.unit)) || f.unit; if (!unit) continue;
      const key = r.date + '|' + unit;
      if (!groups.has(key)) groups.set(key, { date: r.date, unit, note: '', ex: new Map() });
      const g = groups.get(key), name = String(r.ex).trim();
      if (!g.ex.has(name)) g.ex.set(name, { name, weste: false, griffe: false, sets: [] });
      const e = g.ex.get(name);
      if (truthy(r.weste)) e.weste = true; if (truthy(r.griffe)) e.griffe = true;
      if (!g.note && r.note) g.note = String(r.note).trim();
      if (String(r.w || '').trim() || String(r.r || '').trim()) e.sets.push({ w: cleanW(r.w || ''), r: String(r.r || '').trim() });
    }
    const ops = []; let replaced = 0;
    for (const g of groups.values()) {
      let id = null; for (const [sid, s] of existing) if (s.date === g.date && s.unit === g.unit) { id = sid; break; }
      if (id) replaced++; else id = `${g.date}_${SLUG[g.unit] || 'x'}`;
      const prev = existing.get(id);
      ops.push({ id, doc: { date: g.date, unit: g.unit, note: g.note || (prev && prev.note) || '', exercises: [...g.ex.values()], updatedAt: now } });
    }
    return { ops, replaced };
  }

  /* ---------- Sicherung (JSON) lesen und prüfen ---------- */
  function cleanSession(s) {
    if (!isObj(s) || !isISODate(s.date)) return null;
    const unit = String(s.unit ?? '').trim().slice(0, 40); if (!unit) return null;
    const exercises = [];
    for (const e of Array.isArray(s.exercises) ? s.exercises : []) {
      if (!isObj(e)) continue; const name = String(e.name ?? '').trim(); if (!name) continue;
      const sets = [];
      for (const st of Array.isArray(e.sets) ? e.sets : []) { if (!isObj(st)) continue; sets.push({ w: cleanW(st.w ?? ''), r: String(st.r ?? '').trim() }); }
      exercises.push({ name, weste: !!e.weste, griffe: !!e.griffe, sets });
    }
    return { date: s.date, unit, note: typeof s.note === 'string' ? s.note : '', exercises, updatedAt: Number.isFinite(s.updatedAt) ? s.updatedAt : 0 };
  }
  function cleanPlan(p) {
    if (!isObj(p)) return null;
    const name = String(p.name ?? '').trim(); if (!name) return null;
    const exercises = []; for (const n of Array.isArray(p.exercises) ? p.exercises : []) { const t = String(n ?? '').trim(); if (t && !exercises.includes(t)) exercises.push(t); }
    const out = { name, unit: String(p.unit ?? 'Push').trim().slice(0, 40) || 'Push', exercises };
    if (Number.isFinite(p.order)) out.order = p.order;
    return out;
  }
  /* text: Inhalt von trainingsbuch-komplett.json (String oder schon geparstes Objekt) */
  function parseBackup(text) {
    let j;
    try { j = typeof text === 'string' ? JSON.parse(text.replace(/^﻿/, '')) : text; } catch (e) { return { error: 'Die Datei ist kein gültiges JSON.' }; }
    if (!isObj(j) || j.app !== 'trainingsbuch') return { error: 'Das ist keine Trainingsbuch-Sicherung (trainingsbuch-komplett.json).' };
    if ((Number(j.version) || 1) > 1) return { error: 'Die Sicherung stammt aus einer neueren App-Version. Bitte die App aktualisieren.' };
    const data = { sessions: {}, plans: {}, exinfo: {}, rest: {} }; let skipped = 0;
    for (const [id, s] of Object.entries(isObj(j.sessions) ? j.sessions : {})) { const c = id ? cleanSession(s) : null; if (c) data.sessions[id] = c; else skipped++; }
    for (const [id, p] of Object.entries(isObj(j.plans) ? j.plans : {})) { const c = id ? cleanPlan(p) : null; if (c) data.plans[id] = c; else skipped++; }
    for (const [k, v] of Object.entries(isObj(j.exinfo) ? j.exinfo : {})) if (k.trim() && typeof v === 'string' && v.trim()) data.exinfo[k] = v.trim();
    for (const [k, v] of Object.entries(isObj(j.rest) ? j.rest : {})) if (k.trim() && typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 600) data.rest[k] = Math.round(v);
    return { data, skipped, counts: { sessions: Object.keys(data.sessions).length, plans: Object.keys(data.plans).length, exinfo: Object.keys(data.exinfo).length } };
  }
  /* Was passiert beim Wiederherstellen? local: {sessions:Map, plans:Map, exinfo, rest}, backup: parseBackup().data
     mode 'merge': Vorhandenes bleibt, Fehlendes kommt dazu, bei gleichem Training gewinnt das neuere (updatedAt).
     mode 'replace': Der Stand wird genau so, wie er in der Sicherung steht. */
  function planRestore(local, backup, mode) {
    const r = { sessionOps: [], sessionDel: [], planOps: [], planDel: [], exinfo: null, rest: null, stats: { added: 0, updated: 0, kept: 0, removed: 0 } };
    if (mode === 'replace') {
      for (const [id, doc] of Object.entries(backup.sessions)) r.sessionOps.push({ id, doc });
      for (const id of local.sessions.keys()) if (!(id in backup.sessions)) { r.sessionDel.push(id); r.stats.removed++; }
      for (const [id, doc] of Object.entries(backup.plans)) r.planOps.push({ id, doc });
      for (const id of local.plans.keys()) if (!(id in backup.plans)) r.planDel.push(id);
      r.stats.added = Object.keys(backup.sessions).filter(id => !local.sessions.has(id)).length;
      r.stats.updated = Object.keys(backup.sessions).length - r.stats.added;
      r.exinfo = Object.assign({}, backup.exinfo); r.rest = Object.assign({}, backup.rest);
      return r;
    }
    for (const [id, doc] of Object.entries(backup.sessions)) {
      const cur = local.sessions.get(id);
      if (!cur) { r.sessionOps.push({ id, doc }); r.stats.added++; }
      else if ((doc.updatedAt || 0) > (cur.updatedAt || 0)) { r.sessionOps.push({ id, doc }); r.stats.updated++; }
      else r.stats.kept++;
    }
    for (const [id, doc] of Object.entries(backup.plans)) if (!local.plans.has(id)) r.planOps.push({ id, doc });
    const ex = Object.assign({}, local.exinfo), rs = Object.assign({}, local.rest); let exChanged = false, rsChanged = false;
    for (const [k, v] of Object.entries(backup.exinfo)) if (!(k in ex)) { ex[k] = v; exChanged = true; }
    for (const [k, v] of Object.entries(backup.rest)) if (!(k in rs)) { rs[k] = v; rsChanged = true; }
    if (exChanged) r.exinfo = ex; if (rsChanged) r.rest = rs;
    return r;
  }

  /* ---------- Übung umbenennen / zusammenführen ---------- */
  /* local: {sessions:Map, plans:Map, exinfo, rest}. Liefert null bei ungültiger Eingabe. */
  function planRename(local, from, to) {
    from = String(from ?? '').trim(); to = String(to ?? '').trim();
    if (!from || !to || from === to) return null;
    const r = { sessionOps: [], planOps: [], exinfo: null, rest: null, merged: false, counts: { sessions: 0, plans: 0 } };
    let toExists = false;
    for (const s of local.sessions.values()) if ((s.exercises || []).some(e => e.name === to)) toExists = true;
    for (const p of local.plans.values()) if ((p.exercises || []).includes(to)) toExists = true;
    r.merged = toExists;
    for (const [id, s] of local.sessions) {
      if (!(s.exercises || []).some(e => e.name === from)) continue;
      const doc = clone(s); const out = [];
      for (const e of doc.exercises) {
        if (e.name !== from) { out.push(e); continue; }
        const twin = out.find(x => x.name === to) || doc.exercises.find(x => x !== e && x.name === to);
        if (twin) { twin.sets = (twin.sets || []).concat(e.sets || []); twin.weste = !!(twin.weste || e.weste); twin.griffe = !!(twin.griffe || e.griffe); }
        else { e.name = to; out.push(e); }
      }
      doc.exercises = out; doc.updatedAt = Math.max(Date.now(), (s.updatedAt || 0) + 1);
      r.sessionOps.push({ id, doc }); r.counts.sessions++;
    }
    for (const [id, p] of local.plans) {
      if (!(p.exercises || []).includes(from)) continue;
      const doc = clone(p); const seen = new Set(), list = [];
      for (const n of doc.exercises) { const m = n === from ? to : n; if (!seen.has(m)) { seen.add(m); list.push(m); } }
      doc.exercises = list; r.planOps.push({ id, doc }); r.counts.plans++;
    }
    const ex = local.exinfo || {}, rs = local.rest || {};
    if (from in ex) { const n = Object.assign({}, ex); if (!(to in n)) n[to] = n[from]; delete n[from]; r.exinfo = n; }
    if (from in rs) { const n = Object.assign({}, rs); if (!(to in n)) n[to] = n[from]; delete n[from]; r.rest = n; }
    return r;
  }

  return {
    UNITS, SLUG, esc, clone, pad, isObj, num, cleanW, todayISO, parseISO, isISODate, fmtLong, fmtDay, fmtShort, daysAgo, agoText, fmtNum, setStr,
    weightKinds, defaultWMode, catalog, unitOf, lastFor, METRICS, niceTicks,
    splitCSVLine, normKey, KEYMAP, parseDate, parseCSV, guessUnit, truthy, matchUnit, buildCSV, planImport,
    parseBackup, planRestore, planRename
  };
});
