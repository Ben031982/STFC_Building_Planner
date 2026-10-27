let dashTab = "ov";
function setTab(t) {
  dashTab = t;
  document
    .querySelectorAll("#dashTabs [data-tab]")
    .forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  ["ov", "bld", "res", "fc", "hist"].forEach((k) => $("pane-" + k).classList.toggle("on", k === t));
  if (typeof navSync === "function") setTimeout(navSync, 0);
  const cp = $("chartPanel");
  if (t === "hist") {
    if (cp.parentElement !== $("pane-hist")) $("pane-hist").prepend(cp);
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
        "Pflichtgebäude",
        ((p.planData && p.planData.requiredBuildings) || []).length + " Gebäude",
      ],
      ["resourceCosts", "Ressourcen", "aus Total resources"],
      ["buildTime", "Bauzeit", "aus Total resources"],
      ["efficiencies", "Effizienzen", "für alle Materialien mit Bedarf"],
      ["confirm", "Bestätigung", "durch dich"],
    ];
  const T = {
    draft: ["Nächster Schritt: Upgrade-Plan importieren", "Upgrade-Plan importieren"],
    incomplete: ["Nächster Schritt: fehlende Plandaten importieren", "Upgrade-Plan importieren"],
    review: ["Nächster Schritt: Daten prüfen und bestätigen", "Daten prüfen & bestätigen"],
    stale: isOutdated(p)
      ? ["Nächster Schritt: Plandaten aktualisieren", "Upgrade-Plan importieren"]
      : ["Nächster Schritt: Upgrade-Plan für das neue Ziel importieren", "Neu importieren"],
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
      return `<div class="nextStep ${done ? "done" : "open"}"><span class="chip ${done ? "ok" : "todo"}">${done ? "✓ erledigt" : "offen"}</span><b>${l}</b><span class="muted">${done ? sub : k === "requiredBuildings" && c.targetMismatch ? "passt nicht zum Ziel" : "fehlt noch"}</span></div>`;
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
    ? y + " J. " + d + " T."
    : d
      ? d + " T. " + h + " Std."
      : h
        ? h + " Std. " + m + " Min."
        : m + " Min.";
}
function resGroups(rows) {
  return [
    ["Σ-ROHSTOFFE", (r) => /^Σ/.test(r[0])],
    ["7★ RARE", (r) => /Rare/.test(r[0])],
    ["7★ UNCOMMON", (r) => /Uncommon/.test(r[0])],
    ["7★ COMMON · ZÄHLT NICHT (PER LATINUM KAUFBAR)", (r) => /Common/.test(r[0])],
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
      h += `<tr class="${com ? "resCommon" : ""}${isB ? " resBn" : slow.has(r[0]) ? " resSlow" : ""}"><td>${r[0]}${isB ? ' <span class="bnTag">ENGPASS</span>' : ""}</td><td>${fmt(r[1])}</td><td>${fmt(r[2])}</td><td class="${m ? (isB ? "amber" : "") : "green"}">${m ? fmt(m) : "gedeckt"}</td><td>${eff ? (Number.isFinite(e) ? fx(e) + " %" : "–") : rate(r[0])}</td><td><span class="prog${m ? "" : " done"}"><i style="width:${pc}%"></i></span> ${pc}%</td></tr>`;
    }
  }
  return h;
}
function renderEmpty() {
  $("plans").innerHTML =
    '<div class="noPlansHint">Noch keine Zielpläne. Leg deinen ersten Plan mit „+ Neuer Plan“ an.</div>';
  $("lastImport").textContent = s.snapshots.length
    ? "Letzter Import: " +
      fdt(s.snapshots.at(-1).createdAt) +
      (latestSnapshot() ? "\nNeuester Exportstand: " + fdt(snapTime(latestSnapshot())) : "")
    : "Noch kein Snapshot importiert.";
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
          `<article class="plan ${x.id === p.id ? "active" : ""}" data-id="${x.id}" draggable="true"><div class="cardMove"><button data-mv="-1" data-mid="${x.id}" aria-label="Nach links"${xi === 0 ? " disabled" : ""}>◀</button><button data-mv="1" data-mid="${x.id}" aria-label="Nach rechts"${xi === s.plans.length - 1 ? " disabled" : ""}>▶</button></div><div class="pt"><img src="${ART[artKey(x)]}"><div><h3>${escAttr(x.name)}${x.isMain ? '<span class="mainStar"> ★ Hauptplan</span>' : ""}</h3><span class="muted">${isShip(x) ? shipLabel(x) : "Level " + x.start + " → " + x.target}</span>${x.after && planById(x.after) ? `<br><span class="chain">⛓ nach ${escAttr(planById(x.after).name)}</span>` : ""}</div></div>${(() => {
            if (isShip(x)) return `<div class="bar"><i style="width:0%"></i></div><div class="meta"><span>Schiff</span><b></b></div>`;
            const pr = planProgress(x),
              d = pr ? pr.done : x.done,
              t = pr ? pr.total : x.total,
              pc = pr ? pr.pct : Math.round((100 * x.done) / x.total);
            return `<div class="bar"><i style="width:${pc}%"></i></div><div class="meta"><span>${d}/${t}${pr ? " Stufen" : ""}</span><b>${pc}%</b></div>`;
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
  $("pLevel").textContent = isShip(p) ? shipLabel(p) : `Level ${p.start} → ${p.target}`;
  const pr = planProgress(p);
  $("pProg").textContent = (pr ? pr.pct : Math.round((100 * p.done) / p.total)) + " %";
  $("pBar").style.width = (pr ? pr.pct : Math.round((100 * p.done) / p.total)) + "%";
  $("heroMain").style.display = p.isMain ? "" : "none";
  $("pDone").textContent = isShip(p)
    ? (shipReqHtml(p.ship.yard).cls === "no" ? "Schiffswerft " + p.ship.yard + " noch nicht erreicht" : p.ship.name)
    : pr
      ? `${pr.done} von ${pr.total} Stufen` +
        (pr.since ? " seit " + new Date(pr.since).toLocaleDateString("de-DE") : "")
      : `${p.done} von ${p.total}`;
  $("bottleneckValue").textContent = bottleneck ? bottleneck.name : "Nicht berechenbar";
  $("bottleneckValue").className = bottleneck ? (bottleneck.none ? "green" : "amber") : "";
  $("bottleneckDetail").textContent = bottleneck
    ? bottleneck.none
      ? "Alle Rare-, Uncommon- und Σ-Ressourcen gedeckt"
      : fmt(bottleneck.missing) +
        " fehlen" +
        (bottleneck.fc
          ? " · bremst die Fertigstellung"
          : " (" + Math.round(100 * bottleneck.share) + " %) · vorläufig, noch keine Prognose")
    : "Keine Kostengrundlage für diesen Zielplan";
  renderBottleneckCard(p);
  const ct = p.hasPlanData ? (p.planData || {}).construction : null;
  $("buildTimeValue").textContent = isShip(p) ? "–" : ct ? fmtDuration(ct.cost) : "Nicht berechenbar";
  $("buildTimeDetail").textContent = isShip(p)
    ? "Bei Schiffen nicht berücksichtigt"
    : ct
    ? ct.needed > 0
      ? "Speedups fehlen: " + fmtDuration(ct.needed)
      : "Speedups ausreichend (laut Spock's Club)"
    : "Keine Bauzeitdaten vorhanden";
  $("buildTimeDetail").className = isShip(p) ? "muted" : ct ? (ct.needed > 0 ? "amber" : "green") : "muted";
  $("planDataNotice").textContent = p.hasPlanData
    ? ""
    : isOutdated(p)
      ? outdatedText(p) + " Bis dahin wird der Plan nicht berechnet."
      : ({
          draft: "Für " + p.name + " wurde noch kein eigener Upgrade-Plan importiert.",
          incomplete:
            "Die Plandaten für " +
            p.name +
            " sind unvollständig. Bitte den Upgrade-Plan vollständig importieren.",
          review:
            "Die Plandaten für " +
            p.name +
            " sind vollständig, aber noch nicht bestätigt (Plandaten verwalten → Bestätigung).",
          stale:
            "Die Plandaten für " +
            p.name +
            " passen nicht mehr zum Ziel. Bitte den Upgrade-Plan für das aktuelle Ziel neu importieren.",
        }[p.status] || "") +
        " Ressourcenbedarf, Engpass, Bauzeit, Meilensteine und Bedarfslinie werden deshalb erst nach Import und Bestätigung berechnet.";
  $("resSource").textContent = resourceSourceNote(p, planRows);
  $("resRows").innerHTML =
    resTableHtml(p, planRows, bottleneck, false) ||
    '<tr><td colspan="6" class="muted">Keine planabhängige Kostengrundlage – der Plan ist nicht aktiv.</td></tr>';
  renderNextCard(p);
  const seq = orderedSequence(p);
  const openN = seq.filter((x) => !x.done).length;
  $("seqMsg").textContent = $("seqMsg").dataset.keep ? $("seqMsg").textContent : "";
  delete $("seqMsg").dataset.keep;
  $("seqReset").style.display = ((p.planData || {}).customOrder || []).length ? "" : "none";
  $("seqRows").innerHTML = seq.length
    ? seqRowsHtml(seq, 0, false, true, (x) => sharedPlans(p, x))
    : isShip(p)
      ? '<tr><td colspan="4" class="muted">Schiffe haben keine Bau-Reihenfolge – hier zählt nur der Tier-Aufstieg bzw. der Bau des Schiffs.</td></tr>'
      : '<tr><td colspan="4" class="muted">Keine Pflichtgebäude vorhanden. Bitte den Upgrade-Plan importieren.</td></tr>';
  $("seqCount").textContent = seq.length
    ? seq.length -
      openN +
      " von " +
      seq.length +
      " Schritten erledigt" +
      (p.status === "active"
        ? ""
        : " · Plan " +
          statusLabel(p.status) +
          (p.status === "stale" ? " – Daten gehören zum alten Ziel" : ""))
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
    s.logs.push("Bau-Reihenfolge zurückgesetzt: " + p.name);
    save();
  };
  $("resRows2").innerHTML =
    resTableHtml(p, planRows, bottleneck, true) ||
    '<tr><td colspan="6" class="muted">Keine planabhängige Kostengrundlage – der Plan ist nicht aktiv.</td></tr>';
  $("resSource2").textContent = resourceSourceNote(p, planRows);
  const ce = ((p.planData || {}).efficiencies || {})["Σ-Construction Time"],
    cc = p.hasPlanData ? (p.planData || {}).construction : null;
  (() => {
    const h = (p.planData || {}).history || [];
    $("histCount").textContent = h.length ? h.length + " Messpunkt" + (h.length === 1 ? "" : "e") : "";
    $("histRows").innerHTML = h.length
      ? [...h]
          .reverse()
          .map((x) => {
            const r = x.resources || {},
              v = (k) => (r[k] ? fmt(r[k].onHand) : "–");
            return `<tr><td>${fdt(x.at)}</td><td>${escAttr(x.kind)}</td><td>${x.progress ? x.progress.done + " / " + x.progress.total : "–"}</td><td>${v("Σ-Parsteel")}</td><td>${v("Σ-Tritanium")}</td><td>${v("Σ-Dilithium")}</td></tr>`;
          })
          .join("")
      : '<tr><td colspan="6" class="muted">Noch keine Messpunkte. Der erste entsteht beim nächsten Import des Upgrade-Plans.</td></tr>';
    const inc = planIncome(p),
      sg = (v) => (v > 0 ? "+" : "") + fmt(v);
    $("incomeRows").innerHTML = inc.rows.length
      ? inc.rows
          .map((r) =>
            r.missing
              ? `<tr><td>${r.name}</td><td colspan="5" class="muted">keine Werte in beiden Messpunkten</td></tr>`
              : r.costUp
                ? `<tr><td>${r.name}</td><td>${sg(r.dStock)}</td><td colspan="4" class="red">Cost gestiegen – Plan geändert? Einkommen nicht berechenbar</td></tr>`
                : `<tr><td>${r.name}</td><td>${sg(r.dStock)}</td><td>${fmt(r.built)}</td><td class="${r.inc >= 0 ? "green" : "red"}">${sg(r.inc)}</td><td>${r.day === null ? "–" : sg(r.day)}</td><td>${r.day === null ? "–" : sg(r.day * 7)}</td></tr>`,
          )
          .join("")
      : '<tr><td colspan="6" class="muted">Mindestens zwei Messpunkte mit „Total resources“ nötig.</td></tr>';
    $("incomeNote").textContent = inc.rows.length
      ? "Zeitraum: " +
        fdt(inc.from) +
        " bis " +
        fdt(inc.to) +
        " (" +
        inc.days.toFixed(1).replace(".", ",") +
        " Tage)." +
        (inc.days < FC_GAP_DAYS ? " Weniger als " + FC_GAP_H + " Stunden – deshalb keine Tages- oder Wochenraten." : "") +
        " Zeitpunkt = Importzeit; bitte direkt nach dem Synchronisieren in Spock's Club importieren."
      : inc.points === 1
        ? "Ein Messpunkt mit Ressourcen ist vorhanden. Ab dem zweiten Import von „Total resources“ wird das Einkommen berechnet."
        : "Noch kein Messpunkt mit Ressourcen.";
  })();
  $("effConstr").textContent = cc
    ? "Bauzeit: " +
      fmtDuration(cc.cost) +
      " (Base " +
      fmtDuration(cc.base) +
      ")" +
      (Number.isFinite(ce) ? " · Effizienz Σ-Construction Time " + fx(ce) + " %" : "")
    : "";
  $("mileRows").innerHTML =
    seq.length && p.hasPlanData
      ? openN
        ? seqRowsHtml(seq, 6, true)
        : '<tr><td colspan="4" class="green">Alle Bauschritte erledigt.</td></tr>'
      : '<tr><td colspan="4" class="muted">Keine planabhängigen Bauschritte vorhanden.</td></tr>';
  $("lastImport").textContent = s.snapshots.length
    ? "Letzter Import: " +
      fdt(s.snapshots.at(-1).createdAt) +
      (latestSnapshot()
        ? "\nNeuester Exportstand: " +
          fdt(snapTime(latestSnapshot())) +
          (snapHasExport(latestSnapshot()) ? "" : " (keine Exportzeit im Dateinamen, Importzeit)")
        : "")
    : "Noch kein Snapshot importiert.";
  $("log").innerHTML = s.logs.slice(-4).reverse().map(escAttr).join("<br>");
  renderForecast(p);
  renderPacks(p);
  if (typeof renderEffPanel === "function") renderEffPanel(p);
  if (typeof renderChainPanel === "function") renderChainPanel(p);
  {
    const pc = packCalc(p);
    if (isShip(p)) {
      $("packsValue").textContent = "–";
      $("packsDetail").textContent = "Für Schiffe nicht berechnet";
    } else if (!pc) {
      $("packsValue").textContent = "–";
      $("packsDetail").textContent = p.hasPlanData
        ? packEmpty()
          ? "Stationspack unter Daten & Import › Stationspack pflegen"
          : "nicht berechenbar"
        : "erst wenn der Plan aktiv ist";
    } else if (!pc.total) {
      $("packsValue").textContent = "Keine nötig";
      $("packsDetail").textContent = "alle relevanten Ressourcen gedeckt";
    } else {
      $("packsValue").textContent = (pc.approx ? "ca. " : "") + fx(pc.total) + " Packs";
      $("packsDetail").textContent =
        (pc.approx ? "ca. " : "") +
        fx(pc.total * pc.pack.priceEUR) +
        " € · bestimmt durch " +
        pc.driver.replace("7★ ", "");
    }
  }
  renderSnaps();
  renderChart();
  renderBackup();
  renderScan();
  renderCare();
  renderEvents();
  logForecast();
  renderImportPage();
  flashChanged(p);
}
function renderSnaps() {
  $("snapList").innerHTML = s.snapshots.length
    ? [...s.snapshots]
        .reverse()
        .map(
          (x) =>
            `<div class="snapItem"><b>Export: ${fdt(snapTime(x))}${snapHasExport(x) ? "" : " (Importzeit)"}</b><br><span class="muted">importiert ${fdt(x.createdAt)}</span><br><span class="muted" style="font-size:11px;word-break:break-all">${escAttr(x.fileName)}</span><button data-del="${x.id}" class="snapDel" title="Snapshot löschen">Löschen</button></div>`,
        )
        .join("")
    : "Noch keine Snapshots";
  $("snapList")
    .querySelectorAll("[data-del]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          if (confirm("Snapshot löschen?")) {
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
      '<p class="muted">Für einen Vergleich braucht es mindestens zwei Snapshots.</p>';
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
  drawChart("chartBox", 600, 224, false);
  if ($("chartModal").classList.contains("on")) {
    $("chartBigSelect").value = $("resourceSelect").value;
    drawChart("chartBigBox", 1100, 470, true);
  }
}
