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

## Einstellungen

Zahnrad oben rechts. Alle Abschnitte sind eingeklappt und lassen sich einzeln aufklappen: Training (Satzdauer), Design, Logo, Signal am Pausenende, Sicherung & Wiederherstellung, Dropbox-Backup, CSV importieren, Übungen verwalten. Auf der Startseite führt „Sicherung & Import“ direkt zum aufgeklappten Abschnitt Sicherung.

## Satz fertig, Restzeit und Trainingsdauer

- Jeder Satz hat rechts einen **Haken**. Sind Gewicht oder Wiederholungen noch leer, übernimmt der Haken die grauen Werte vom letzten Training.
- Mit dem Haken startet automatisch die **Pause** der Übung (Zeit am Zeitfeld). Nach dem allerletzten Satz startet keine mehr. Erneutes Tippen nimmt den Haken zurück.
- Der **Balken oben** zeigt „Noch ca. 16 Min“, die Endzeit und die bisherige Dauer. Berechnet wird: offene Sätze × Satzdauer + deren Pausen (ohne die nach dem letzten Satz) + die gerade laufende Pause. Vor dem ersten Haken steht dort die geplante Dauer. Die Satzdauer (Standard 45 s) steht unter Einstellungen → Training.
- Beim Speichern wird die **tatsächliche Dauer** abgelegt: vom ersten abgehakten Satz (minus eine Satzdauer) bis zum letzten abgehakten Satz, als `dur` in Sekunden am Training. Sie steht im Verlauf und in der Komplett-Sicherung. Ohne Haken wird keine Dauer gespeichert. Beim Bearbeiten bleibt sie erhalten. Die CSV enthält sie nicht.

## Fortschritt

Je Übung ein Diagramm mit **allen Sätzen**: jedes Training steht gleichmäßig verteilt auf der Achse, jeder Satz ist ein Punkt, der Top-Satz ist der große Ring und die Linie verbindet die Top-Sätze. Die gestrichelte Linie ist der Trend. Antippen eines Trainings zeigt darunter alle seine Sätze. Darüber steht die Entwicklung seit dem ersten angezeigten Training (Pfeil, Differenz, Prozent). „Letzte 12 / Letzte 30 / Alle“ begrenzt den Zeitraum. Weitere Kennzahlen: Top-Gewicht, Volumen, Beste Wdh, Wdh gesamt.

## Sichern und Wiederherstellen

- **Einstellungen → Sicherung & Wiederherstellung → Komplett-Sicherung (JSON)** enthält Trainings, Pläne, Übungshinweise und Pausenzeiten.
- Dort liest **Wiederherstellen** diese Datei wieder ein: *Zusammenführen* (Vorhandenes bleibt, bei gleichem Training gewinnt die neuere Fassung) oder *Alles ersetzen*.
- Die CSV ist nur für Tabellenkalkulationen gedacht und enthält keine Pläne.

### Dropbox (Einstellungen → Dropbox-Backup)

Beim Sichern schreibt die App `trainingsbuch.csv` und `trainingsbuch-komplett.json` in den App-Ordner.

Einmal einrichten, in der Dropbox App Console (dropbox.com/developers/apps):

1. Reiter *Settings* → *OAuth 2* → *Redirect URIs*: genau die Adresse eintragen, die die App im Abschnitt anzeigt (zum Beispiel `https://erikmitknax.github.io/meine-pwa/trainingsbuch-pwa/`, mit Schrägstrich am Ende, ohne `index.html`), dann *Add*. Ohne diesen Eintrag zeigt Dropbox „Invalid redirect_uri“. Die App hat dafür einen Kopieren-Knopf.
2. Fürs **Wiederherstellen aus Dropbox** zusätzlich Reiter *Permissions*: `files.content.read` anhaken, *Submit*. Danach in der App *Trennen* und *Mit Dropbox verbinden* (nur so bekommt der Zugang die neue Berechtigung).

Das automatische Sichern startet auf einem Gerät erst, nachdem du dort einmal „Jetzt sichern“ oder „Aus Dropbox wiederherstellen“ benutzt hast. So überschreibt ein neues Gerät mit leerem Stand keine vorhandene Sicherung.

## Updates ausliefern

Der Service Worker holt HTML, JS und CSS immer zuerst aus dem Netz, bei Offline-Betrieb die zuletzt geladene Fassung. Ein Update kommt also beim nächsten Öffnen an, ohne etwas hochzuzählen. `VERSION` in `sw.js` nur ändern, wenn Dateien dazukommen oder wegfallen (dann auch die Liste `SHELL` anpassen, ein Test prüft sie).
