# Wunschliste als Android-App (APK)

Die App ist eine Hülle (Capacitor), die die Seite
https://erikmitknax.github.io/meine-pwa/wunschliste-pwa/ lädt.
Änderungen an `wunschliste-pwa/` kommen also ohne neue APK auf dem Handy an.
Eine neue APK ist nur nötig, wenn sich etwas in `android-app-wunschliste/` ändert.

Gebaut wird sie von GitHub Actions (`.github/workflows/build-apk-wunschliste.yml`).
Download: Releases -> "Wunschliste-App (APK)" -> wunschliste.apk

Signiert wird mit demselben festen Debug-Schlüssel wie das Trainingsbuch
(`android-app/resources/debug.keystore`), damit Updates über die installierte App gehen.
Die App braucht keine besonderen Berechtigungen (Bilder kommen über die Dateiauswahl).
