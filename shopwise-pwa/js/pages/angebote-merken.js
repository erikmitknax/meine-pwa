// Dialog: Lebensmittel zur Angebote-Merkliste hinzufügen/bearbeiten (unabhängig vom Bestand).
import { newWatchItem, saveWatchItem, removeWatchItem, UNITS, priceLabel } from '../store.js';
import { defaultsFor } from '../angebote-logik.js';
import { h } from '../dom.js';

function field(labelText, control) {
  const label = h('label', 'field');
  label.appendChild(h('span', 'field-label', labelText));
  label.appendChild(control);
  return label;
}

export function openWatchDialog(existing, onDone) {
  const item = existing ? { ...existing } : newWatchItem();
  const dialog = h('dialog', 'dialog');
  const form = h('form');
  form.method = 'dialog';
  form.appendChild(h('h2', '', existing ? 'Gemerktes Lebensmittel' : 'Lebensmittel merken'));

  const name = h('input');
  name.type = 'text'; name.required = true; name.maxLength = 40; name.autocomplete = 'off';
  name.placeholder = 'z. B. Lachs'; name.value = item.name;
  form.appendChild(field('Name', name));

  const unit = h('select');
  for (const u of UNITS) { const o = h('option', '', u); o.value = u; unit.appendChild(o); }
  unit.value = item.unit;
  form.appendChild(field('Einheit für den Preisvergleich', unit));

  const price = h('input');
  price.type = 'number'; price.inputMode = 'decimal'; price.step = '0.01'; price.min = '0';
  price.placeholder = 'optional, z. B. 1,29'; price.value = item.price != null ? item.price : '';
  const priceField = field('', price);
  const priceText = priceField.querySelector('.field-label');
  const upd = () => { priceText.textContent = `Üblicher Preis (€ pro ${priceLabel(unit.value)})`; };
  unit.addEventListener('change', upd); upd();
  form.appendChild(priceField);

  const search = h('input');
  search.type = 'text'; search.maxLength = 120; search.autocomplete = 'off'; search.value = item.search || '';
  const exclude = h('input');
  exclude.type = 'text'; exclude.maxLength = 500; exclude.autocomplete = 'off'; exclude.value = item.exclude || '';
  const hints = () => {
    const d = defaultsFor(name.value);
    search.placeholder = d.search || 'z. B. Räucherlachs';
    exclude.placeholder = d.exclude || 'z. B. Katzenfutter';
  };
  name.addEventListener('input', hints); hints();
  form.appendChild(field('Weitere Suchbegriffe', search));
  form.appendChild(field('Nicht anzeigen bei', exclude));
  form.appendChild(h('p', 'dialog-hint', 'Durch Komma getrennt. Neue Begriffe werden beim nächsten automatischen Abruf (Mo/Do) mitgesucht.'));

  const actions = h('div', 'dialog-actions');
  if (existing) {
    const del = h('button', 'btn btn-danger', 'Entfernen');
    del.type = 'button';
    del.addEventListener('click', () => {
      if (confirm(`„${existing.name}“ von der Merkliste entfernen?`)) { removeWatchItem(existing.id); dialog.close(); onDone(); }
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
    item.unit = unit.value;
    item.price = price.value === '' ? null : Math.round(parseFloat(price.value) * 100) / 100;
    item.search = search.value.trim();
    item.exclude = exclude.value.trim();
    if (!item.name) return;
    saveWatchItem(item);
    onDone();
  });

  dialog.appendChild(form);
  dialog.addEventListener('close', () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
  if (!existing) name.focus();
}
