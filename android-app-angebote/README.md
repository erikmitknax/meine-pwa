# Angebots-Radar als Android-App (APK)

Die App ist eine Hülle (Capacitor), die die Seite
https://erikmitknax.github.io/meine-pwa/angebote-pwa/ lädt.
Änderungen an `angebote-pwa/` kommen also ohne neue APK auf dem Handy an.
Eine neue APK ist nur nötig, wenn sich etwas in `android-app-angebote/` ändert.

Gebaut wird sie von GitHub Actions (`.github/workflows/build-apk-angebote.yml`).
Download: Releases -> "Angebots-Radar (APK)" -> angebote.apk

Signiert wird mit demselben festen Debug-Schlüssel wie das Trainingsbuch
(`android-app/resources/debug.keystore`), damit Updates über die installierte App gehen.

Berechtigung: nur Benachrichtigungen (Android 13+ fragt beim Einschalten in der App nach).
Dafür ist das Plug-in `@capacitor/local-notifications` eingebaut (Meldungen direkt auf dem Gerät, kein Server).
Das Symbol in der Statusleiste liegt in `resources/stat/` und wird von `patch_android.py` eingetragen.
