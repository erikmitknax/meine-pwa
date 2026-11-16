// Einkaufsliste aus Datei (CSV/TXT) oder eingefügtem Text importieren.
// Die KI-Erstellung passiert außerhalb der App (ChatGPT, Claude …) über den kopierbaren Prompt.
import { h } from './dom.js';
import { norm } from './angebote-logik.js';
import { loadLists, addList, addItems } from './store.js';
import { showToast } from './toast.js';

export const AI_PROMPT = `Erstelle mir eine Einkaufsliste als CSV-Datei.
Regeln:
- Erste Zeile ist die Kopfzeile: Artikel;Menge
- Trennzeichen ist das Semikolon (;)
- Pro Zeile genau ein Artikel, keine Leerzeilen
- Menge kurz, z. B. "2", "2 Stk", "500 g", "1 l" (leer lassen, wenn egal)
- Artikelnamen kurz und ohne Marke, auf Deutsch
- Gib NUR die CSV in einem Codeblock aus, ohne Erklärung

Meine Wünsche: [hier eintragen, z. B. "Wocheneinkauf für 2 Personen, vegetarisch, 4 Abendessen"]`;

const NAME_MAX = 60, QTY_MAX = 12, ITEMS_MAX = 500;
const HEAD_NAME = ['name', 'artikel', 'produkt', 'lebensmittel', 'item', 'bezeichnung', 'ware'];
const HEAD_QTY = ['menge', 'anzahl', 'qty', 'quantity', 'stück', 'stueck', 'amount'];

/** UTF-8 lesen; enthält das Ergebnis Ersatzzeichen, als Windows-1252 (Excel) neu lesen. */
export function decodeBuffer(buf) {
  let t = new TextDecoder('utf-8').decode(buf);
  if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
  return t.replace(/^﻿/, '');
}

/** CSV-Zeilen mit Anführungszeichen-Unterstützung. */
function splitCsv(text, delim) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some(Boolean));
}

function detectDelim(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let best = null, bestN = 0;
  for (const d of [';', '\t', ',']) {
    const n = lines.filter((l) => l.includes(d)).length;
    if (n > bestN) { best = d; bestN = n; }
  }
  // Komma nur als Trenner, wenn (fast) jede Zeile eines enthält; sonst ist es Fließtext ("Milch, fettarm")
  return bestN >= Math.max(1, Math.ceil(lines.length * 0.6)) ? best : null;
}

const UNIT_RE = '(?:kg|g|mg|l|ml|cl|stk\\.?|stück|st\\.?|pck\\.?|pkg\\.?|packung(?:en)?|dose[n]?|fl\\.?|flasche[n]?|bund|becher|glas|gläser|tüte[n]?)';
/** "2x Milch", "500 g Mehl", "3 Äpfel" → { name, qty } */
export function splitQty(line) {
  let m = line.match(new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*(?:x|×)\\s+(.+)$', 'i'));
  if (m) return { qty: m[1], name: m[2] };
  m = line.match(new RegExp('^(\\d+(?:[.,]\\d+)?\\s*' + UNIT_RE + ')\\s+(.+)$', 'i'));
  if (m) return { qty: m[1].replace(/\s+/g, ' '), name: m[2].replace(/^(?:von|vom)\s+/i, '') };
  m = line.match(/^(\d+)\s+([^\d].*)$/);
  if (m) return { qty: m[1], name: m[2] };
  return { qty: '', name: line };
}

const clean = (s) => String(s || '').replace(/^\s*(?:[-*•–]|\[[ xX]?\]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim();

/**
 * Text → { items:[{name,qty}], skipped }  (Duplikate in der Datei werden gezählt)
 */
export function parseList(text) {
  const src = String(text || '').replace(/^﻿/, '').replace(/^```\w*\s*$/gm, '');
  const delim = detectDelim(src);
  let raw = []; // {name, qty}
  if (delim) {
    let rows = splitCsv(src, delim);
    let ni = 0, qi = 1;
    const first = rows[0] ? rows[0].map((x) => x.toLowerCase()) : [];
    const hn = first.findIndex((x) => HEAD_NAME.includes(x));
    const hq = first.findIndex((x) => HEAD_QTY.includes(x));
    const headed = hn >= 0 || hq >= 0;
    if (headed) {
      ni = hn >= 0 ? hn : (hq === 0 ? 1 : 0);
      qi = hq >= 0 ? hq : -1;
      rows = rows.slice(1);
    }
    for (const r of rows) {
      const name = clean(r[ni]);
      let qty = qi >= 0 ? (r[qi] || '').trim() : '';
      if (!headed && qi >= 0 && r.length === 2 && /^\d/.test(r[0]) && r[1] && !/^\d/.test(r[1])) { // "2;Milch" (Menge zuerst)
        raw.push({ name: clean(r[1]), qty: r[0].trim() }); continue;
      }
      if (name) raw.push({ name, qty });
    }
  } else {
    for (const line of src.split(/\r?\n/)) {
      const t = clean(line);
      if (!t) continue;
      raw.push(splitQty(t));
    }
  }
  const seen = new Set();
  const items = [];
  let skipped = 0;
  for (const it of raw) {
    const name = it.name.slice(0, NAME_MAX).trim();
    if (!name) continue;
    const key = norm(name);
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    items.push({ name, qty: String(it.qty || '').slice(0, QTY_MAX).trim() });
    if (items.length >= ITEMS_MAX) break;
  }
  return { items, skipped };
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* Fallback */ }
  try {
    const ta = h('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

function field(label, control) {
  const l = h('label', 'field');
  l.appendChild(h('span', 'field-label', label));
  l.appendChild(control);
  return l;
}

/** Dialog „Liste importieren“. onDone() wird nach erfolgreichem Import aufgerufen. */
export function openImportDialog(onDone) {
  const dialog = h('dialog', 'dialog import-dialog');
  const form = h('form');
  form.method = 'dialog';
  form.appendChild(h('h2', '', 'Liste importieren'));
  form.appendChild(h('p', 'dialog-hint import-intro',
    'CSV- oder Textdatei wählen oder Text einfügen. Mit dem KI-Prompt erstellt dir ChatGPT, Claude & Co. die Liste in Sekunden.'));

  const copy = h('button', 'btn btn-ghost import-prompt', 'KI-Prompt kopieren');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    showToast((await copyText(AI_PROMPT)) ? 'Prompt kopiert – in eine KI einfügen.' : 'Kopieren nicht möglich.');
  });
  form.appendChild(copy);

  const file = h('input');
  file.type = 'file';
  file.accept = '.csv,.txt,.tsv,text/csv,text/plain';
  form.appendChild(field('Datei', file));

  const area = h('textarea', 'import-text');
  area.rows = 6;
  area.placeholder = 'Oder hier einfügen:\nArtikel;Menge\nMilch;2 l\nÄpfel;1 kg';
  form.appendChild(field('Text', area));

  const sel = h('select');
  sel.appendChild(new Option('Neue Liste', '__new'));
  for (const l of loadLists()) sel.appendChild(new Option('Zu „' + l.name + '“ hinzufügen', l.id));
  form.appendChild(field('Ziel', sel));

  const nameIn = h('input');
  nameIn.type = 'text'; nameIn.maxLength = 40; nameIn.placeholder = 'Name der neuen Liste';
  nameIn.value = 'Import ' + new Date().toLocaleDateString('de-DE');
  const nameField = field('Name der neuen Liste', nameIn);
  form.appendChild(nameField);
  sel.addEventListener('change', () => { nameField.hidden = sel.value !== '__new'; });

  const preview = h('div', 'import-preview');
  form.appendChild(preview);

  const row = h('div', 'dialog-actions');
  const cancel = h('button', 'btn btn-ghost', 'Abbrechen');
  cancel.type = 'button';
  cancel.addEventListener('click', () => dialog.close());
  const ok = h('button', 'btn btn-gold', 'Importieren');
  ok.type = 'submit';
  ok.disabled = true;
  row.append(cancel, ok);
  form.appendChild(row);

  let parsed = { items: [], skipped: 0 };
  function update() {
    parsed = parseList(area.value);
    preview.textContent = '';
    ok.disabled = !parsed.items.length;
    if (!area.value.trim()) return;
    if (!parsed.items.length) { preview.appendChild(h('p', 'dialog-hint', 'Keine Artikel erkannt.')); return; }
    preview.appendChild(h('p', 'import-count', `${parsed.items.length} Artikel erkannt` + (parsed.skipped ? ` (${parsed.skipped} doppelt ignoriert)` : '')));
    const ul = h('ul', 'import-list');
    for (const it of parsed.items.slice(0, 8)) ul.appendChild(h('li', '', it.qty ? `${it.name} – ${it.qty}` : it.name));
    if (parsed.items.length > 8) ul.appendChild(h('li', 'more', `… und ${parsed.items.length - 8} weitere`));
    preview.appendChild(ul);
  }
  area.addEventListener('input', update);

  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    if (f.size > 1024 * 1024) { showToast('Datei ist zu groß (max. 1 MB).'); return; }
    try { area.value = decodeBuffer(await f.arrayBuffer()); } catch { showToast('Datei konnte nicht gelesen werden.'); return; }
    update();
  });

  form.addEventListener('submit', () => {
    if (!parsed.items.length) return;
    let id = sel.value;
    if (id === '__new') {
      const lists = addList(nameIn.value.trim() || 'Import');
      id = lists[lists.length - 1].id;
    }
    const { added, existing } = addItems(id, parsed.items);
    showToast(`${added} Artikel übernommen` + (existing ? `, ${existing} schon vorhanden` : '') + '.');
    if (onDone) onDone(id);
  });

  dialog.appendChild(form);
  dialog.addEventListener('close', () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
}
