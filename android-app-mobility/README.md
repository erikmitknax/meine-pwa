# Mobility Quest als Android-App (APK)

Die App ist eine Hülle (Capacitor), die die Seite
https://erikmitknax.github.io/meine-pwa/mobility-pwa/ lädt.
Änderungen an `mobility-pwa/` kommen also ohne neue APK auf dem Handy an.
Eine neue APK ist nur nötig, wenn sich etwas in `android-app-mobility/` ändert.

Gebaut wird sie von GitHub Actions (`.github/workflows/build-apk-mobility.yml`).
Download: https://github.com/erikmitknax/meine-pwa/releases/download/apk-mobility/mobility-quest.apk

Signiert wird mit demselben festen Debug-Schlüssel wie die anderen Apps
(`android-app/resources/debug.keystore`), damit Updates über die installierte App gehen.
