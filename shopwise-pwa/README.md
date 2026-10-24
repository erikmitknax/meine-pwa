# Shopwise

Einkaufslisten-App als PWA (Progressive Web App). Reines HTML/CSS/JavaScript, kein Build-Schritt nötig.

## Struktur

```
index.html              App-Shell mit Header und Tab-Leiste
manifest.webmanifest    PWA-Manifest (Name, Farben, Icons)
sw.js                   Service Worker (Offline-Cache)
css/styles.css          Design (Midnight-Blau, Off-White, Gold)
js/app.js               Einstiegspunkt
js/router.js            Hash-Router für die Tabs
js/pages/               Eine Datei pro Seite
icons/                  App-Icons
```

## Seiten

| Tab           | Datei                        | Status       |
|---------------|------------------------------|--------------|
| Einkaufsliste | `js/pages/einkaufsliste.js`  | Listenübersicht (Listen anlegen/löschen) |
| Angebote      | `js/pages/angebote.js`       | Platzhalter  |
| Bestand       | `js/pages/bestand.js`        | Platzhalter  |
| Einstellungen | `js/pages/einstellungen.js`  | Platzhalter  |

## Lokal starten

Ein Service Worker braucht `http://localhost` (nicht `file://`):

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080` öffnen. In VS Code geht auch die Erweiterung „Live Server“.

## Hinweise

- Ändert sich eine Datei der App-Shell, in `sw.js` die Version `CACHE` erhöhen, sonst sehen Nutzer die alte Version.
- Liegt im Repo `meine-pwa` im Ordner `shopwise-pwa/` (wie die anderen Apps).
