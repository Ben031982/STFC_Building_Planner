#!/usr/bin/env python3
"""Gibt den CHANGELOG-Abschnitt einer Version als Release-Text aus.

    python tools/release_notes.py 2.1.0  > release_notes.md

Bricht ab, wenn es den Abschnitt nicht gibt oder er noch als „in Arbeit“ markiert ist –
so entsteht kein Release mit unfertigem Text.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def notes(version, text):
    m = re.search(r"^## \[" + re.escape(version) + r"\](.*)$", text, re.M)
    if not m:
        raise SystemExit(f"Kein Abschnitt „## [{version}]“ im CHANGELOG.md gefunden.")
    if "in Arbeit" in m.group(1):
        raise SystemExit(f"Der CHANGELOG-Abschnitt {version} ist noch als „in Arbeit“ markiert – bitte Datum eintragen.")
    rest = text[m.end():]
    nxt = re.search(r"^## \[", rest, re.M)
    body = (rest[: nxt.start()] if nxt else rest).strip()
    if not body:
        raise SystemExit(f"Der CHANGELOG-Abschnitt {version} ist leer.")
    return body + "\n\nDie Planner-Datei herunterladen, im selben Browser öffnen – deine Daten werden übernommen.\n"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Aufruf: python tools/release_notes.py <Version>")
    sys.stdout.write(notes(sys.argv[1], (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")))
