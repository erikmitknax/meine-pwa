# Ernährung als Android-App (APK)

Die App ist eine Hülle (Capacitor), die die Seite
https://erikmitknax.github.io/meine-pwa/ernaehrung-pwa/ lädt.
Änderungen an `ernaehrung-pwa/` kommen also ohne neue APK auf dem Handy an.
Eine neue APK ist nur nötig, wenn sich etwas in `android-app-ernaehrung/` ändert.

Gebaut wird sie von GitHub Actions (`.github/workflows/build-apk-ernaehrung.yml`).
Download: Releases -> "Ernaehrung-App (APK)" -> ernaehrung.apk

Signiert wird mit demselben festen Debug-Schlüssel wie das Trainingsbuch
(`android-app/resources/debug.keystore`), damit Updates über die installierte App gehen.
Die App braucht die Kamera-Berechtigung (Barcode-Scanner, Foto-KI).
