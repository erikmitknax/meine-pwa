// Feste Liste "Nachkaufen": alle Lebensmittel aus dem Bestand, die unter der Schwelle (20 %) oder leer sind.
// Wird nicht gespeichert, sondern immer aus dem Bestand berechnet – deshalb nicht löschbar und überall aktuell.
// "Gekauft" bucht die eingegebene Menge auf den Bestand; reicht er dann, verschwindet der Eintrag von selbst.
import { loadStock, saveStockItem, stockStatus, getCategory } from '../store.js';
import { h } from '../dom.js';
import { showToast as toast } from '../toast.js';

const fmt = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
const parse = (s) => Number(String(s).trim().replace(',', '.'));

export const restockItems = () =>
  loadStock().filter((i) => stockStatus(i) !== 'ok')
    .sort((a, b) => a.amount / a.max - b.amount / b.max);

export function mountRestock(container, onChange = () => {}) {
  const box = h('div', 'items');
  container.appendChild(box);

  function row(item) {
    const li = h('div', `restock-row is-${stockStatus(item)}`);
    const info = h('div', 'restock-info');
    info.appendChild(h('div', 'restock-name', item.name));
    const cat = getCategory(item.categoryId);
    info.appendChild(h('div', 'restock-sub',
      `${fmt(item.amount)} von ${fmt(item.max)} ${item.unit}${cat ? ' · ' + cat.name : ''}`));
    li.appendChild(info);

    const form = h('form', 'restock-buy');
    const input = h('input', 'restock-qty');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.value = fmt(Math.max(item.max - item.amount, 0));   // Vorschlag: bis zum Maximum auffüllen
    input.setAttribute('aria-label', `Gekaufte Menge ${item.name} in ${item.unit}`);
    const unit = h('span', 'restock-unit', item.unit);
    const btn = h('button', 'restock-btn', 'Gekauft');
    btn.type = 'submit';
    form.append(input, unit, btn);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const qty = parse(input.value);
      if (!Number.isFinite(qty) || qty <= 0) { input.focus(); return; }
      saveStockItem({ ...item, amount: Math.round((item.amount + qty) * 1000) / 1000 });
      toast(`${item.name}: +${fmt(qty)} ${item.unit} im Bestand`);
      draw();
      onChange();
    });
    li.appendChild(form);
    return li;
  }

  function draw() {
    box.innerHTML = '';
    const items = restockItems();
    if (!items.length) {
      box.appendChild(h('p', 'hint', 'Alles da – nichts zum Nachkaufen. 🎉'));
      return;
    }
    items.forEach((i) => box.appendChild(row(i)));
  }
  draw();
}

export const restockSummary = () => {
  const n = restockItems().length;
  return n ? `${n} ${n === 1 ? 'Artikel' : 'Artikel'} aus dem Bestand` : 'Alles da';
};
