// Einstiegspunkt: Router starten und Service Worker registrieren.
import { startRouter } from './router.js';

startRouter(document.getElementById('view'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service Worker konnte nicht registriert werden:', err);
    });
  });
}
