# Kippen-Tracker (Sync)

Zählt Zigaretten pro Tag, mit Diagrammen, Kosten und Zeitraum-Vergleich. Startet leer.
Ohne Anmeldung liegt alles nur auf dem Gerät. Mit Anmeldung (Firebase, E-Mail/Passwort)
werden die Einträge zwischen Geräten abgeglichen, auch offline Eingetragenes.

- Web-App: https://erikmitknax.github.io/meine-pwa/kippen-sync-pwa/
- Android-App (APK): https://erikmitknax.github.io/meine-pwa/kippen-sync-apk/kippen-tracker.apk
  (Quelle der APK: `kippen-sync-apk/`, die APK enthält dieselbe Seite fest eingebaut)

## Firebase einmalig einrichten
1. https://console.firebase.google.com: Projekt anlegen.
2. Authentication: Anmeldemethode "E-Mail/Passwort" aktivieren.
3. Firestore Database anlegen (z. B. europe-west3), danach unter "Regeln" den Inhalt von
   `firestore.rules` einfügen und veröffentlichen.
4. Projekteinstellungen, Allgemein, "Meine Apps": Web-App hinzufügen, den Block `firebaseConfig` kopieren.
5. In der App unten bei "Synchronisieren" einfügen, "Verbinden", dann Konto erstellen.
   Auf dem zweiten Gerät denselben Block einfügen und anmelden.

Der Block `firebaseConfig` ist kein Geheimnis. Geschützt sind die Daten durch die Firestore-Regeln.

`firebase-kfb.js` ist das gebündelte Firebase-SDK (Auth + Firestore, Version 13.1.0).
