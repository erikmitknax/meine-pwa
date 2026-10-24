// Einstiegspunkt: Router starten, Update-Prüfung und Nachkauf-Badge aktivieren.
import { startRouter } from './router.js';
import { initUpdater } from './updater.js';
import { stockAlertCount } from './store.js';
import { initSync } from './sync.js';
import { openQuick } from './quick.js';

// Zahl am Tab "Bestand": wie viele Lebensmittel nachgekauft werden sollten.
function updateBadge() {
  const tab = document.querySelector('.tabbar a[data-route="bestand"]');
  let badge = tab.querySelector('.tab-badge');
  const count = stockAlertCount();
  if (!count) { if (badge) badge.remove(); return; }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'tab-badge';
    tab.appendChild(badge);
  }
  badge.textContent = count;
}

window.addEventListener('shopwise:stock-changed', updateBadge);
updateBadge();

document.getElementById('quick-open').addEventListener('click', openQuick);

startRouter(document.getElementById('view'));
initUpdater();
initSync();
