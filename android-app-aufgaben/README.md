# Aufgaben als Android-App (APK)

Die App ist eine Hülle (Capacitor), die die Seite
https://erikmitknax.github.io/meine-pwa/aufgaben-pwa/ lädt.
Änderungen an `aufgaben-pwa/` kommen also ohne neue APK auf dem Handy an.
Eine neue APK ist nur nötig, wenn sich etwas in `android-app-aufgaben/` ändert.

Anders als die PWA zeigt die APK die Benachrichtigungen über ein eigenes Android-Plug-in
(`patch_android.py` erzeugt es): lautlos, bleibt bis "Erledigt", kommt nach dem Wegwischen
nach 15 Minuten wieder, auch bei geschlossener App.

Gebaut wird sie von GitHub Actions (`.github/workflows/build-apk-aufgaben.yml`).
Download: Releases -> "Aufgaben-App (APK)" -> aufgaben.apk

Signiert wird mit demselben festen Debug-Schlüssel wie die anderen Apps
(`android-app/resources/debug.keystore`), damit Updates über die installierte App gehen.

## Widget
Das Widget "Aufgaben" zeigt bis zu 5 offene Aufgaben mit Haken zum Abhaken.
Hinzufügen: Startbildschirm oder Sperrbildschirm lange drücken -> Widgets -> Aufgaben.
Wiederholende Aufgaben rücken nach dem Abhaken auf den nächsten Termin und kommen dann wieder.

## Farben und Wiederkehr pro Aufgabe
Jede Aufgabe kann eine Farb-Kategorie (Rot, Blau, Grün, Gelb, Schwarz, Weiß) und eine eigene
Wiederkehr-Zeit nach dem Wegwischen haben. Die Benachrichtigung ist dann in der Farbe der Kategorie
(Inhaltsbereich; die Kopfzeile mit App-Name bestimmt Android), das Widget zeigt einen Farbpunkt.
