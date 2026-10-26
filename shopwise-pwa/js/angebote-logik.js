// Angebote ↔ Bestand: Treffer finden, Packungsgrößen umrechnen, Preis pro Einheit vergleichen.
// Reine Funktionen ohne Browser-Abhängigkeit (testbar mit Node).

export const norm = (s) => String(s ?? '').toLowerCase()
  .replace(/ß/g, 'ss').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

// Standard-Suchbegriffe und -Ausschlüsse für häufige Lebensmittel (Schlüssel = normalisierter Name).
// Eigene Eingaben im Bestand ersetzen diese Standardwerte.
export const DEFAULTS = {
  eier: { syn: ['freilandeier', 'bodenhaltung'], ex: ['waffel', 'nudel', 'likor', 'schokolade', 'salat', 'kuchen', 'pasta', 'ostereier', 'mayonnaise', 'creme', 'brot'] },
  milch: { syn: ['vollmilch', 'h milch', 'frischmilch'], ex: ['muller', 'milka', 'milchmause', 'milch mause', 'milchschnitte', 'adventskalender', 'alpenmilch', 'kinder', 'drink', 'shake', 'schokolade', 'milchreis', 'kokos', 'milchshake', 'shampoo', 'lotion', 'dusch', 'pulver', 'bonbon', 'brot', 'riegel', 'creme', 'schnitte', 'buttermilch', 'kaffeesahne', 'hafer', 'mandel', 'soja'] },
  butter: { syn: [], ex: ['butterkeks', 'buttermilch', 'butterschmalz', 'erdnuss', 'brezel', 'croissant', 'kakaobutter', 'shea', 'gebaeck', 'kekse', 'laugen', 'croguette'] },
  nudeln: { syn: ['pasta', 'spaghetti', 'penne', 'fusilli', 'tagliatelle', 'spirelli', 'makkaroni'], ex: ['nudelsalat', 'nudelsuppe', 'instant', 'fertig', 'pfanne', 'sauce', 'soße'] },
  kase: { syn: ['gouda', 'edamer', 'emmentaler', 'mozzarella', 'camembert', 'schnittkase', 'reibekase', 'landkase', 'weichkase', 'hartkase'], ex: ['pizza', 'frischkase', 'kasekuchen', 'kaseschnecke', 'cracker', 'snack', 'chips', 'piccolinis', 'laugen', 'tortellini', 'ravioli'] },
  brot: { syn: ['vollkornbrot', 'toastbrot', 'mischbrot'], ex: ['aufstrich', 'chips', 'gewurz'] },
  kartoffeln: { syn: ['kartoffel', 'speisekartoffel'], ex: ['chips', 'pommes', 'puffer', 'kloss', 'salat', 'puree', 'knodel', 'kroketten', 'gnocchi', 'rosti', 'wedges', 'pfanne'] },
  tomaten: { syn: ['cherrytomaten', 'rispentomaten', 'strauchtomaten'], ex: ['ketchup', 'sauce', 'suppe', 'mark', 'passata', 'getrocknet', 'pesto', 'saft', 'passiert', 'stuckig', 'dose', 'konserve'] },
  hahnchen: { syn: ['huhnchen', 'geflugel', 'hahnchenbrust', 'hahnchenschenkel'], ex: ['suppe', 'brühe', 'bruhe', 'nugget', 'salat'] },
  reis: { syn: ['basmati', 'langkornreis', 'jasmin'], ex: ['milchreis', 'reiswaffel', 'reiswein', 'reisnudel', 'reisbrot'] },
  apfel: { syn: ['tafelapfel'], ex: ['saft', 'mus', 'schorle', 'kuchen', 'essig', 'ringe', 'hipp', 'pfirsich', 'erdbeer', 'himbeere', 'banane', 'in apfel', 'riegel'] },
  zwiebeln: { syn: ['zwiebel'], ex: ['ringe', 'suppe', 'rost'] },
  joghurt: { syn: ['jogurt'], ex: ['dressing', 'eis', 'riegel'] },
  banane: { syn: ['bananen'], ex: ['chips', 'milch', 'riegel'] },
};

// Aus "Tomaten" wird auch "Tomate" (einfache Mehrzahl-Formen).
function variants(term) {
  const out = new Set([term]);
  for (const cut of ['en', 'n', 'e', 's']) {
    if (term.endsWith(cut) && term.length - cut.length >= 4) out.add(term.slice(0, -cut.length));
  }
  return [...out];
}

const splitList = (s) => String(s ?? '').split(/[,;\n]/).map(norm).filter(Boolean);

export function termsFor(item) {
  const n = norm(item.name);
  const def = DEFAULTS[n] || DEFAULTS[n.replace(/e$/, '')] || { syn: [], ex: [] };
  const own = splitList(item.search);
  const exOwn = splitList(item.exclude);
  const base = [n, ...(own.length ? own : def.syn.map(norm))];
  return {
    terms: [...new Set(base.flatMap(variants))],
    exclude: (exOwn.length ? exOwn : def.ex.map(norm)),
  };
}

export const defaultsFor = (name) => {
  const n = norm(name);
  const d = DEFAULTS[n] || DEFAULTS[n.replace(/e$/, '')];
  return d ? { search: d.syn.join(', '), exclude: d.ex.join(', ') } : { search: '', exclude: '' };
};

// Aktuell wirksame Ausschlusswörter eines Lebensmittels (eigene Liste, sonst Standardwerte) – als Text-Liste.
export function effectiveExclude(item) {
  const own = String(item.exclude ?? '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  if (own.length) return own;
  const d = defaultsFor(item.name).exclude;
  return d ? d.split(', ') : [];
}

// Vorschlag für „Passt nicht“: das Wort im Titel, das den Treffer ausgelöst hat (z. B. „Milch-Mäuse“).
export function suggestExclusion(offer, item) {
  const { terms } = termsFor(item);
  const words = String(offer.title).split(/\s+/);
  const hit = words.find((w) => {
    const n = ` ${norm(w)} `;
    return terms.some((t) => n.includes(` ${t}`) || (t.length >= 5 && n.trim().split(' ').some((x) => x.endsWith(t))));
  });
  return (hit || offer.title).replace(/[^\p{L}\p{N}\- ]/gu, '').trim();
}

export function matches(offer, { terms, exclude }) {
  const hay = ` ${norm(`${offer.title} ${offer.brand || ''}`)} `;
  if (exclude.some((e) => hay.includes(e))) return false;
  return terms.some((t) => hay.includes(` ${t}`) || (t.length >= 5 && !t.includes(' ') && hay.split(' ').some((w) => w.endsWith(t))));
}

/* ---------- Mengen und Grundpreise ---------- */
const prep = (s) => String(s ?? '').toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/,/g, '.');
const FACTOR = { kg: ['mass', 1000], g: ['mass', 1], l: ['vol', 1000], ml: ['vol', 1], cl: ['vol', 10], stk: ['count', 1], stuck: ['count', 1], st: ['count', 1] };

// "500 g", "1,25 l", "150-g-Schale", "6 x 0,5 l", "10 Stück", "Stück" → { dim, amt } (amt in g / ml / Stück)
export function parseSize(unit) {
  const s = prep(unit);
  if (!s) return null;
  let m = s.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*-?\s*(kg|ml|cl|g|l)\b/);
  if (m) return { dim: FACTOR[m[3]][0], amt: Number(m[1]) * Number(m[2]) * FACTOR[m[3]][1] };
  m = s.match(/(\d+(?:\.\d+)?)\s*-?\s*(kg|ml|cl|g|l)\b/);
  if (m) return { dim: FACTOR[m[2]][0], amt: Number(m[1]) * FACTOR[m[2]][1] };
  m = s.match(/(\d+)\s*-?\s*(stuck|stk|st|er)\b/);
  if (m) return { dim: 'count', amt: Number(m[1]) };
  if (/\b(stuck|stk)\b/.test(s)) return { dim: 'count', amt: 1 };
  return null;
}

// Fallback: Grundpreis-Text, z. B. "1 kg = 7,24 €", "6.6 €/kg", "1kg = € 4,40 - € 3,77" → Preis pro g / ml / Stück
export function parsePerUnit(text) {
  const s = prep(text);
  let m = s.match(/(\d+(?:\.\d+)?)\s*(kg|ml|cl|g|l)\s*=\s*€?\s*(\d+(?:\.\d+)?)/);
  if (m) { const [dim, f] = FACTOR[m[2]]; return { dim, per: Number(m[3]) / (Number(m[1]) * f) }; }
  m = s.match(/(\d+(?:\.\d+)?)\s*€\s*\/\s*(kg|ml|cl|g|l|stuck|stk|st)\b/);
  if (m) { const [dim, f] = FACTOR[m[2]]; return { dim, per: Number(m[1]) / f }; }
  return null;
}

// Preis des Angebots pro g / ml / Stück.
export function offerBase(offer) {
  const size = parseSize(offer.unit);
  if (size && size.amt > 0) return { dim: size.dim, per: offer.price / size.amt, size };
  const pu = parsePerUnit(offer.perUnit);
  return pu ? { ...pu, size: null } : null;
}

// Üblicher Preis aus dem Bestand (€ pro PRICE_BASE der Einheit) → pro g / ml / Stück.
export function itemBase(item) {
  if (item.price == null || !(item.price > 0)) return null;
  switch (item.unit) {
    case 'g': return { dim: 'mass', per: item.price / 100 };
    case 'kg': return { dim: 'mass', per: item.price / 1000 };
    case 'ml': return { dim: 'vol', per: item.price / 100 };
    case 'l': return { dim: 'vol', per: item.price / 1000 };
    case 'Stk': return { dim: 'count', per: item.price };
    default: return null;   // Packung: Größe unbekannt, nicht vergleichbar
  }
}

export const displayPer = (b) => {
  if (!b) return null;
  if (b.dim === 'mass') return { value: b.per * 1000, label: '€/kg' };
  if (b.dim === 'vol') return { value: b.per * 1000, label: '€/l' };
  return { value: b.per, label: '€/Stk' };
};

const today = () => new Date().toISOString().slice(0, 10);

// Ergebnis je Lebensmittel: sortierte Treffer, günstigster zuerst.
export function offersFor(item, offers, now = today()) {
  const q = termsFor(item);
  const usual = itemBase(item);
  const found = [];
  const seen = new Set();
  const itemDim = (({ g: 'mass', kg: 'mass', ml: 'vol', l: 'vol', Stk: 'count' })[item.unit]) || null;
  for (const o of offers) {
    if (o.to && o.to < now) continue;                       // abgelaufen
    if (!matches(o, q)) continue;
    const key = `${o.chain}|${norm(o.title)}|${o.unit}|${o.price}`;
    if (seen.has(key)) continue;                            // gleiches Angebot mehrfach im Prospekt
    seen.add(key);
    const base = offerBase(o);
    // Gewicht ↔ Volumen passt nicht zusammen (z. B. 250 g Schokolade bei „Milch“ in Litern)
    if (base && itemDim && base.dim !== itemDim && base.dim !== 'count' && itemDim !== 'count') continue;
    const comparable = base && usual && base.dim === usual.dim;
    found.push({
      ...o,
      per: base ? displayPer(base) : null,
      sort: base ? base.per * (base.dim === 'count' ? 1 : 1) : Infinity,
      dimOk: !!comparable,
      saving: comparable ? 1 - base.per / usual.per : null,   // 0,25 = 25 % günstiger als üblich
    });
  }
  // Nur gleiche Größenart (Gewicht/Volumen/Stück) untereinander sortieren, sonst nach Preis.
  found.sort((a, b) => (a.dimOk === b.dimOk ? a.sort - b.sort || a.price - b.price : a.dimOk ? -1 : 1));
  return found;
}
