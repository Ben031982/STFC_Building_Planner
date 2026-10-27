#!/usr/bin/env python3
"""Baut aus src/ die eine, offline lauffähige HTML-Datei des Planners.

    python tools/build.py                 # Version aus src/VERSION, Ausgabe nach dist/
    python tools/build.py --version 1.0   # andere Versionsnummer (z. B. für Vergleiche)
    python tools/build.py --out pfad.html

Was der Build macht:
  * src/css/*.css in Dateinamen-Reihenfolge zusammenfügen,
    url("../assets/...") wird als data:-URI eingebettet (Schriften),
  * src/js/*.js in Dateinamen-Reihenfolge zusammenfügen,
    asset("img/...") wird als data:-URI-String eingebettet (Gebäudebilder),
  * beides in src/index.html an /* @@CSS@@ */ und /* @@JS@@ */ einsetzen,
  * __VERSION__ überall durch die Versionsnummer ersetzen.

Nur Python 3.8+ nötig, keine weiteren Pakete.
"""
import argparse
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
MIME = {
    ".woff2": "font/woff2",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
}


def data_uri(path: pathlib.Path) -> str:
    if not path.is_file():
        sys.exit(f"Build-Fehler: Datei fehlt: {path}")
    mime = MIME.get(path.suffix.lower())
    if not mime:
        sys.exit(f"Build-Fehler: unbekannter Dateityp: {path}")
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def read_parts(folder: str, pattern: str) -> str:
    files = sorted((SRC / folder).glob(pattern))
    if not files:
        sys.exit(f"Build-Fehler: keine Dateien in src/{folder}")
    return "\n".join(f.read_text(encoding="utf-8").rstrip("\n") for f in files) + "\n"


def build(version: str) -> str:
    css = read_parts("css", "*.css")
    css = re.sub(
        r'url\("(\.\./assets/[^"]+)"\)',
        lambda m: "url(" + data_uri((SRC / "css" / m.group(1)).resolve()) + ")",
        css,
    )
    js = read_parts("js", "*.js")
    js = re.sub(
        r'asset\("([^"]+)"\)',
        lambda m: '"' + data_uri(SRC / "assets" / m.group(1)) + '"',
        js,
    )
    if re.search(r"</script", js, re.I):
        sys.exit("Build-Fehler: '</script' im JavaScript würde die Datei zerbrechen")
    html = (SRC / "index.html").read_text(encoding="utf-8")
    for marker in ("/* @@CSS@@ */", "/* @@JS@@ */"):
        if html.count(marker) != 1:
            sys.exit(f"Build-Fehler: Platzhalter {marker} fehlt oder doppelt in index.html")
    html = html.replace("/* @@CSS@@ */", css).replace("/* @@JS@@ */", js)
    html = html.replace("__VERSION__", version)
    # Kein Leerraum nach </body>: der HTML-Parser würde ihn als Text in <body> einhängen.
    html = re.sub(r"</body>\s*</html>\s*$", "</body></html>", html)
    return html


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version", help="Versionsnummer (Standard: Inhalt von src/VERSION)")
    ap.add_argument("--out", help="Zieldatei (Standard: dist/Bens_G7_STFC_Progress_Planner_v<Version>.html)")
    a = ap.parse_args()
    version = a.version or (SRC / "VERSION").read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"\d+(\.\d+)+", version):
        sys.exit(f"Build-Fehler: ungültige Version {version!r}")
    out = pathlib.Path(a.out) if a.out else ROOT / "dist" / f"Bens_G7_STFC_Progress_Planner_v{version}.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    html = build(version)
    out.write_text(html, encoding="utf-8", newline="\n")
    print(f"gebaut: {out}  ({len(html.encode('utf-8')) / 1024:.0f} KB, Version {version})")


if __name__ == "__main__":
    main()
