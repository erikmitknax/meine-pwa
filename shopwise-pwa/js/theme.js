// Vorgefertigte Designs. Jedes Design setzt nur Farb-Variablen (siehe css/styles.css, Abschnitt "Designs").
// Die Wahl gilt pro Gerät und wird lokal gespeichert.
export const THEMES = [
  { id: 'mitternacht', name: 'Mitternacht & Gold', bar: '#0b1736', c: ['#0b1736', '#1b2d5c', '#c9a24b', '#f6f1e7'] },
  { id: 'smaragd', name: 'Smaragd', bar: '#072019', c: ['#072019', '#17463a', '#cfae55', '#f2f4ea'] },
  { id: 'burgund', name: 'Burgund & Roségold', bar: '#260b17', c: ['#260b17', '#52203a', '#d9a58a', '#f7eeea'] },
  { id: 'graphit', name: 'Graphit & Silber', bar: '#141619', c: ['#141619', '#2e3238', '#b9bcc4', '#f1f1ee'] },
  { id: 'ozean', name: 'Ozean & Bernstein', bar: '#072229', c: ['#072229', '#174b5c', '#e0a35c', '#eff5f3'] },
  { id: 'violett', name: 'Nachtviolett', bar: '#160f33', c: ['#160f33', '#35286e', '#c9a24b', '#f3effa'] },
];
const KEY = 'shopwise.theme';

export function currentTheme() {
  try { const t = localStorage.getItem(KEY); if (THEMES.some((x) => x.id === t)) return t; } catch { /* egal */ }
  return 'mitternacht';
}

export function applyTheme(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  document.documentElement.dataset.theme = t.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.bar);
  try { localStorage.setItem(KEY, t.id); } catch { /* egal */ }
}
