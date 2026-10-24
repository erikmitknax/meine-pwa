// Schnell-Dialog (Plus-Button in der Tab-Leiste): Lebensmittel im Bestand suchen und Verbrauch direkt buchen.
import { loadStock, saveStockItem, stockStatus, STEP, getCategory } from './store.js';
import { showToast } from './toast.js';
import { h } from './dom.js';

const fmt = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
const parse = (s) => Number(String(s).trim().replace(',', '.'));
const round = (n) => Math.round(n * 1000) / 1000;
const norm = (s) => s.toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '');

export function openQuick() {
  if (document.querySelector('dialog.quick')) return;
  const dialog = h('dialog', 'dialog quick');
  dialog.appendChild(h('h2', '', 'Bestand anpassen'));

  const search = h('input');
  search.type = 'search';
  search.placeholder = 'Lebensmittel suchen …';
  search.autocomplete = 'off';
  search.setAttribute('aria-label', 'Lebensmittel suchen');
  dialog.appendChild(search);

  const results = h('div', 'quick-list');
  dialog.appendChild(results);

  const actions = h('div', 'dialog-actions');
  const close = h('button', 'btn btn-gold', 'Fertig');
  close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  actions.appendChild(close);
  dialog.appendChild(actions);

  function setAmount(item, value) {
    const before = stockStatus(item);
    item.amount = Math.max(0, round(value));
    saveStockItem(item);
    const after = stockStatus(item);
    if (after !== before && after === 'empty') showToast(`${item.name} ist leer – nachkaufen.`);
    else if (after !== before && after === 'low') showToast(`${item.name} ist fast leer – nachkaufen.`);
  }

  function draw() {
    results.innerHTML = '';
    const q = norm(search.value.trim());
    const items = loadStock()
      .filter((i) => !q || norm(i.name).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (!items.length) {
      results.appendChild(h('p', 'hint', q ? 'Nichts gefunden.' : 'Noch keine Lebensmittel im Bestand.'));
      return;
    }
    for (const item of items) {
      const step = STEP[item.unit] || 1;
      const row = h('div', `quick-row is-${stockStatus(item)}`);
      const info = h('div', 'quick-info');
      info.appendChild(h('div', 'quick-name', item.name));
      const cat = getCategory(item.categoryId);
      info.appendChild(h('div', 'quick-sub', `von ${fmt(item.max)} ${item.unit}${cat ? ' · ' + cat.name : ''}`));
      row.appendChild(info);

      const ctrl = h('div', 'quick-ctrl');
      const minus = h('button', 'quick-step', '−');
      minus.type = 'button';
      minus.disabled = item.amount <= 0;
      minus.setAttribute('aria-label', `${item.name}: ${fmt(step)} ${item.unit} weniger`);
      const amount = h('input', 'quick-amount');
      amount.type = 'text';
      amount.inputMode = 'decimal';
      amount.value = fmt(item.amount);
      amount.setAttribute('aria-label', `${item.name}: Menge in ${item.unit}`);
      const plus = h('button', 'quick-step', '+');
      plus.type = 'button';
      plus.setAttribute('aria-label', `${item.name}: ${fmt(step)} ${item.unit} mehr`);
      ctrl.append(minus, amount, h('span', 'quick-unit', item.unit), plus);
      row.appendChild(ctrl);

      // Zeile nur aktualisieren (nicht die ganze Liste), damit Tastatur und Scrollposition bleiben.
      const refresh = () => {
        amount.value = fmt(item.amount);
        minus.disabled = item.amount <= 0;
        row.className = `quick-row is-${stockStatus(item)}`;
      };
      minus.addEventListener('click', () => { setAmount(item, item.amount - step); refresh(); });
      plus.addEventListener('click', () => { setAmount(item, item.amount + step); refresh(); });
      amount.addEventListener('change', () => {
        const v = parse(amount.value);
        if (Number.isFinite(v) && v >= 0) setAmount(item, v);
        refresh();
      });
      amount.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); amount.blur(); } });
      results.appendChild(row);
    }
  }

  search.addEventListener('input', draw);
  dialog.addEventListener('close', () => {
    dialog.remove();
    window.dispatchEvent(new Event('shopwise:remote-changed'));   // aktuelle Seite neu zeichnen
  });
  draw();
  document.body.appendChild(dialog);
  dialog.showModal();
  search.focus();
}
