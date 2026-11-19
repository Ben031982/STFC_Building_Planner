let impStep = 1;
function openImport() {
  resetOcr();
  renderEffTable();
  $("ocrModal").classList.add("on");
  // ab 3.0: Schiffe brauchen keine „Included upgrades“ – direkt bei den Ressourcen beginnen
  const ship = isShip(s.plans.find((x) => x.id === managingPlanId));
  document.querySelector('.impStepBtn[data-step="1"]').hidden = ship;
  // Schritte für Schiffe neu nummerieren: 2 Schritte statt 3
  const n = ship ? 2 : 3,
    no = (k) => (ship ? k - 1 : k);
  document.querySelector("#ocrModal .impRail .impSmall").textContent = _t("iw.schritte", { n });
  [2, 3].forEach((k) => {
    document.querySelector(`.impStepBtn[data-step="${k}"] .impNum`).textContent = no(k);
    $("impPane" + k).querySelector(".impSmall").textContent = _t("iw.schritt_von", { k: no(k), n });
  });
  setImpStep(ship ? 2 : 1);
  renderImpSummary();
}
function impMinStep() {
  return isShip(s.plans.find((x) => x.id === managingPlanId)) ? 2 : 1;
}
function setImpStep(n) {
  impStep = Math.max(impMinStep(), Math.min(3, n));
  [1, 2, 3].forEach((k) => $("impPane" + k).classList.toggle("on", k === impStep));
  document
    .querySelectorAll(".impStepBtn")
    .forEach((b) => b.classList.toggle("on", +b.dataset.step === impStep));
  $("impPrev").disabled = impStep === impMinStep();
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
  const ship = isShip(p),
    mats = planMaterials(p);
  if (ship) setChip("impChip1", "ok", _t("iw.schiff_nicht_noetig"));
  else if (d.blds.length) setChip("impChip1", "ok", _t("iw.geb_erkannt", { n: d.blds.length }));
  else if (up) setChip("impChip1", "err", _t("iw.nicht_erkannt"));
  else if ((old.requiredBuildings || []).length) setChip("impChip1", "neutral", _t("iw.aus_letztem"));
  else setChip("impChip1", "todo", _t("iw.noch_nicht"));
  const nRes = Object.values(ocrState.resources).filter(
      (v) => v && v.value !== "" && Number.isFinite(v.cost),
    ).length,
    nAs = Object.values(ocrState.resources).filter((v) => v && v.assumed).length;
  if (nRes)
    setChip(
      "impChip2",
      nRes >= mats.length ? "ok" : "todo",
      _t("iw.materialien", { n: nRes - nAs }) + (nAs ? _t("iw.ohne_bedarf", { n: nAs }) : ""),
    );
  else if (rs) setChip("impChip2", "err", _t("iw.nicht_erkannt"));
  else if (old.resources) setChip("impChip2", "neutral", _t("iw.aus_letztem"));
  else setChip("impChip2", "todo", _t("iw.noch_nicht"));
  const nEff = Object.keys(ocrState.efficiencies).length,
    needEff = planEffKeys(p).filter((k) => {
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
      missEff ? _t("iw.eff_fehlen", { n: nEff, m: missEff }) : _t("iw.eff_voll", { n: nEff }),
    );
  else if (ef) setChip("impChip3", "err", _t("iw.nicht_erkannt"));
  else if (old.efficiencies) setChip("impChip3", "neutral", _t("iw.aus_letztem"));
  else setChip("impChip3", "todo", _t("iw.noch_nicht"));
  const tmp = { ...p, start: d.start, target: d.target, planData: nd, confirmation: null },
    st = d.empty ? calcPlanStatus(p) : calcPlanStatus(tmp),
    ck = planChecks(tmp),
    t = nd.target;
  $("impTargetChip").textContent = ship
    ? _t("iw.ziel", { v: p.ship.name + " · " + shipLabel(p) })
    : _t("iw.ziel", { v: (t ? escAttr(t.building) + " " : "") + d.start + " → " + d.target });
  const resN = mats.filter(
      (k) => nd.resources && nd.resources[k] && Number.isFinite(nd.resources[k].cost),
    ).length,
    effN = planEffKeys(p).filter((k) => nd.efficiencies && Number.isFinite(nd.efficiencies[k])).length,
    mark = (ok, txt) => `<b style="color:${ok ? "#7aeab0" : "#ffd993"}">${txt}</b>`;
  $("impSummary").innerHTML =
    `<span class="muted">${_t("iw.sum_plan")}</span><br><b>${escAttr(d.name)}</b><br><span class="muted">${_t("ev.th_ziel")}</span><br><b>${ship ? escAttr(p.ship.name + " · " + shipLabel(p)) : (t ? escAttr(t.building) + " " : "") + d.start + " → " + d.target}</b><br>${ship ? "" : `<span class="muted">${_t("seq.pflichtgebaeude")}</span><br>${mark(ck.requiredBuildings, (nd.requiredBuildings || []).length + (d.blds.length ? _t("iw.neu") : (nd.requiredBuildings || []).length ? _t("iw.bisher") : ""))}<br>`}<span class="muted">${_t("dash.ressourcen")}</span><br>${mark(
      ck.resourceCosts,
      _t("dash.von", { a: resN, b: mats.length }) +
        (() => {
          const a = mats.filter(
            (k) => nd.resources && nd.resources[k] && nd.resources[k].cost === 0,
          ).length;
          return a ? _t("iw.ohne_bedarf2", { n: a }) : "";
        })(),
    )}<br>${ship ? "" : `<span class="muted">${_t("dash.bauzeit")}</span><br>${mark(ck.buildTime, ck.buildTime ? _t("pd.vorhanden") : _t("exp.fehlt_wert"))}<br>`}<span class="muted">${_t("dash.effizienzen")}</span><br>${mark(ck.efficiencies, _t("iw.von_noetigen", { a: effN, b: planEffKeys(p).filter((k) => effNeeded(nd, k)).length }))}<br><span class="muted">${_t("iw.status_nach")}</span><br><span class="statusBadge status-${d.empty ? st : importOutcome(p, d).keepConfirm ? "active" : st}" style="margin-top:3px">${statusLabel(d.empty ? st : importOutcome(p, d).keepConfirm ? "active" : st)}</span>`;
  const oc = d.empty ? null : importOutcome(p, d),
    prPrev = d.empty ? null : planProgress({ ...p, start: d.start, target: d.target, planData: nd });
  $("impNote").innerHTML =
    (oc && oc.keepConfirm
      ? `<div class="impWarn" style="border-color:#2f8f61;background:#12301f;margin-bottom:8px"><b>${_t("iw.fort")}</b> ${_t("iw.fort_text")}${prPrev ? _t("iw.fort_danach", { a: prPrev.done, b: prPrev.total }) : ""}</div>`
      : oc && oc.sameTarget && oc.newBuildings.length
        ? `<div class="impWarn" style="margin-bottom:8px">${_t("iw.neue_pflicht", { list: oc.newBuildings.map(escAttr).join(", ") })}</div>`
        : "") +
    (oc && oc.keepConfirm
      ? ""
      : st === "stale"
        ? `<div class="impWarn"><b>${_t("iw.ziel_passt")}</b> ${_t("iw.ziel_passt_text", { alt: t ? escAttr(t.building) + " " + t.start + " → " + t.target : _t("pd.anderer_stand"), a: d.start, b: d.target })}</div>`
        : st === "review"
          ? `<div class="impWarn" style="border-color:#2f8f61;background:#12301f">${_t("iw.alles_voll")}</div>`
          : st === "incomplete"
            ? `<div class="impWarn">${_t("iw.nachreichen")}</div>`
            : "");
  const seq = d.blds.length
    ? buildSequence({ planData: { requiredBuildings: nd.requiredBuildings, target: nd.target } })
    : [];
  $("impSeq").innerHTML = seq.length
    ? seqRowsHtml(seq)
    : `<tr><td class="muted">${_t("iw.keine_pflicht")}</td></tr>`;
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
function isOlderThanLatest(sn) {
  const ls = latestSnapshot();
  return !!ls && new Date(snapTime(sn)) < new Date(snapTime(ls));
}
async function ingest(f) {
  try {
    pending = await parseExport(await f.text(), f.name);
    const h = pending.hash,
      values = pending.values;
    let dup = s.snapshots.some((x) => x.hash === h);
    if (dup) {
      // ab 3.0: Schiffsteile in den schon vorhandenen Snapshot nachtragen
      const old = s.snapshots.find((x) => x.hash === h);
      if (snapNeedsParts(old) && backfillParts(old, values)) partsBackfillDone(1);
    }
    $("dup").innerHTML =
      (pending.sigmaWarn && pending.sigmaWarn.length
        ? `<p class="red">${_t("iw.token", { list: pending.sigmaWarn.join(", ") })}</p>`
        : "") +
      (Object.keys(pending.values).some((k) => k.startsWith("Σ"))
        ? ""
        : `<p class="muted">${_t("iw.sigma_nicht")}</p>`) +
      (dup ? `<p class="red">${_t("iw.duplikat")}</p>` : "") +
      (!dup && isOlderThanLatest(pending)
        ? `<p class="muted" id="olderHint">${_t("iw.aelter", { d: fdt(snapTime(latestSnapshot())) })}</p>`
        : "") +
      (pending.exportedAt
        ? `<p class="muted">${_t("iw.exportstand", { d: fdt(pending.exportedAt) })}</p>`
        : `<p class="red">${_t("iw.keine_zeit")}</p>`);
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
          `<b>${_t("iw.identisch")}</b> ${_t("iw.identisch_text", { d: fdt(snapTime(ls)) })}<br><label style="display:inline-flex;gap:6px;margin-top:6px"><input type="checkbox" id="sameOk"> ${_t("iw.trotzdem")}</label>`;
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
    alert(_t("iw.abgelehnt", { e: e.message }));
  } finally {
    $("file").value = "";
  }
}
$("confirm").onclick = () => {
  s.snapshots.push(pending);
  syncResources();
  s.logs.push(_t("exp.log_snap", { f: pending.fileName }));
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
