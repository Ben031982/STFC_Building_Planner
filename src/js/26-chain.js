// „startet nach“ (ab 3.0): Ein Plan kann auf einen anderen folgen. Was die Vorgänger kosten, wird zuerst vom
// Bestand abgezogen; „fehlt“ heißt dann: Kosten der Vorgänger + eigene Kosten − Bestand.
// Pläne ohne Vorgänger rechnen wie bisher jeder für sich.
// Achtung: läuft schon beim ersten render() – keine let/const auf oberster Ebene benutzen.

function planById(id) {
  return s.plans.find((x) => x.id === id) || null;
}
// Vorgänger in Reihenfolge (direkter zuerst), ohne Kreise
function chainAncestors(p) {
  const out = [],
    seen = new Set([p && p.id]);
  let q = p && p.after ? planById(p.after) : null;
  while (q && !seen.has(q.id)) {
    out.push(q);
    seen.add(q.id);
    q = q.after ? planById(q.after) : null;
  }
  return out;
}
// Vorgemerkte Mengen je Material: Summe der Kosten aller aktiven Vorgänger
function chainReserved(p) {
  const anc = chainAncestors(p).filter((q) => calcPlanStatus(q) === "active");
  if (!anc.length) return null;
  const r = {};
  for (const q of anc)
    for (const [m, v] of Object.entries((q.planData || {}).resources || {})) if (isNum(v.cost)) r[m] = (r[m] || 0) + v.cost;
  return r;
}
// Mögliche Vorgänger für p: alle anderen Pläne, die nicht selbst (über Umwege) auf p folgen
function afterCandidates(p) {
  return s.plans.filter((q) => q !== p && !(p && chainAncestors(q).includes(p)));
}
function afterOptionsHtml(p, sel, suggest) {
  return (
    '<option value="">– kein Vorgänger –</option>' +
    afterCandidates(p)
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
function afterHint(p, afterId) {
  const q = afterId ? planById(afterId) : null;
  if (!q) return "Ohne Vorgänger rechnet der Plan wie bisher für sich allein.";
  return calcPlanStatus(q) === "active"
    ? "Was „" + q.name + "“ noch braucht, wird zuerst vom Bestand abgezogen; dieser Plan rechnet mit dem Rest."
    : "„" + q.name + "“ ist noch nicht aktiv. Sobald er bestätigt ist, wird er zuerst vom Bestand abgezogen.";
}

// ---------------------------------------------------------------- Dialoge
function chainDraftRender() {
  const sel = $("draftAfter");
  if (!sel) return;
  let suggest = null,
    yard = NaN;
  const ship = typeof draftType !== "undefined" && draftType === "ship";
  if (ship) {
    const sh = SHIPS.find((x) => x.key === $("draftShip").value);
    yard = $("draftShip").value === "other" ? +$("draftYard").value || NaN : sh ? sh.yard : NaN;
    suggest = suggestAfterForYard(yard);
  }
  const cur = sel.dataset.touched ? sel.value : suggest || "";
  sel.innerHTML = afterOptionsHtml(null, cur, suggest);
  sel.value = cur;
  $("draftAfterHint").textContent =
    (suggest && cur === suggest ? "Vorgeschlagen, weil das Schiff eine höhere Schiffswerft braucht. " : "") + afterHint(null, cur);
  // Schiffswerft zu niedrig und kein Schiffswerft-Plan gewählt: Hinweis, dass es kein Fertigdatum gibt
  const y = ship && Number.isFinite(yard) ? shipyardLevel() : null,
    yh = $("draftYardHint");
  yh.hidden = !(y && y.level < yard && !isShipyardPlan(planById(cur), yard));
  yh.innerHTML = yh.hidden
    ? ""
    : `Ohne Schiffswerft ${yard} zeigt der Planner kein Fertigdatum. Für ein Datum lege einen Plan <b>Schiffswerft ${yard}</b> an und wähle ihn unter „Startet nach“.`;
}
function chainManageFill(p) {
  const sel = $("editAfter");
  if (!sel) return;
  sel.innerHTML = afterOptionsHtml(p, p.after || "", isShip(p) ? suggestAfterForYard(p.ship.yard) : null);
  sel.value = p.after && planById(p.after) ? p.after : "";
  $("editAfterHint").textContent = afterHint(p, sel.value);
  sel.onchange = () => ($("editAfterHint").textContent = afterHint(p, sel.value));
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
    `<h3>⛓ ${escAttr(p.name)} startet nach ${escAttr(names)}</h3>` +
    (act.length < anc.length
      ? `<p class="muted" style="font-size:12px;margin:2px 0 8px">Noch nicht aktiv und deshalb noch nicht abgezogen: ${anc
          .filter((q) => !act.includes(q))
          .map((q) => escAttr(q.name))
          .join(", ")}.</p>`
      : `<p class="muted" style="font-size:12px;margin:2px 0 8px">Was ${escAttr(act.map((q) => q.name).join(" und "))} kostet, ist vorgemerkt und steht diesem Plan erst danach zur Verfügung.</p>`) +
    `<div class="histWrap"><table class="histTable" style="width:100%"><thead><tr><th>Material</th><th>Bestand</th><th>Vorgemerkt</th><th>Verfügbar</th><th>Kosten</th><th>Fehlt (inkl. Vorgänger)</th><th>Gedeckt ca.</th></tr></thead><tbody id="chainRows">` +
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
    `</tbody></table></div><div class="chartNote" style="margin-top:8px">Fehlt = Kosten der Vorgänger + Kosten dieses Plans − Bestand. Prognose, Engpass und Zieltermin dieses Plans rechnen mit diesem Wert. Ändern unter „Plandaten verwalten“ › „Startet nach“.</div>`;
}
