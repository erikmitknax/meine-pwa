# Kippen-Tracker (Sync)

Zählt Zigaretten pro Tag, mit Diagrammen, Kosten und Zeitraum-Vergleich. Startet leer.
Die Einträge werden über Firebase zwischen Geräten abgeglichen, auch offline Eingetragenes.

- Web-App: https://erikmitknax.github.io/meine-pwa/kippen-sync-pwa/
- Android-App (APK): https://erikmitknax.github.io/meine-pwa/kippen-sync-apk/kippen-tracker.apk
  (die APK enthält dieselbe Seite fest eingebaut, Quelle: `kippen-sync-apk/`)

## Synchronisieren
Es ist dasselbe Firebase-Projekt (`foodpro-e2a44`) und dasselbe Konto wie bei FoodPro, Lernwerkstatt,
Wunschliste und Shopwise. Unten bei "Synchronisieren" mit der gleichen E-Mail und dem gleichen Passwort anmelden,
fertig. Auf jedem Gerät dieselben Zugangsdaten benutzen.

Die Daten liegen unter `users/<uid>/kt_eintraege/<Datum>` (`{ n: Anzahl }`) und
`users/<uid>/kt_einstellungen/app` (`{ preis }`) und fallen unter die bestehende Regel `users/{uid}/**`
(Beispiel in `firestore.rules`). Es ist keine Einrichtung nötig. Die Web-Konfiguration ist kein Geheimnis.

Hast du vor der Anmeldung schon Einträge auf dem Gerät gemacht, fragt die App, ob sie ins Konto übernommen werden sollen.

`firebase-kfb.js` ist das gebündelte Firebase-SDK (Auth + Firestore, Version 13.1.0).
