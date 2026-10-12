# Trainingsbuch als Android-App (APK)

Die App ist eine Huelle (Capacitor), die die Seite
https://erikmitknax.github.io/meine-pwa/trainingsbuch-pwa/ laedt.
Updates der Seite kommen also ohne neue APK an. Eine neue APK ist nur noetig,
wenn sich etwas in `android-app/` aendert.

Gebaut wird sie von GitHub Actions (`.github/workflows/build-apk.yml`).
Download: Releases -> "Trainingsbuch-App (APK)" -> trainingsbuch.apk

## Countdown in der Benachrichtigung

`native/RestTimerPlugin.java` ist ein kleines eigenes Capacitor-Plugin ("RestTimer"). `patch_android.py` (Schritt 7)
kopiert es ins erzeugte Projekt, registriert es in `MainActivity` und legt das Symbol `ic_stat_timer` an.
Beim Abhaken eines Satzes zeigt die App eine laufende, stumme Benachrichtigung mit Countdown. Das System zaehlt
selbst herunter, auch bei gesperrtem Handy; am Pausenende verschwindet sie von allein. Das Signal kommt weiter vom
LocalNotifications-Plugin. Auf Android 16 kann sie als Live-Update in der Statusleiste erscheinen.
Dafuer ist **eine neue APK** noetig (die Seite allein reicht nicht). Ohne das Plugin passiert nichts, die App laeuft normal.
