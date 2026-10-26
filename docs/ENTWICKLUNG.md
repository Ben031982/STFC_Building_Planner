# Entwicklung

Der Planner wird als **eine einzige HTML-Datei** verteilt. Bearbeitet wird er aber im lesbaren Quellcode unter `src/`; ein Build-Skript setzt daraus die Datei zusammen.

## Aufbau

```
src/
  VERSION              Versionsnummer, z. B. 2.1.0
  index.html           Seitengerüst mit den Platzhaltern /* @@CSS@@ */ und /* @@JS@@ */
  css/NN-*.css         Stile, in Dateinamen-Reihenfolge zusammengefügt (Reihenfolge = Kaskade)
  js/NN-*.js           Skript, in Dateinamen-Reihenfolge zu einem Skript zusammengefügt
  assets/fonts/        Schriften (woff2), eingebunden über url("../assets/fonts/…")
  assets/img/          Gebäudebilder (webp), eingebunden über asset("img/…")
tools/build.py         Build: eine HTML-Datei nach dist/
tests/run_tests.py     automatische Tests (Playwright)
tests/fixtures/        erfundene Testdaten
```

Die JS-Dateien sind **klassische Skripte ohne Module**: Sie teilen sich einen gemeinsamen Gültigkeitsbereich, so wie früher in der einen Datei. Funktionen dürfen also Funktionen aus anderen Dateien aufrufen; Variablen mit `let`/`const` müssen aber in einer Datei mit kleinerer Nummer stehen, wenn sie beim Laden schon gebraucht werden.

| Datei | Inhalt |
|---|---|
| `00-assets` | Gebäudebilder, Material-IDs, Konstanten |
| `01-store` | Laden, Speichern, Migration, Speicher-Absicherung |
| `02-util` | Hilfsfunktionen, Σ-Werte, Snapshot-Zeiten |
| `03-plan-model` | Planressourcen, Fortschritt, Planhistorie |
| `04-forecast-packs` | Prognose (gewichtete Quantile, Qualität), Engpass, Packs, Engpass-Karte |
| `05-plan-order-sequence` | Reihenfolge von Plänen und Bauschritten |
| `06-import-page` | Seite „Daten & Import“ |
| `07-weekly` | Wochenbericht mit Vorwochen-Vergleich und Ausblick |
| `08-what-if` | Was-wäre-wenn |
| `09-outdated-events` | Veraltete Pläne, Ereignisse |
| `10-care` | Datenpflege-Hinweise |
| `11-export-scan` | Spock's-Exporte einlesen und prüfen, Bestand aus dem neuesten Snapshot |
| `12-backup` | Backups, Wiederherstellen, Belegungsanzeige |
| `13-build-sequence` | Bau-Reihenfolge berechnen |
| `14-dashboard` | Übersicht und Tabs |
| `15-chart` | Ressourcendiagramm mit Werteanzeige beim Darüberfahren |
| `16-plan-dialog-parsers` | Plandialog, Einlesen der Spock's-Texte |
| `17-import-wizard` | Import-Assistent in drei Schritten |
| `18-update-assistant` | Leiste „Pläne brauchen ein Update“, nacheinander durch den Import-Assistenten |
| `19-wiring` | Knöpfe verdrahten, Start |
| `20-tutorial` | Einführung beim ersten Öffnen |
| `21-nav` | Navigation |
| `22-setup-help` | Einrichtungs-Karte, Begriffserklärungen (ⓘ), Exportsuche beim Öffnen, Aufleuchten geänderter Kennzahlen |
| `23-target-date` | Zieltermin prüfen (Seite Was-wäre-wenn), Datum je Plan in `targetDate` |

## Bauen

```
python tools/build.py
```

Ergebnis: `dist/Bens_STFC_Progress_Planner_v<VERSION>.html`. Nötig ist nur Python 3.8 oder neuer.

## Testen

```
pip install playwright
python -m playwright install chromium
python tests/run_tests.py
```

Ohne Argument wird zuerst gebaut. Mit `python tests/run_tests.py datei.html` lässt sich jede fertige Datei prüfen, mit `-k name` nur ein Teil der Tests.

Die Tests decken ab: leerer Start mit Einführung, alle Seiten, Exporte einlesen, Plan importieren und Prognose, Backup und Wiederherstellen, Übernahme von Daten aus 1.0, die Speicher-Absicherung, die Zielerkennung (Operations als Voraussetzung, Planname bleibt), das kopierte Effizienz-Format, den Update-Assistenten, die Engpass-Karte, die Prognose-Qualität samt Gewichtung, die Einrichtungs-Karte, die Begriffserklärungen, die Exportsuche beim Öffnen, den Optik-Feinschliff (Symbole, Diagramm, Bewegung, Markierung der Engpass-Materialien) sowie ab 2.1 Datenintegrität (ältere, doppelte, ungültige und kaputte Exporte, Snapshot löschen, Importreihenfolge), Prognose-Grenzfälle (ein Snapshot, Stillstand, negativ, über 3 Jahre, Ausreißer) und Zielplan-Konsistenz (Zielwechsel, erledigte Bauten, Plan löschen), Zieltermin und Wochenbericht (Vorwoche, Ausblick).

Hinweise für neue Tests: Die Uhr steht im Test fest (25.10.2026, 09:00 UTC) – Plan-IDs enthalten die Uhrzeit, für einen zweiten Plan die Uhr vorstellen (`second_plan`). Kein `reload()` nach dem Speichern: Headless-Chromium verliert dabei manchmal den localStorage einer lokalen Datei; stattdessen `reopen()`.

## Neue Version veröffentlichen

1. `src/VERSION` hochzählen.
2. `python tests/run_tests.py`: alle Tests müssen bestehen.
3. Die Datei aus `dist/` ins Hauptverzeichnis kopieren, die alte Version entfernen, README-Links anpassen.
