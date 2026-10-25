const TUT_KEY = "bens-stfc-tutorial",
  TUT = [
    [
      "Willkommen",
      "Willkommen im STFC Progress Planner",
      '<p>Der Planner zeigt dir, <b>wann du ein Gebäudeziel erreichst</b> – zum Beispiel Operations 76 – und <b>welches Material dich am meisten bremst</b>.</p><p>Er rechnet mit deinen echten Daten aus Spock\'s Club: deinem Ressourcenstand aus regelmäßigen Exporten und den Kosten deines Upgrade-Plans.</p><div class="tip">Alles bleibt in diesem Browser auf deinem PC. Die Datei braucht kein Internet und sendet keine Daten.</div>',
    ],
    [
      "Voraussetzungen",
      "Was du brauchst",
      "<ul><li>Ein Konto auf <b>next.spocks.club</b> (Anmeldung per E-Mail und Einmalpasswort).</li><li>Synchronisierung deines Spielkontos mit Spock's Club: am PC über den <b>STFC Community Mod</b> (Sync-Token auf der Seite „Syncing“ erstellen) oder über die <b>Spock's-Club-App</b>.</li><li><b>Chrome oder Edge</b> – nur dort klappen Ordnerzugriff für neue Exporte und automatische Backups.</li></ul><div class=\"tip\">Die Einrichtung Schritt für Schritt steht im Userguide (<b>STFC_Planner_Userguide.pdf</b>).</div>",
    ],
    [
      "Schritt 1 von 3",
      "Account-Snapshot einlesen",
      "<ol><li>Spiel starten, damit Spock's Club synchronisiert.</li><li>In Spock's Club: <b>Syncing › Export Data</b>, mindestens <b>Buildings</b> und <b>Resources</b> wählen, Format <b>JSON</b>, <b>Download Export</b>.</li><li>Hier im Planner: <b>„Neue Exporte einlesen“</b> (beim ersten Mal den Download-Ordner wählen) oder die Datei ins Importfeld ziehen.</li></ol><div class=\"tip\">Exportiere mehrmals pro Woche. Ab drei Abschnitten mit je mindestens 24 Stunden Abstand erstellt der Planner eine Prognose.</div>",
    ],
    [
      "Schritt 2 von 3",
      "Zielplan anlegen",
      '<ol><li><b>„+ Neuer Plan“</b>: Name, Start- und Ziellevel, zum Beispiel Operations 74 → 76.</li><li>In Spock\'s Club das Ziel in den <b>Upgrade Plan</b> legen – <b>immer nur ein Item</b>.</li><li>Die drei Texte kopieren: <b>Included upgrades</b>, <b>Total resources</b> (Copy-Button) und <b>Item costs &amp; efficiencies</b>.</li><li>Im Plan: <b>„Plandaten verwalten“ › „Upgrade-Plan importieren“</b>, einfügen, prüfen und bestätigen.</li></ol><div class="tip">Erst nach deiner Bestätigung ist ein Plan „Aktiv“ und wird berechnet. Nach jedem Bau importierst du die Texte neu.</div>',
    ],
    [
      "Schritt 3 von 3",
      "Daten sichern – und los",
      '<p>Klicke einmal auf <b>„Backup jetzt speichern“</b> und wähle einen Ordner. Danach sichert der Planner nach jedem Import automatisch.</p><p>Der Kasten <b>Datenpflege</b> in der Übersicht sagt dir, wenn etwas fällig ist – etwa ein neuer Export oder ein veralteter Plan.</p><div class="tip">Diese Einführung findest du jederzeit wieder im Menü unter <b>„? Einführung“</b>.</div>',
    ],
  ];
let tutI = 0;
function tutRender() {
  const t = TUT[tutI];
  $("tutStep").textContent = t[0].toUpperCase();
  $("tutTitle").textContent = t[1];
  $("tutBody").innerHTML = t[2];
  $("tutDots").innerHTML = TUT.map((_, i) => '<i class="' + (i === tutI ? "on" : "") + '"></i>').join("");
  $("tutPrev").style.visibility = tutI ? "visible" : "hidden";
  $("tutNext").textContent = tutI === TUT.length - 1 ? "Los geht's" : "Weiter";
  $("tutSkip").style.visibility = tutI === TUT.length - 1 ? "hidden" : "visible";
}
function tutOpen() {
  tutI = 0;
  tutRender();
  $("tutModal").classList.add("on");
  setTimeout(() => $("tutNext").focus(), 0);
}
function tutClose() {
  $("tutModal").classList.remove("on");
  try {
    localStorage.setItem(TUT_KEY, "1");
  } catch (_) {}
}
$("tutNext").onclick = () => {
  if (tutI < TUT.length - 1) {
    tutI++;
    tutRender();
  } else tutClose();
};
$("tutPrev").onclick = () => {
  if (tutI > 0) {
    tutI--;
    tutRender();
  }
};
$("tutSkip").onclick = tutClose;
$("ntut").onclick = tutOpen;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("tutModal").classList.contains("on")) tutClose();
});
(function () {
  let seen = false;
  try {
    seen = localStorage.getItem(TUT_KEY) === "1";
  } catch (_) {}
  if (!seen && !(s.snapshots || []).length) tutOpen();
})();
