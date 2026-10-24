// Tab "Einstellungen": Konto & Sicherung (Firebase-Abgleich) und App-Version.
import { h } from '../dom.js';
import { APP_VERSION } from '../version.js';
import { checkForUpdate } from '../updater.js';
import { getSync, login, forgotPassword, logout, syncNow } from '../sync.js';

const UPDATE_MESSAGES = {
  available: 'Neue Version gefunden – siehe Banner unten.',
  current: 'Du hast die neueste Version.',
  offline: 'Keine Verbindung – später erneut versuchen.',
  unsupported: 'Updates werden hier nicht unterstützt.',
};

// Zeichnet die Seite neu, wenn sich der Abgleich-Status ändert (nur solange die Seite offen ist).
let redraw = null;
window.addEventListener('shopwise:sync-state', () => {
  if (redraw && location.hash.startsWith('#/einstellungen')) redraw();
});

export function render(el) {
  let message = '';     // Rückmeldung unter den Konto-Knöpfen
  let busy = false;

  function input(type, placeholder, autocomplete, value = '') {
    const i = h('input');
    i.type = type;
    i.placeholder = placeholder;
    i.autocomplete = autocomplete;
    i.value = value;
    return i;
  }

  function accountPanel() {
    const sync = getSync();
    const panel = h('section', 'panel');
    panel.appendChild(h('h2', '', 'Konto & Sicherung'));

    if (!sync.signedIn) {
      panel.appendChild(h('p', 'panel-text',
        'Melde dich mit deinem Konto an (dasselbe wie bei FoodPro, Lernwerkstatt und Wunschliste). Dann sind Listen und Bestand gesichert und auf allen Geräten live gleich. Noch kein Konto? Einfach „Konto erstellen“.'));
      const mail = input('email', 'E-Mail', 'email');
      mail.inputMode = 'email';
      mail.autocapitalize = 'off';
      const pw = input('password', 'Passwort (mind. 6 Zeichen)', 'current-password');
      panel.append(mail, pw);

      const run = async (create) => {
        busy = true; message = ''; draw();
        message = await login(mail.value.trim(), pw.value, create);
        busy = false; draw();
      };
      const row = h('div', 'panel-row');
      const inBtn = h('button', 'btn btn-gold', 'Anmelden');
      inBtn.type = 'button';
      inBtn.disabled = busy;
      inBtn.addEventListener('click', () => run(false));
      const newBtn = h('button', 'btn btn-ghost-light', 'Konto erstellen');
      newBtn.type = 'button';
      newBtn.disabled = busy;
      newBtn.addEventListener('click', () => run(true));
      row.append(inBtn, newBtn);
      panel.appendChild(row);

      const forgot = h('button', 'link-btn', 'Passwort vergessen?');
      forgot.type = 'button';
      forgot.addEventListener('click', async () => { message = await forgotPassword(mail.value.trim()); draw(); });
      panel.appendChild(forgot);

      if (busy || sync.state === 'connect') panel.appendChild(h('p', 'panel-text', 'Verbinde …'));
    } else {
      const label = sync.state === 'live' ? 'Gesichert & live'
        : sync.state === 'sync' ? 'Gleiche ab …'
        : sync.state === 'error' ? 'Abgleich gestört' : 'Nicht verbunden';
      panel.appendChild(h('p', `sync-label sync-${sync.state}`, label));
      const ago = sync.last
        ? new Date(sync.last).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '';
      panel.appendChild(h('p', 'panel-text', `Angemeldet als ${sync.email}${ago ? ` · zuletzt abgeglichen ${ago}` : ''}`));
      panel.appendChild(h('p', 'panel-text', 'Änderungen erscheinen in Sekunden auf allen angemeldeten Geräten. Ohne Netz arbeitet die App weiter und gleicht später ab.'));

      const row = h('div', 'panel-row');
      const now = h('button', 'btn btn-gold', 'Jetzt abgleichen');
      now.type = 'button';
      now.addEventListener('click', async () => { message = await syncNow(); draw(); });
      const out = h('button', 'btn btn-ghost-light', 'Abmelden');
      out.type = 'button';
      out.addEventListener('click', async () => {
        await logout();
        message = 'Abgemeldet – die Daten bleiben auf diesem Gerät.';
        draw();
      });
      row.append(now, out);
      panel.appendChild(row);
    }

    const shown = message || (sync.state === 'error' ? sync.err : '');
    if (shown) {
      const msg = h('p', `panel-msg${sync.state === 'error' && !message ? ' err' : ''}`, shown);
      msg.setAttribute('role', 'status');
      panel.appendChild(msg);
    }
    return panel;
  }

  function aboutBox() {
    const box = h('section', 'about');
    box.appendChild(h('p', '', `Shopwise Version ${APP_VERSION}`));
    const btn = h('button', 'btn btn-gold', 'Nach Updates suchen');
    btn.type = 'button';
    const status = h('p', 'about-status');
    status.setAttribute('role', 'status');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      status.textContent = 'Suche …';
      status.textContent = UPDATE_MESSAGES[await checkForUpdate()];
      btn.disabled = false;
    });
    box.append(btn, status);
    return box;
  }

  function draw() {
    const a = document.activeElement;
    if (a && el.contains(a) && a.tagName === 'INPUT') return;   // beim Tippen nicht stören
    el.innerHTML = '';
    el.appendChild(h('h1', '', 'Einstellungen'));
    el.appendChild(accountPanel());
    el.appendChild(aboutBox());
  }

  redraw = draw;
  draw();
}
