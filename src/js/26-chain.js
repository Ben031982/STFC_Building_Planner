// „startet nach“ (ab 3.0): Ein Plan kann auf einen anderen folgen. Was die Vorgänger kosten, wird zuerst vom
// Bestand abgezogen; „fehlt“ heißt dann: Kosten der Vorgänger + eigene Kosten − Bestand.
// Pläne ohne Vorgänger rechnen wie bisher jeder für sich.
// Achtung: läuft schon beim ersten render() – keine let/const auf oberster Ebene benutzen.

function planById(id) {
  return s.plans.find((x) => x.id === id) || null;
}
// ab 3.1: Verkettung nur noch Schiff → Schiffswerft-Plan, der die nötige Stufe erreicht
// (Gebäudeketten zählten gemeinsame Vorstufen doppelt).
function validAfter(p) {
  const q = p && p.after ? planById(p.after) : null;
  return q && q !== p && isShip(p) && p.ship && isShipyardPlan(q, +p.ship.yard) ? q : null;
}
function chainAncestors(p) {
  const q = validAfter(p);
  return q ? [q] : [];
}
// Vorgemerkte Mengen je Material: Kosten des aktiven Schiffswerft-Plans
function chainReserved(p) {
  const anc = chainAncestors(p).filter((q) => calcPlanStatus(q) === "active");
  if (!anc.length) return null;
  const r = {};
  for (const q of anc)
    for (const [m, v] of Object.entries((q.planData || {}).resources || {})) if (isNum(v.cost)) r[m] = (r[m] || 0) + v.cost;
  return r;
}
// Mögliche Schiffswerft-Pläne für ein Schiff, das Schiffswerft `yard` braucht
function afterCandidates(p, yard) {
  return Number.isFinite(yard) ? s.plans.filter((q) => q !== p && isShipyardPlan(q, yard)) : [];
}
function afterOptionsHtml(p, sel, suggest, yard) {
  return (
    '<option value="">– keiner –</option>' +
    afterCandidates(p, yard)
      .map(
        (q) =>
          `<option value="${escAttr(q.id)}"${q.id === sel ? " selected" : ""}>${escAttr(q.name)}${q.id === suggest ? " (vorgeschlagen)" : ""}${calcPlanStatus(q) === "active" ? "" : " · noch nicht aktiv"}</option>`,
      )
      .join("")
  );
}
// Vorschlag: braucht ein Schiff eine höhere Schiffswerft, den passenden Schiffswerft-Plan als Vorgänger
function suggestAfterForYard(yard) {
  if (!Number.isFinite(yard)) return null;
  const y = shipyardLevel();
  if (y && y.level >= yard) return null;
  const hit = s.plans.filter((q) => isShipyardPlan(q, yard)).sort((a, b) => a.target - b.target)[0];
  return hit ? hit.id : null;
}
function afterHint(p, afterId, yard) {
  const q = afterId ? planById(afterId) : null,
    list = Number.isFinite(yard) ? "Zur Auswahl stehen nur Pläne, die Schiffswerft " + yard + " oder höher erreichen. " : "";
  if (!q)
    return Number.isFinite(yard) && !afterCandidates(p, yard).length
      ? "Es gibt noch keinen Plan für Schiffswerft " + yard + " oder höher. Ohne Schiffswerft-Plan rechnet das Schiff für sich allein."
      : list + "Ohne Schiffswerft-Plan rechnet das Schiff für sich allein.";
  return (
    list +
    (calcPlanStatus(q) === "active"
      ? "Was „" + q.name + "“ noch braucht, wird zuerst vom Bestand abgezogen; das Schiff rechnet mit dem Rest."
      : "„" + q.name + "“ ist noch nicht aktiv. Sobald er bestätigt ist, wird er zuerst vom Bestand abgezogen.")
  );
}

// ---------------------------------------------------------------- Dialoge
function chainDraftRender() {
  const sel = $("draftAfter");
  if (!sel) return;
  let suggest = null,
    yard = NaN;
  let ship = typeof draftType !== "undefined" && draftType === "ship";
  if (ship) {
    const sh = SHIPS.find((x) => x.key === $("draftShip").value);
    yard = $("draftShip").value === "other" ? +$("draftYard").value || NaN : sh ? sh.yard : NaN;
    suggest = suggestAfterForYard(yard);
  }
  // Gebäude haben keinen Vorgänger mehr (ab 3.1); reicht die Schiffswerft schon, braucht das Schiff keinen
  const yl = ship && Number.isFinite(yard) ? shipyardLevel() : null;
  if (yl && yl.level >= yard) ship = false;
  $("draftAfterLab").hidden = $("draftAfterHint").hidden = !ship;
  let cur = sel.dataset.touched ? sel.value : suggest || "";
  if (!ship || !afterCandidates(null, yard).some((q) => q.id === cur)) cur = ship && !sel.dataset.touched ? suggest || "" : "";
  sel.innerHTML = afterOptionsHtml(null, cur, suggest, yard);
  sel.value = cur;
  $("draftAfterHint").textContent = !ship
    ? ""
    : (suggest && cur === suggest ? "Vorgeschlagen, weil das Schiff eine höhere Schiffswerft braucht. " : "") + afterHint(null, cur, yard);
  // Schiffswerft zu niedrig und kein Schiffswerft-Plan gewählt: Hinweis, dass es kein Fertigdatum gibt
  const y = ship && Number.isFinite(yard) ? shipyardLevel() : null,
    yh = $("draftYardHint");
  yh.hidden = !(y && y.level < yard && !isShipyardPlan(planById(cur), yard));
  yh.innerHTML = yh.hidden
    ? ""
    : `Ohne Schiffswerft ${yard} zeigt der Planner kein Fertigdatum. Für ein Datum lege einen Plan <b>Schiffswerft ${yard}</b> an und wähle ihn unter „Schiffswerft-Plan“.`;
}
function chainManageFill(p) {
  const sel = $("editAfter");
  if (!sel) return;
  const yard = isShip(p) && p.ship ? +p.ship.yard : NaN,
    yl = Number.isFinite(yard) ? shipyardLevel() : null,
    ship = isShip(p) && p.ship && (!(yl && yl.level >= yard) || !!validAfter(p));
  $("editAfterLab").hidden = $("editAfterHint").hidden = !ship;
  const cur = validAfter(p) ? p.after : "";
  sel.innerHTML = afterOptionsHtml(p, cur, ship ? suggestAfterForYard(yard) : null, yard);
  sel.value = cur;
  $("editAfterHint").textContent = ship ? afterHint(p, sel.value, yard) : "";
  sel.onchange = () => ($("editAfterHint").textContent = afterHint(p, sel.value, yard));
}
$("draftAfter").onchange = () => {
  $("draftAfter").dataset.touched = "1";
  chainDraftRender();
};

// ---------------------------------------------------------------- Übersicht: Bestand nach Vorgänger
function renderChainPanel(p) {
  const el = $("chainPanel");
  if (!el) return;
  const anc = p ? chainAncestors(p) : [];
  if (!anc.length || !p.hasPlanData) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  const act = anc.filter((q) => calcPlanStatus(q) === "active"),
    names = anc.map((q) => q.name).join(" → "),
    resv = chainReserved(p) || {},
    fc = planForecast(p),
    rows = getPlanResources(p);
  el.hidden = false;
  el.innerHTML =
    `<h3>⛓ ${escAttr(p.name)} nach ${escAttr(names)}</h3>` +
    (act.length < anc.length
      ? `<p class="muted" style="font-size:12px;margin:2px 0 8px">Noch nicht aktiv und deshalb noch nicht abgezogen: ${anc
          .filter((q) => !act.includes(q))
          .map((q) => escAttr(q.name))
          .join(", ")}.</p>`
      : `<p class="muted" style="font-size:12px;margin:2px 0 8px">Was ${escAttr(act.map((q) => q.name).join(" und "))} kostet, ist vorgemerkt und steht diesem Plan erst danach zur Verfügung.</p>`) +
    `<div class="histWrap"><table class="histTable" style="width:100%"><thead><tr><th>Material</th><th>Bestand</th><th>Vorgemerkt</th><th>Verfügbar</th><th>Kosten</th><th>Fehlt (inkl. Schiffswerft)</th><th>Gedeckt ca.</th></tr></thead><tbody id="chainRows">` +
    rows
      .filter((r) => isNum(r[2]) && r[2] > 0)
      .map((r) => {
        const [m, cur, cost, miss] = r,
          v = resv[m] || 0,
          x = fc && fc.res.find((y) => y.m === m),
          eta = !x
            ? "–"
            : miss <= 0
              ? "gedeckt"
              : x.common
                ? "per Latinum"
                : x.status === "data"
                  ? "zu wenig Daten"
                  : fmtEta(x.eta.real, fc.base, x.far.real);
        return `<tr><td>${escAttr(m)}</td><td>${isNum(cur) ? fmt(cur) : "–"}</td><td class="${v ? "res" : ""}">${v ? fmt(v) : "–"}</td><td>${isNum(cur) ? fmt(Math.max(0, cur - v)) : "–"}</td><td>${fmt(cost)}</td><td>${miss > 0 ? fmt(miss) : "gedeckt"}</td><td>${eta}</td></tr>`;
      })
      .join("") +
    `</tbody></table></div><div class="chartNote" style="margin-top:8px">Fehlt = Kosten des Schiffswerft-Plans + Kosten des Schiffs − Bestand. Prognose, Engpass und Zieltermin des Schiffs rechnen mit diesem Wert. Ändern unter „Plandaten verwalten“ › „Schiffswerft-Plan“.</div>`;
}
