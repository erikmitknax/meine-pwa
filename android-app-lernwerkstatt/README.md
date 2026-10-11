# Lernwerkstatt als Android-App (APK)

Die App ist eine Huelle (Capacitor), die die Seite
https://erikmitknax.github.io/meine-pwa/lernwerkstatt-pwa/ laedt.
Updates der Seite kommen also ohne neue APK an. Eine neue APK ist nur noetig,
wenn sich etwas in `android-app-lernwerkstatt/` aendert.

Gebaut wird sie von GitHub Actions (`.github/workflows/build-apk-lernwerkstatt.yml`).
Download: Releases -> "Lernwerkstatt-App (APK)" -> lernwerkstatt.apk

Signiert wird mit demselben festen Debug-Schluessel wie das Trainingsbuch
(`android-app/resources/debug.keystore`), damit Updates ueber die installierte App gehen.

Zusaetzlich zu Capacitor sind zwei Plugins eingebunden: `@capacitor/filesystem` und `@capacitor/share`.
Damit oeffnet die App PDF-Unterlagen und erstellt Sicherungen ueber das Android-Teilen-Menue.
