import { renderEmpty } from './_empty.js';
import { APP_VERSION } from '../version.js';
import { checkForUpdate } from '../updater.js';

const MESSAGES = {
  available: 'Neue Version gefunden – siehe Banner unten.',
  current: 'Du hast die neueste Version.',
  offline: 'Keine Verbindung – später erneut versuchen.',
  unsupported: 'Updates werden hier nicht unterstützt.',
};

export function render(el) {
  renderEmpty(el, {
    title: 'Einstellungen',
    iconPath: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  });

  const box = document.createElement('section');
  box.className = 'about';

  const version = document.createElement('p');
  version.textContent = `Shopwise Version ${APP_VERSION}`;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-gold';
  btn.textContent = 'Nach Updates suchen';

  const status = document.createElement('p');
  status.className = 'about-status';
  status.setAttribute('role', 'status');

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    status.textContent = 'Suche …';
    status.textContent = MESSAGES[await checkForUpdate()];
    btn.disabled = false;
  });

  box.append(version, btn, status);
  el.appendChild(box);
}
