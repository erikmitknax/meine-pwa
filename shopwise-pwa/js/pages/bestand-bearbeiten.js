// Unterseite "Kategorien bearbeiten": Name, Symbol, Reihenfolge, löschen, neu anlegen.
import {
  loadCategories, loadStock, addCategory, updateCategory, moveCategory, removeCategory,
} from '../store.js';
import { h } from '../dom.js';
import { iconSvg, ICON_KEYS, ICON_LABELS } from '../icons.js';

export function render(el) {
  function openIconDialog(cat) {
    const dialog = h('dialog', 'dialog');
    dialog.appendChild(h('h2', '', 'Symbol wählen'));

    const grid = h('div', 'icon-grid');
    for (const key of ICON_KEYS) {
      const btn = h('button', `icon-choice${key === cat.icon ? ' selected' : ''}`);
      btn.type = 'button';
      btn.title = ICON_LABELS[key];
      btn.setAttribute('aria-label', ICON_LABELS[key]);
      btn.appendChild(iconSvg(key));
      btn.addEventListener('click', () => {
        updateCategory(cat.id, { icon: key });
        dialog.close();
        draw();
      });
      grid.appendChild(btn);
    }
    dialog.appendChild(grid);

    const actions = h('div', 'dialog-actions');
    const cancel = h('button', 'btn btn-ghost', 'Abbrechen');
    cancel.type = 'button';
    cancel.addEventListener('click', () => dialog.close());
    actions.appendChild(cancel);
    dialog.appendChild(actions);

    dialog.addEventListener('close', () => dialog.remove());
    document.body.appendChild(dialog);
    dialog.showModal();
  }

  function draw(focusLast = false) {
    const scroll = el.scrollTop;
    el.innerHTML = '';

    const back = h('a', 'back-link', '← Fertig');
    back.href = '#/bestand';
    el.appendChild(back);
    el.appendChild(h('h1', '', 'Kategorien bearbeiten'));
    el.appendChild(h('p', 'hint', 'Name ändern, Symbol wählen, Reihenfolge ändern oder Kategorie löschen. Die Lebensmittel legst du in der jeweiligen Kategorie an.'));

    const cats = loadCategories();
    const items = loadStock();
    const list = h('div', 'cat-list');

    cats.forEach((cat, i) => {
      const row = h('div', 'cat-row');

      const iconBtn = h('button', 'cat-row-icon');
      iconBtn.type = 'button';
      iconBtn.setAttribute('aria-label', `Symbol von „${cat.name}“ ändern`);
      iconBtn.appendChild(iconSvg(cat.icon));
      iconBtn.addEventListener('click', () => openIconDialog(cat));
      row.appendChild(iconBtn);

      const name = h('input', 'cat-row-name');
      name.type = 'text';
      name.maxLength = 30;
      name.value = cat.name;
      name.setAttribute('aria-label', 'Name der Kategorie');
      // Ohne Neuzeichnen speichern, damit ein folgender Tipp auf ▲ ▼ ✕ nicht verloren geht.
      name.addEventListener('change', () => {
        const value = name.value.trim();
        if (!value) { name.value = cat.name; return; }
        cat.name = value;
        updateCategory(cat.id, { name: value });
      });
      row.appendChild(name);

      const up = h('button', 'icon-btn', '▲');
      up.type = 'button';
      up.disabled = i === 0;
      up.setAttribute('aria-label', `„${cat.name}“ nach oben`);
      up.addEventListener('click', () => { moveCategory(cat.id, -1); draw(); });

      const down = h('button', 'icon-btn', '▼');
      down.type = 'button';
      down.disabled = i === cats.length - 1;
      down.setAttribute('aria-label', `„${cat.name}“ nach unten`);
      down.addEventListener('click', () => { moveCategory(cat.id, 1); draw(); });

      const del = h('button', 'icon-btn', '✕');
      del.type = 'button';
      del.setAttribute('aria-label', `Kategorie „${cat.name}“ löschen`);
      del.addEventListener('click', () => {
        const n = items.filter((x) => x.categoryId === cat.id).length;
        const text = n
          ? `Kategorie „${cat.name}“ und ihre ${n} Lebensmittel löschen?`
          : `Kategorie „${cat.name}“ löschen?`;
        if (confirm(text)) { removeCategory(cat.id); draw(); }
      });

      row.append(up, down, del);
      list.appendChild(row);
    });
    el.appendChild(list);

    const add = h('button', 'add-card add-stock');
    add.type = 'button';
    add.appendChild(h('span', 'plus', '+'));
    add.appendChild(h('span', '', 'Neue Kategorie'));
    add.addEventListener('click', () => {
      addCategory('Neue Kategorie', 'basket');
      draw(true);
    });
    el.appendChild(add);

    if (focusLast) {
      const inputs = el.querySelectorAll('.cat-row-name');
      const last = inputs[inputs.length - 1];
      if (last) { last.scrollIntoView({ block: 'center' }); last.focus(); last.select(); }
    } else {
      el.scrollTop = scroll;
    }
  }

  draw();
}
