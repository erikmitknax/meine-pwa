// Tests für trainingsbuch-pwa/logic.js. Ausführen: node --test "trainingsbuch-pwa/tests/*.test.js"
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

const sess = (date, unit, exercises, extra) => Object.assign({ date, unit, note: '', exercises, updatedAt: 1 }, extra);
const ex = (name, sets, extra) => Object.assign({ name, weste: false, griffe: false, sets: sets.map(([w, r]) => ({ w: String(w), r: String(r) })) }, extra);

test('num: Zahlen, Komma, Einheit, Vorzeichen', () => {
  assert.equal(L.num('10'), 10);
  assert.equal(L.num('10,5'), 10.5);
  assert.equal(L.num(' 10.5 '), 10.5);
  assert.equal(L.num('10 kg'), 10);
  assert.equal(L.num('10kg'), 10);
  assert.equal(L.num('12,5KG'), 12.5);
  assert.equal(L.num('+10'), 10);
  assert.equal(L.num('-20'), -20);
  for (const bad of ['', 'abc', 'Band rot', '10,5,2', '1e3', '--5', '10 lbs', null, undefined]) assert.ok(Number.isNaN(L.num(bad)), String(bad));
});

test('cleanW und setStr: Einheit weg, Text bleibt', () => {
  assert.equal(L.cleanW('10 kg'), '10');
  assert.equal(L.cleanW('Band rot'), 'Band rot');
  assert.equal(L.cleanW(''), '');
  assert.equal(L.setStr({ w: '40', r: '8' }), '40×8');
  assert.equal(L.setStr({ w: '40 kg', r: '8' }), '40×8');
  assert.equal(L.setStr({ w: 'Band rot', r: '12' }), 'Band rot 12');
  assert.equal(L.setStr({ w: '', r: '15' }), '15');
  assert.equal(L.setStr({ w: '', r: '' }), '–');
});

test('weightKinds: "10 kg" macht eine Übung nicht mehr zur Varianten-Übung', () => {
  const s = [sess('2026-10-01', 'Push', [ex('Bankdrücken', [['10 kg', 8], ['12,5', 8]])])];
  const k = L.weightKinds(s, 'Bankdrücken');
  assert.equal(k.numeric, true);
  assert.deepEqual(k.text, []);
  assert.equal(L.defaultWMode(k), 'num');
});

test('defaultWMode: nur Text -> Varianten, gemischt -> Zahl', () => {
  const only = L.weightKinds([sess('2026-10-01', 'Pull', [ex('Rudern', [['Band rot', 10], ['Band blau', 10]])])], 'Rudern');
  assert.equal(L.defaultWMode(only), 'var');
  const mixed = L.weightKinds([sess('2026-10-01', 'Pull', [ex('Klimmzug', [['Band rot', 5], ['10', 5]])])], 'Klimmzug');
  assert.equal(mixed.numeric, true);
  assert.deepEqual(mixed.text, ['Band rot']);
  assert.equal(L.defaultWMode(mixed), 'num');
  const bw = L.weightKinds([sess('2026-10-01', 'Push', [ex('Liegestütze', [['', 20]])])], 'Liegestütze');
  assert.equal(bw.seen, true); assert.equal(bw.numeric, false); assert.deepEqual(bw.text, []);
});

test('METRICS: Top, Volumen, Wdh', () => {
  const e = ex('X', [['40', 8], ['42,5', 6], ['', 10], ['Band', 5]]);
  assert.equal(L.METRICS.top.f(e), 42.5);
  assert.equal(L.METRICS.vol.f(e), 40 * 8 + 42.5 * 6);
  assert.equal(L.METRICS.best.f(e), 10);
  assert.equal(L.METRICS.total.f(e), 29);
  assert.ok(Number.isNaN(L.METRICS.top.f(ex('Y', [['', 5]]))));
});

test('niceTicks', () => {
  assert.deepEqual(L.niceTicks(0, 100, 4), [0, 25, 50, 75, 100]);
  const t = L.niceTicks(7, 7, 4); assert.ok(t[0] <= 6 && t[t.length - 1] >= 8);
  const u = L.niceTicks(41.2, 57.9, 4); assert.ok(u[0] <= 41.2 && u[u.length - 1] >= 57.9);
});

test('catalog, unitOf, lastFor', () => {
  const sessions = [
    Object.assign(sess('2026-10-01', 'Push', [ex('Bankdrücken', [['40', 8]]), ex('Dips', [['', 10]])]), { id: 'a' }),
    Object.assign(sess('2026-10-08', 'Push', [ex('Bankdrücken', [['42,5', 8]])]), { id: 'b' })
  ];
  const plans = [{ name: 'Push', unit: 'Push', exercises: ['Bankdrücken', 'Schulterdrücken'] }];
  assert.deepEqual(L.catalog(sessions, plans, 'Push')[0], 'Bankdrücken');
  assert.ok(L.catalog(sessions, plans, 'Push').includes('Schulterdrücken'));
  assert.equal(L.unitOf(sessions, plans, 'Dips'), 'Push');
  assert.equal(L.unitOf(sessions, plans, 'Unbekannt'), 'Sonstige');
  const desc = [sessions[1], sessions[0]];
  assert.equal(L.lastFor(desc, 'Bankdrücken').date, '2026-10-08');
  assert.equal(L.lastFor(desc, 'Bankdrücken', 'b').date, '2026-10-01');
  assert.equal(L.lastFor(desc, 'Bankdrücken', null, '2026-10-05').date, '2026-10-01');
  assert.equal(L.lastFor(desc, 'Nix'), null);
});

test('parseCSV: Semikolon, Komma, BOM, deutsche und englische Köpfe', () => {
  const a = L.parseCSV('﻿Datum;Übung;Satz;Gewicht_kg;Wiederholungen\n11.10.2026;Bankdrücken;1;40;8\n2026-10-11;Bankdrücken;2;40,5;7\n');
  assert.equal(a.error, undefined); assert.equal(a.rows.length, 2); assert.equal(a.hasUnit, false);
  assert.equal(a.rows[0].date, '2026-10-11'); assert.equal(a.rows[1].w, '40,5');
  const b = L.parseCSV('date,exercise,kg,reps,unit\n2026-10-11,Squat,100,5,Beine');
  assert.equal(b.rows.length, 1); assert.equal(b.hasUnit, true);
  assert.match(L.parseCSV('foo;bar\n1;2').error, /fehlen/);
  assert.match(L.parseCSV('').error, /leer/);
  assert.equal(L.parseCSV('Datum;Übung\nkaputt;X\n').rows.length, 0);
  const q = L.parseCSV('Datum;Übung;Notiz\n2026-10-11;"A;B";"sagte ""hi"""\n');
  assert.equal(q.rows[0].ex, 'A;B'); assert.equal(q.rows[0].note, 'sagte "hi"');
});

test('buildCSV: Export und Reimport sind verlustfrei (Gewicht ohne Einheit)', () => {
  const sessions = [
    sess('2026-10-08', 'Push', [ex('Bankdrücken', [['42,5', 8], ['42,5', 7]], { weste: true })], { note: 'gut; "stark"' }),
    sess('2026-10-01', 'Push', [ex('Bankdrücken', [['40 kg', 8]])])
  ];
  const csv = L.buildCSV(sessions);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'Datum;Einheit;Übung;Satz;Gewicht_kg;Wiederholungen;Weste;Griffe;Notiz');
  assert.ok(lines[1].startsWith('2026-10-01;Push;Bankdrücken;1;40;8'));
  const back = L.parseCSV(csv);
  assert.equal(back.rows.length, 3); assert.equal(back.hasUnit, true);
  const plan = L.planImport([{ rows: back.rows, hasUnit: true, unit: '' }], new Map(), 5);
  assert.equal(plan.ops.length, 2); assert.equal(plan.replaced, 0);
  const oct8 = plan.ops.find(o => o.doc.date === '2026-10-08').doc;
  assert.equal(oct8.note, 'gut; "stark"'); assert.equal(oct8.exercises[0].weste, true); assert.equal(oct8.exercises[0].sets.length, 2);
});

test('planImport: gleiches Datum und gleiche Einheit ersetzt, Notiz bleibt', () => {
  const existing = new Map([['alt', sess('2026-10-01', 'Push', [ex('A', [['1', 1]])], { note: 'meine Notiz' })]]);
  const rows = [{ date: '2026-10-01', ex: 'B', w: '20 kg', r: '10' }];
  const p = L.planImport([{ rows, hasUnit: false, unit: 'Push' }], existing, 7);
  assert.equal(p.replaced, 1); assert.equal(p.ops[0].id, 'alt');
  assert.equal(p.ops[0].doc.note, 'meine Notiz'); assert.equal(p.ops[0].doc.exercises[0].sets[0].w, '20');
  assert.equal(L.planImport([{ rows, hasUnit: false, unit: '' }], existing, 7).ops.length, 0);
});

const backupJson = o => JSON.stringify(Object.assign({ app: 'trainingsbuch', version: 1, sessions: {}, plans: {}, exinfo: {}, rest: {} }, o));

test('parseBackup: gültige Sicherung', () => {
  const r = L.parseBackup(backupJson({
    sessions: { s1: sess('2026-10-01', 'Push', [ex('A', [['40 kg', 8]])]) },
    plans: { p1: { name: 'Push Gym', unit: 'Push', exercises: ['A', 'A', 'B'], order: 3 } },
    exinfo: { A: ' Sitz 5 ' }, rest: { A: 120 }
  }));
  assert.equal(r.error, undefined);
  assert.deepEqual(r.counts, { sessions: 1, plans: 1, exinfo: 1 });
  assert.equal(r.data.sessions.s1.exercises[0].sets[0].w, '40');
  assert.deepEqual(r.data.plans.p1.exercises, ['A', 'B']);
  assert.equal(r.data.plans.p1.order, 3);
  assert.equal(r.data.exinfo.A, 'Sitz 5'); assert.equal(r.data.rest.A, 120);
});

test('parseBackup: kaputte Teile werden übersprungen, Fremdes abgelehnt', () => {
  const r = L.parseBackup(backupJson({
    sessions: { ok: sess('2026-10-01', 'Push', [ex('A', [['1', 1]])]), badDate: sess('2026-13-45', 'Push', []), noUnit: { date: '2026-10-02', exercises: [] }, str: 'x' },
    plans: { noName: { unit: 'Push', exercises: [] } }, rest: { A: 9999, B: 'x', C: 60 }
  }));
  assert.equal(r.counts.sessions, 1); assert.equal(r.counts.plans, 0); assert.equal(r.skipped, 4);
  assert.deepEqual(r.data.rest, { C: 60 });
  assert.match(L.parseBackup('kein json').error, /JSON/);
  assert.match(L.parseBackup('{"app":"kippen"}').error, /keine Trainingsbuch/);
  assert.match(L.parseBackup(JSON.stringify({ app: 'trainingsbuch', version: 2 })).error, /neueren/);
  assert.equal(L.parseBackup('﻿' + backupJson({})).error, undefined);
});

const mkLocal = () => ({
  sessions: new Map([['a', sess('2026-10-01', 'Push', [ex('A', [['1', 1]])], { updatedAt: 100 })], ['b', sess('2026-10-02', 'Pull', [], { updatedAt: 500 })]]),
  plans: new Map([['p1', { name: 'Lokal', unit: 'Push', exercises: [] }]]),
  exinfo: { A: 'lokal' }, rest: { A: 60 }
});

test('planRestore merge: Fehlendes dazu, Neueres gewinnt, Lokales bleibt', () => {
  const backup = L.parseBackup(backupJson({
    sessions: { a: sess('2026-10-01', 'Push', [], { updatedAt: 200 }), b: sess('2026-10-02', 'Pull', [], { updatedAt: 100 }), c: sess('2026-10-03', 'Beine', [], { updatedAt: 1 }) },
    plans: { p1: { name: 'Backup', unit: 'Push', exercises: [] }, p2: { name: 'Neu', unit: 'Pull', exercises: [] } },
    exinfo: { A: 'backup', B: 'neu' }, rest: { A: 90, B: 45 }
  })).data;
  const r = L.planRestore(mkLocal(), backup, 'merge');
  assert.deepEqual(r.sessionOps.map(o => o.id).sort(), ['a', 'c']);
  assert.deepEqual(r.stats, { added: 1, updated: 1, kept: 1, removed: 0 });
  assert.deepEqual(r.planOps.map(o => o.id), ['p2']);
  assert.deepEqual(r.exinfo, { A: 'lokal', B: 'neu' }); assert.deepEqual(r.rest, { A: 60, B: 45 });
  assert.deepEqual(r.sessionDel, []);
});

test('planRestore replace: genau der Stand der Sicherung', () => {
  const backup = L.parseBackup(backupJson({ sessions: { a: sess('2026-10-01', 'Push', [], { updatedAt: 1 }), c: sess('2026-10-03', 'Beine', []) }, plans: {}, exinfo: { B: 'x' }, rest: {} })).data;
  const r = L.planRestore(mkLocal(), backup, 'replace');
  assert.deepEqual(r.sessionOps.map(o => o.id).sort(), ['a', 'c']); assert.deepEqual(r.sessionDel, ['b']);
  assert.deepEqual(r.planDel, ['p1']); assert.deepEqual(r.exinfo, { B: 'x' }); assert.deepEqual(r.rest, {});
  assert.equal(r.stats.removed, 1);
});

test('planRename: umbenennen in Trainings, Plänen, Hinweisen, Pausen', () => {
  const local = {
    sessions: new Map([['a', sess('2026-10-01', 'Push', [ex('Bankdrucken', [['40', 8]]), ex('Dips', [['', 10]])])], ['b', sess('2026-10-02', 'Pull', [ex('Rudern', [['30', 8]])])]]),
    plans: new Map([['p', { name: 'Push', unit: 'Push', exercises: ['Bankdrucken', 'Dips'] }]]),
    exinfo: { Bankdrucken: 'Sitz 5' }, rest: { Bankdrucken: 120 }
  };
  const r = L.planRename(local, 'Bankdrucken', 'Bankdrücken');
  assert.equal(r.merged, false); assert.deepEqual(r.counts, { sessions: 1, plans: 1 });
  assert.equal(r.sessionOps[0].doc.exercises[0].name, 'Bankdrücken');
  assert.deepEqual(r.planOps[0].doc.exercises, ['Bankdrücken', 'Dips']);
  assert.deepEqual(r.exinfo, { 'Bankdrücken': 'Sitz 5' }); assert.deepEqual(r.rest, { 'Bankdrücken': 120 });
  assert.equal(local.sessions.get('a').exercises[0].name, 'Bankdrucken', 'Original bleibt unverändert');
  assert.ok(r.sessionOps[0].doc.updatedAt > 1);
});

test('planRename: Zusammenführen, auch im selben Training und im selben Plan', () => {
  const local = {
    sessions: new Map([['a', sess('2026-10-01', 'Push', [ex('Bankdrücken', [['40', 8]]), ex('Bankdrucken', [['42', 6]], { weste: true })])], ['b', sess('2026-10-02', 'Push', [ex('Bankdrucken', [['44', 5]]), ex('Bankdrücken', [['45', 4]])])]]),
    plans: new Map([['p', { name: 'P', unit: 'Push', exercises: ['Bankdrucken', 'Bankdrücken'] }]]),
    exinfo: { Bankdrucken: 'alt', Bankdrücken: 'neu' }, rest: { Bankdrucken: 90 }
  };
  const r = L.planRename(local, 'Bankdrucken', 'Bankdrücken');
  assert.equal(r.merged, true);
  for (const op of r.sessionOps) { assert.equal(op.doc.exercises.length, 1); assert.equal(op.doc.exercises[0].name, 'Bankdrücken'); }
  const a = r.sessionOps.find(o => o.id === 'a').doc.exercises[0]; assert.equal(a.sets.length, 2); assert.equal(a.weste, true);
  assert.deepEqual(r.planOps[0].doc.exercises, ['Bankdrücken']);
  assert.deepEqual(r.exinfo, { 'Bankdrücken': 'neu' }); assert.deepEqual(r.rest, { 'Bankdrücken': 90 });
});

test('planRename: ungültige Eingaben', () => {
  const local = { sessions: new Map(), plans: new Map(), exinfo: {}, rest: {} };
  assert.equal(L.planRename(local, 'A', 'A'), null);
  assert.equal(L.planRename(local, 'A', '  '), null);
  assert.equal(L.planRename(local, '', 'B'), null);
});

test('isISODate und Datumshilfen', () => {
  assert.ok(L.isISODate('2026-02-28')); assert.ok(!L.isISODate('2026-02-30')); assert.ok(!L.isISODate('26-1-1')); assert.ok(!L.isISODate(null));
  assert.equal(L.fmtShort('2026-10-11'), '11.10.');
  assert.equal(L.agoText(0), 'heute'); assert.equal(L.agoText(1), 'gestern'); assert.equal(L.agoText(5), 'vor 5 T.');
  assert.equal(L.fmtNum(40), '40'); assert.equal(L.fmtNum(42.5), '42,5');
  assert.equal(L.esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});
