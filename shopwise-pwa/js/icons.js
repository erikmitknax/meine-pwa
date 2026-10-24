// Symbole für Kategorien (24x24, Linien-Stil passend zur Tab-Leiste).
const PATHS = {
  milk: '<path d="M7 7l2-4h6l2 4"/><path d="M7 7h10v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z"/><path d="M10 12h4"/>',
  apple: '<path d="M12 8.5c-1.6-1.4-5.5-1.6-6.3 2.3-.7 3.5 1.4 8.2 3.6 9.4 1 .5 1.8 0 2.7 0s1.7.5 2.7 0c2.2-1.2 4.3-5.9 3.6-9.4-.8-3.9-4.7-3.7-6.3-2.3z"/><path d="M12 8.5c0-2 .9-3.8 2.6-4.5"/>',
  fish: '<path d="M3 12c3-4.5 8-5.5 12-3.5l3.5-2.5v12L15 15.5C11 17.5 6 16.5 3 12z"/><circle cx="8" cy="11" r=".7"/>',
  bread: '<path d="M5 10c-1.7-1-2-4 0-5.5C6 3.7 7 3.5 8 3.5h8c1 0 2 .2 3 1 2 1.5 1.7 4.5 0 5.5V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M9 10v4M12 10v4M15 10v4"/>',
  jar: '<path d="M8 3h8v3H8z"/><path d="M7 6h10l1 3v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9z"/><path d="M9 12h6v4H9z"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="M9.5 4.5 12 6.5l2.5-2M9.5 19.5 12 17.5l2.5 2"/>',
  bottle: '<path d="M10 3h4v4l1.5 3v10a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V10L10 7z"/><path d="M8.5 13h7"/>',
  basket: '<path d="M3 10h18l-2 10H5z"/><path d="M8 10l3-6M16 10l-3-6"/>',
  cheese: '<path d="M3 17 21 8v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><circle cx="12" cy="15" r="1"/><circle cx="17" cy="13.5" r=".8"/>',
  egg: '<path d="M12 3c3.5 0 6 6 6 10a6 6 0 0 1-12 0c0-4 2.5-10 6-10z"/>',
  spice: '<path d="M8 3h8l1 4H7z"/><path d="M7 7h10l-1 13a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z"/><path d="M10 11h4"/>',
  candy: '<path d="M12 8c2.5 0 4 1.8 4 4s-1.5 4-4 4-4-1.8-4-4 1.5-4 4-4z"/><path d="M8 12 3 9v6zM16 12l5-3v6z"/>',
  can: '<path d="M7 5c0-1 2.2-2 5-2s5 1 5 2v14c0 1-2.2 2-5 2s-5-1-5-2z"/><path d="M7 5c0 1 2.2 2 5 2s5-1 5-2"/><path d="M7 11h10"/>',
  grain: '<path d="M12 21V8"/><path d="M12 8c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zM12 8c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4zM12 14c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zM12 14c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4z"/>',
  cup: '<path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M8 3c0 1.5 1.5 1.5 1.5 3M12 3c0 1.5 1.5 1.5 1.5 3"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  house: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  paw: '<circle cx="6" cy="11" r="1.6"/><circle cx="9.5" cy="6.5" r="1.6"/><circle cx="14.5" cy="6.5" r="1.6"/><circle cx="18" cy="11" r="1.6"/><path d="M12 12c-3 0-5.5 3-5.5 5.2 0 1.6 1.4 2.3 3 2 .9-.2 1.6-.5 2.5-.5s1.6.3 2.5.5c1.6.3 3-.4 3-2C17.5 15 15 12 12 12z"/>',
};

// Symbole der Oberfläche (nicht als Kategorie-Symbol wählbar)
const UI_PATHS = {
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
};

export function uiIcon(key) {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${UI_PATHS[key]}</svg>`;
  return wrap.firstChild;
}

export const ICON_LABELS = {
  milk: 'Milch', apple: 'Obst & Gemüse', fish: 'Fisch', bread: 'Brot', jar: 'Vorrat',
  snow: 'Tiefkühl', bottle: 'Getränke', basket: 'Sonstiges', cheese: 'Käse', egg: 'Eier',
  spice: 'Gewürze', candy: 'Süßes', can: 'Konserven', grain: 'Getreide', cup: 'Kaffee & Tee',
  drop: 'Drogerie', house: 'Haushalt', paw: 'Haustier',
};

export const ICON_KEYS = Object.keys(PATHS);

export function iconSvg(key) {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${PATHS[key] || PATHS.basket}</svg>`;
  return wrap.firstChild;
}
