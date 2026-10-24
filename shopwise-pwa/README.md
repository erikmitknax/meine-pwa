# Shopwise

Einkaufslisten-App als PWA (Progressive Web App). Reines HTML/CSS/JavaScript, kein Build-Schritt nötig.

## Struktur

```
index.html              App-Shell mit Header und Tab-Leiste
manifest.webmanifest    PWA-Manifest (Name, Farben, Icons)
sw.js                   Service Worker (Offline-Cache, enthält VERSION)
bump-version.mjs        Zählt die Version hoch (sw.js + js/version.js)
css/styles.css          Design (Midnight-Blau, Off-White, Gold)
js/app.js               Einstiegspunkt
js/router.js            Hash-Router für die Tabs
js/updater.js           Prüft auf neue Version, zeigt Update-Banner
js/version.js           Aktuelle Versionsnummer
js/store.js             Speicher für Listen und Bestand (localStorage)
js/sync.js              Geräte-Abgleich über Firebase (Anmeldung + Firestore)
js/firebase-config.js   Firebase-Projekt (öffentliche Web-Konfiguration)
js/toast.js             Kurze Meldungen
js/dom.js               Helfer zum Erzeugen von Elementen
js/icons.js             Symbole für Kategorien
js/pages/               Eine Datei pro Seite
icons/                  App-Icons
```

## Seiten

| Tab           | Datei                        | Status       |
|---------------|------------------------------|--------------|
| Einkaufsliste | `js/pages/einkaufsliste.js`  | Listenübersicht; in jeder Liste Artikel hinzufügen, abhaken, löschen |
| Angebote      | `js/pages/angebote.js`       | Platzhalter  |
| Bestand       | `js/pages/bestand.js`        | Kategorie-Kacheln, darin Lebensmittel mit Menge/Maximum, Nachkauf-Meldung bei 20 % und 0 %; Kategorien bearbeitbar |
| Einstellungen | `js/pages/einstellungen.js`  | Platzhalter  |

## Lokal starten

Ein Service Worker braucht `http://localhost` (nicht `file://`):

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080` öffnen. In VS Code geht auch die Erweiterung „Live Server“.

## Geräte-Abgleich (Firebase)

Einstellungen → „Konto & Sicherung“: mit E-Mail und Passwort anmelden (dasselbe Konto wie bei FoodPro, Lernwerkstatt, Wunschliste).
Danach werden Listen, Artikel, Kategorien und Bestand live zwischen allen angemeldeten Geräten abgeglichen. Lokal zuerst: ohne Netz
läuft die App weiter und gleicht später ab. Dokumente liegen unter `users/<uid>/sw_lists | sw_litems | sw_cats | sw_stock`
(Regel `users/{uid}/**` reicht aus). Letzte Änderung gewinnt, Löschungen werden als Löschmarke abgeglichen.
Ein neues Gerät mit unberührten Startdaten übernimmt beim ersten Anmelden einfach den vorhandenen Stand.

## Updates / Versionen

Vor jedem Push mit Änderungen: `node bump-version.mjs patch` (oder `minor`, `major`, `1.2.3`).
Die installierte App prüft beim Start, beim Zurückkehren in die App und alle 15 Minuten, ob
eine neue Version da ist, und zeigt dann „Neue Version verfügbar → Aktualisieren“.
In den Einstellungen steht die Version und es gibt „Nach Updates suchen“.

Updates kommen nur an, wenn die App von der gehosteten Adresse installiert wurde
(nicht aus einem entpackten ZIP/lokal).
