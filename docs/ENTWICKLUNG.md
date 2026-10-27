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
tools/release_notes.py Release-Text aus dem CHANGELOG
.github/workflows/     GitHub-Action „Release erstellen“
tests/run_tests.py     automatische Tests (Playwright)
tests/fixtures/        erfundene Testdaten
```

Die JS-Dateien sind **klassische Skripte ohne Module**: Sie teilen sich einen gemeinsamen Gültigkeitsbereich, so wie früher in der einen Datei. Funktionen dürfen also Funktionen aus anderen Dateien aufrufen; Variablen mit `let`/`const` müssen aber in einer Datei mit kleinerer Nummer stehen, wenn sie beim Laden schon gebraucht werden.

| Datei | Inhalt |
|---|---|
| `00-assets` | Gebäude- und Schiffsbilder, Material- und Schiffsteil-IDs, Schiffsliste, Konstanten |
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
| `23-target-date` | Zieltermin prüfen mit Plan-Karten (Seite Was-wäre-wenn), Datum je Plan in `targetDate` |
| `24-efficiency` | Effizienzen: Wirkung und Verlauf (Seite Ressourcen & Effizienzen) |
| `25-ships` | Schiffe: Schiffsplan anlegen, Schiffswerft-Stufe (Gebäude 15) |
| `26-chain` | Schiffswerft-Plan (ab 3.1, vorher „Startet nach“): Kosten der Schiffswerft zuerst vom Bestand abziehen, Kasten in der Übersicht |
| `27-ship-packs` | Schiffs-Packs je Klasse: Daten, Editor-Anbindung, Daten & Import; `planPack(p)` liefert Stationspack oder Schiffs-Pack |

## Bauen

```
python tools/build.py
```

Ergebnis: `dist/Bens_G7_STFC_Progress_Planner_v<VERSION>.html`. Nötig ist nur Python 3.8 oder neuer.

## Testen

```
pip install playwright
python -m playwright install chromium
python tests/run_tests.py
```

Ohne Argument wird zuerst gebaut. Mit `python tests/run_tests.py datei.html` lässt sich jede fertige Datei prüfen, mit `-k name` nur ein Teil der Tests.

Die Tests decken ab: leerer Start mit Einführung, alle Seiten, Exporte einlesen, Plan importieren und Prognose, Backup und Wiederherstellen, Übernahme von Daten aus 1.0, die Speicher-Absicherung, die Zielerkennung (Operations als Voraussetzung, Planname bleibt), das kopierte Effizienz-Format, den Update-Assistenten, die Engpass-Karte, die Prognose-Qualität samt Gewichtung, die Einrichtungs-Karte, die Begriffserklärungen, die Exportsuche beim Öffnen, den Optik-Feinschliff (Symbole, Diagramm, Bewegung, Markierung der Engpass-Materialien) sowie ab 2.1 Datenintegrität (ältere, doppelte, ungültige und kaputte Exporte, Snapshot löschen, Importreihenfolge), Prognose-Grenzfälle (ein Snapshot, Stillstand, negativ, über 3 Jahre, Ausreißer) und Zielplan-Konsistenz (Zielwechsel, erledigte Bauten, Plan löschen), Zieltermin und Wochenbericht (Vorwoche, Ausblick), ab 3.0 Schiffe (Schiffsteile aus dem Export, Nachtragen, Schiffsplan, Neubau, keine Packs), Schiffswerft-Plan und „Schiffswerft fehlt“, ab 3.1 „Ziel erreicht“ und das Auflösen alter Gebäudeketten, ab 3.2 Schiffs-Packs und Startwerte im eigenen Build.

Hinweise für neue Tests: Die Uhr steht im Test fest (25.10.2026, 09:00 UTC) – Plan-IDs enthalten die Uhrzeit, für einen zweiten Plan die Uhr vorstellen (`second_plan`). Kein `reload()` nach dem Speichern: Headless-Chromium verliert dabei manchmal den localStorage einer lokalen Datei; stattdessen `reopen()`.

## Neue Version veröffentlichen

1. `src/VERSION` hochzählen (z. B. `2.1.0`).
2. Im `CHANGELOG.md` den Abschnitt `## [2.1.0] – <Datum>` fertig schreiben (nicht „in Arbeit“).
3. Userguide aktualisieren (`STFC_Planner_Userguide.pdf` im Hauptverzeichnis), die gebaute Datei aus `dist/` ins Hauptverzeichnis kopieren, die alte Version entfernen, README-Links anpassen. Alles auf `main` pushen.
4. Auf GitHub: **Actions › Release erstellen › Run workflow**. Die Action baut, lässt alle Tests laufen, setzt den Tag `v<VERSION>` und legt das Release mit Planner-Datei und Userguide an. Der Text kommt aus dem CHANGELOG-Abschnitt.

Die Action bricht ohne Release ab, wenn ein Test fehlschlägt, der Tag schon existiert oder der CHANGELOG-Abschnitt fehlt bzw. noch „in Arbeit“ ist.


## Eigener Build mit Startwerten

`python tools/build.py --seed pfad/zu/schiffs-packs.json --out pfad.html` setzt Startwerte für die Schiffs-Packs ein (Format wie `s.shipPacks`: je Klasse `name`, `priceEUR`, `validFrom`, `contents`). Sie greifen nur, solange noch kein Schiffs-Pack gepflegt ist. Die veröffentlichte Datei und die Release-Action bauen ohne `--seed`.
