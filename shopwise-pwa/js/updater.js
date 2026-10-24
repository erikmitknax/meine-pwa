// Update-Prüfung: sucht nach einer neuen Version (sw.js mit anderer VERSION)
// und zeigt dann ein Banner "Neue Version verfügbar".
const CHECK_EVERY_MS = 15 * 60 * 1000; // zusätzlich zu jedem Start / Zurückkehren in die App

let registration = null;

function showBanner() {
  if (document.getElementById('update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'update-banner';
  banner.setAttribute('role', 'status');

  const text = document.createElement('span');
  text.textContent = 'Neue Version verfügbar';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Aktualisieren';
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'Aktualisiere …';
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      location.reload();
    }
  });

  banner.append(text, btn);
  document.querySelector('.app').insertBefore(banner, document.querySelector('.tabbar'));
}

// Rückgabe: 'available' | 'current' | 'offline' | 'unsupported'
export async function checkForUpdate() {
  if (!registration) return 'unsupported';
  try {
    await registration.update();
  } catch {
    return 'offline';
  }
  if (registration.installing) {
    const worker = registration.installing;
    await new Promise((resolve) => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' || worker.state === 'redundant') resolve();
      });
    });
  }
  if (registration.waiting && navigator.serviceWorker.controller) {
    showBanner();
    return 'available';
  }
  return 'current';
}

export function initUpdater() {
  if (!('serviceWorker' in navigator)) return;

  // Nach der Aktualisierung neu laden – aber nicht bei der allerersten Installation.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showBanner();

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showBanner();
        });
      });

      checkForUpdate();
      setInterval(checkForUpdate, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    })
    .catch((err) => console.warn('Service Worker konnte nicht registriert werden:', err));
}
