function importPage() {
  document.querySelectorAll(".nav [data-tab]").forEach((b) => b.classList.remove("on"));
  ["nd", "nw", "nwk"].forEach((i) => $(i).classList.remove("on"));
  $("dash").classList.add("off");
  ["snapView", "wifView", "wkView"].forEach((i) => $(i).classList.remove("on"));
  $("impView").classList.add("on");
  $("ni").classList.add("on");
  renderImportPage();
}
function renderPackSummary() {
  const el = $("packSummary");
  if (!el) return;
  const pk = (s.packs || [])[0];
  if (packEmpty()) {
    el.innerHTML =
      _t("imp.pack_leer");
    return;
  }
  const n = Object.values(pk.contents || {}).filter((c) => +c.amount > 0).length;
  el.innerHTML =
    _t(n === 1 ? "imp.pack_gepflegt1" : "imp.pack_gepflegt", { n, p: fx(pk.priceEUR || 100) }) +
    (pk.validFrom ? _t("imp.gueltig_ab", { d: new Date(pk.validFrom).toLocaleDateString(LOC()) }) : "") +
    "<br>" +
    _t("imp.nach_ops_pruefen");
}
function renderImportPage() {
  const el = $("impPlans");
  if (!el) return;
  renderPackSummary();
  renderShipPacks();
  renderScan();
  renderUpdateBars();
  renderSetupToggle();
  const sn = [...s.snapshots]
    .filter((x) => x && x.values)
    .sort((a, b) => new Date(snapTime(b)) - new Date(snapTime(a)))
    .slice(0, 5);
  $("impSnaps").innerHTML = sn.length
    ? sn
        .map(
          (x) =>
            `<tr><td>${fdt(snapTime(x))}</td><td class="muted" style="white-space:normal">${escAttr(x.fileName || "")}</td></tr>`,
        )
        .join("")
    : `<tr><td class="muted">${_t("imp.kein_snapshot")}</td></tr>`;
  el.innerHTML = s.plans
    .map((p) => {
      const st = calcPlanStatus(p),
        imp = p.planData && p.planData.importedAt,
        why = isOutdated(p)
          ? '<div class="muted" style="font-size:11px;white-space:normal">' +
            _t("imp.erledigt", { list: escAttr(p.planData.outdatedBy.items.map((i) => i.name + " → " + i.level).join(", ")) }) +
            "</div>"
          : "";
      const btn =
        st === "review"
          ? `<button class="miniBtn" data-impm="${escAttr(p.id)}">${_t("imp.pruefen_bestaetigen")}</button>`
          : `<button class="miniBtn" data-impo="${escAttr(p.id)}">${st === "draft" ? _t("imp.importieren") : _t("imp.neu_importieren")}</button>`;
      return `<tr><td style="white-space:normal"><b>${escAttr(p.name)}</b>${p.isMain ? ` <span class="muted">· ${_t("common.hauptplan")}</span>` : ""}<div class="muted" style="font-size:11px">${isShip(p) ? shipLabel(p) : _t("common.level_von_bis", { a: p.start, b: p.target })}</div>${why}</td><td><span class="statusBadge status-${st}">${statusLabel(st)}</span></td><td>${imp ? fdt(imp) : "–"}</td><td>${btn}</td></tr>`;
    })
    .join("");
  el.querySelectorAll("[data-impo]").forEach(
    (b) =>
      (b.onclick = () => {
        s.active = b.dataset.impo;
        render();
        openManage();
        $("openOcrBtn").click();
      }),
  );
  el.querySelectorAll("[data-impm]").forEach(
    (b) =>
      (b.onclick = () => {
        s.active = b.dataset.impm;
        render();
        openManage();
      }),
  );
}
