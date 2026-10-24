// Artikel einer Einkaufsliste (Hinzufügen, Abhaken, Löschen) – wird direkt in der aufgeklappten Liste angezeigt.
import { getList, addItem, toggleItem, removeItem, clearChecked, loadHistory, forgetHistory, loadStock, loadWatch } from '../store.js';
import { norm } from '../angebote-logik.js';
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

  // Vorschläge aus dem Verlauf (alles, was du schon mal eingetippt hast) sowie aus Bestand und Merkliste
  const suggest = h('div', 'suggest');
  suggest.hidden = true;
  container.appendChild(suggest);

  function candidates(q) {
    const map = new Map();
    for (const [id, e] of Object.entries(loadHistory())) map.set(norm(e.name), { id, name: e.name, qty: e.qty, n: e.n, last: e.last });
    for (const i of [...loadStock(), ...loadWatch()]) if (!map.has(norm(i.name))) map.set(norm(i.name), { id: null, name: i.name, qty: '', n: 0, last: 0 });
    const onList = new Set((getList(listId)?.items || []).filter((i) => !i.checked).map((i) => norm(i.name)));
    const out = [];
    for (const [key, e] of map) {
      if (key === q || onList.has(key)) continue;
      const words = key.split(' ');
      const starts = key.startsWith(q);
      if (starts || words.some((w) => w.startsWith(q))) out.push({ ...e, rank: starts ? 0 : 1 });
    }
    return out.sort((a, b) => a.rank - b.rank || b.n - a.n || b.last - a.last || a.name.localeCompare(b.name, 'de')).slice(0, 5);
  }

  function drawSuggest() {
    const q = norm(name.value);
    suggest.innerHTML = '';
    const list = q.length >= 2 ? candidates(q) : [];
    suggest.hidden = !list.length;
    for (const c of list) {
      const row = h('div', 'suggest-row');
      const pick = h('button', 'suggest-pick');
      pick.type = 'button';
      pick.appendChild(h('span', 'suggest-name', c.name));
      if (c.qty) pick.appendChild(h('span', 'suggest-qty', c.qty));
      pick.addEventListener('pointerdown', (e) => e.preventDefault());   // Tastatur bleibt offen
      pick.addEventListener('click', () => {
        name.value = c.name;
        if (c.qty && !qty.value) qty.value = c.qty;
        suggest.hidden = true;
        name.focus();
      });
      row.appendChild(pick);
      if (c.id) {
        const x = h('button', 'suggest-x', '✕');
        x.type = 'button';
        x.setAttribute('aria-label', `„${c.name}“ aus den Vorschlägen entfernen`);
        x.addEventListener('pointerdown', (e) => e.preventDefault());
        x.addEventListener('click', () => { forgetHistory(c.id); drawSuggest(); });
        row.appendChild(x);
      }
      suggest.appendChild(row);
    }
  }
  let hideTimer = null;
  const show = () => { clearTimeout(hideTimer); drawSuggest(); };
  name.addEventListener('input', show);
  name.addEventListener('focus', show);
  name.addEventListener('blur', () => { clearTimeout(hideTimer); hideTimer = setTimeout(() => { suggest.hidden = true; }, 150); });

  const listEl = h('div', 'items');
  container.appendChild(listEl);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = name.value.trim();
    if (!value) return;
    addItem(listId, value, qty.value.trim());
    name.value = '';
    qty.value = '';
    suggest.hidden = true;
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
