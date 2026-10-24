# Angebots-Radar

Zeigt die Wochenprospekte von ALDI Nord, REWE, PENNY, LIDL, EDEKA und KAUFLAND für Hamburg-Bergedorf,
gleicht sie mit deiner Vorratsliste ab (z. B. 10 × Haferflocken) und sagt dir, wo es gerade im Angebot ist
und wie viel Prozent du sparst. Läuft ohne Server, Daten bleiben auf dem Gerät.

**Stand jetzt:** Oberfläche, Abgleich, Prozent-Rechnung und Benachrichtigungen sind fertig.
Die Angebote sind noch **Beispieldaten** (`quelle.js`, die sich selbst auf die aktuelle Woche datieren).
Die echte Anbindung kommt als nächster Schritt – dafür gibt es genau eine Stelle: `Quelle.laden()` in `quelle.js`.

## Konto & Sicherung

Im Tab „Mehr“ kann man sich mit dem Firebase-Konto anmelden (gleiches Projekt und Konto wie bei den anderen Apps).
Dann werden Vorrat und Einstellungen unter `users/<uid>/ar_wishes` und `ar_settings` in Firestore gesichert und live zwischen Geräten abgeglichen
(letzte Änderung gewinnt). Ohne Anmeldung bleibt alles nur auf dem Gerät. Die bestehenden Firestore-Regeln (`users/{uid}/**`) reichen aus.
Welche Treffer schon gemeldet wurden, bleibt pro Gerät.

## Dateien

| Datei | Aufgabe |
|---|---|
| `index.html`, `app.css`, `app.js` | Oberfläche (4 Tabs: Treffer, Vorrat, Prospekte, Mehr) |
| `logik.js` | Abgleich Wunsch ↔ Angebot, Prozent, Preis pro kg/l, Limit pro Kunde, "neu?"-Prüfung (ohne Oberfläche, testbar) |
| `quelle.js` | **Datenquelle** – heute Beispieldaten, später echte Daten |
| `benachr.js` | Benachrichtigungen (App: lokal über Capacitor, Browser: Service Worker) |
| `sync.js` | Konto-Sicherung über Firebase (gleiches Konto wie FoodPro, Lernwerkstatt, Wunschliste) |
| `sw.js`, `manifest.webmanifest` | PWA / Offline |

## Wie die Schnittstelle aussehen sollte

Die App braucht eine einzige JSON-Datei (oder eine URL, die sie liefert). In `quelle.js` dann
`QUELLE_URL` setzen, fertig. Format:

```json
{
  "quelle": "json",
  "stand": "2026-10-26T06:00:00Z",
  "ort": { "name": "Hamburg-Bergedorf", "plz": "21029" },
  "laeden": [ { "id": "lidl", "name": "LIDL", "farbe": "#8A6D00" } ],
  "prospekte": [
    { "id": "lidl-2026-10-26", "laden": "lidl", "titel": "LIDL – Angebote",
      "gueltigVon": "2026-10-26", "gueltigBis": "2026-10-31",
      "url": "https://… (Prospekt-PDF oder -Seite, optional)" }
  ],
  "angebote": [
    { "id": "lidl-2026-10-26-0", "laden": "lidl", "artikel": "Haferflocken zart", "marke": "Eigenmarke",
      "menge": { "wert": 500, "einheit": "g" },
      "preis": 0.79, "normalpreis": 1.19, "limitProKunde": 12,
      "gueltigVon": "2026-10-26", "gueltigBis": "2026-10-31",
      "seite": 3, "prospektId": "lidl-2026-10-26" }
  ]
}
```

Pflichtfelder pro Angebot: `id`, `laden`, `artikel`, `preis`, `gueltigVon`, `gueltigBis`.
Einheiten für `menge.einheit`: `g`, `kg`, `ml`, `l`, `Stk`. `normalpreis` (Streichpreis) braucht es für die Prozent-Rechnung,
sonst nutzt die App den "üblichen Preis", den du beim Artikel einträgst.

### Woher kommen die Daten? (in der Reihenfolge, die ich empfehle)

1. **Prospekt-Portale mit Zugang** (kaufDA/Bonial, marktguru): bieten keine offene, freie API. Zugang gibt es nur über
   Partnerprogramme/Verträge. Wenn ihr so einen Zugang bekommt, ist das der sauberste Weg.
2. **Eigener kleiner Abruf-Job**: ein geplanter GitHub-Action-Lauf (z. B. täglich 6 Uhr) holt die Daten, wandelt sie in
   obiges Format um und legt `angebote.json` in dieses Repo. Die App liest sie über GitHub Pages. Kein Server, passt zu deinem Setup.
   Achtung: Webseiten automatisch auszulesen (Scraping) ist oft gegen die Nutzungsbedingungen – vorher prüfen.
3. **Von Hand / Import**: für den Anfang kann man `angebote.json` auch selbst pflegen oder aus Prospekt-PDFs erzeugen lassen.

Für "nur Bergedorf": PLZ 21029 (Bergedorf) bzw. 21033/21035 – die Auswahl der Märkte passiert in der Datenquelle,
die App zeigt nur, was in der JSON steht.

## Benachrichtigungen – was geht, was kommt

- **Jetzt:** Beim Öffnen der App wird geprüft, ob es neue Treffer über deiner Schwelle gibt (Standard 15 %, pro Artikel einstellbar) → Meldung.
  In der Android-App zusätzlich eine feste Wochenerinnerung Montag + Donnerstag 8:00 (wenn die neuen Prospekte starten).
- **Noch nicht:** Meldung, ohne dass du die App öffnest, sobald ein Angebot erscheint. Dafür gibt es zwei Wege:
  1. *Hintergrundjob in der Android-Hülle* (WorkManager): holt täglich `angebote.json`, vergleicht mit deiner Liste und meldet sich. Deine Liste bleibt auf dem Handy (Datenschutz). **Mein Vorschlag.**
  2. *Server-Push* (Firebase): braucht einen Server und deine Liste dort – mehr Aufwand, nur sinnvoll für mehrere Nutzer.

## Prozent-Rechnung

`Ersparnis % = (Vergleichspreis − Angebotspreis) / Vergleichspreis`. Vergleichspreis ist dein üblicher Preis pro Packung,
sonst der Normalpreis aus dem Prospekt. Bei Limit pro Kunde rechnet die App nur mit der erlaubten Menge und weist darauf hin.
Der Preis pro kg/l wird zusätzlich angezeigt, damit verschieden große Packungen vergleichbar sind.

Bekannte Grenzen des Abgleichs: Er sucht Wörter im Artikeltext (mit kleinen Synonymen wie Nudeln ↔ Spaghetti).
"Butter" findet auch "Buttermilch", wenn so ein Angebot vorkommt – dann den Suchbegriff genauer schreiben.

## Test

```
node --test angebote-pwa/tests/logik.test.js
```
Lokal ansehen: Ordner mit `python3 -m http.server` starten und `http://localhost:8000/` öffnen.
