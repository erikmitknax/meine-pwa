# Trainingsbuch als App aufs Handy

## 1. Online stellen (GitHub Pages, kostenlos)
1. Auf github.com ein Konto anlegen und ein neues Repository erstellen, z. B. `trainingsbuch` (Public).
2. „Add file" → „Upload files" → alle Dateien aus diesem Ordner hochladen → „Commit changes".
3. Settings → Pages → Source: „Deploy from a branch", Branch `main`, Ordner `/ (root)` → Save.
4. Nach ca. 1 Minute läuft die App unter `https://DEINNAME.github.io/trainingsbuch/`.

## 2. Aufs Handy
- **iPhone:** Link in Safari öffnen → Teilen → „Zum Home-Bildschirm".
- **Android:** Link in Chrome öffnen → ⋮ → „App installieren".

Beim ersten Start lädt die App deine bisherigen Trainings aus `seed.json`.
Danach kannst du `seed.json` aus dem Repository löschen (das Repository ist öffentlich).

## 3. Updates
Neue Dateien ins Repository hochladen (oder Claude macht das, wenn GitHub verbunden ist)
und in `sw.js` die Zeile `const VERSION = 'tb-v1'` hochzählen.
Beim nächsten Öffnen mit Internet lädt die App die neue Version. Nicht neu installieren,
deine Daten bleiben erhalten.

## 4. Deine Daten
Sie liegen nur auf dem Handy. Wenn du die App vom Home-Bildschirm löschst, sind sie weg.
Darum ab und zu unter „Import & Export" ein Backup als CSV speichern.
