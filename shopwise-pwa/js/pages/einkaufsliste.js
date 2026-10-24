// Tab "Einkaufsliste":
//   #/einkaufsliste        -> Übersicht aller Listen + Button für neue Liste
//   #/einkaufsliste/<id>   -> Artikel dieser Liste (einkaufsliste-artikel.js)
import { loadLists, addList, removeList } from '../store.js';
import { h } from '../dom.js';
import { render as renderItems } from './einkaufsliste-artikel.js';

export function render(el, params = []) {
  const [listId] = params;
  if (listId) return renderItems(el, listId);
  return renderOverview(el);
}

function summary(list) {
  const total = list.items.length;
  if (!total) return 'Noch keine Artikel';
  const done = list.items.filter((i) => i.checked).length;
  const open = total - done;
  return done ? `${open} offen · ${done} erledigt` : `${open} Artikel`;
}

function renderOverview(el) {
  el.appendChild(h('h1', '', 'Einkaufslisten'));

  const wrap = h('div', 'lists');
  el.appendChild(wrap);

  function draw() {
    wrap.innerHTML = '';

    for (const list of loadLists()) {
      const card = h('article', 'list-card');

      const info = h('a', 'list-info');
      info.href = `#/einkaufsliste/${list.id}`;
      info.appendChild(h('h2', '', list.name));
      info.appendChild(h('p', '', summary(list)));
      card.appendChild(info);

      const del = h('button', 'icon-btn', '✕');
      del.type = 'button';
      del.setAttribute('aria-label', `Liste „${list.name}“ löschen`);
      del.addEventListener('click', () => {
        const n = list.items.length;
        const text = n
          ? `Liste „${list.name}“ mit ${n} Artikeln löschen?`
          : `Liste „${list.name}“ löschen?`;
        if (confirm(text)) {
          removeList(list.id);
          draw();
        }
      });
      card.appendChild(del);

      wrap.appendChild(card);
    }

    const add = h('button', 'add-card');
    add.type = 'button';
    add.appendChild(h('span', 'plus', '+'));
    add.appendChild(h('span', '', 'Neue Liste'));
    add.addEventListener('click', openDialog);
    wrap.appendChild(add);
  }

  function openDialog() {
    const dialog = h('dialog', 'dialog');
    const form = h('form');
    form.method = 'dialog';

    form.appendChild(h('h2', '', 'Neue Liste'));

    const input = h('input');
    input.type = 'text';
    input.placeholder = 'Name, z. B. Wochenmarkt';
    input.maxLength = 40;
    input.required = true;
    input.autocomplete = 'off';
    form.appendChild(input);

    const row = h('div', 'dialog-actions');
    const cancel = h('button', 'btn btn-ghost', 'Abbrechen');
    cancel.type = 'button';
    cancel.addEventListener('click', () => dialog.close());
    const ok = h('button', 'btn btn-gold', 'Hinzufügen');
    ok.type = 'submit';
    row.append(cancel, ok);
    form.appendChild(row);

    form.addEventListener('submit', () => {
      const name = input.value.trim();
      if (name) {
        addList(name);
        draw();
      }
    });

    dialog.appendChild(form);
    dialog.addEventListener('close', () => dialog.remove());
    document.body.appendChild(dialog);
    dialog.showModal();
    input.focus();
  }

  draw();
}
