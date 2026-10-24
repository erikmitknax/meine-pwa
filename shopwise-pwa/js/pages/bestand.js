// Tab "Bestand": Übersicht der Kategorien. Unterseiten:
//   #/bestand               -> Kategorie-Kacheln
//   #/bestand/<kategorie>   -> Lebensmittel dieser Kategorie (bestand-kategorie.js)
//   #/bestand/kategorien    -> Kategorien bearbeiten (bestand-bearbeiten.js)
import { loadCategories, loadStock, stockStatus } from '../store.js';
import { h } from '../dom.js';
import { iconSvg } from '../icons.js';
import { render as renderCategory } from './bestand-kategorie.js';
import { render as renderEdit } from './bestand-bearbeiten.js';

export function render(el, params = []) {
  const [sub] = params;
  if (sub === 'kategorien') return renderEdit(el);
  if (sub) return renderCategory(el, sub);
  return renderOverview(el);
}

function renderOverview(el) {
  el.appendChild(h('h1', '', 'Bestand'));

  const cats = loadCategories();
  const items = loadStock();
  const percent = (i) => Math.round((i.amount / i.max) * 100);

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
      const cat = cats.find((c) => c.id === i.categoryId);
      const state = stockStatus(i) === 'empty' ? 'leer' : `${percent(i)} %`;
      ul.appendChild(h('li', '', `${i.name} – ${state}${cat ? ` (${cat.name})` : ''}`));
    }
    box.appendChild(ul);
    el.appendChild(box);
  }

  if (!cats.length) {
    el.appendChild(h('p', 'hint', 'Noch keine Kategorien. Lege unten mit „Kategorien bearbeiten“ welche an.'));
  }

  const grid = h('div', 'cat-grid');
  for (const cat of cats) {
    const mine = items.filter((i) => i.categoryId === cat.id);
    const empty = mine.filter((i) => stockStatus(i) === 'empty').length;
    const low = mine.filter((i) => stockStatus(i) === 'low').length;
    const status = empty ? 'status-empty' : low ? 'status-low' : '';

    const tile = h('a', `cat-tile ${status}`);
    tile.href = `#/bestand/${cat.id}`;

    const icon = h('div', 'cat-icon');
    icon.appendChild(iconSvg(cat.icon));
    tile.appendChild(icon);
    tile.appendChild(h('h2', 'cat-name', cat.name));
    tile.appendChild(h('p', 'cat-meta',
      mine.length === 0 ? 'Noch leer' : mine.length === 1 ? '1 Lebensmittel' : `${mine.length} Lebensmittel`));
    if (empty + low) tile.appendChild(h('p', 'cat-alert', `${empty + low} nachkaufen`));

    grid.appendChild(tile);
  }
  el.appendChild(grid);

  const edit = h('a', 'btn-wide', 'Kategorien bearbeiten');
  edit.href = '#/bestand/kategorien';
  el.appendChild(edit);
}
