// Einstiegspunkt: Router starten und Update-Prüfung aktivieren.
import { startRouter } from './router.js';
import { initUpdater } from './updater.js';

startRouter(document.getElementById('view'));
initUpdater();
