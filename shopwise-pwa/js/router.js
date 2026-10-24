// Einfacher Hash-Router (#/einkaufsliste, #/bestand/<unterseite>, ...).
// Neue Seite hinzufügen: Datei in js/pages/ anlegen und hier eintragen.
// Seiten bekommen (element, params): params = Teile hinter dem Seitennamen.
// Hinweis: Dateinamen dürfen nicht mit "_" beginnen (GitHub Pages liefert die nicht aus).
import { render as einkaufsliste } from './pages/einkaufsliste.js';
import { render as angebote } from './pages/angebote.js';
import { render as bestand } from './pages/bestand.js';
import { render as einstellungen } from './pages/einstellungen.js';

const routes = { einkaufsliste, angebote, bestand, einstellungen };
const DEFAULT_ROUTE = 'einkaufsliste';

export function startRouter(viewEl) {
  const tabs = document.querySelectorAll('.tabbar a');

  function navigate() {
    const [name, ...params] = location.hash.replace('#/', '').split('/');
    const known = !!routes[name];
    const route = known ? name : DEFAULT_ROUTE;

    viewEl.innerHTML = '';
    routes[route](viewEl, known ? params : []);
    viewEl.scrollTop = 0;

    tabs.forEach((tab) => {
      const active = tab.dataset.route === route;
      tab.classList.toggle('active', active);
      if (active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
  }

  window.addEventListener('hashchange', navigate);
  navigate();
}
