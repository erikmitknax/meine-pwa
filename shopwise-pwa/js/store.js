// Speicher für Einkaufslisten (localStorage, nur auf diesem Gerät).
const KEY = 'shopwise.lists';

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

// Meldet jede lokale Änderung (der Abgleich lädt sie dann hoch).
function dataChanged() {
  window.dispatchEvent(new CustomEvent('shopwise:data-changed'));
}

function saveRaw(lists) {
  try { localStorage.setItem(KEY, JSON.stringify(lists)); } catch { /* Speicher voll/gesperrt */ }
}

function save(lists) {
  saveRaw(lists);
  dataChanged();
}

export function loadLists() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* defekte Daten ignorieren */ }
  // Erster Start: eine Beispielliste
  const seed = [{ id: newId(), name: 'Wocheneinkauf', items: [] }];
  save(seed);
  return seed;
}

export function addList(name) {
  const lists = loadLists();
  lists.push({ id: newId(), name, items: [], created: Date.now() });
  save(lists);
  return lists;
}

export function renameList(id, name) {
  const lists = loadLists();
  const list = lists.find((l) => l.id === id);
  if (!list) return lists;
  list.name = name;
  save(lists);
  return lists;
}

export function removeList(id) {
  const lists = loadLists().filter((l) => l.id !== id);
  save(lists);
  return lists;
}

export function getList(id) {
  return loadLists().find((l) => l.id === id);
}

/* Artikel einer Einkaufsliste: { id, name, qty (Text, optional), checked } */
function updateList(id, fn) {
  const lists = loadLists();
  const list = lists.find((l) => l.id === id);
  if (!list) return null;
  fn(list);
  save(lists);
  return list;
}

export function addItem(listId, name, qty = '') {
  return updateList(listId, (l) => l.items.push({ id: newId(), name, qty, checked: false, created: Date.now() }));
}

export function toggleItem(listId, itemId) {
  return updateList(listId, (l) => {
    const it = l.items.find((x) => x.id === itemId);
    if (it) it.checked = !it.checked;
  });
}

export function removeItem(listId, itemId) {
  return updateList(listId, (l) => { l.items = l.items.filter((x) => x.id !== itemId); });
}

export function clearChecked(listId) {
  return updateList(listId, (l) => { l.items = l.items.filter((x) => !x.checked); });
}

/* ---------- Bestand: Kategorien + Lebensmittel ---------- */
const STOCK_KEY = 'shopwise.stock';
const CAT_KEY = 'shopwise.categories';

// Startkategorien (beim ersten Öffnen); danach frei änderbar.
const DEFAULT_CATEGORIES = [
  { name: 'Milchprodukte', icon: 'milk' },
  { name: 'Obst & Gemüse', icon: 'apple' },
  { name: 'Fleisch & Fisch', icon: 'fish' },
  { name: 'Backwaren', icon: 'bread' },
  { name: 'Vorrat', icon: 'jar' },
  { name: 'Tiefkühl', icon: 'snow' },
  { name: 'Getränke', icon: 'bottle' },
  { name: 'Sonstiges', icon: 'basket' },
];
export const UNITS = ['Stk', 'Packung', 'g', 'kg', 'ml', 'l'];
// Preise gelten pro Bezugsmenge: 100 g, 100 ml, sonst pro 1 Einheit (so sind Angebote später vergleichbar).
export const PRICE_BASE = { Stk: 1, Packung: 1, g: 100, kg: 1, ml: 100, l: 1 };
export const priceLabel = (unit) => (PRICE_BASE[unit] > 1 ? `${PRICE_BASE[unit]} ${unit}` : unit);
// Schrittweite der +/- Tasten je Einheit
export const STEP = { Stk: 1, Packung: 1, g: 100, kg: 0.5, ml: 100, l: 0.5 };

// Meldung ab 20 % (fast leer) und bei 0 % (leer), bezogen auf die Maximalmenge.
export const LOW_RATIO = 0.2;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return JSON.parse(raw);
  } catch { /* defekte Daten ignorieren */ }
  return fallback;
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Speicher voll/gesperrt */ }
}

function changed() {
  window.dispatchEvent(new CustomEvent('shopwise:stock-changed'));
  dataChanged();
}

// Lädt Kategorien und Lebensmittel. Legt beim ersten Start die Startkategorien an und
// stellt ältere Daten um (Lebensmittel mit Kategorie-Namen -> categoryId).
function ensureData() {
  let cats = readJSON(CAT_KEY, null);
  const items = readJSON(STOCK_KEY, []);
  let dirty = false;

  if (!Array.isArray(cats)) {
    cats = DEFAULT_CATEGORIES.map((c, i) => ({ id: newId(), ...c, o: i }));
    dirty = true;
  }
  cats.forEach((c, i) => { if (typeof c.o !== 'number') { c.o = i; dirty = true; } });
  for (const item of items) {
    if (item.categoryId && cats.some((c) => c.id === item.categoryId)) continue;
    const name = String(item.category || 'Sonstiges').trim() || 'Sonstiges';
    let cat = cats.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!cat) {
      cat = { id: newId(), name, icon: 'basket', o: cats.length };
      cats.push(cat);
    }
    item.categoryId = cat.id;
    delete item.category;
    dirty = true;
  }
  if (dirty) {
    writeJSON(CAT_KEY, cats);
    writeJSON(STOCK_KEY, items);
  }
  return { cats, items };
}

/* Kategorien */
export const loadCategories = () => ensureData().cats;
export const getCategory = (id) => loadCategories().find((c) => c.id === id);

export function addCategory(name, icon = 'basket') {
  const { cats } = ensureData();
  const cat = { id: newId(), name, icon, o: Math.max(-1, ...cats.map((c) => c.o)) + 1 };
  cats.push(cat);
  writeJSON(CAT_KEY, cats);
  changed();
  return cat;
}

export function updateCategory(id, fields) {
  const { cats } = ensureData();
  const cat = cats.find((c) => c.id === id);
  if (!cat) return;
  Object.assign(cat, fields);
  writeJSON(CAT_KEY, cats);
  changed();
}

// dir: -1 = nach oben, +1 = nach unten
export function moveCategory(id, dir) {
  const { cats } = ensureData();
  const i = cats.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cats.length) return;
  [cats[i], cats[j]] = [cats[j], cats[i]];
  [cats[i].o, cats[j].o] = [cats[j].o, cats[i].o];   // Reihenfolge-Nummern mittauschen
  writeJSON(CAT_KEY, cats);
  changed();
}

// Löscht die Kategorie samt ihrer Lebensmittel.
export function removeCategory(id) {
  const { cats, items } = ensureData();
  writeJSON(CAT_KEY, cats.filter((c) => c.id !== id));
  writeJSON(STOCK_KEY, items.filter((i) => i.categoryId !== id));
  changed();
}

/* Lebensmittel */
export const loadStock = () => ensureData().items;

export function newStockItem(categoryId) {
  return { id: newId(), name: '', categoryId, unit: 'Stk', amount: 0, max: 1, price: null, search: '', exclude: '' };
}

export function saveStockItem(item) {
  const items = loadStock();
  const i = items.findIndex((x) => x.id === item.id);
  if (i >= 0) items[i] = item; else items.push(item);
  writeJSON(STOCK_KEY, items);
  changed();
}

export function removeStockItem(id) {
  writeJSON(STOCK_KEY, loadStock().filter((x) => x.id !== id));
  changed();
}

// 'ok' | 'low' (höchstens 20 %) | 'empty' (0)
export function stockStatus(item) {
  if (item.amount <= 0) return 'empty';
  if (item.amount / item.max <= LOW_RATIO + 1e-9) return 'low';
  return 'ok';
}

export function stockAlertCount() {
  return loadStock().filter((i) => stockStatus(i) !== 'ok').length;
}

/* ---------- Merkliste (Angebote): Lebensmittel beobachten, unabhängig vom Bestand ---------- */
const WATCH_KEY = 'shopwise.watch';
export const loadWatch = () => readJSON(WATCH_KEY, []);
export const newWatchItem = () => ({ id: newId(), name: '', unit: 'kg', price: null, search: '', exclude: '' });
export function saveWatchItem(item) {
  const items = loadWatch();
  const i = items.findIndex((x) => x.id === item.id);
  if (i >= 0) items[i] = item; else items.push(item);
  writeJSON(WATCH_KEY, items);
  changed();
}
export function removeWatchItem(id) {
  writeJSON(WATCH_KEY, loadWatch().filter((x) => x.id !== id));
  changed();
}

/* ---------- Abgleich (Firebase): flache Sicht auf alle Daten ----------
   Vier Arten von Dokumenten, jedes mit eigener ID:
     lists  = Einkaufsliste (Name)            litems = Artikel einer Liste
     cats   = Bestand-Kategorie (Name, Symbol, Reihenfolge)   stock = Lebensmittel */
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

// Bereinigt ein Dokument (lokal wie von außen); null = ungültig.
function normDoc(type, d) {
  if (!d || typeof d !== 'object') return null;
  if (type === 'lists') {
    const name = text(d.name, 60);
    return name ? { name, created: num(d.created) } : null;
  }
  if (type === 'litems') {
    const name = text(d.name, 80);
    return name && d.listId
      ? { listId: String(d.listId), name, qty: text(d.qty, 20), checked: !!d.checked, created: num(d.created) }
      : null;
  }
  if (type === 'cats') {
    const name = text(d.name, 40);
    return name ? { name, icon: text(d.icon, 20) || 'basket', o: num(d.o) } : null;
  }
  if (type === 'stock') {
    const name = text(d.name, 60);
    if (!name || !d.categoryId) return null;
    const price = d.price === null || d.price === undefined || d.price === '' ? null : Math.max(0, num(d.price));
    return {
      categoryId: String(d.categoryId), name,
      unit: UNITS.includes(d.unit) ? d.unit : 'Stk',
      amount: Math.max(0, num(d.amount)), max: num(d.max) > 0 ? num(d.max) : 1, price,
      search: text(d.search, 120), exclude: text(d.exclude, 120),
    };
  }
  if (type === 'watch') {
    const name = text(d.name, 60);
    if (!name) return null;
    const price = d.price === null || d.price === undefined || d.price === '' ? null : Math.max(0, num(d.price));
    return { name, unit: UNITS.includes(d.unit) ? d.unit : 'kg', price, search: text(d.search, 120), exclude: text(d.exclude, 120) };
  }
  return null;
}

export function exportAll() {
  const out = { lists: {}, litems: {}, cats: {}, stock: {}, watch: {} };
  const { cats, items } = ensureData();
  for (const l of loadLists()) {
    const n = normDoc('lists', l);
    if (n) out.lists[l.id] = n;
    for (const it of l.items) {
      const m = normDoc('litems', { ...it, listId: l.id });
      if (m) out.litems[it.id] = m;
    }
  }
  for (const c of cats) { const n = normDoc('cats', c); if (n) out.cats[c.id] = n; }
  for (const i of items) { const n = normDoc('stock', i); if (n) out.stock[i.id] = n; }
  for (const w of loadWatch()) { const n = normDoc('watch', w); if (n) out.watch[w.id] = n; }
  return out;
}

const byCreated = (a, b) => (a.created || 0) - (b.created || 0);

// Dokument von einem anderen Gerät übernehmen (ohne Änderungs-Event).
// Rückgabe: 'ok' | 'orphan' (Eltern fehlen noch, später erneut versuchen) | 'invalid'
export function importDoc(type, id, d) {
  const n = normDoc(type, d);
  if (!n) return 'invalid';
  if (type === 'lists') {
    const lists = loadLists();
    const l = lists.find((x) => x.id === id);
    if (l) Object.assign(l, n); else lists.push({ id, ...n, items: [] });
    lists.sort(byCreated);
    saveRaw(lists);
  } else if (type === 'litems') {
    const lists = loadLists();
    const list = lists.find((x) => x.id === n.listId);
    if (!list) return 'orphan';
    const { listId, ...fields } = n;
    const it = list.items.find((x) => x.id === id);
    if (it) Object.assign(it, fields); else list.items.push({ id, ...fields });
    list.items.sort(byCreated);
    saveRaw(lists);
  } else if (type === 'cats') {
    const { cats } = ensureData();
    const c = cats.find((x) => x.id === id);
    if (c) Object.assign(c, n); else cats.push({ id, ...n });
    cats.sort((a, b) => a.o - b.o);
    writeJSON(CAT_KEY, cats);
  } else if (type === 'stock') {
    const { cats, items } = ensureData();
    if (!cats.some((c) => c.id === n.categoryId)) return 'orphan';
    const it = items.find((x) => x.id === id);
    if (it) Object.assign(it, n); else items.push({ id, ...n });
    writeJSON(STOCK_KEY, items);
  } else if (type === 'watch') {
    const items = loadWatch();
    const it = items.find((x) => x.id === id);
    if (it) Object.assign(it, n); else items.push({ id, ...n });
    writeJSON(WATCH_KEY, items);
  }
  return 'ok';
}

// Löschung von einem anderen Gerät übernehmen. Rückgabe: true, wenn lokal etwas entfernt wurde.
export function removeDoc(type, id) {
  if (type === 'watch') {
    const items = loadWatch();
    const rest = items.filter((i) => i.id !== id);
    if (rest.length === items.length) return false;
    writeJSON(WATCH_KEY, rest);
    return true;
  }
  if (type === 'lists') {
    const lists = loadLists();
    const rest = lists.filter((l) => l.id !== id);
    if (rest.length === lists.length) return false;
    saveRaw(rest);
    return true;
  }
  if (type === 'litems') {
    const lists = loadLists();
    let hit = false;
    for (const l of lists) {
      const rest = l.items.filter((i) => i.id !== id);
      if (rest.length !== l.items.length) { l.items = rest; hit = true; }
    }
    if (hit) saveRaw(lists);
    return hit;
  }
  if (type === 'cats') {
    const { cats, items } = ensureData();
    if (!cats.some((c) => c.id === id)) return false;
    writeJSON(CAT_KEY, cats.filter((c) => c.id !== id));
    writeJSON(STOCK_KEY, items.filter((i) => i.categoryId !== id));   // wie removeCategory
    return true;
  }
  if (type === 'stock') {
    const { items } = ensureData();
    const rest = items.filter((i) => i.id !== id);
    if (rest.length === items.length) return false;
    writeJSON(STOCK_KEY, rest);
    return true;
  }
  return false;
}

// Noch unberührte Startdaten? Dann übernimmt ein neues Gerät beim ersten Abgleich einfach den vorhandenen Stand.
export function isPristine(type) {
  if (type === 'lists') return loadLists().every((l) => l.items.length === 0);
  if (type === 'stock') return loadStock().length === 0;
  if (type === 'cats') {
    const { cats, items } = ensureData();
    return items.length === 0 && cats.length === DEFAULT_CATEGORIES.length
      && cats.every((c, i) => c.name === DEFAULT_CATEGORIES[i].name && c.icon === DEFAULT_CATEGORIES[i].icon);
  }
  return false;
}

// Leert eine Art von Daten ohne Neu-Anlegen der Startdaten.
export function resetType(type) {
  if (type === 'lists') saveRaw([]);
  else if (type === 'cats') writeJSON(CAT_KEY, []);
  else if (type === 'stock') writeJSON(STOCK_KEY, []);
}
