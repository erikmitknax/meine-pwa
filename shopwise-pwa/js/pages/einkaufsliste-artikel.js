// Artikel einer Einkaufsliste (Hinzufügen, Abhaken, Löschen) – wird direkt in der aufgeklappten Liste angezeigt.
import { getList, addItem, toggleItem, removeItem, clearChecked } from '../store.js';
import { h } from '../dom.js';

// onChange wird nach jeder Änderung aufgerufen (z. B. um die Zusammenfassung in der Kopfzeile zu aktualisieren).
export function mountItems(container, listId, onChange = () => {}) {
  // Eingabe bleibt beim Hinzufügen bestehen (Tastatur bleibt offen), nur die Artikel darunter werden neu gezeichnet.
  const form = h('form', 'add-item');
  const name = h('input', 'add-item-name');
  name.type = 'text';
  name.placeholder = 'Artikel hinzufügen …';
  name.maxLength = 60;
  name.required = true;
  name.autocomplete = 'off';
  name.setAttribute('aria-label', 'Artikelname');
  const qty = h('input', 'add-item-qty');
  qty.type = 'text';
  qty.placeholder = 'Menge';
  qty.maxLength = 12;
  qty.autocomplete = 'off';
  qty.setAttribute('aria-label', 'Menge (optional)');
  const submit = h('button', 'add-item-btn', '+');
  submit.type = 'submit';
  submit.setAttribute('aria-label', 'Hinzufügen');
  form.append(name, qty, submit);
  container.appendChild(form);

  const listEl = h('div', 'items');
  container.appendChild(listEl);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = name.value.trim();
    if (!value) return;
    addItem(listId, value, qty.value.trim());
    name.value = '';
    qty.value = '';
    name.focus();
    draw();
    onChange();
  });

  function row(item) {
    const li = h('div', `item${item.checked ? ' done' : ''}`);

    const main = h('button', 'item-main');
    main.type = 'button';
    main.setAttribute('role', 'checkbox');
    main.setAttribute('aria-checked', String(item.checked));
    main.appendChild(h('span', 'item-check', item.checked ? '✓' : ''));
    main.appendChild(h('span', 'item-name', item.name));
    if (item.qty) main.appendChild(h('span', 'item-qty', item.qty));
    main.addEventListener('click', () => { toggleItem(listId, item.id); draw(); onChange(); });
    li.appendChild(main);

    const del = h('button', 'icon-btn', '✕');
    del.type = 'button';
    del.setAttribute('aria-label', `${item.name} löschen`);
    del.addEventListener('click', () => { removeItem(listId, item.id); draw(); onChange(); });
    li.appendChild(del);

    return li;
  }

  function draw() {
    const list = getList(listId);
    listEl.innerHTML = '';
    if (!list) return;

    if (!list.items.length) {
      listEl.appendChild(h('p', 'hint', 'Noch keine Artikel. Gib oben einen Artikel ein und tippe auf „+“.'));
      return;
    }

    // Offene zuerst, erledigte unten (Reihenfolge innerhalb bleibt erhalten).
    const open = list.items.filter((i) => !i.checked);
    const done = list.items.filter((i) => i.checked);
    [...open, ...done].forEach((i) => listEl.appendChild(row(i)));

    if (done.length) {
      const clear = h('button', 'btn-wide', `Erledigte entfernen (${done.length})`);
      clear.type = 'button';
      clear.addEventListener('click', () => { clearChecked(listId); draw(); onChange(); });
      listEl.appendChild(clear);
    }
  }

  draw();
}
