// Speicher für Einkaufslisten (localStorage, nur auf diesem Gerät).
const KEY = 'shopwise.lists';

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function save(lists) {
  try { localStorage.setItem(KEY, JSON.stringify(lists)); } catch { /* Speicher voll/gesperrt */ }
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
  lists.push({ id: newId(), name, items: [] });
  save(lists);
  return lists;
}

export function removeList(id) {
  const lists = loadLists().filter((l) => l.id !== id);
  save(lists);
  return lists;
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
}

// Lädt Kategorien und Lebensmittel. Legt beim ersten Start die Startkategorien an und
// stellt ältere Daten um (Lebensmittel mit Kategorie-Namen -> categoryId).
function ensureData() {
  let cats = readJSON(CAT_KEY, null);
  const items = readJSON(STOCK_KEY, []);
  let dirty = false;

  if (!Array.isArray(cats)) {
    cats = DEFAULT_CATEGORIES.map((c) => ({ id: newId(), ...c }));
    dirty = true;
  }
  for (const item of items) {
    if (item.categoryId && cats.some((c) => c.id === item.categoryId)) continue;
    const name = String(item.category || 'Sonstiges').trim() || 'Sonstiges';
    let cat = cats.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!cat) {
      cat = { id: newId(), name, icon: 'basket' };
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
  const cat = { id: newId(), name, icon };
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
  return { id: newId(), name: '', categoryId, unit: 'Stk', amount: 0, max: 1 };
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
