# Changelog

## [2.1.1] – 2026-10-27

### Fehlerbehebungen
- Im Import-Assistenten blieb die Liste der erkannten Effizienzen (Schritt 3) leer, sobald die Seite „Ressourcen & Effizienzen“ einmal angezeigt worden war. Ursache: Die neue Effizienz-Tabelle hatte dieselbe interne Kennung wie diese Liste. Die Effizienzen wurden trotzdem richtig übernommen, nur nicht angezeigt.

### Technik
- Neuer Test: keine doppelten Element-Kennungen auf allen Seiten, Effizienzen im Import-Assistenten sichtbar (51 Tests).

## [2.1.0] – 2026-10-27

### Neuer Name
- Der Planner heißt jetzt **Ben's G7 STFC Progress Planner** – er ist ganz auf die 7★-Materialien (G7) zugeschnitten. Die Datei heißt `Bens_G7_STFC_Progress_Planner_v2.1.0.html`. Deine Daten übernimmt er wie gewohnt.

### Neue Funktionen (Phase 3)

**Effizienzen: Wirkung und Verlauf** (Seite Ressourcen & Effizienzen)
- Je Material Effizienz, Grundkosten, Kosten und Ersparnis (Kosten = Grundkosten ÷ (1 + Effizienz)).
- Ab 2.1 merkt sich der Planner die Effizienzen bei jedem Plan-Import. Ab dem zweiten Import: welche Effizienzen gestiegen oder gesunken sind und wie viele Tage das am Termin ausmacht.
- Wochenbericht: Zeile „Effizienzen diese Woche“.

### Neue Funktionen (Phase 2)

**Zieltermin prüfen** (Seite Was-wäre-wenn)
- Alle Zielpläne als Karten wie im Dashboard, jeder mit eigenem „Fertig bis“ und der Bewertung direkt auf der Karte; ein Klick zeigt die Details: je Material „fehlt“, „benötigt pro Tag“ (fehlt ÷ verbleibende Tage), „bisher pro Tag“ (realistisches Einkommen), Differenz und Bewertung.
- Bewertung mit den drei Prognose-Szenarien: reicht sicher (auch konservativ), reicht (realistisch), knapp (nur optimistisch), reicht nicht.
- Gesamtbewertung, verbleibende Tage und das kritische Material (kleinstes Verhältnis von bisherigem zu benötigtem Einkommen).
- Das Datum wird je Plan gespeichert. Bauzeit und Stellschrauben fließen nicht ein; vergangene Daten und fehlende Daten werden gekennzeichnet.

**Wochenbericht**
- Spalten „Ø Vorwoche“ und „Trend“: Einkommen pro Tag im Vergleich zur Vorwoche, „kein Vergleich“ wenn Daten fehlen.
- Ausblick auf die kommende Woche (nur in der laufenden Woche): welche Materialien voraussichtlich gedeckt werden, Engpass und nächster Engpass, Fertigstellung.


### Verbesserungen
- Ein Abschnitt zählt schon ab 20 Stunden Abstand zwischen zwei Exporten (vorher 24). Wer täglich etwa zur gleichen Zeit exportiert, verliert so keine Tage mehr, wenn es einmal 23 Stunden sind. Alle Hinweise nennen jetzt 20 Stunden.

### Fehlerbehebungen (Phase 1)
- Ein älterer Export im Einzelimport überschrieb den gespeicherten Bestand. Der Bestand folgt jetzt immer dem zeitlich neuesten Snapshot; der Einzelimport zeigt bei älteren Exporten den Hinweis „Älter als dein neuester Snapshot“.
- Nach dem Löschen eines Snapshots wurde der Bestand vom zuletzt eingefügten statt vom zeitlich neuesten Snapshot übernommen.
- Exporte mit leeren, negativen oder Text-Werten wurden still übernommen. Solche Dateien werden jetzt abgelehnt („Ungültiger Wert bei …“), die vorhandenen Daten bleiben unverändert.
- Bei extrem kleinem Zuwachs konnte die Prognose „Invalid Date“ zeigen. Termine über 1 Jahr erscheinen jetzt als „ca. Mai 2032 (~5,5 Jahre)“, über 100 Jahre als „nicht absehbar“ – in Prognose, Engpass-Karte, Stationspack, Was-wäre-wenn und Wochenbericht.

### Technik
- 18 neue Tests (Datenintegrität, Prognose-Grenzfälle, Zielplan-Konsistenz, Zieltermin, Wochenbericht, 20-Stunden-Abschnitte, Effizienzen), insgesamt 50. Die Tests laufen mit fester Zeitzone und damit überall gleich.
- GitHub-Action „Release erstellen“: baut den Planner, lässt alle Tests laufen und legt das Release mit Planner-Datei und Userguide an – auf Knopfdruck unter Actions.
- Ursache des gelegentlich fehlschlagenden Tests aus 2.0 behoben: Headless-Chromium verliert beim Neuladen einer lokalen Datei manchmal den Browser-Speicher. Der Test öffnet die Seite jetzt neu statt sie neu zu laden. Kein Fehler im Planner.

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
