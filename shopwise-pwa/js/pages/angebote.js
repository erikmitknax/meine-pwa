// Tab "Angebote": zeigt Wochenangebote (Daten aus data/angebote.json) zu den Lebensmitteln im Bestand
// und vergleicht den Preis pro Einheit mit dem üblichen Preis.
import { loadStock, loadWatch, stockStatus, saveStockItem, saveWatchItem } from '../store.js';
import { openWatchDialog } from './angebote-merken.js';
import { offersFor, effectiveExclude, suggestExclusion } from '../angebote-logik.js';
import { h } from '../dom.js';
import { uiIcon } from '../icons.js';

const CHAINS = { 'aldi-nord': 'Aldi Nord', 'aldi-sued': 'Aldi Süd', rewe: 'Rewe', edeka: 'Edeka', penny: 'Penny', lidl: 'Lidl' };
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const pct = (x) => `${Math.round(Math.abs(x) * 100)} %`;
const DATA_KEY = 'shopwise.angebote';
const OPEN_KEY = 'shopwise.openOffers';
const FILTER_KEY = 'shopwise.offerFilter';

const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ } };

async function loadData() {
  try {
    const res = await fetch('data/angebote.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    write(DATA_KEY, data);
    return { data, offline: false };
  } catch {
    const data = read(DATA_KEY, null);          // zuletzt gespeicherter Stand (z. B. offline)
    return { data, offline: !!data };
  }
}

const dateText = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
};

export function render(el) {
  el.appendChild(h('h1', '', 'Angebote'));
  const body = h('div', 'offers');
  el.appendChild(body);
  body.appendChild(h('p', 'hint', 'Lade Angebote …'));

  loadData().then(({ data, offline }) => {
    if (!location.hash.startsWith('#/angebote')) return;   // Tab wurde inzwischen gewechselt
    body.innerHTML = '';
    draw(body, data, offline);
  });
}

// „Passt nicht“: Wort wählen, das bei diesem Lebensmittel künftig nicht mehr als Treffer gilt.
function openHideDialog(g, offer, onDone) {
  const dialog = h('dialog', 'dialog');
  const form = h('form');
  form.method = 'dialog';
  form.appendChild(h('h2', '', 'Passt nicht'));
  form.appendChild(h('p', 'dialog-hint', `„${offer.title}“ nicht mehr als Treffer für „${g.item.name}“ anzeigen.`));
  const word = h('input');
  word.type = 'text'; word.required = true; word.maxLength = 40; word.autocomplete = 'off';
  word.value = suggestExclusion(offer, g.item);
  const label = h('label', 'field');
  label.appendChild(h('span', 'field-label', 'Ausblenden, wenn der Titel enthält'));
  label.appendChild(word);
  form.appendChild(label);
  form.appendChild(h('p', 'dialog-hint', 'Das Wort lässt sich später im Lebensmittel unter „nicht anzeigen bei“ wieder entfernen.'));
  const actions = h('div', 'dialog-actions');
  const cancel = h('button', 'btn btn-ghost', 'Abbrechen');
  cancel.type = 'button';
  cancel.addEventListener('click', () => dialog.close());
  const ok = h('button', 'btn btn-gold', 'Ausblenden');
  ok.type = 'submit';
  actions.append(cancel, ok);
  form.appendChild(actions);
  form.addEventListener('submit', () => {
    const w = word.value.trim();
    if (!w) return;
    const list = effectiveExclude(g.item);                 // bisherige (oder Standard-)Wörter bleiben erhalten
    if (!list.some((x) => x.toLowerCase() === w.toLowerCase())) list.push(w);
    const updated = { ...g.item, exclude: list.join(', ').slice(0, 500) };
    if (g.watch) saveWatchItem(updated); else saveStockItem(updated);
    onDone();
  });
  dialog.appendChild(form);
  dialog.addEventListener('close', () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
  word.focus();
  word.select();
}

function draw(body, data, offline) {
  const offers = data && Array.isArray(data.offers) ? data.offers : [];
  const open = new Set(read(OPEN_KEY, []));
  const stored = read(FILTER_KEY, 'all');
  let filter = stored === true ? 'cheap' : (['all', 'cheap', 'next'].includes(stored) ? stored : 'all');   // all | cheap | next
  const todayStr = new Date().toLocaleDateString('sv-SE');
  const isNext = (o) => !!o.from && o.from > todayStr;
  const rebuild = () => { body.innerHTML = ''; draw(body, data, offline); };

  if (offers.length) {
    const chains = Object.keys(data.counts || {}).map((c) => CHAINS[c] || c).join(', ');
    const upd = data.updated ? new Date(data.updated).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '';
    body.appendChild(h('p', 'offers-meta', `Stand ${upd} · ${chains}${offline ? ' · offline, letzter Stand' : ''}`));
  } else {
    body.appendChild(h('p', 'hint', 'Noch keine Angebotsdaten. Sie werden automatisch montags und donnerstags abgerufen.'));
  }

  const chips = h('div', 'chips');
  const watchBox = h('div', 'lists');
  const stockBox = h('div', 'lists');
  body.append(chips, watchBox, stockBox);

  // Treffer je Lebensmittel (aus Bestand oder Merkliste), günstigster zuerst
  function group(item, extra) {
    let found = offersFor(item, offers);
    const savings = found.filter((o) => o.saving != null).map((o) => o.saving);
    const best = savings.length ? Math.max(...savings) : null;
    if (filter === 'cheap') found = found.filter((o) => o.saving != null && o.saving > 0);
    if (filter === 'next') found = found.filter(isNext);
    return { item, offers: found, best, ...extra };
  }

  function drawChips() {
    chips.innerHTML = '';
    for (const [label, val] of [['Alle Treffer', 'all'], ['Günstiger als üblich', 'cheap'], ['Nächste Woche', 'next']]) {
      const b = h('button', `chip${filter === val ? ' active' : ''}`, label);
      b.type = 'button';
      b.addEventListener('click', () => { filter = val; write(FILTER_KEY, val); drawChips(); drawLists(); });
      chips.appendChild(b);
    }
  }

  function offerRow(o, g) {
    const r = h('div', 'offer-row');
    const left = h('div', 'offer-info');
    const title = h('div', 'offer-title', o.title);
    if (isNext(o)) title.appendChild(h('span', 'tag tag-next', 'nächste Woche'));
    left.appendChild(title);
    left.appendChild(h('div', 'offer-sub', [CHAINS[o.chain] || o.chain, o.unit, isNext(o) ? `ab ${dateText(o.from)}` : (o.to ? `bis ${dateText(o.to)}` : '')].filter(Boolean).join(' · ')));
    r.appendChild(left);
    const right = h('div', 'offer-price');
    right.appendChild(h('div', 'offer-eur', eur.format(o.price)));
    if (o.per) right.appendChild(h('div', 'offer-per', `${eur.format(o.per.value)} pro ${o.per.label.split('/')[1]}`));
    if (o.saving != null) {
      const good = o.saving > 0.005;
      right.appendChild(h('div', `offer-save ${good ? 'good' : 'bad'}`, good ? `${pct(o.saving)} günstiger als üblich` : `${pct(o.saving)} teurer als üblich`));
    }
    r.appendChild(right);
    const hide = h('button', 'offer-hide', '✕');
    hide.type = 'button';
    hide.setAttribute('aria-label', `„${o.title}“ passt nicht – ausblenden`);
    hide.title = 'Passt nicht';
    hide.addEventListener('click', () => openHideDialog(g, o, rebuild));
    r.appendChild(hide);
    return r;
  }

  function card(g, container) {
    const key = (g.watch ? 'w:' : '') + g.item.id;
    const isOpen = open.has(key);
    const el = h('article', `list-card offer-card${isOpen ? ' open' : ''}`);
    const head = h('div', 'list-head');
    const toggle = h('button', 'list-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(isOpen));
    const chev = h('span', 'chev');
    chev.appendChild(uiIcon('chevron'));
    const info = h('div', 'list-info');
    info.appendChild(h('h2', '', g.item.name));
    const top = g.offers[0];
    info.appendChild(h('p', '', top
      ? `${g.offers.length} ${g.offers.length === 1 ? 'Angebot' : 'Angebote'} · ab ${eur.format(top.price)} (${CHAINS[top.chain] || top.chain})`
      : 'Gerade kein Angebot'));
    toggle.append(chev, info);
    toggle.addEventListener('click', () => {
      if (open.has(key)) open.delete(key); else open.add(key);
      write(OPEN_KEY, [...open]);
      drawLists();
    });
    head.appendChild(toggle);
    const tags = h('div', 'offer-tags');
    if (g.need) tags.appendChild(h('span', 'tag tag-need', 'nachkaufen'));
    if (g.best != null && g.best > 0.005 && g.offers.length) tags.appendChild(h('span', 'tag tag-good', `−${pct(g.best)}`));
    if (tags.childNodes.length) head.appendChild(tags);
    if (g.watch) {
      const edit = h('button', 'icon-btn');
      edit.type = 'button';
      edit.appendChild(uiIcon('pencil'));
      edit.setAttribute('aria-label', `${g.item.name} bearbeiten`);
      edit.addEventListener('click', () => openWatchDialog(g.item, rebuild));
      head.appendChild(edit);
    }
    el.appendChild(head);
    if (isOpen) {
      const bodyEl = h('div', 'list-body');
      if (g.offers.length) g.offers.forEach((o) => bodyEl.appendChild(offerRow(o, g)));
      else bodyEl.appendChild(h('p', 'hint', offers.length
        ? 'Diese Woche nichts gefunden. Neue Begriffe werden beim nächsten Abruf mitgesucht.'
        : 'Noch keine Angebotsdaten.'));
      if (g.item.price == null && g.offers.length) bodyEl.appendChild(h('p', 'hint', 'Tipp: Hinterlege den üblichen Preis, dann zeige ich dir die Ersparnis.'));
      el.appendChild(bodyEl);
    }
    container.appendChild(el);
  }

  function drawLists() {
    watchBox.innerHTML = '';
    stockBox.innerHTML = '';

    // --- Merkliste (unabhängig vom Bestand)
    watchBox.appendChild(h('h2', 'section-title', 'Meine Merkliste'));
    const watch = loadWatch().map((w) => group(w, { watch: true, need: false }))
      .filter((g) => filter === 'all' || g.offers.length)
      .sort((a, b) => (b.offers.length > 0) - (a.offers.length > 0) || ((b.best ?? -9) - (a.best ?? -9)) || a.item.name.localeCompare(b.item.name, 'de'));
    if (!watch.length && !loadWatch().length) {
      watchBox.appendChild(h('p', 'hint', 'Merke dir Lebensmittel, die dich interessieren – unabhängig von deinem Bestand. Sie erscheinen hier, sobald sie im Angebot sind.'));
    }
    watch.forEach((g) => card(g, watchBox));
    const add = h('button', 'add-card');
    add.type = 'button';
    add.appendChild(h('span', 'plus', '+'));
    add.appendChild(h('span', '', 'Lebensmittel merken'));
    add.addEventListener('click', () => openWatchDialog(null, rebuild));
    watchBox.appendChild(add);

    // --- Aus dem Bestand
    const stock = loadStock();
    if (!stock.length) return;
    stockBox.appendChild(h('h2', 'section-title', 'Aus deinem Bestand'));
    const all = stock.map((i) => group(i, { watch: false, need: stockStatus(i) !== 'ok' }));
    const none = all.filter((g) => !offersFor(g.item, offers).length).map((g) => g.item.name);
    const groups = all.filter((g) => g.offers.length)
      .sort((a, b) => (b.need - a.need) || ((b.best ?? -9) - (a.best ?? -9)) || a.item.name.localeCompare(b.item.name, 'de'));
    if (!groups.length) stockBox.appendChild(h('p', 'hint', filter === 'cheap' ? 'Gerade nichts, das günstiger als üblich ist.' : filter === 'next' ? 'Für nächste Woche ist noch nichts bekannt.' : 'Gerade keine Angebote zu deinen Lebensmitteln.'));
    groups.forEach((g) => card(g, stockBox));
    if (none.length) stockBox.appendChild(h('p', 'hint', `Keine Treffer für: ${none.join(', ')}`));
  }

  drawChips();
  drawLists();
}
