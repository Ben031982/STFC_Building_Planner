let impStep = 1;
function openImport() {
  resetOcr();
  renderEffTable();
  $("ocrModal").classList.add("on");
  setImpStep(1);
  renderImpSummary();
}
function setImpStep(n) {
  impStep = Math.max(1, Math.min(3, n));
  [1, 2, 3].forEach((k) => $("impPane" + k).classList.toggle("on", k === impStep));
  document
    .querySelectorAll(".impStepBtn")
    .forEach((b) => b.classList.toggle("on", +b.dataset.step === impStep));
  $("impPrev").disabled = impStep === 1;
  $("impNext").disabled = impStep === 3;
}
function setChip(id, cls, txt) {
  const c = $(id);
  c.className = "chip " + cls;
  c.textContent = txt;
  c.parentElement.classList.toggle("done", cls === "ok");
}
function renderImpSummary() {
  const p = s.plans.find((x) => x.id === managingPlanId);
  if (!p) return;
  syncImportInputs();
  const d = importDraft(p),
    old = p.planData || {},
    nd = d.planData;
  const up = $("upText").value.trim(),
    rs = $("resPasteText").value.trim(),
    ef = $("effText").value.trim();
  if (d.blds.length) setChip("impChip1", "ok", d.blds.length + " Gebäude erkannt");
  else if (up) setChip("impChip1", "err", "nicht erkannt");
  else if ((old.requiredBuildings || []).length) setChip("impChip1", "neutral", "aus letztem Import");
  else setChip("impChip1", "todo", "noch nicht eingefügt");
  const nRes = Object.values(ocrState.resources).filter(
      (v) => v && v.value !== "" && Number.isFinite(v.cost),
    ).length,
    nAs = Object.values(ocrState.resources).filter((v) => v && v.assumed).length;
  if (nRes)
    setChip(
      "impChip2",
      nRes === 12 ? "ok" : "todo",
      nRes - nAs + " Materialien" + (nAs ? " · " + nAs + " ohne Bedarf" : ""),
    );
  else if (rs) setChip("impChip2", "err", "nicht erkannt");
  else if (old.resources) setChip("impChip2", "neutral", "aus letztem Import");
  else setChip("impChip2", "todo", "noch nicht eingefügt");
  const nEff = Object.keys(ocrState.efficiencies).length,
    needEff = EFF_ALL.filter((k) => {
      const r = ocrState.resources[k];
      return k === "Σ-Construction Time"
        ? !(ocrState.construction && ocrState.construction.cost === 0)
        : !(r && r.cost === 0);
    }),
    missEff = needEff.filter((k) => !isNum(ocrState.efficiencies[k])).length;
  if (nEff)
    setChip(
      "impChip3",
      missEff ? "todo" : "ok",
      missEff ? nEff + " Effizienzen · " + missEff + " fehlen" : nEff + " Effizienzen · vollständig",
    );
  else if (ef) setChip("impChip3", "err", "nicht erkannt");
  else if (old.efficiencies) setChip("impChip3", "neutral", "aus letztem Import");
  else setChip("impChip3", "todo", "noch nicht eingefügt");
  const tmp = { ...p, start: d.start, target: d.target, planData: nd, confirmation: null },
    st = d.empty ? calcPlanStatus(p) : calcPlanStatus(tmp),
    ck = planChecks(tmp),
    t = nd.target;
  $("impTargetChip").textContent =
    "Ziel: " + (t ? escAttr(t.building) + " " : "") + d.start + " → " + d.target;
  const resN = MATERIALS.filter(
      (k) => nd.resources && nd.resources[k] && Number.isFinite(nd.resources[k].cost),
    ).length,
    effN = EFF_ALL.filter((k) => nd.efficiencies && Number.isFinite(nd.efficiencies[k])).length,
    mark = (ok, txt) => `<b style="color:${ok ? "#7aeab0" : "#ffd993"}">${txt}</b>`;
  $("impSummary").innerHTML =
    `<span class="muted">Plan</span><br><b>${escAttr(d.name)}</b><br><span class="muted">Ziel</span><br><b>${t ? escAttr(t.building) + " " : ""}${d.start} → ${d.target}</b><br><span class="muted">Pflichtgebäude</span><br>${mark(ck.requiredBuildings, (nd.requiredBuildings || []).length + (d.blds.length ? " (neu)" : (nd.requiredBuildings || []).length ? " (bisher)" : ""))}<br><span class="muted">Ressourcen</span><br>${mark(
      ck.resourceCosts,
      resN +
        " von 12" +
        (() => {
          const a = MATERIALS.filter(
            (k) => nd.resources && nd.resources[k] && nd.resources[k].cost === 0,
          ).length;
          return a ? " (" + a + " ohne Bedarf)" : "";
        })(),
    )}<br><span class="muted">Bauzeit</span><br>${mark(ck.buildTime, ck.buildTime ? "vorhanden" : "fehlt")}<br><span class="muted">Effizienzen</span><br>${mark(ck.efficiencies, effN + " von " + EFF_ALL.filter((k) => effNeeded(nd, k)).length + " nötigen")}<br><span class="muted">Status nach Übernahme</span><br><span class="statusBadge status-${d.empty ? st : importOutcome(p, d).keepConfirm ? "active" : st}" style="margin-top:3px">${statusLabel(d.empty ? st : importOutcome(p, d).keepConfirm ? "active" : st)}</span>`;
  const oc = d.empty ? null : importOutcome(p, d),
    prPrev = d.empty ? null : planProgress({ ...p, start: d.start, target: d.target, planData: nd });
  $("impNote").innerHTML =
    (oc && oc.keepConfirm
      ? `<div class="impWarn" style="border-color:#2f8f61;background:#12301f;margin-bottom:8px"><b>Fortschreibung:</b> gleiches Ziel, vollständig, keine neuen Gebäude – die Bestätigung bleibt erhalten.${prPrev ? " Fortschritt danach: " + prPrev.done + " von " + prPrev.total + " Stufen." : ""}</div>`
      : oc && oc.sameTarget && oc.newBuildings.length
        ? `<div class="impWarn" style="margin-bottom:8px">Neue Pflichtgebäude seit dem Ausgangsstand: ${oc.newBuildings.map(escAttr).join(", ")}. Bitte danach neu bestätigen.</div>`
        : "") +
    (oc && oc.keepConfirm
      ? ""
      : st === "stale"
        ? `<div class="impWarn"><b>Ziel passt nicht.</b> Die Gebäudedaten gehören zu ${t ? escAttr(t.building) + " " + t.start + " → " + t.target : "einem anderen Stand"}, der Plan hat das Ziel ${d.start} → ${d.target}. Bitte „Included upgrades“ für das aktuelle Ziel einfügen.</div>`
        : st === "review"
          ? '<div class="impWarn" style="border-color:#2f8f61;background:#12301f">Alles vollständig. Nach der Übernahme bitte unter „Plandaten verwalten“ bestätigen.</div>'
          : st === "incomplete"
            ? '<div class="impWarn">Du kannst schon übernehmen und fehlende Teile später nachreichen. Der Plan bleibt dann „Unvollständig“.</div>'
            : "");
  const seq = d.blds.length
    ? buildSequence({ planData: { requiredBuildings: nd.requiredBuildings, target: nd.target } })
    : [];
  $("impSeq").innerHTML = seq.length
    ? seqRowsHtml(seq)
    : '<tr><td class="muted">Noch keine Pflichtgebäude eingefügt.</td></tr>';
}
document.querySelectorAll(".impStepBtn").forEach((b) => (b.onclick = () => setImpStep(+b.dataset.step)));
$("impPrev").onclick = () => setImpStep(impStep - 1);
$("impNext").onclick = () => setImpStep(impStep + 1);
["upText", "resPasteText", "effText", "ocrTargetName", "ocrStartLevel", "ocrTargetLevel"].forEach((id) =>
  $(id).addEventListener("input", renderImpSummary),
);
$("parseResPaste").addEventListener("click", renderImpSummary);
$("ocrBuildings").addEventListener("input", renderImpSummary);
$("ocrResources").addEventListener("input", renderImpSummary);
$("ocrModal").onclick = (e) => {
  if (e.target === $("ocrModal")) {
    $("ocrModal").classList.remove("on");
    resetOcr();
  }
};
renderOcrTables();
$("resourceSelect").onchange = renderChart;
async function hash(t) {
  let b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function ingest(f) {
  try {
    pending = await parseExport(await f.text(), f.name);
    const h = pending.hash,
      values = pending.values;
    let dup = s.snapshots.some((x) => x.hash === h);
    $("dup").innerHTML =
      (pending.sigmaWarn && pending.sigmaWarn.length
        ? '<p class="red">Achtung: ' +
          pending.sigmaWarn.join(", ") +
          " – die Token-Zuordnung ist nicht eindeutig (zwei Einträge mit unterschiedlicher Anzahl). Wert bitte mit Spock's Club vergleichen.</p>"
        : "") +
      (Object.keys(pending.values).some((k) => k.startsWith("Σ"))
        ? ""
        : '<p class="muted">Σ-Werte konnten aus diesem Export nicht berechnet werden.</p>') +
      (dup ? '<p class="red">Duplikat, Import blockiert.</p>' : "") +
      (pending.exportedAt
        ? '<p class="muted">Exportstand laut Dateiname: ' + fdt(pending.exportedAt) + "</p>"
        : '<p class="red">Keine Exportzeit im Dateinamen gefunden. Als Zeitpunkt wird die Importzeit verwendet – Raten können dadurch ungenau werden. Am besten die Datei nicht umbenennen.</p>');
    $("preview").innerHTML = Object.entries(values)
      .map(([n, v]) => {
        const row = s.resources.find((r) => r[0] === n);
        if (!row) return `<tr><td>${n}</td><td>–</td><td>${fmt(v)}</td><td>–</td></tr>`;
        let o = row[1],
          d = v - o;
        return `<tr><td>${n}</td><td>${fmt(o)}</td><td>${fmt(v)}</td><td class="${d >= 0 ? "green" : "red"}">${d > 0 ? "+" : ""}${fmt(d)}</td></tr>`;
      })
      .join("");
    $("confirm").disabled = dup;
    {
      const ls = latestSnapshot(),
        keys = Object.keys(pending.values),
        same =
          !dup &&
          ls &&
          ls.values &&
          keys.every((k) => ls.values[k] === undefined || ls.values[k] === pending.values[k]) &&
          keys.some((k) => ls.values[k] !== undefined);
      const w = $("sameWarn");
      if (same) {
        w.style.display = "block";
        w.innerHTML =
          "<b>Achtung: identische Werte.</b> Dieser Export enthält exakt dieselben Ressourcen wie der Snapshot mit Exportstand " +
          fdt(snapTime(ls)) +
          '. Häufigste Ursache: Export vor der Synchronisierung in Spock\'s Club (Spiel öffnen, dann exportieren). Ein solcher Snapshot würde einen Abschnitt ohne Veränderung erzeugen und die Raten nach unten ziehen.<br><label style="display:inline-flex;gap:6px;margin-top:6px"><input type="checkbox" id="sameOk"> Trotzdem übernehmen (z. B. weil ich wirklich nicht gespielt habe)</label>';
        $("confirm").disabled = true;
        $("sameOk").onchange = (e) => {
          $("confirm").disabled = !e.target.checked;
        };
      } else {
        w.style.display = "none";
        w.innerHTML = "";
      }
    }
    $("modal").classList.add("on");
  } catch (e) {
    alert("Import abgelehnt: " + e.message);
  } finally {
    $("file").value = "";
  }
}
$("confirm").onclick = () => {
  s.snapshots.push(pending);
  s.resources = s.resources.map((r) =>
    pending.values[r[0]] !== undefined ? [r[0], pending.values[r[0]], r[2]] : r,
  );
  for (const [n, v] of Object.entries(pending.values))
    if (!s.resources.some((r) => r[0] === n)) s.resources.push([n, v, 0]);
  s.logs.push("Snapshot: " + pending.fileName);
  pending = null;
  $("modal").classList.remove("on");
  save();
};
$("cancel").onclick = () => {
  $("modal").classList.remove("on");
  pending = null;
};
$("file").onchange = (e) => ingestFiles([...e.target.files]);
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());
function snaps() {
  $("impView").classList.remove("on");
  $("ni").classList.remove("on");
  $("wifView").classList.remove("on");
  $("nw").classList.remove("on");
  $("wkView").classList.remove("on");
  $("nwk").classList.remove("on");
  document.querySelectorAll(".nav [data-tab]").forEach((b) => b.classList.remove("on"));
  $("dash").classList.add("off");
  $("snapView").classList.add("on");
  $("nd").classList.remove("on");
}
function dash() {
  $("impView").classList.remove("on");
  $("ni").classList.remove("on");
  $("dash").classList.remove("off");
  $("snapView").classList.remove("on");
  $("wifView").classList.remove("on");
  $("nw").classList.remove("on");
  $("wkView").classList.remove("on");
  $("nwk").classList.remove("on");
  $("nd").classList.add("on");
}
$("nd").onclick = $("back").onclick = () => {
  dash();
  setTab("ov");
};
document.querySelectorAll("#dashTabs [data-tab]").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
document.querySelectorAll(".nav [data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      dash();
      setTab(b.dataset.tab);
    }),
);
$("allStepsBtn").onclick = () => setTab("bld");
