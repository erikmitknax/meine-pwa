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

/* ---------- Bestand (Lebensmittel mit Menge und Maximum) ---------- */
const STOCK_KEY = 'shopwise.stock';

export const DEFAULT_CATEGORIES = [
  'Milchprodukte', 'Obst & Gemüse', 'Fleisch & Fisch', 'Backwaren',
  'Vorrat', 'Tiefkühl', 'Getränke', 'Sonstiges',
];
export const UNITS = ['Stk', 'Packung', 'g', 'kg', 'ml', 'l'];
// Schrittweite der +/- Tasten je Einheit
export const STEP = { Stk: 1, Packung: 1, g: 100, kg: 0.5, ml: 100, l: 0.5 };

// Meldung ab 20 % (fast leer) und bei 0 % (leer), bezogen auf die Maximalmenge.
export const LOW_RATIO = 0.2;

export function loadStock() {
  try {
    const raw = localStorage.getItem(STOCK_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* defekte Daten ignorieren */ }
  return [];
}

function saveStock(items) {
  try { localStorage.setItem(STOCK_KEY, JSON.stringify(items)); } catch { /* Speicher voll/gesperrt */ }
  window.dispatchEvent(new CustomEvent('shopwise:stock-changed'));
}

export function newStockItem() {
  return { id: newId(), name: '', category: DEFAULT_CATEGORIES[0], unit: 'Stk', amount: 0, max: 1 };
}

export function saveStockItem(item) {
  const items = loadStock();
  const i = items.findIndex((x) => x.id === item.id);
  if (i >= 0) items[i] = item; else items.push(item);
  saveStock(items);
}

export function removeStockItem(id) {
  saveStock(loadStock().filter((x) => x.id !== id));
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
