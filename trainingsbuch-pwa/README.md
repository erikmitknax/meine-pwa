# Trainingsbuch (PWA)

Läuft ohne Server und ohne Abhängigkeiten. Die Daten liegen im `localStorage` des Browsers (oder der Android-App).

## Dateien

| Datei | Aufgabe |
|---|---|
| `index.html` | Gerüst, lädt die Dateien unten |
| `app.css` | Aussehen, Schriften (`fonts/`, lokal gehostet, Lizenz in `fonts/LICENSE.txt`) |
| `logic.js` | Reine Logik ohne Oberfläche: Zahlen, CSV, Sicherung prüfen, Wiederherstellen planen, Übung umbenennen |
| `app.js` | Oberfläche, Speicher, Pausentimer, Navigation |
| `settings-theme.js` | Farben, Logo, Signal am Pausenende |
| `dropbox-backup.js` | Sicherung und Wiederherstellung über Dropbox (OAuth2 PKCE, ohne Server) |
| `sw.js` | Service Worker: Offline-Betrieb |

## Tests

Vom Repo-Root aus:

```
npm ci
npm test
```

Das sind Unit-Tests für `logic.js` und `sw.js` sowie zwei Durchläufe der ganzen App in jsdom (`tests/smoke/`). GitHub Actions führt sie bei jeder Änderung an `trainingsbuch-pwa/` aus.

## Sichern und Wiederherstellen

- **Daten → Sichern → Komplett-Sicherung (JSON)** enthält Trainings, Pläne, Übungshinweise und Pausenzeiten.
- **Daten → Wiederherstellen** liest diese Datei wieder ein: *Zusammenführen* (Vorhandenes bleibt, bei gleichem Training gewinnt die neuere Fassung) oder *Alles ersetzen*.
- Die CSV ist nur für Tabellenkalkulationen gedacht und enthält keine Pläne.

### Dropbox

Beim Sichern schreibt die App `trainingsbuch.csv` und `trainingsbuch-komplett.json` in den App-Ordner.

Fürs **Wiederherstellen aus Dropbox** braucht die Dropbox-App zusätzlich die Berechtigung `files.content.read`:

1. Dropbox App Console öffnen, die App wählen, Reiter *Permissions*.
2. `files.content.read` anhaken, *Submit*.
3. In der Trainingsbuch-App unter Daten *Trennen* und danach *Mit Dropbox verbinden* (nur so bekommt der Zugang die neue Berechtigung).

Das automatische Sichern startet auf einem Gerät erst, nachdem du dort einmal „Jetzt sichern“ oder „Aus Dropbox wiederherstellen“ benutzt hast. So überschreibt ein neues Gerät mit leerem Stand keine vorhandene Sicherung.

## Updates ausliefern

Der Service Worker holt HTML, JS und CSS immer zuerst aus dem Netz, bei Offline-Betrieb die zuletzt geladene Fassung. Ein Update kommt also beim nächsten Öffnen an, ohne etwas hochzuzählen. `VERSION` in `sw.js` nur ändern, wenn Dateien dazukommen oder wegfallen (dann auch die Liste `SHELL` anpassen, ein Test prüft sie).
