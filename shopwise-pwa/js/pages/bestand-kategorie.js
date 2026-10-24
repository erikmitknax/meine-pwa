// Unterseite einer Kategorie: Lebensmittel mit Menge, Maximum und Nachkauf-Meldung.
import {
  loadStock, loadCategories, getCategory, saveStockItem, removeStockItem, stockStatus,
  newStockItem, UNITS, STEP, priceLabel,
} from '../store.js';
import { showToast } from '../toast.js';
import { h } from '../dom.js';
import { iconSvg } from '../icons.js';

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmt = (n) => nf.format(n);
const round = (n) => Math.round(n * 1000) / 1000;
const percent = (item) => Math.round((item.amount / item.max) * 100);

function stateText(item, status) {
  if (status === 'empty') return 'Leer – nachkaufen';
  if (status === 'low') return `${percent(item)} % – fast leer, nachkaufen`;
  return `${percent(item)} %`;
}

function notifyIfCrossed(item, before, after) {
  if (before === after) return;
  if (after === 'empty') showToast(`${item.name} ist leer – nachkaufen.`);
  else if (after === 'low') showToast(`${item.name} ist fast leer (${percent(item)} %) – nachkaufen.`);
}

export function render(el, categoryId) {
  const category = getCategory(categoryId);
  if (!category) {            // Kategorie gibt es nicht (mehr)
    location.hash = '#/bestand';
    return;
  }

  function change(item, delta) {
    const before = stockStatus(item);
    item.amount = Math.max(0, round(item.amount + delta));
    saveStockItem(item);
    notifyIfCrossed(item, before, stockStatus(item));
    draw();
  }

  function card(item) {
    const status = stockStatus(item);
    const art = h('article', `stock-card status-${status}`);

    const main = h('button', 'stock-main');
    main.type = 'button';
    main.setAttribute('aria-label', `${item.name} bearbeiten`);
    main.appendChild(h('h3', '', item.name));
    main.appendChild(h('p', 'stock-amount', `${fmt(item.amount)} / ${fmt(item.max)} ${item.unit}`));
    if (item.price != null) main.appendChild(h('p', 'stock-price', `${eur.format(item.price)} pro ${priceLabel(item.unit)}`));
    const bar = h('div', 'bar');
    const fill = h('div', 'bar-fill');
    fill.style.width = `${Math.min(100, Math.max(0, (item.amount / item.max) * 100))}%`;
    bar.appendChild(fill);
    main.appendChild(bar);
    main.appendChild(h('p', 'stock-state', stateText(item, status)));
    main.addEventListener('click', () => openDialog(item));
    art.appendChild(main);

    const step = STEP[item.unit] || 1;
    const ctrl = h('div', 'stock-ctrl');
    const minus = h('button', 'step-btn', '−');
    minus.type = 'button';
    minus.disabled = item.amount <= 0;
    minus.setAttribute('aria-label', `${item.name}: ${fmt(step)} ${item.unit} weniger`);
    minus.addEventListener('click', () => change(item, -step));
    const plus = h('button', 'step-btn', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', `${item.name}: ${fmt(step)} ${item.unit} mehr`);
    plus.addEventListener('click', () => change(item, step));
    ctrl.append(minus, plus);
    art.appendChild(ctrl);

    return art;
  }

  function draw() {
    const scroll = el.scrollTop;
    el.innerHTML = '';

    const back = h('a', 'back-link', '← Bestand');
    back.href = '#/bestand';
    el.appendChild(back);

    const title = h('h1', 'page-title');
    title.appendChild(iconSvg(category.icon));
    title.appendChild(h('span', '', category.name));
    el.appendChild(title);

    const items = loadStock()
      .filter((i) => i.categoryId === category.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));

    if (!items.length) {
      el.appendChild(h('p', 'hint', 'Hier ist noch nichts drin. Tippe unten auf „+“, um dein erstes Lebensmittel hinzuzufügen.'));
    } else {
      const grid = h('div', 'stock-grid');
      items.forEach((i) => grid.appendChild(card(i)));
      el.appendChild(grid);
    }

    const add = h('button', 'add-card add-stock');
    add.type = 'button';
    add.appendChild(h('span', 'plus', '+'));
    add.appendChild(h('span', '', 'Lebensmittel hinzufügen'));
    add.addEventListener('click', () => openDialog(null));
    el.appendChild(add);

    el.scrollTop = scroll;
  }

  function field(labelText, control) {
    const label = h('label', 'field');
    label.appendChild(h('span', 'field-label', labelText));
    label.appendChild(control);
    return label;
  }

  function openDialog(existing) {
    const item = existing ? { ...existing } : newStockItem(category.id);
    const before = existing ? stockStatus(existing) : 'ok';

    const dialog = h('dialog', 'dialog');
    const form = h('form');
    form.method = 'dialog';
    form.appendChild(h('h2', '', existing ? 'Lebensmittel bearbeiten' : 'Neues Lebensmittel'));

    const name = h('input');
    name.type = 'text';
    name.required = true;
    name.maxLength = 40;
    name.autocomplete = 'off';
    name.placeholder = 'z. B. Milch';
    name.value = item.name;
    form.appendChild(field('Name', name));

    const catSelect = h('select');
    for (const c of loadCategories()) {
      const o = h('option', '', c.name);
      o.value = c.id;
      catSelect.appendChild(o);
    }
    catSelect.value = item.categoryId;
    form.appendChild(field('Kategorie', catSelect));

    const unit = h('select');
    for (const u of UNITS) {
      const o = h('option', '', u);
      o.value = u;
      unit.appendChild(o);
    }
    unit.value = item.unit;
    form.appendChild(field('Einheit', unit));

    const amount = h('input');
    amount.type = 'number';
    amount.inputMode = 'decimal';
    amount.step = 'any';
    amount.min = '0';
    amount.required = true;
    amount.value = item.amount;

    const max = h('input');
    max.type = 'number';
    max.inputMode = 'decimal';
    max.step = 'any';
    max.min = '0.001';
    max.required = true;
    max.value = existing ? item.max : '';
    max.placeholder = 'z. B. 10';

    const row = h('div', 'field-row');
    row.append(field('Aktuell vorhanden', amount), field('Genug (Maximum)', max));
    form.appendChild(row);
    form.appendChild(h('p', 'dialog-hint', 'Bei 20 % und bei 0 % des Maximums bekommst du die Meldung „nachkaufen“.'));

    // Üblicher Preis (optional): Vergleichswert, ob ein Angebot wirklich günstiger ist
    const price = h('input');
    price.type = 'number';
    price.inputMode = 'decimal';
    price.step = '0.01';
    price.min = '0';
    price.placeholder = 'optional, z. B. 1,29';
    price.value = item.price != null ? item.price : '';
    const priceField = field('', price);
    const priceText = priceField.querySelector('.field-label');
    const updatePriceText = () => { priceText.textContent = `Üblicher Preis (€ pro ${priceLabel(unit.value)})`; };
    unit.addEventListener('change', updatePriceText);
    updatePriceText();
    form.appendChild(priceField);
    form.appendChild(h('p', 'dialog-hint', 'Damit lässt sich später prüfen, ob ein Angebot wirklich günstiger ist.'));

    const actions = h('div', 'dialog-actions');
    if (existing) {
      const del = h('button', 'btn btn-danger', 'Löschen');
      del.type = 'button';
      del.addEventListener('click', () => {
        if (confirm(`„${existing.name}“ aus dem Bestand löschen?`)) {
          removeStockItem(existing.id);
          dialog.close();
          draw();
        }
      });
      actions.appendChild(del);
    }
    const cancel = h('button', 'btn btn-ghost', 'Abbrechen');
    cancel.type = 'button';
    cancel.addEventListener('click', () => dialog.close());
    const ok = h('button', 'btn btn-gold', 'Speichern');
    ok.type = 'submit';
    actions.append(cancel, ok);
    form.appendChild(actions);

    form.addEventListener('submit', () => {
      item.name = name.value.trim();
      item.categoryId = catSelect.value;
      item.unit = unit.value;
      item.amount = round(parseFloat(amount.value));
      item.max = round(parseFloat(max.value));
      item.price = price.value === '' ? null : Math.round(parseFloat(price.value) * 100) / 100;
      if (!item.name) return;
      saveStockItem(item);
      notifyIfCrossed(item, before, stockStatus(item));
      draw();
    });

    dialog.appendChild(form);
    dialog.addEventListener('close', () => dialog.remove());
    document.body.appendChild(dialog);
    dialog.showModal();
    if (!existing) name.focus();
  }

  draw();
}
