// Tab "Angebote": zeigt Wochenangebote (Daten aus data/angebote.json) zu den Lebensmitteln im Bestand
// und vergleicht den Preis pro Einheit mit dem üblichen Preis.
import { loadStock, stockStatus } from '../store.js';
import { offersFor } from '../angebote-logik.js';
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

function draw(body, data, offline) {
  if (!data || !Array.isArray(data.offers) || !data.offers.length) {
    body.appendChild(h('p', 'hint',
      'Noch keine Angebotsdaten. Sie werden automatisch montags und donnerstags abgerufen – der erste Abruf kann einen Moment dauern.'));
    return;
  }

  const open = new Set(read(OPEN_KEY, []));
  let onlyCheaper = read(FILTER_KEY, false);

  const chains = Object.keys(data.counts || {}).map((c) => CHAINS[c] || c).join(', ');
  const upd = data.updated ? new Date(data.updated).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '';
  body.appendChild(h('p', 'offers-meta', `Stand ${upd} · ${chains}${offline ? ' · offline, letzter Stand' : ''}`));

  const chips = h('div', 'chips');
  const list = h('div', 'lists');
  body.append(chips, list);

  function groups() {
    const out = [];
    const none = [];
    for (const item of loadStock()) {
      let offers = offersFor(item, data.offers);
      if (!offers.length) { none.push(item.name); continue; }
      const savings = offers.filter((o) => o.saving != null).map((o) => o.saving);
      const best = savings.length ? Math.max(...savings) : null;
      if (onlyCheaper) {
        offers = offers.filter((o) => o.saving != null && o.saving > 0);
        if (!offers.length) continue;
      }
      out.push({ item, offers, best, need: stockStatus(item) !== 'ok' });
    }
    // Erst was nachgekauft werden muss, dann nach Ersparnis
    out.sort((a, b) => (b.need - a.need) || ((b.best ?? -9) - (a.best ?? -9)) || a.item.name.localeCompare(b.item.name, 'de'));
    return { out, none };
  }

  function drawChips() {
    chips.innerHTML = '';
    for (const [label, val] of [['Alle Treffer', false], ['Günstiger als üblich', true]]) {
      const b = h('button', `chip${onlyCheaper === val ? ' active' : ''}`, label);
      b.type = 'button';
      b.addEventListener('click', () => { onlyCheaper = val; write(FILTER_KEY, val); drawChips(); drawList(); });
      chips.appendChild(b);
    }
  }

  function offerRow(o) {
    const r = h('div', 'offer-row');
    const left = h('div', 'offer-info');
    left.appendChild(h('div', 'offer-title', o.title));
    left.appendChild(h('div', 'offer-sub', [CHAINS[o.chain] || o.chain, o.unit, o.to ? `bis ${dateText(o.to)}` : ''].filter(Boolean).join(' · ')));
    r.appendChild(left);
    const right = h('div', 'offer-price');
    right.appendChild(h('div', 'offer-eur', eur.format(o.price)));
    if (o.per) right.appendChild(h('div', 'offer-per', `${eur.format(o.per.value)} pro ${o.per.label.split('/')[1]}`));
    if (o.saving != null) {
      const good = o.saving > 0.005;
      right.appendChild(h('div', `offer-save ${good ? 'good' : 'bad'}`, good ? `${pct(o.saving)} günstiger als üblich` : `${pct(o.saving)} teurer als üblich`));
    }
    r.appendChild(right);
    return r;
  }

  function drawList() {
    list.innerHTML = '';
    const { out, none } = groups();
    if (!loadStock().length) {
      list.appendChild(h('p', 'hint', 'Dein Bestand ist noch leer. Lege Lebensmittel an, dann suche ich passende Angebote.'));
      return;
    }
    if (!out.length) list.appendChild(h('p', 'hint', onlyCheaper ? 'Gerade nichts, das günstiger als üblich ist.' : 'Gerade keine Angebote zu deinen Lebensmitteln.'));

    for (const g of out) {
      const isOpen = open.has(g.item.id);
      const card = h('article', `list-card offer-card${isOpen ? ' open' : ''}`);
      const head = h('div', 'list-head');
      const toggle = h('button', 'list-toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', String(isOpen));
      const chev = h('span', 'chev');
      chev.appendChild(uiIcon('chevron'));
      const info = h('div', 'list-info');
      info.appendChild(h('h2', '', g.item.name));
      const top = g.offers[0];
      const sum = `${g.offers.length} ${g.offers.length === 1 ? 'Angebot' : 'Angebote'} · ab ${eur.format(top.price)} (${CHAINS[top.chain] || top.chain})`;
      info.appendChild(h('p', '', sum));
      toggle.append(chev, info);
      toggle.addEventListener('click', () => {
        if (open.has(g.item.id)) open.delete(g.item.id); else open.add(g.item.id);
        write(OPEN_KEY, [...open]);
        drawList();
      });
      head.appendChild(toggle);
      const tags = h('div', 'offer-tags');
      if (g.need) tags.appendChild(h('span', 'tag tag-need', 'nachkaufen'));
      if (g.best != null && g.best > 0.005) tags.appendChild(h('span', 'tag tag-good', `−${pct(g.best)}`));
      head.appendChild(tags);
      card.appendChild(head);
      if (isOpen) {
        const bodyEl = h('div', 'list-body');
        g.offers.forEach((o) => bodyEl.appendChild(offerRow(o)));
        if (g.item.price == null) bodyEl.appendChild(h('p', 'hint', 'Tipp: Hinterlege im Bestand den üblichen Preis, dann zeige ich dir die Ersparnis.'));
        card.appendChild(bodyEl);
      }
      list.appendChild(card);
    }
    if (none.length) list.appendChild(h('p', 'hint', `Keine Treffer für: ${none.join(', ')}`));
  }

  drawChips();
  drawList();
}
