// Schiffe (ab 3.0): Schiffsplan anlegen, Schiffswerft-Stufe, Anzeige-Hilfen.
// Achtung: Funktionen hier können schon beim ersten render() laufen – keine let/const auf oberster Ebene benutzen.

// Aktuelle Stufe der Schiffswerft: aus dem neuesten Export (Gebäude 15), sonst aus einem Gebäudeplan mit Shipyard
function shipyardLevel() {
  const ls = latestSnapshot(),
    v = ls && ls.bld ? ls.bld[SHIPYARD_BUILDING_ID] : undefined;
  if (Number.isFinite(+v) && v !== null && v !== undefined) return { level: +v, src: "Export" };
  for (const q of s.plans) {
    if (isShip(q)) continue;
    const cur = currentLevels(q),
      k = Object.keys(cur).find((n) => /^(shipyard|schiffswerft)$/i.test(n));
    if (k && Number.isFinite(cur[k])) return { level: cur[k], src: "Plan " + q.name };
  }
  return null;
}
function shipReqHtml(yard) {
  if (!Number.isFinite(yard)) return { cls: "unk", txt: "Nötige Schiffswerft-Stufe eintragen, dann prüft der Planner die Voraussetzung." };
  const y = shipyardLevel();
  if (!y) return { cls: "unk", txt: "Schiffswerft " + yard + " nötig – deine Stufe ist noch unbekannt (kommt mit dem nächsten Export)." };
  return y.level >= yard
    ? { cls: "ok", txt: "✔ Voraussetzung erfüllt: Schiffswerft " + yard + " (bei dir " + y.level + ", laut " + y.src + ")" }
    : { cls: "no", txt: "✖ Voraussetzung noch nicht erfüllt: Schiffswerft " + yard + " (bei dir " + y.level + ", laut " + y.src + ")" };
}

// ---------------------------------------------------------------- Dialog „Neuen Zielplan anlegen“
var draftType, draftCls;
function shipDraftReset() {
  draftType = "building";
  draftCls = "explorer";
  const sel = $("draftShip");
  if (!sel.options.length) {
    const groups = {};
    for (const sh of SHIPS) (groups[sh.yard] = groups[sh.yard] || []).push(sh);
    sel.innerHTML =
      Object.keys(groups)
        .sort((a, b) => a - b)
        .map(
          (y) =>
            `<optgroup label="Schiffswerft ${y}">` +
            groups[y]
              .map(
                (sh) =>
                  `<option value="${sh.key}">${escAttr(sh.name)} – ${sh.faction} · ${SHIP_CLASSES[sh.cls].label} · ab Schiffswerft ${sh.yard}</option>`,
              )
              .join("") +
            "</optgroup>",
        )
        .join("") + '<option value="other">Anderes Schiff …</option>';
  }
  sel.value = "praefortis";
  $("draftBuild").checked = false;
  $("draftShipName").value = "";
  $("draftYard").value = "";
  $("draftTierFrom").value = "";
  $("draftTierTo").value = "";
  shipDraftRender();
}
function shipDraftPick() {
  const sh = SHIPS.find((x) => x.key === $("draftShip").value);
  if (sh) draftCls = sh.cls;
  shipDraftRender();
}
function shipDraftRender() {
  const ship = draftType === "ship",
    other = $("draftShip").value === "other",
    sh = SHIPS.find((x) => x.key === $("draftShip").value);
  document.querySelectorAll("#draftType [data-dt]").forEach((b) => b.classList.toggle("on", b.dataset.dt === draftType));
  $("draftShipBox").hidden = !ship;
  $("draftBuildingBox").hidden = ship;
  $("draftYardLab").hidden = !other;
  $("draftCls").innerHTML = Object.entries(SHIP_CLASSES)
    .map(
      ([k, c]) =>
        `<button type="button" data-cls="${k}" class="${k === draftCls ? "on" : ""}"><img src="${ART["ship_" + k]}" alt="">${c.label}</button>`,
    )
    .join("");
  $("draftCls")
    .querySelectorAll("[data-cls]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          draftCls = b.dataset.cls;
          shipDraftRender();
        }),
    );
  const build = $("draftBuild").checked;
  $("draftTierFrom").disabled = build;
  if (build) $("draftTierFrom").value = "";
  $("draftTierFrom").placeholder = build ? "Neubau" : "z. B. 7";
  const yard = other ? +$("draftYard").value || NaN : sh ? sh.yard : NaN,
    r = ship ? shipReqHtml(yard) : null;
  $("draftReq").className = "dReq " + (r ? r.cls : "");
  $("draftReq").textContent = r ? r.txt : "";
  if (typeof chainDraftRender === "function") chainDraftRender();
  $("draftHint").textContent = ship
    ? "Danach wie gewohnt importieren: im Spock's-Upgrade-Planer das Schiffsziel anlegen und „Total resources“ sowie „Cost efficiencies“ kopieren."
    : "Der Plan bleibt gesperrt, bis Pflichtgebäude, Ressourcenbedarf, Bauzeit und Effizienzen vollständig vorliegen und bestätigt wurden.";
}
// Gibt true zurück, wenn ein Schiffsplan angelegt wurde (sonst übernimmt der Gebäude-Dialog)
function shipDraftSave() {
  if (draftType !== "ship") return false;
  const key = $("draftShip").value,
    sh = SHIPS.find((x) => x.key === key),
    build = $("draftBuild").checked,
    from = build ? 0 : +$("draftTierFrom").value,
    to = +$("draftTierTo").value,
    yard = sh ? sh.yard : +$("draftYard").value || null,
    shipName = sh ? sh.name : $("draftShipName").value.trim(),
    name = $("draftShipName").value.trim() || (shipName ? shipName + " T" + to : "");
  if (!shipName || !Number.isFinite(to) || to < 1 || (!build && (!Number.isFinite(from) || from < 1 || to <= from))) {
    alert(
      key === "other" && !shipName
        ? "Bitte einen Plannamen für das Schiff eingeben."
        : build
          ? "Bitte das Ziel-Tier eingeben."
          : "Bitte Tier von und Tier bis eingeben (Ziel höher als Start).",
    );
    return true;
  }
  const id = "plan-" + Date.now();
  s.plans.push({
    id,
    name,
    kind: "ship",
    art: "auto",
    type: "ship",
    ship: { key: sh ? key : "other", name: shipName, cls: draftCls, yard, build },
    start: from,
    target: to,
    done: 0,
    total: 1,
    isMain: !s.plans.length,
    sources: [],
    planData: null,
    confirmation: null,
    ...($("draftAfter").value ? { after: $("draftAfter").value } : {}),
  });
  s.active = id;
  s.logs.push("Schiffsplan als Entwurf angelegt: " + name);
  closeDraft();
  save();
  return true;
}
document.querySelectorAll("#draftType [data-dt]").forEach(
  (b) =>
    (b.onclick = () => {
      draftType = b.dataset.dt;
      shipDraftRender();
    }),
);
$("draftShip").onchange = shipDraftPick;
$("draftBuild").onchange = shipDraftRender;
$("draftYard").oninput = shipDraftRender;

// ---------------------------------------------------------------- Schiffswerft fehlt (ab 3.0)
// Gebäudeplan für die Schiffswerft, der mindestens die nötige Stufe erreicht
function isShipyardPlan(q, yard) {
  if (!q || isShip(q)) return false;
  const t = (q.planData || {}).target,
    n = String((t && t.building) || q.name).toLowerCase();
  return /shipyard|schiffswerft/.test(n) && +q.target >= yard;
}
// Schiff, dessen Schiffswerft laut Export zu niedrig ist und kein aktiver Schiffswerft-Plan als Vorgänger:
// dann gibt es kein Fertigdatum, nur „Ressourcen gedeckt am …“. Unbekannte Stufe → keine Sperre.
function shipYardBlock(p) {
  if (!isShip(p) || !p.ship) return null;
  const yard = +p.ship.yard;
  if (!Number.isFinite(yard) || yard <= 0) return null;
  const y = shipyardLevel();
  if (!y || y.level >= yard) return null;
  const yp = (typeof chainAncestors === "function" ? chainAncestors(p) : []).filter((q) => isShipyardPlan(q, yard));
  if (yp.some((q) => calcPlanStatus(q) === "active")) return null;
  return { yard, have: y.level, pending: yp[0] || null };
}
function shipYardHint(b) {
  return b.pending
    ? "Ein Fertigdatum gibt es, sobald „" + b.pending.name + "“ bestätigt ist"
    : "Für ein Fertigdatum: Plan „Schiffswerft " + b.yard + "“ anlegen und unter „Startet nach“ wählen";
}
