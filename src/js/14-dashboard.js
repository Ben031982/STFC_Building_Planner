let dashTab = "ov";
function setTab(t) {
  dashTab = t;
  document
    .querySelectorAll("#dashTabs [data-tab]")
    .forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  ["ov", "bld", "res", "fc", "hist", "log"].forEach((k) => $("pane-" + k).classList.toggle("on", k === t));
  if (typeof navSync === "function") setTimeout(navSync, 0);
  document.querySelector(".hero").classList.toggle("slim", t !== "ov");
  const cp = $("chartPanel");
  if (t === "hist") {
    if (cp.parentElement !== $("pane-hist")) $("iwPanel").after(cp);
  } else if (cp.parentElement === $("pane-hist")) $("pane-ov").querySelector(".bottom > div").prepend(cp);
  document.querySelectorAll(".nav [data-tab]").forEach((b) => b.classList.remove("on"));
  if (t !== "ov") {
    const nb = document.querySelector('.nav [data-tab="' + t + '"]');
    if (nb) {
      $("nd").classList.remove("on");
      nb.classList.add("on");
    }
  } else if (!$("snapView").classList.contains("on")) $("nd").classList.add("on");
  renderChart();
}
function renderNextCard(p) {
  const card = $("nextCard");
  if (p.status === "active") {
    card.style.display = "none";
    return;
  }
  card.style.display = "block";
  const c = planChecks(p),
    parts = [
      [
        "requiredBuildings",
        _t("seq.pflichtgebaeude"),
        _t("dash.n_gebaeude", { n: ((p.planData && p.planData.requiredBuildings) || []).length }),
      ],
      ["resourceCosts", _t("dash.ressourcen"), _t("dash.aus_total")],
      ["buildTime", _t("dash.bauzeit"), _t("dash.aus_total")],
      ["efficiencies", _t("dash.effizienzen"), _t("dash.fuer_alle_mat")],
      ["confirm", _t("dash.bestaetigung"), _t("dash.durch_dich")],
    ];
  const T = {
    draft: [_t("dash.next_draft"), _t("care.upgrade_importieren")],
    incomplete: [_t("dash.next_incomplete"), _t("care.upgrade_importieren")],
    review: [_t("dash.next_review"), _t("dash.pruefen_bestaetigen")],
    stale: isOutdated(p)
      ? [_t("dash.next_outdated"), _t("care.upgrade_importieren")]
      : [_t("dash.next_stale"), _t("imp.neu_importieren")],
  }[p.status] || ["", ""];
  $("nextTitle").textContent = T[0];
  $("nextBtn").textContent = T[1];
  $("nextBtn").onclick = () => {
    openManage();
    if (p.status !== "review") openImport();
  };
  $("nextSteps").innerHTML = parts
    .filter(([k]) => !isShip(p) || !["requiredBuildings", "buildTime"].includes(k))
    .map(([k, l, sub]) => {
      const done =
        k === "confirm" ? false : k === "requiredBuildings" ? c.requiredBuildings && !c.targetMismatch : c[k];
      return `<div class="nextStep ${done ? "done" : "open"}"><span class="chip ${done ? "ok" : "todo"}">${done ? _t("dash.chip_erledigt") : _t("common.offen")}</span><b>${l}</b><span class="muted">${done ? sub : k === "requiredBuildings" && c.targetMismatch ? _t("dash.passt_nicht") : _t("dash.fehlt_noch")}</span></div>`;
    })
    .join("");
}
function fmtDuration(sec) {
  sec = Math.max(0, Math.round(+sec || 0));
  const y = Math.floor(sec / 31536000),
    d = Math.floor((sec % 31536000) / 86400),
    h = Math.floor((sec % 86400) / 3600),
    m = Math.floor((sec % 3600) / 60);
  return y
    ? _t("dur.yd", { y, d })
    : d
      ? _t("dur.dh", { d, h })
      : h
        ? _t("dur.hm", { h, m })
        : _t("dur.m", { m });
}
function resGroups(rows) {
  return [
    [_t("dash.grp_sigma"), (r) => /^Σ/.test(r[0])],
    ["7★ RARE", (r) => /Rare/.test(r[0])],
    ["7★ UNCOMMON", (r) => /Uncommon/.test(r[0])],
    [_t("dash.grp_common"), (r) => /Common/.test(r[0])],
  ]
    .map(([h, f]) => [h, rows.filter(f)])
    .filter((x) => x[1].length);
}
function resTableHtml(p, rows, bn, eff) {
  if (!rows.length) return "";
  const fc = eff ? null : planForecast(p),
    rate = (m) => {
      const f = fc && fc.res.find((x) => x.m === m);
      return f && f.st && f.st.n >= FC_MIN && f.st.real != null
        ? (f.st.real > 0 ? "+" : "") + fmt(f.st.real)
        : "–";
    };
  const slow = new Set(((p.hasPlanData && bottleneckRows(p)) || { rows: [] }).rows.map((x) => x.m));
  let h = "";
  for (const [g, rs] of resGroups(rows)) {
    h += `<tr class="resGrp"><td colspan="6">${g}</td></tr>`;
    for (const r of rs) {
      const m = r[3],
        pc = (r[5] || r[2]) > 0 ? Math.min(100, Math.round((100 * r[1]) / (r[5] || r[2]))) : 100,
        com = /Common/.test(r[0]),
        isB = !!(bn && !bn.none && bn.name === r[0]),
        e = eff ? ((p.planData || {}).efficiencies || {})[r[0]] : null;
      h += `<tr class="${com ? "resCommon" : ""}${isB ? " resBn" : slow.has(r[0]) ? " resSlow" : ""}"><td>${r[0]}${isB ? ` <span class="bnTag">${_t("dash.engpass_tag")}</span>` : ""}</td><td>${fmt(r[1])}</td><td>${fmt(r[2])}</td><td class="${m ? (isB ? "amber" : "") : "green"}">${m ? fmt(m) : _t("common.gedeckt")}</td><td>${eff ? (Number.isFinite(e) ? fx(e) + " %" : "–") : rate(r[0])}</td><td><span class="prog${m ? "" : " done"}"><i style="width:${pc}%"></i></span> ${pc}%</td></tr>`;
    }
  }
  return h;
}
function renderEmpty() {
  $("plans").innerHTML =
    `<div class="noPlansHint">${_t("dash.keine_plaene")}</div>`;
  $("lastImport").textContent = s.snapshots.length
    ? _t("dash.letzter_import", { d: fdt(s.snapshots.at(-1).createdAt) }) +
      (latestSnapshot() ? "\n" + _t("dash.neuester_export", { d: fdt(snapTime(latestSnapshot())) }) : "")
    : _t("imp.kein_snapshot");
  $("log").innerHTML = s.logs.slice(-4).reverse().map(escAttr).join("<br>");
  renderSnaps();
  renderBackup();
  renderScan();
  renderCare();
  renderImportPage();
}
function render() {
  renderUpdateBars();
  renderSetup();
  $("dash").classList.toggle("noPlans", !s.plans.length);
  if (!s.plans.length) {
    renderEmpty();
    return;
  }
  let p = s.plans.find((x) => x.id === s.active) || s.plans[0];
  p.status = calcPlanStatus(p);
  p.hasPlanData = p.status === "active";
  let planRows = getPlanResources(p),
    bottleneck = planBottleneck(p, planRows);
  $("plans").innerHTML =
    s.plans
      .map(
        (x, xi) =>
          `<article class="plan ${x.id === p.id ? "active" : ""}" data-id="${x.id}" draggable="true"><div class="cardMove"><button data-mv="-1" data-mid="${x.id}" aria-label="${_t("seq.nach_links")}"${xi === 0 ? " disabled" : ""}>◀</button><button data-mv="1" data-mid="${x.id}" aria-label="${_t("seq.nach_rechts")}"${xi === s.plans.length - 1 ? " disabled" : ""}>▶</button></div><div class="pt"><img src="${ART[artKey(x)]}"><div><h3>${escAttr(x.name)}${x.isMain ? `<span class="mainStar"> ★ ${_t("common.hauptplan")}</span>` : ""}</h3><span class="muted">${isShip(x) ? shipLabel(x) : _t("common.level_von_bis", { a: x.start, b: x.target })}</span>${validAfter(x) ? `<br><span class="chain">⛓ ${_t("dash.nach", { name: escAttr(validAfter(x).name) })}</span>` : ""}</div></div>${(() => {
            if (isShip(x)) return `<div class="bar"><i style="width:0%"></i></div><div class="meta"><span>${_t("dash.schiff")}</span><b></b></div>`;
            const pr = planProgress(x),
              d = pr ? pr.done : x.done,
              t = pr ? pr.total : x.total,
              pc = pr ? pr.pct : Math.round((100 * x.done) / x.total);
            return `<div class="bar"><i style="width:${pc}%"></i></div><div class="meta"><span>${d}/${t}${pr ? " " + _t("dash.stufen_suffix") : ""}</span><b>${pc}%</b></div>`;
          })()}<span class="statusBadge status-${calcPlanStatus(x)}">${statusLabel(calcPlanStatus(x))}</span></article>`,
      )
      .join("") + "";
  {
    const ac = $("plans").querySelector(".plan.active");
    if (ac && typeof ac.scrollIntoView === "function") {
      const pl = $("plans");
      const l = ac.offsetLeft - pl.offsetLeft,
        r = l + ac.offsetWidth;
      if (l < pl.scrollLeft || r > pl.scrollLeft + pl.clientWidth) pl.scrollLeft = Math.max(0, l - 8);
    }
  }
  $("plans")
    .querySelectorAll("[data-id]")
    .forEach((e) => {
      e.onclick = () => {
        s.active = e.dataset.id;
        save();
      };
      e.ondragstart = (ev) => {
        dragPlanId = e.dataset.id;
        try {
          ev.dataTransfer.setData("text/plain", e.dataset.id);
          ev.dataTransfer.effectAllowed = "move";
        } catch (_) {}
        e.classList.add("dragging");
      };
      e.ondragend = () => {
        dragPlanId = null;
        $("plans")
          .querySelectorAll(".plan")
          .forEach((c) => c.classList.remove("dragging", "dropBefore", "dropAfter"));
      };
      e.ondragover = (ev) => {
        if (!dragPlanId) return;
        ev.preventDefault();
        const r = e.getBoundingClientRect(),
          after = Number.isFinite(ev.clientX) && r.width ? ev.clientX > r.left + r.width / 2 : false;
        e.classList.toggle("dropAfter", after);
        e.classList.toggle("dropBefore", !after);
      };
      e.ondragleave = () => e.classList.remove("dropBefore", "dropAfter");
      e.ondrop = (ev) => {
        if (!dragPlanId) return;
        ev.preventDefault();
        ev.stopPropagation();
        const after = e.classList.contains("dropAfter"),
          src = dragPlanId;
        dragPlanId = null;
        if (src === e.dataset.id) {
          render();
          return;
        }
        const si = s.plans.findIndex((x) => x.id === src);
        let ti = s.plans.findIndex((x) => x.id === e.dataset.id) + (after ? 1 : 0);
        if (si < ti) ti--;
        movePlan(src, ti);
      };
    });
  $("plans")
    .querySelectorAll("[data-mv]")
    .forEach(
      (b) =>
        (b.onclick = (ev) => {
          ev.stopPropagation();
          const i = s.plans.findIndex((x) => x.id === b.dataset.mid);
          movePlan(b.dataset.mid, i + +b.dataset.mv);
        }),
    );
  const npc = $("newPlanCard");
  if (npc) npc.onclick = openDraft;
  $("pTitle").textContent = p.name;
  $("planStatusBadge").textContent = statusLabel(p.status);
  $("planStatusBadge").className = "statusBadge status-" + p.status;
  $("pStatusDot").textContent = "● " + statusLabel(p.status);
  $("pStatusDot").className = "sd-" + p.status;
  $("pImg").src = ART[artKey(p)];
  $("pName").textContent = isShip(p) ? p.name : p.name.replace(/\s\d+$/, "");
  $("pLevel").textContent = isShip(p) ? shipLabel(p) : _t("common.level_von_bis", { a: p.start, b: p.target });
  const pr = planProgress(p);
  $("pProg").textContent = (pr ? pr.pct : Math.round((100 * p.done) / p.total)) + " %";
  $("pBar").style.width = (pr ? pr.pct : Math.round((100 * p.done) / p.total)) + "%";
  $("heroMain").style.display = p.isMain ? "" : "none";
  $("pDone").textContent = isShip(p)
    ? (shipReqHtml(p.ship.yard).cls === "no" ? _t("dash.werft_nicht", { n: p.ship.yard }) : p.ship.name)
    : pr
      ? _t("dash.von_stufen", { a: pr.done, b: pr.total }) +
        (pr.since ? _t("dash.seit", { d: new Date(pr.since).toLocaleDateString(LOC()) }) : "")
      : _t("dash.von", { a: p.done, b: p.total });
  $("bottleneckValue").textContent = bottleneck ? bottleneck.name : _t("dash.nicht_berechenbar");
  $("bottleneckValue").className = bottleneck ? (bottleneck.none ? "green" : "amber") : "";
  $("bottleneckDetail").textContent = bottleneck
    ? bottleneck.none
      ? _t("dash.alle_gedeckt")
      : _t("dash.fehlen", { n: fmt(bottleneck.missing) }) +
        (bottleneck.fc ? _t("dash.bremst") : _t("dash.vorlaeufig", { p: Math.round(100 * bottleneck.share) }))
    : _t("dash.keine_kosten");
  renderBottleneckCard(p);
  const ct = p.hasPlanData ? (p.planData || {}).construction : null;
  $("buildTimeValue").textContent = isShip(p) ? "–" : ct ? fmtDuration(ct.cost) : _t("dash.nicht_berechenbar");
  $("buildTimeDetail").textContent = isShip(p)
    ? _t("dash.bei_schiffen")
    : ct
    ? ct.needed > 0
      ? _t("dash.speedups_fehlen", { d: fmtDuration(ct.needed) })
      : _t("dash.speedups_ok")
    : _t("dash.keine_bauzeit");
  $("buildTimeDetail").className = isShip(p) ? "muted" : ct ? (ct.needed > 0 ? "amber" : "green") : "muted";
  $("planDataNotice").textContent = p.hasPlanData
    ? ""
    : isOutdated(p)
      ? outdatedText(p) + " " + _t("dash.bis_dahin")
      : ({
          draft: _t("dash.pd_draft", { name: p.name }),
          incomplete: _t("dash.pd_incomplete", { name: p.name }),
          review: _t("dash.pd_review", { name: p.name }),
          stale: _t("dash.pd_stale", { name: p.name }),
        }[p.status] || "") +
        " " +
        _t("dash.pd_deshalb");
  renderNextCard(p);
  const seq = orderedSequence(p);
  const openN = seq.filter((x) => !x.done).length;
  $("seqMsg").textContent = $("seqMsg").dataset.keep ? $("seqMsg").textContent : "";
  delete $("seqMsg").dataset.keep;
  $("seqReset").style.display = ((p.planData || {}).customOrder || []).length ? "" : "none";
  const cover = seq.length && p.status === "active" ? coverMap(p, seq) : null;
  $("seqRows").innerHTML = seq.length
    ? seqRowsHtml(seq, 0, false, true, (x) => sharedPlans(p, x), cover)
    : isShip(p)
      ? `<tr><td colspan="6" class="muted">${_t("dash.schiffe_keine_seq")}</td></tr>`
      : `<tr><td colspan="6" class="muted">${_t("dash.keine_pflicht")}</td></tr>`;
  $("seqCount").textContent = seq.length
    ? _t("dash.schritte", { a: seq.length - openN, b: seq.length }) +
      (p.status === "active"
        ? ""
        : _t("dash.plan_status", { st: statusLabel(p.status) }) + (p.status === "stale" ? _t("dash.altes_ziel") : ""))
    : "";
  $("allStepsBtn").style.display = seq.length > 6 ? "" : "none";
  $("seqRows")
    .querySelectorAll("[data-sm]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          const i = seq.findIndex((x) => seqKey(x) === b.dataset.k);
          if (!applyMoveKeep(p, b.dataset.k, i + +b.dataset.sm)) return;
        }),
    );
  $("seqRows")
    .querySelectorAll("tr[data-sk]")
    .forEach((r) => {
      r.ondragstart = (ev) => {
        dragSeqKey = r.dataset.sk;
        try {
          ev.dataTransfer.setData("text/plain", r.dataset.sk);
          ev.dataTransfer.effectAllowed = "move";
        } catch (_) {}
        r.classList.add("sqDrag");
      };
      r.ondragend = () => {
        dragSeqKey = null;
        $("seqRows")
          .querySelectorAll("tr")
          .forEach((t) => t.classList.remove("sqDrag", "sqBefore", "sqAfter"));
      };
      r.ondragover = (ev) => {
        if (!dragSeqKey) return;
        ev.preventDefault();
        const b = r.getBoundingClientRect(),
          after = Number.isFinite(ev.clientY) && b.height ? ev.clientY > b.top + b.height / 2 : false;
        r.classList.toggle("sqAfter", after);
        r.classList.toggle("sqBefore", !after);
      };
      r.ondragleave = () => r.classList.remove("sqBefore", "sqAfter");
      r.ondrop = (ev) => {
        if (!dragSeqKey) return;
        ev.preventDefault();
        ev.stopPropagation();
        const after = r.classList.contains("sqAfter"),
          src = dragSeqKey;
        dragSeqKey = null;
        if (src === r.dataset.sk) {
          render();
          return;
        }
        const si = seq.findIndex((x) => seqKey(x) === src);
        let ti = seq.findIndex((x) => seqKey(x) === r.dataset.sk) + (after ? 1 : 0);
        if (si < ti) ti--;
        applyMoveKeep(p, src, ti);
      };
    });
  $("seqReset").onclick = () => {
    delete p.planData.customOrder;
    s.logs.push(_t("dash.reset_log", { name: p.name }));
    save();
  };
  renderResMerged(p, planRows, bottleneck);
  $("resSource2").textContent = resourceSourceNote(p, planRows);
  const ce = ((p.planData || {}).efficiencies || {})["Σ-Construction Time"],
    cc = p.hasPlanData ? (p.planData || {}).construction : null;
  (() => {
    const h = (p.planData || {}).history || [];
    $("histCount").textContent = h.length ? _t(h.length === 1 ? "dash.messpunkte1" : "dash.messpunkte", { n: h.length }) : "";
    $("histRows").innerHTML = h.length
      ? [...h]
          .reverse()
          .map((x) => {
            const r = x.resources || {},
              v = (k) => (r[k] ? fmt(r[k].onHand) : "–");
            return `<tr><td>${fdt(x.at)}</td><td>${escAttr(histKindLabel(x.kind))}</td><td>${x.progress ? x.progress.done + " / " + x.progress.total : "–"}</td><td>${v("Σ-Parsteel")}</td><td>${v("Σ-Tritanium")}</td><td>${v("Σ-Dilithium")}</td></tr>`;
          })
          .join("")
      : `<tr><td colspan="6" class="muted">${_t("dash.keine_messpunkte")}</td></tr>`;
  })();
  $("effConstr").textContent = cc
    ? _t("dash.bauzeit_eff", { a: fmtDuration(cc.cost), b: fmtDuration(cc.base) }) +
      (Number.isFinite(ce) ? _t("dash.eff_ct", { v: fx(ce) }) : "")
    : "";
  $("mileRows").innerHTML =
    seq.length && p.hasPlanData
      ? openN
        ? seqRowsHtml(seq, 6, true)
        : `<tr><td colspan="4" class="green">${_t("dash.alle_erledigt")}</td></tr>`
      : `<tr><td colspan="4" class="muted">${_t("dash.keine_schritte")}</td></tr>`;
  $("lastImport").textContent = s.snapshots.length
    ? _t("dash.letzter_import", { d: fdt(s.snapshots.at(-1).createdAt) }) +
      (latestSnapshot()
        ? "\n" +
          _t("dash.neuester_export", { d: fdt(snapTime(latestSnapshot())) }) +
          (snapHasExport(latestSnapshot()) ? "" : _t("dash.keine_exportzeit"))
        : "")
    : _t("imp.kein_snapshot");
  $("log").innerHTML = s.logs.slice(-4).reverse().map(escAttr).join("<br>");
  renderForecast(p);
  // ab 3.4: grüner Kasten, wenn der Export das Gebäudeziel zeigt
  {
    const gb = goalByExport(p),
      el = $("goalBox");
    el.hidden = !gb;
    el.innerHTML = gb
      ? `<span><b>${_t("dash.ziel_erreicht_box")}</b> ${_t("dash.ziel_erreicht_text", { d: new Date(gb.at).toLocaleDateString(LOC()), name: escAttr(gb.name), n: gb.level })}</span><button class="btn completeBtn" id="goalBoxBtn">${_t("dash.plan_abschliessen")}</button>`
      : "";
    if (gb) $("goalBoxBtn").onclick = () => completePlan(p);
  }
  renderPacks(p);
  if (typeof renderEffPanel === "function") renderEffPanel(p);
  if (typeof renderChainPanel === "function") renderChainPanel(p);
  {
    const pc = packCalc(p);
    if (!pc && shipPackMissingText(p)) {
      $("packsValue").textContent = "–";
      $("packsDetail").textContent =
        p.ship && p.ship.key === "other" ? _t("dash.anderes_kein_pack") : _t("dash.schiffspack_pflegen");
    } else if (!pc) {
      $("packsValue").textContent = "–";
      $("packsDetail").textContent = p.hasPlanData
        ? packEmpty()
          ? _t("dash.station_pflegen")
          : _t("wif.nicht_berechenbar")
        : _t("dash.erst_aktiv");
    } else if (!pc.total) {
      $("packsValue").textContent = _t("dash.keine_noetig");
      $("packsDetail").textContent = _t("dash.alle_relevanten");
    } else {
      $("packsValue").textContent = (pc.approx ? _t("common.ca") + " " : "") + _t("dash.n_packs", { n: fx(pc.total) });
      $("packsDetail").textContent =
        (pc.approx ? _t("common.ca") + " " : "") +
        _t("dash.bestimmt", { p: fx(pc.total * pc.pack.priceEUR), m: pc.driver.replace("7★ ", "") }) +
        (isShip(p) ? " · " + pc.pack.name : "") +
        (packInclText(p) ? " · " + packInclText(p) : "");
    }
  }
  $("packSum").innerHTML = $("packsValue").textContent === "–"
    ? ""
    : _t("dash.packsum", { v: escAttr($("packsValue").textContent), d: escAttr($("packsDetail").textContent) });
  renderSnaps();
  renderChart();
  renderBackup();
  renderScan();
  renderCare();
  renderEvents();
  renderGoals();
  logForecast(); // zuerst protokollieren, damit der Verlauf den heutigen Eintrag schon enthält
  renderVerlauf();
  renderImportPage();
  flashChanged(p);
}
function renderSnaps() {
  $("snapList").innerHTML = s.snapshots.length
    ? [...s.snapshots]
        .reverse()
        .map(
          (x) =>
            `<div class="snapItem"><b>${_t("dash.snap_export", { d: fdt(snapTime(x)) })}${snapHasExport(x) ? "" : _t("dash.importzeit")}</b><br><span class="muted">${_t("dash.importiert", { d: fdt(x.createdAt) })}</span><br><span class="muted" style="font-size:11px;word-break:break-all">${escAttr(x.fileName)}</span><button data-del="${x.id}" class="snapDel" title="${_t("dash.snap_loeschen")}">${_t("common.loeschen")}</button></div>`,
        )
        .join("")
    : _t("dash.keine_snaps");
  $("snapList")
    .querySelectorAll("[data-del]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          if (confirm(_t("dash.snap_loeschen_q"))) {
            s.snapshots = s.snapshots.filter((x) => x.id !== b.dataset.del);
            syncResources();
            save();
          }
        }),
    );
  let o = [...s.snapshots]
    .sort((a, b) => new Date(snapTime(a)) - new Date(snapTime(b)))
    .map((x) => `<option value="${x.id}">${fdt(snapTime(x))}</option>`)
    .join("");
  $("from").innerHTML = o;
  $("to").innerHTML = o;
  $("compare").disabled = s.snapshots.length < 2;
  if (s.snapshots.length > 1) {
    $("from").selectedIndex = $("from").options.length - 2;
    $("to").selectedIndex = $("to").options.length - 1;
    if ($("compare").onclick) $("compare").onclick();
  } else
    $("compareResult").innerHTML =
      `<p class="muted">${_t("dash.zwei_snaps")}</p>`;
}
function renderChart() {
  if ($("resourceSelect").options.length !== trackedMats().length) {
    const keep = $("resourceSelect").value;
    const o = trackedMats()
      .map((x) => `<option>${x}</option>`)
      .join("");
    $("resourceSelect").innerHTML = o;
    $("chartBigSelect").innerHTML = o;
    $("resourceSelect").value = keep && trackedMats().includes(keep) ? keep : "7★ Rare Ore";
  }
  const cw = $("chartBox").clientWidth;
  drawChart("chartBox", cw >= 600 ? Math.round(cw) : 600, 224, false);
  if ($("chartModal").classList.contains("on")) {
    $("chartBigSelect").value = $("resourceSelect").value;
    drawChart("chartBigBox", 1100, 470, true);
  }
}
