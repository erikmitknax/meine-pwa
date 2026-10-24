# Shopwise als Android-App (APK)

Die App ist eine Hülle (Capacitor), die https://erikmitknax.github.io/meine-pwa/shopwise-pwa/ lädt.
Änderungen an `shopwise-pwa/` (inklusive der automatischen Updates) kommen also ohne neue APK auf dem Handy an.
Eine neue APK ist nur nötig, wenn sich etwas in `android-app-shopwise/` ändert.

Gebaut wird sie von GitHub Actions (`.github/workflows/build-apk-shopwise.yml`).
Download: Releases → „Shopwise-App (APK)“ → shopwise.apk

Signiert wird mit demselben festen Debug-Schlüssel wie die anderen Apps (`android-app/resources/debug.keystore`),
damit Updates über die installierte App gehen. Keine besonderen Berechtigungen nötig.
