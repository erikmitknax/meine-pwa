// Tab "Einkaufsliste": Übersicht aller Listen + Button für neue Liste.
import { loadLists, addList, removeList } from '../store.js';

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function render(el) {
  el.innerHTML = '';
  el.appendChild(h('h1', '', 'Einkaufslisten'));

  const wrap = h('div', 'lists');
  el.appendChild(wrap);

  function draw() {
    wrap.innerHTML = '';

    for (const list of loadLists()) {
      const card = h('article', 'list-card');

      const info = h('div', 'list-info');
      info.appendChild(h('h2', '', list.name));
      const n = list.items.length;
      info.appendChild(h('p', '', n === 1 ? '1 Artikel' : `${n} Artikel`));
      card.appendChild(info);

      const del = h('button', 'icon-btn', '✕');
      del.type = 'button';
      del.setAttribute('aria-label', `Liste „${list.name}“ löschen`);
      del.addEventListener('click', () => {
        if (confirm(`Liste „${list.name}“ löschen?`)) {
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
