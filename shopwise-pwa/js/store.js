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
