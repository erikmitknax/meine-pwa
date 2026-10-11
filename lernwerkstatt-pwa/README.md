# Lernwerkstatt (PWA)

Karteikarten mit Wiederholungsplan, verschachtelten Themen (bis fünf Ebenen), frei mischbaren Lernstapeln,
PDF-Unterlagen pro Thema und Fokus-Timer. Läuft ohne Server und ohne Abhängigkeiten.
Die Daten liegen im Browser dieses Geräts (`localStorage`, PDFs in IndexedDB).

## Dateien

| Datei | Aufgabe |
|---|---|
| `index.html` | Die ganze App (Oberfläche, Logik, Speicher) in einer Datei |
| `manifest.webmanifest` | Installation auf dem Startbildschirm |
| `sw.js` | Service Worker: Offline-Betrieb, HTML zuerst aus dem Netz |
| `fonts/` | Schriften, lokal gehostet (Lizenz in `fonts/LICENSE.txt`) |
| `icons/` | App-Symbole |

## Sichern

**Bibliothek → Sicherung** erstellt eine JSON-Datei mit Themen, Stapeln, Karten und Lernstapeln samt Fortschritt.
In der Android-App öffnet sich dafür das Teilen-Menü (zum Beispiel Dropbox oder Dateien).
Dieselbe Seite spielt die Datei wieder ein, auch Sicherungen aus der Lernkartei.
PDF-Unterlagen sind nicht in der Sicherung enthalten und bleiben auf dem Gerät, auf dem sie hochgeladen wurden.

## Android

Die APK lädt diese Seite, siehe `android-app-lernwerkstatt/`.
