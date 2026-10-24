"use strict";
/* Angebots-Radar – Benachrichtigungen.
 * In der Android-App: lokale Benachrichtigungen über das Capacitor-Plug-in (kein Server nötig).
 * Im Browser: Benachrichtigung über den Service Worker (nur solange die Seite/der Browser läuft).
 * Wichtig: Beides läuft nur, wenn die App geöffnet wird bzw. als feste Wochenerinnerung.
 * Echte Hintergrund-Meldungen "es gibt jetzt ein Angebot" brauchen später einen Server-Push oder
 * einen Hintergrundjob (siehe README.md). */
const Benachr = (() => {
  const C = window.Capacitor;
  const NATIVE = !!(C && C.isNativePlatform && C.isNativePlatform());
  const LN = () => (C && C.Plugins && C.Plugins.LocalNotifications) || (NATIVE && typeof C.registerPlugin === "function" ? C.registerPlugin("LocalNotifications") : null);
  const WOCHE_IDS = [9001, 9002];

  async function status() {
    if (NATIVE) {
      try { const r = await LN().checkPermissions(); return r.display === "granted" ? "an" : r.display === "denied" ? "aus" : "offen"; }
      catch (e) { return "nicht-moeglich"; }
    }
    if (!("Notification" in window)) return "nicht-moeglich";
    return Notification.permission === "granted" ? "an" : Notification.permission === "denied" ? "aus" : "offen";
  }

  async function fragen() {
    if (NATIVE) {
      try { const r = await LN().requestPermissions(); return r.display === "granted"; } catch (e) { return false; }
    }
    if (!("Notification" in window)) return false;
    try { return (await Notification.requestPermission()) === "granted"; } catch (e) { return false; }
  }

  let zaehler = 1000 + Math.floor(Math.random() * 1000);

  async function zeigen(titel, text, extra) {
    if ((await status()) !== "an") return false;
    if (NATIVE) {
      try {
        await LN().schedule({ notifications: [{ id: ++zaehler, title: titel, body: text, extra: extra || {}, smallIcon: "ic_stat_angebote" }] });
        return true;
      } catch (e) { return false; }
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(titel, { body: text, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: "angebote", data: extra || {} });
      return true;
    } catch (e) { return false; }
  }

  /* Feste Wochenerinnerung (Prospekte wechseln meist Montag und Donnerstag) – nur in der App möglich */
  async function wochenErinnerung(an) {
    if (!NATIVE) return false;
    try {
      await LN().cancel({ notifications: WOCHE_IDS.map(id => ({ id })) });
      if (!an || (await status()) !== "an") return false;
      const mk = (id, weekday, text) => ({
        id, title: "Neue Prospekte", body: text, extra: { tab: "treffer" }, smallIcon: "ic_stat_angebote",
        schedule: { on: { weekday, hour: 8, minute: 0 }, allowWhileIdle: true }
      });
      await LN().schedule({
        notifications: [
          mk(9001, 2, "Montag: die neuen Wochenangebote sind da. Schau, was für deinen Vorrat dabei ist."),
          mk(9002, 5, "Donnerstag: neue Angebote bei Kaufland & Co. Lohnt sich ein Vorratskauf?")
        ]
      });
      return true;
    } catch (e) { return false; }
  }

  /* Tippen auf eine Benachrichtigung -> passenden Tab öffnen */
  function beiKlick(fn) {
    if (NATIVE) {
      try { LN().addListener("localNotificationActionPerformed", ev => fn((ev.notification && ev.notification.extra) || {})); } catch (e) { /* egal */ }
    } else if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", ev => { if (ev.data && ev.data.type === "klick") fn(ev.data.extra || {}); });
    }
  }

  return { NATIVE, status, fragen, zeigen, wochenErinnerung, beiKlick };
})();
