# Changelog

## [2.0] – 2026-10-25

### Neue Funktionen

**Engpass-Karte als Entscheidungshilfe**
- Zeigt die drei Materialien, die laut Prognose zuletzt gedeckt sind, mit Balken und „gedeckt in N T. · Datum“.
- Fußzeile „Mit 1 Stationspack: fertig N Tage früher (Datum) – danach bremst X“, in ganzen Kalendertagen gerechnet. Liegen mehrere Materialien gleichauf: „kein ganzer Tag früher“. Keine Kaufempfehlung.
- Bei leerem Stationspack Hinweis mit Knopf „Stationspack pflegen“.
- Ohne Prognose bleibt die bisherige Anzeige („vorläufig“), die Karte ist dann schmal.

**Prognose-Qualität**
- Plakette VORLÄUFIG / BRAUCHBAR / STABIL neben „Voraussichtlich fertig“, darunter Abschnitte, Zeitraum und was zur nächsten Stufe fehlt.
- Schwellen: brauchbar ab 6 Abschnitten über 14 Tage, stabil ab 10 Abschnitten über 28 Tage.
- Erklärender Kasten unter Prognose & Packs.

**Update-Assistent**
- Leiste „N Pläne brauchen ein Update“ in der Übersicht und unter Daten & Import.
- Ein Klick öffnet nacheinander den geführten Import für jeden veralteten Plan („UPDATE 1 VON 2“), einzelne Pläne lassen sich überspringen.

**Einrichtung**
- Ersetzt die Willkommens-Karte: fünf Schritte (Export, Zielplan aktiv, Stationspack, Backup, Prognose), die der Planner selbst abhakt.
- Der nächste Schritt ist hervorgehoben und hat einen eigenen Knopf.
- Ausblenden „bis zum nächsten Öffnen“ oder „dauerhaft“; unter Daten & Import „Einrichtung wieder einblenden“.

**Begriffe erklärt**
- ⓘ mit Kurzerklärung an Zielplan/Hauptplan, Engpass, Prognose-Qualität, Abschnitt, Snapshot und Plan-Status.

**Exportsuche beim Öffnen**
- Erlaubt der Browser den Zugriff auf den Export-Ordner, bietet der Planner neue Exporte beim Öffnen direkt an. Ohne neue Exporte keine Meldung.

**Speicher-Absicherung**
- Speicherfehler erzeugen eine rote Leiste mit „Backup jetzt speichern“, statt still zu scheitern.
- Belegung des Browser-Speichers unter Daten & Import › Sicherung (ca. 5 MB).
- Ab 70 % Hinweis in der Datenpflege und Punkt an „Daten & Import“.
- Wiederherstellen bricht bei vollem Speicher mit Meldung ab; die bisherigen Daten bleiben unverändert.

### Verbesserungen

**Prognose**
- Abschnitte werden nach ihrer Länge gewichtet: längere zählen mehr als kurze. Bei gleich langen Abschnitten ergibt sich dasselbe wie in 1.0.

**Zielerkennung beim Import**
- Steht Operations auf derselben Stufe wie ein anderes Gebäude, gilt Operations als Voraussetzung und das andere Gebäude als Ziel (z. B. Academy 76).
- Bei mehreren möglichen Zielgebäuden Vorschlag passend zum Plannamen (auch deutsche Namen) und Warnung.
- Der Planname bleibt beim Import erhalten; nur eine Levelzahl am Ende folgt einem neuen Ziellevel („Operations 75“ → „Operations 76“).

**Effizienzen**
- Texte mit der Überschrift „Cost efficiencies“ werden ohne Warnung gelesen.

**Optik**
- Liniensymbole in der Navigation und in den Kennzahl-Karten.
- Diagramm mit Hilfslinie und Werten beim Darüberfahren (Datum, Bestand, Veränderung pro Tag).
- Seiten blenden kurz ein, Balken füllen sich beim Öffnen, geänderte Kennzahlen leuchten einmal auf. Bei „Animationen reduzieren“ im System keine Bewegung.
- Die zwei weiteren Engpass-Materialien sind in der Ressourcentabelle dezent markiert.
- „Exporte-Ordner“ und „Ordner ändern“ stehen nebeneinander.

**Hinweise**
- Hinweis, dass Werte aus Spock's Club vom Spiel abweichen können, unter den Kennzahlen und auf der Seite Ressourcen.
- Stationspack-Hinweise verweisen auf „Daten & Import › Stationspack“ statt auf den alten Menüpunkt „Packs“.

### Fehlerbehebungen
- Das Ereignisprotokoll wuchs unbegrenzt; jetzt auf 200 Einträge begrenzt.
- Speicherfehler blieben ohne Meldung.
- Bei Zielen wie Akademie 76 wurde Operations als Zielgebäude erkannt und der Plan umbenannt.

### Technik
- Lesbarer, aufgeteilter Quellcode unter `src/`; `tools/build.py` erzeugt daraus weiter genau eine Offline-HTML-Datei.
- Automatische Testsuite mit 32 Tests (`tests/run_tests.py`, Playwright, erfundene Testdaten).
- Entwickler-Anleitung in `docs/ENTWICKLUNG.md`.

### Dokumentation
- Userguide 2.0 (20 Seiten) mit neuen Screenshots und Abschnitten zu allen neuen Funktionen.
- README mit „Neu in Version 2.0“, neuen Screenshots und Abschnitt „Für Entwickler“.

### Kompatibilität
- Daten aus 1.0 werden automatisch übernommen – die neue Datei im selben Browser öffnen.

## [1.0] – 2026-10-24

Erste veröffentlichte Version.
