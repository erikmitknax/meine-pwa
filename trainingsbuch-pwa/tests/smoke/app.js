// Durchlauf der ganzen App in jsdom (Training anlegen, Speicherfehler, Gewichtsmodus, Sicherung, Restore, Umbenennen, Zurück-Geste).
// Aufruf: node trainingsbuch-pwa/tests/smoke/app.js [ordner-der-app]
const path = require('path'), http = require('http'), fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };

let pass = 0, fail = 0; const errors = [];
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]); const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Not implemented/.test(e.message)) errors.push('jsdomError: ' + e.message + (e.detail ? ' ' + e.detail : '')); });
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  const dom = await JSDOM.fromURL(base + 'index.html', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.Element.prototype.scrollIntoView = function () {};
      w.scrollTo = function () {};
      w.addEventListener('error', e => errors.push('window.onerror: ' + e.message));
      w.addEventListener('unhandledrejection', e => errors.push('unhandledrejection: ' + (e.reason && e.reason.message || e.reason)));
    }
  });
  const w = dom.window, d = w.document;
  await tick(300);
  const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
  const click = s => { const el = typeof s === 'string' ? $(s) : s; if (!el) throw new Error('nicht gefunden: ' + s); el.click(); };
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const change = (el, v) => { if (v !== undefined) el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const LS = k => JSON.parse(w.localStorage.getItem(k) || 'null');
  const toast = () => $('#toast') && !$('#toast').hidden ? $('#toast').textContent : '';
  const view = () => $('#view').textContent;

  console.log('Start');
  ok(!!w.TBLogic, 'logic.js geladen (window.TBLogic)');
  ok(view().includes('Training starten'), 'Startseite zeigt "Training starten"');
  ok(!d.querySelector('link[href*="googleapis"]'), 'keine Google-Fonts-Verbindung im HTML');
  ok(d.querySelector('title') && d.querySelector('title').parentNode.tagName === 'HEAD', '<title> steht im <head>');

  console.log('Training anlegen, Gewicht "10 kg" wird zu "10"');
  click('[data-act="startUnit"][data-unit="Push"]'); await tick();
  type($('#addEx'), 'Bankdrücken'); click('[data-act="addEx"]'); await tick();
  type($('input[data-ei="0"][data-si="0"][data-f="w"]'), '10 kg');
  type($('input[data-ei="0"][data-si="0"][data-f="r"]'), '8');
  type($('input[data-ei="0"][data-si="1"][data-f="w"]'), '12,5');
  type($('input[data-ei="0"][data-si="1"][data-f="r"]'), '7');
  ok(LS('tb_draft') && LS('tb_draft').exercises[0].sets[0].w === '10 kg', 'Entwurf wird bei jeder Eingabe gespeichert');
  click('[data-act="save"]'); await tick(60);
  const s1 = Object.values(LS('tb_sessions') || {});
  ok(s1.length === 1, 'Training gespeichert (localStorage)');
  ok(s1[0] && s1[0].exercises[0].sets[0].w === '10' && s1[0].exercises[0].sets[1].w === '12,5', 'Einheit "kg" wurde beim Speichern entfernt');
  ok(view().includes('Bankdrücken') || $$('.card').length === 1, 'Verlauf zeigt das Training');

  console.log('Speicher voll: Fehler wird gemeldet, nichts geht verloren');
  click('[data-act="tab"][data-tab="log"]'); await tick();
  click('[data-act="startUnit"][data-unit="Pull"]'); await tick();
  type($('#addEx'), 'Rudern'); click('[data-act="addEx"]'); await tick();
  type($('input[data-ei="0"][data-si="0"][data-f="r"]'), '10');
  const origSet = w.Storage.prototype.setItem;
  w.Storage.prototype.setItem = function () { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
  click('[data-act="save"]'); await tick(60);
  ok(/Nicht gespeichert.*Speicher voll/.test(toast()), 'Meldung "Nicht gespeichert: Speicher voll." erscheint (war: stilles "Training gespeichert")');
  ok($$('.ex').length === 1, 'Entwurf bleibt offen');
  w.Storage.prototype.setItem = origSet;
  ok(Object.keys(LS('tb_sessions')).length === 1, 'zweites Training wurde nicht halb gespeichert');
  click('[data-act="save"]'); await tick(60);
  ok(Object.keys(LS('tb_sessions')).length === 2, 'danach lässt sich normal speichern');

  console.log('Gewichtsmodus: Text-Gewicht macht Zahlenfeld nicht mehr kaputt');
  // Übung mit Gummiband-Varianten und einem Zahlenwert in der Historie
  const sess = LS('tb_sessions');
  sess['x1'] = { date: '2026-09-01', unit: 'Pull', note: '', exercises: [{ name: 'Klimmzug', weste: false, griffe: false, sets: [{ w: 'Band rot', r: '5' }, { w: '10', r: '5' }] }], updatedAt: 1 };
  sess['x2'] = { date: '2026-09-02', unit: 'Pull', note: '', exercises: [{ name: 'Seilzug', weste: false, griffe: false, sets: [{ w: 'Band rot', r: '5' }, { w: 'Band blau', r: '5' }] }], updatedAt: 1 };
  w.localStorage.setItem('tb_sessions', JSON.stringify(sess));
  const dom2 = await JSDOM.fromURL(base + 'index.html', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w2) { w2.Element.prototype.scrollIntoView = function () {}; w2.scrollTo = function () {}; w2.addEventListener('error', e => errors.push('window.onerror: ' + e.message)); w2.localStorage.setItem('tb_sessions', JSON.stringify(sess)); w2.localStorage.setItem('tb_plans', w.localStorage.getItem('tb_plans') || '{}'); } });
  await tick(300);
  const w2 = dom2.window, d2 = w2.document, q2 = s => d2.querySelector(s), c2 = s => q2(s).click();
  const t2 = (el, v) => { el.value = v; el.dispatchEvent(new w2.Event('input', { bubbles: true })); };
  c2('[data-act="startUnit"][data-unit="Pull"]'); await tick();
  t2(q2('#addEx'), 'Klimmzug'); c2('[data-act="addEx"]'); await tick();
  ok(!!q2('input[data-f="w"][data-ei="0"]') && !q2('.cyc'), 'gemischte Übung (Zahl + Band): Zahlenfeld, kein Varianten-Schalter');
  c2('[data-act="exMenu"][data-ei="0"]'); await tick();
  ok(!!q2('[data-act="wmode"]') && /Gewicht wählen/.test(q2('[data-act="wmode"]').textContent), 'Menü bietet "Gewicht wählen" an');
  c2('[data-act="wmode"]'); await tick();
  ok(!!q2('.cyc'), 'nach Umschalten: Varianten-Schalter');
  c2('[data-act="wmode"]'); await tick();
  ok(!q2('.cyc') && !!q2('input[data-f="w"][data-ei="0"]'), 'zurück auf Zahlenfeld');
  t2(q2('#addEx'), 'Seilzug'); c2('[data-act="addEx"]'); await tick();
  ok(d2.querySelectorAll('.cyc').length >= 1, 'reine Varianten-Übung (nur Bänder) zeigt weiter den Varianten-Schalter');
  c2('[data-act="discard"]'); await tick(); c2('[data-act="discardYes"]'); await tick();
  ok(!!q2('[data-act="tab"][data-tab="settings"][data-open="backup"]') && !q2('[data-tab="data"]'), 'Startseite verlinkt "Sicherung & Import" (keinen Daten-Tab mehr)');

  console.log('Komplett-Sicherung: Export, Restore (zusammenführen und ersetzen), Fehlerfälle');
  const wx = w2, dx = d2, lsx = k => JSON.parse(wx.localStorage.getItem(k) || 'null');
  const qx = s => dx.querySelector(s), cx = s => qx(s).click();
  cx('#gearBtn'); await tick();
  ok(dx.querySelectorAll('.acc').length === 7, 'Einstellungen haben 7 Abschnitte');
  ok(dx.querySelectorAll('.acc.open').length === 0 && dx.querySelectorAll('.acc-b').length === 0, 'alle Abschnitte sind eingeklappt');
  ok([...dx.querySelectorAll('.acc-h')].every(h => h.getAttribute('aria-expanded') === 'false'), 'aria-expanded ist überall "false"');
  const titles = [...dx.querySelectorAll('.acc-h')].map(h => h.textContent);
  ok(['Design', 'Logo', 'Signal am Pausenende', 'Sicherung & Wiederherstellung', 'Dropbox-Backup', 'CSV importieren', 'Übungen verwalten'].every(t => titles.some(x => x.includes(t))), 'Titel: Design, Logo, Signal, Sicherung, Dropbox, CSV, Übungen');
  cx('[data-act="acc"][data-id="design"]'); await tick();
  ok(dx.querySelectorAll('.acc.open').length === 1 && !!qx('.swatches'), 'Antippen klappt "Design" auf');
  ok(qx('[data-act="acc"][data-id="design"]').getAttribute('aria-expanded') === 'true', 'aria-expanded wird "true"');
  cx('[data-act="acc"][data-id="backup"]'); await tick();
  ok(dx.querySelectorAll('.acc.open').length === 2 && /Sichern/.test(qx('#view').textContent) && /Wiederherstellen/.test(qx('#view').textContent), 'mehrere Abschnitte können offen sein, Sicherung zeigt Sichern und Wiederherstellen');
  cx('[data-act="acc"][data-id="design"]'); await tick();
  ok(dx.querySelectorAll('.acc.open').length === 1 && !qx('.swatches'), 'nochmal Antippen klappt wieder zu');
  cx('[data-act="tab"][data-tab="log"]'); await tick(); cx('#gearBtn'); await tick();
  ok(dx.querySelectorAll('.acc.open').length === 0, 'beim erneuten Öffnen der Einstellungen ist wieder alles zu');
  cx('[data-act="tab"][data-tab="log"]'); await tick(); cx('[data-act="tab"][data-open="backup"]'); await tick();
  ok(dx.querySelectorAll('.acc.open').length === 1 && qx('.acc.open .acc-h').textContent.includes('Sicherung'), 'Link "Sicherung & Import" öffnet die Einstellungen mit aufgeklapptem Abschnitt Sicherung');
  // Pläne und Hinweise für den Rundlauf anlegen
  const plans = { p1: { name: 'Push Gym', unit: 'Push', exercises: ['Bankdrücken'], order: 1 } };
  wx.localStorage.setItem('tb_plans', JSON.stringify(plans)); wx.localStorage.setItem('tb_exinfo', JSON.stringify({ 'Bankdrücken': 'Sitz 5' })); wx.localStorage.setItem('tb_rest', JSON.stringify({ 'Bankdrücken': 120 }));
  const dom3 = await JSDOM.fromURL(base + 'index.html', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w3) { w3.Element.prototype.scrollIntoView = function () {}; w3.scrollTo = function () {}; w3.addEventListener('error', e => errors.push('window.onerror: ' + e.message)); for (const k of ['tb_sessions', 'tb_plans', 'tb_exinfo', 'tb_rest']) w3.localStorage.setItem(k, wx.localStorage.getItem(k)); w3.localStorage.setItem('tb_tab', JSON.stringify('data')); } });
  await tick(300);
  const w3 = dom3.window, d3 = w3.document, q = s => d3.querySelector(s), c = s => q(s).click(), L3 = k => JSON.parse(w3.localStorage.getItem(k) || 'null');
  const tp = (el, v) => { el.value = v; el.dispatchEvent(new w3.Event('input', { bubbles: true })); };
  const t3 = () => q('#toast') && !q('#toast').hidden ? q('#toast').textContent : '';
  ok(/Sicherung & Wiederherstellung/.test(q('#view').textContent) && !q('.acc.open'), 'alter gespeicherter Tab "data" öffnet die Einstellungen, alles eingeklappt');
  c('[data-act="acc"][data-id="backup"]'); await tick();
  c('[data-act="exportJSON"]'); await tick(60);
  const exp = q('#expText');
  ok(!!exp, 'JSON-Export fällt ohne Download-Möglichkeit auf Text zum Kopieren zurück');
  const backupText = exp ? exp.value : '{}';
  const parsedBackup = w3.TBLogic.parseBackup(backupText);
  ok(!parsedBackup.error && parsedBackup.counts.sessions === Object.keys(L3('tb_sessions')).length && parsedBackup.counts.plans === 1, 'Export lässt sich wieder einlesen, nichts fehlt');
  const nSess = Object.keys(L3('tb_sessions')).length;

  const pick = async (text, name = 'trainingsbuch-komplett.json') => { const inp = q('#bkIn'); Object.defineProperty(inp, 'files', { value: [{ name, text: () => Promise.resolve(text) }], configurable: true }); inp.dispatchEvent(new w3.Event('change', { bubbles: true })); await tick(60); };
  await pick('das ist kein json');
  ok(/kein gültiges JSON/.test(q('#view').textContent), 'kaputte Datei: verständliche Fehlermeldung');
  c('[data-act="restoreCancel"]'); await tick();
  await pick(JSON.stringify({ app: 'kippen', version: 1 }));
  ok(/keine Trainingsbuch-Sicherung/.test(q('#view').textContent), 'fremde Datei wird abgelehnt');
  c('[data-act="restoreCancel"]'); await tick();

  // Neue Sicherung mit zusätzlichem Training und neuerer Version eines vorhandenen
  const b = JSON.parse(backupText);
  const firstId = Object.keys(b.sessions)[0];
  b.sessions['neu1'] = { date: '2026-08-01', unit: 'Beine', note: 'alt', exercises: [{ name: 'Kniebeuge', weste: false, griffe: false, sets: [{ w: '100', r: '5' }] }], updatedAt: 5 };
  b.sessions[firstId].updatedAt = 9e15; b.sessions[firstId].note = 'aus Sicherung';
  b.plans['p2'] = { name: 'Beine', unit: 'Beine', exercises: ['Kniebeuge'] };
  await pick(JSON.stringify(b));
  ok(/Zusammenführen/.test(q('#view').textContent) && /1 neue Trainings/.test(q('#view').textContent) && /1 werden durch die neuere/.test(q('#view').textContent), 'Vorschau Zusammenführen: 1 neu, 1 aktualisiert');
  ok(Object.keys(L3('tb_sessions')).length === nSess, 'Vorschau ändert noch nichts');
  c('[data-act="restoreRun"]'); await tick(60);
  const after = L3('tb_sessions');
  ok(Object.keys(after).length === nSess + 1 && after['neu1'] && after[firstId].note === 'aus Sicherung', 'Zusammenführen: neues Training da, neuere Fassung übernommen');
  ok(Object.keys(L3('tb_plans')).length === 2, 'Zusammenführen: fehlender Plan ergänzt');
  ok(/Wiederhergestellt: 1 neu, 1 aktualisiert/.test(t3()), 'Meldung nennt das Ergebnis');

  // Ersetzen mit Rückfrage
  const b2 = JSON.parse(backupText);
  await pick(JSON.stringify(b2));
  c('[data-act="restoreMode"][data-v="replace"]'); await tick();
  ok(/entfernt/.test(q('#view').textContent), 'Vorschau Ersetzen nennt, was entfernt wird');
  c('[data-act="restoreAskReplace"]'); await tick();
  ok(/Wirklich ersetzen/.test(q('#view').textContent), 'Ersetzen verlangt eine Bestätigung');
  c('[data-act="restoreRun"]'); await tick(60);
  ok(Object.keys(L3('tb_sessions')).length === nSess && !L3('tb_sessions')['neu1'] && Object.keys(L3('tb_plans')).length === 1, 'Ersetzen: Stand entspricht genau der Sicherung');

  // Speicher voll beim Wiederherstellen: alles oder nichts
  await pick(JSON.stringify(b));
  const before = w3.localStorage.getItem('tb_sessions');
  const orig3 = w3.Storage.prototype.setItem; w3.Storage.prototype.setItem = function () { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; };
  c('[data-act="restoreRun"]'); await tick(60);
  w3.Storage.prototype.setItem = orig3;
  ok(/Nicht wiederhergestellt/.test(t3()) && w3.localStorage.getItem('tb_sessions') === before, 'Speicher voll beim Restore: Meldung, Daten unverändert');
  c('[data-act="restoreCancel"]'); await tick();

  console.log('Übung umbenennen und zusammenführen');
  c('[data-act="acc"][data-id="manage"]'); await tick();
  const sel = q('#rnFrom');
  ok(!!sel && [...sel.options].some(o => o.textContent === 'Bankdrücken'), 'Auswahl enthält vorhandene Übungen');
  // Tippfehler-Übung anlegen
  const s3 = L3('tb_sessions'); s3['typo'] = { date: '2026-10-05', unit: 'Push', note: '', exercises: [{ name: 'Bankdrucken', weste: false, griffe: false, sets: [{ w: '45', r: '5' }] }], updatedAt: 1 };
  w3.localStorage.setItem('tb_sessions', JSON.stringify(s3));
  const dom4 = await JSDOM.fromURL(base + 'index.html', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w4) { w4.Element.prototype.scrollIntoView = function () {}; w4.scrollTo = function () {}; for (const k of ['tb_sessions', 'tb_plans', 'tb_exinfo', 'tb_rest']) w4.localStorage.setItem(k, w3.localStorage.getItem(k)); w4.localStorage.setItem('tb_tab', JSON.stringify('data')); } });
  await tick(300);
  const w4 = dom4.window, d4 = w4.document, q4 = s => d4.querySelector(s), c4 = s => q4(s).click(), L4 = k => JSON.parse(w4.localStorage.getItem(k) || 'null');
  c4('[data-act="acc"][data-id="manage"]'); await tick();
  const s4 = q4('#rnFrom'); s4.value = 'Bankdrucken'; s4.dispatchEvent(new w4.Event('change', { bubbles: true })); await tick();
  const to = q4('#rnTo'); to.value = 'Bankdrücken'; to.dispatchEvent(new w4.Event('input', { bubbles: true }));
  c4('[data-act="rnPrepare"]'); await tick();
  ok(/gibt es schon, beide werden zusammengeführt/.test(q4('#view').textContent) && /1 Trainings/.test(q4('#view').textContent), 'Vorschau: Zusammenführen mit vorhandener Übung, 1 Training betroffen');
  ok(!!q4('#rnTo').readOnly, 'Namensfeld ist während der Bestätigung gesperrt');
  c4('[data-act="rnApply"]'); await tick(60);
  const after4 = L4('tb_sessions');
  ok(!Object.values(after4).some(s => s.exercises.some(e => e.name === 'Bankdrucken')) && after4['typo'].exercises[0].name === 'Bankdrücken', 'alter Name ist überall weg');
  ok(/ist jetzt/.test(q4('#toast').textContent), 'Meldung bestätigt das Umbenennen');
  c4('[data-act="rnPrepare"]'); await tick();
  ok(/Wähle eine Übung/.test(q4('#toast').textContent), 'leere Auswahl: freundlicher Hinweis statt Fehler');

  console.log('Zurück-Geste');
  c4('[data-act="tab"][data-tab="hist"]'); await tick();
  c4('[data-act="tab"][data-tab="prog"]'); await tick();
  ok(w4.document.querySelector('.tab.on') && /Fortschritt/.test(w4.document.querySelector('.tab.on').textContent), 'Fortschritt ist offen');
  w4.history.back(); await tick(100);
  ok(/Verlauf/.test(w4.document.querySelector('.tab.on').textContent), 'Zurück führt zu Verlauf');
  w4.history.back(); await tick(100);
  ok(errors.length === 0, 'zweites Zurück wirft keinen Fehler');

  console.log('Fortschritt rendert');
  c4('[data-act="tab"][data-tab="prog"]'); await tick();
  ok(!!q4('svg.chart') || /Noch keine Daten|Für diese Kennzahl/.test(q4('#view').textContent), 'Diagramm oder Hinweis wird angezeigt');

  console.log('Fortschritt: alle Sätze, Trend, Auswahl, Zeitraum');
  const many = {};
  for (let i = 0; i < 15; i++) {
    const d = new Date(Date.UTC(2026, 8, 1 + i * 2)).toISOString().slice(0, 10);
    many['m' + i] = { date: d, unit: 'Push', note: '', exercises: [{ name: 'Bankdrücken', weste: false, griffe: false, sets: [{ w: String(60 + i), r: '8' }, { w: String(55 + i), r: '10' }, { w: String(50 + i), r: '12' }] }], updatedAt: i + 1 };
  }
  const dom5 = await JSDOM.fromURL(base + 'index.html', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w5) { w5.Element.prototype.scrollIntoView = function () {}; w5.scrollTo = function () {}; w5.addEventListener('error', e => errors.push('window.onerror: ' + e.message)); w5.localStorage.setItem('tb_sessions', JSON.stringify(many)); w5.localStorage.setItem('tb_tab', JSON.stringify('prog')); w5.localStorage.setItem('tb_progEx', JSON.stringify('Bankdrücken')); } });
  await tick(300);
  const w5 = dom5.window, q5 = x => w5.document.querySelector(x), qa5 = x => w5.document.querySelectorAll(x), c5 = x => q5(x).dispatchEvent(new w5.MouseEvent('click', { bubbles: true }));
  ok(qa5('svg.chart .hit').length === 12, 'Standard: die letzten 12 Trainings, je eine Tippfläche');
  ok(qa5('svg.chart circle.dot').length === 36, 'jeder Satz ist ein Punkt (12 Trainings × 3 Sätze)');
  ok(qa5('svg.chart circle.pt').length === 12 && !!q5('svg.chart .trend'), 'Top-Sätze und Trendlinie sind eingezeichnet');
  ok(/▲ \+14 kg/.test(q5('.trendline').textContent) || /▲ \+11 kg/.test(q5('.trendline').textContent), 'Entwicklung mit Pfeil: ' + q5('.trendline').textContent.trim());
  ok(/74/.test(q5('.readout').textContent) && /74×8/.test(q5('.setlist').textContent.replace(/\s/g, '')) , 'ausgewählt ist das letzte Training, alle seine Sätze stehen darunter');
  c5('svg.chart .hit[data-i="0"]'); await tick();
  ok(/63/.test(q5('.readout').textContent) && /63×8/.test(q5('.setlist').textContent) && /58×10/.test(q5('.setlist').textContent) && /53×12/.test(q5('.setlist').textContent), 'Tippen auf ein Training zeigt dessen drei Sätze');
  c5('[data-act="range"][data-r="0"]'); await tick();
  ok(qa5('svg.chart .hit').length === 15, '„Alle“ zeigt alle 15 Trainings');
  c5('[data-act="metric"][data-m="vol"]'); await tick();
  ok(qa5('svg.chart circle.dot').length === 0 && qa5('svg.chart circle.pt').length === 15, 'Volumen: nur eine Linie, keine Satzpunkte');
  dom5.window.close();

  console.log('Fehler im Log');
  ok(errors.length === 0, errors.length ? errors.slice(0, 8).join(' | ') : 'keine Fehler in der Konsole');
  console.log(`\n${pass} ok, ${fail} fehlgeschlagen`);
  server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ABBRUCH', e); server.close(); process.exit(2); });
