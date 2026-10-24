// Tab "Bestand": Lebensmittel nach Kategorie, mit Menge, Maximum und Nachkauf-Meldung.
import {
  loadStock, saveStockItem, removeStockItem, stockStatus, newStockItem,
  DEFAULT_CATEGORIES, UNITS, STEP,
} from '../store.js';
import { showToast } from '../toast.js';

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const fmt = (n) => nf.format(n);
const round = (n) => Math.round(n * 1000) / 1000;
const percent = (item) => Math.round((item.amount / item.max) * 100);

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

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

function allCategories(items) {
  const extra = [...new Set(items.map((i) => i.category))].filter((c) => !DEFAULT_CATEGORIES.includes(c));
  return [...DEFAULT_CATEGORIES, ...extra.sort((a, b) => a.localeCompare(b, 'de'))];
}

export function render(el) {
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
    el.appendChild(h('h1', '', 'Bestand'));

    const items = loadStock();

    // Nachkaufen-Hinweis (ab 20 % und bei 0 %)
    const alerts = items
      .filter((i) => stockStatus(i) !== 'ok')
      .sort((a, b) => a.amount / a.max - b.amount / b.max);
    if (alerts.length) {
      const box = h('section', 'stock-alert');
      box.setAttribute('role', 'status');
      box.appendChild(h('h2', '', `Nachkaufen (${alerts.length})`));
      const ul = h('ul');
      for (const i of alerts) {
        ul.appendChild(h('li', '', `${i.name} – ${stockStatus(i) === 'empty' ? 'leer' : `${percent(i)} %`}`));
      }
      box.appendChild(ul);
      el.appendChild(box);
    }

    if (!items.length) {
      el.appendChild(h('p', 'hint', 'Noch keine Lebensmittel im Bestand.'));
    }

    for (const category of allCategories(items)) {
      const inCat = items
        .filter((i) => i.category === category)
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
      if (!inCat.length) continue;
      el.appendChild(h('h2', 'cat-title', category));
      const grid = h('div', 'stock-grid');
      inCat.forEach((i) => grid.appendChild(card(i)));
      el.appendChild(grid);
    }

    const add = h('button', 'add-card add-stock');
    add.type = 'button';
    add.appendChild(h('span', 'plus', '+'));
    add.appendChild(h('span', '', 'Neues Lebensmittel'));
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
    const item = existing ? { ...existing } : newStockItem();
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

    const categories = allCategories(loadStock());
    const select = h('select');
    for (const c of categories) {
      const o = h('option', '', c);
      o.value = c;
      select.appendChild(o);
    }
    const newOpt = h('option', '', '+ Neue Kategorie …');
    newOpt.value = '__new';
    select.appendChild(newOpt);
    select.value = categories.includes(item.category) ? item.category : categories[0];
    form.appendChild(field('Kategorie', select));

    const newCat = h('input');
    newCat.type = 'text';
    newCat.maxLength = 30;
    newCat.placeholder = 'Name der neuen Kategorie';
    newCat.hidden = true;
    form.appendChild(newCat);
    select.addEventListener('change', () => {
      const isNew = select.value === '__new';
      newCat.hidden = !isNew;
      newCat.required = isNew;
      if (isNew) newCat.focus();
    });

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
      item.category = select.value === '__new' ? newCat.value.trim() : select.value;
      item.unit = unit.value;
      item.amount = round(parseFloat(amount.value));
      item.max = round(parseFloat(max.value));
      if (!item.name || !item.category) return;
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
