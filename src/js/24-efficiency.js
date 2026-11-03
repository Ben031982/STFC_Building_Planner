// Effizienzen: Wirkung und Verlauf (ab 2.1, F22) – Seite Ressourcen & Effizienzen.
// Kosten = Grundkosten ÷ (1 + Effizienz/100), so rechnet Spock's Club. Der Verlauf beginnt mit 2.1: Bei jedem
// Plan-Import speichert die Planhistorie die Effizienzen mit (makeHistPoint). Frühere Termine und Raten werden
// nicht mit neuen Effizienzen umgerechnet.
// Achtung: render() ruft renderEffPanel() schon beim Laden auf – hier deshalb keine let/const auf oberster Ebene.

function effCost(base, eff) {
  return base / (1 + eff / 100);
}

// Messpunkte mit Effizienzen: letzter (jetzt) und vorletzter (voriger Import)
function effHistory(p) {
  const h = (((p && p.planData) || {}).history || [])
    .filter((x) => x.efficiencies && Object.keys(x.efficiencies).length)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  return { all: h, prev: h.length >= 2 ? h[h.length - 2] : null, last: h.length ? h[h.length - 1] : null };
}

function effRows(p) {
  const d = p.planData || {},
    res = d.resources || {},
    eff = d.efficiencies || {};
  return planMaterials(p).filter(
    (m) => res[m] && isNum(res[m].base) && res[m].base > 0 && isNum(res[m].cost) && res[m].cost > 0,
  ).map((m) => ({ m, base: res[m].base, cost: res[m].cost, eff: isNum(eff[m]) ? eff[m] : null }));
}

// Termin, wenn die heutigen Grundkosten mit früheren Effizienzen gerechnet würden (gleicher Bestand, gleiches Einkommen)
function effEtaWith(p, oldEff) {
  const fc = planForecast(p);
  if (!fc || !(fc.overall.real > 0)) return null;
  const res = (p.planData || {}).resources || {},
    cur = Object.fromEntries(getPlanResources(p).map((r) => [r[0], r[1]]));
  let worst = 0;
  for (const x of fc.res) {
    if (x.common) continue;
    const r = res[x.m];
    let miss = x.miss;
    if (r && isNum(r.base) && r.base > 0 && isNum(oldEff[x.m]))
      miss = Math.max(0, effCost(r.base, oldEff[x.m]) - (cur[x.m] || 0));
    if (miss <= 0) continue;
    if (!(x.st.n >= FC_MIN && x.st.real > 0)) return null;
    worst = Math.max(worst, miss / x.st.real);
  }
  return fcTooFar(worst) ? null : { fc, days: worst };
}

function renderEffPanel(p) {
  const box = $("effBody");
  if (!box) return;
  if (!p || !p.hasPlanData) {
    box.innerHTML = '<p class="muted">Braucht einen aktiven Plan mit bestätigten Plandaten.</p>';
    return;
  }
  const rows = effRows(p);
  if (!rows.length) {
    box.innerHTML =
      '<p class="muted">Für diesen Plan liegen keine Grundkosten vor. Bitte „Total resources“ mit Grundkosten (Base Cost) neu importieren.</p>';
    return;
  }
  const H = effHistory(p),
    prev = H.prev && H.prev.efficiencies,
    prevAt = H.prev ? new Date(H.prev.at).toLocaleDateString("de-DE") : "";
  // Karte 1: Ersparnis bei der größten Σ-Ressource, sonst beim ersten Material
  const big = rows.filter((r) => /^Σ/.test(r.m)).sort((a, b) => b.base - a.base)[0] || rows[0];
  // Karte 2: Änderungen seit dem vorigen Import
  let up = 0,
    down = 0;
  if (prev)
    for (const r of rows) {
      if (r.eff == null || !isNum(prev[r.m])) continue;
      if (r.eff > prev[r.m]) up++;
      else if (r.eff < prev[r.m]) down++;
    }
  const chTxt = !prev
    ? ["Noch kein Vergleich", "ab dem nächsten Plan-Import"]
    : up || down
      ? [
          [up ? up + (up === 1 ? " Effizienz gestiegen" : " Effizienzen gestiegen") : "", down ? down + " gesunken" : ""]
            .filter(Boolean)
            .join(", "),
          "Import " + prevAt + " → " + new Date(H.last.at).toLocaleDateString("de-DE"),
        ]
      : ["Unverändert", "seit dem Import vom " + prevAt];
  // Karte 3: Einfluss auf den Termin (in Kalendertagen)
  let etaB = "–",
    etaS = prev ? "Termin noch nicht berechenbar" : "ab dem nächsten Plan-Import";
  if (prev) {
    const w = effEtaWith(p, prev);
    if (w) {
      const dd = (x) => new Date(w.fc.base + x * 864e5).setHours(0, 0, 0, 0),
        g = Math.round((dd(w.days) - dd(w.fc.overall.real)) / 864e5);
      etaB =
        g === 0
          ? "kein ganzer Tag"
          : `<span class="${g > 0 ? "green" : "red"}">${Math.abs(g)} ${Math.abs(g) === 1 ? "Tag" : "Tage"} ${g > 0 ? "früher" : "später"}</span>`;
      etaS = "mit den Effizienzen vom " + prevAt + ": " + fmtEta(w.days, w.fc.base);
    }
  }
  box.innerHTML =
    `<div class="wifSum effSum"><div><span class="muted">Ersparnis durch Effizienzen</span><b>${fmt(big.base - big.cost)} ${escAttr(big.m)}</b><span class="muted">Kosten ${fmt(big.cost)} statt ${fmt(big.base)}</span></div>` +
    `<div><span class="muted">Seit dem vorigen Import</span><b>${chTxt[0]}</b><span class="muted">${chTxt[1]}</span></div>` +
    `<div><span class="muted">Einfluss auf den Termin</span><b>${etaB}</b><span class="muted">${escAttr(etaS)}</span></div></div>` +
    `<div class="chartNote" style="margin-top:8px">Kosten = Grundkosten ÷ (1 + Effizienz). Der Verlauf beginnt mit Version 2.1: Ab jetzt merkt sich der Planner die Effizienzen bei jedem Plan-Import. „Einfluss auf den Termin“ rechnet die heutigen Grundkosten mit den früheren Effizienzen, bei gleichem Bestand und Einkommen. Frühere Termine und Raten werden nicht nachträglich umgerechnet.</div>`;
}

// Ressourcen- und Effizienztabelle mit eingebautem Effizienzrechner (ab 5.0).
// Rechner: Zusatz in %-Punkten (Effizienzen addieren sich), Kosten = Grundkosten ÷ (1 + Effizienz/100). Nichts wird gespeichert.
var effSim; // erst in renderResMerged angelegt: render() läuft schon beim Laden
var effSimOn;
function effSimEff(r) {
  return r.eff != null ? r.eff : (r.base / r.cost - 1) * 100;
}
function renderResMerged(p, planRows, bn) {
  const tb = $("effPanelRows"),
    head = $("resHead");
  if (!tb) return;
  if (!effSim) effSim = {};
  const sim = effSim[p.id] || (effSim[p.id] = {}),
    on = !!effSimOn && p.hasPlanData;
  $("esToggle").setAttribute("aria-pressed", on ? "true" : "false");
  $("esToggle").classList.toggle("esOn", on);
  $("esToggle").textContent = on ? "Rechner an ✓" : "Rechner";
  $("esToggle").disabled = !p.hasPlanData;
  $("esReset").hidden = !on;
  $("esHint").textContent = on
    ? "Zusatz in %-Punkten – es wird nichts gespeichert"
    : p.hasPlanData
      ? "Was wäre, wenn bei einem Material Effizienz dazukommt?"
      : "Braucht einen aktiven Plan mit bestätigten Plandaten";
  $("esSum").hidden = !on;
  $("esToggle").onclick = () => {
    effSimOn = !effSimOn;
    renderResMerged(p, planRows, bn);
  };
  $("esReset").onclick = () => {
    effSim[p.id] = {};
    renderResMerged(p, planRows, bn);
  };
  if (!planRows.length || !p.hasPlanData) {
    head.innerHTML = "";
    tb.innerHTML = '<tr><td class="muted">Keine planabhängige Kostengrundlage – der Plan ist nicht aktiv.</td></tr>';
    return;
  }
  const effR = {};
  effRows(p).forEach((r) => (effR[r.m] = r));
  const H = effHistory(p),
    prev = H.prev && H.prev.efficiencies,
    slow = new Set(((p.hasPlanData && bottleneckRows(p)) || { rows: [] }).rows.map((x) => x.m)),
    ncol = on ? 10 : 9;
  head.innerHTML =
    "<tr><th>Material</th><th>Aktuell</th><th>Benötigt</th><th>Fehlt</th><th>Fortschritt</th>" +
    (on ? "<th>Zusatz (%-P.)</th>" : "") +
    "<th>Effizienz</th><th>Änderung</th><th>Grundkosten</th><th>Ersparnis</th></tr>";
  let h = "";
  for (const [g, rs] of resGroups(planRows)) {
    h += `<tr class="resGrp"><td colspan="${ncol}">${g}</td></tr>`;
    for (const r of rs) {
      const m = r[3],
        pc = (r[5] || r[2]) > 0 ? Math.min(100, Math.round((100 * r[1]) / (r[5] || r[2]))) : 100,
        com = /Common/.test(r[0]),
        isB = !!(bn && !bn.none && bn.name === r[0]),
        x = effR[r[0]],
        o = prev && x && isNum(prev[r[0]]) ? prev[r[0]] : null,
        ch =
          o == null || !x || x.eff == null
            ? '<span class="muted">–</span>'
            : x.eff === o
              ? '<span class="muted">±0</span>'
              : `<span class="${x.eff > o ? "green" : "red"}">${x.eff > o ? "+" : "−"}${fx(Math.abs(x.eff - o))} %-P.</span>`,
        save = x ? x.base - x.cost : null;
      h += `<tr data-m="${escAttr(r[0])}" class="${com ? "resCommon" : ""}${isB ? " resBn" : slow.has(r[0]) ? " resSlow" : ""}"><td>${r[0]}${isB ? ' <span class="bnTag">ENGPASS</span>' : ""}</td><td>${fmt(r[1])}</td><td>${fmt(r[2])}</td><td class="esMiss ${m ? (isB ? "amber" : "") : "green"}">${m ? fmt(m) : "gedeckt"}</td><td><span class="prog${m ? "" : " done"}"><i style="width:${pc}%"></i></span> ${pc}%</td>`;
      if (on)
        h += x
          ? `<td><input class="esIn" type="number" step="any" min="0" inputmode="decimal" value="${sim[r[0]] || ""}" placeholder="0" aria-label="Zusätzliche Effizienz ${escAttr(r[0])}"></td>`
          : '<td class="muted">–</td>';
      h += `<td class="esEff">${x ? fx(effSimEff(x)) + " %" : "–"}</td><td>${ch}</td><td>${x ? fmt(x.base) : "–"}</td><td class="${x ? "green" : "muted"}">${x ? `−${fmt(save)} (${Math.round((100 * save) / x.base)} %)` : "–"}</td></tr>`;
    }
  }
  tb.innerHTML = h;
  if (on) {
    tb.querySelectorAll(".esIn").forEach((inp) => {
      inp.oninput = () => {
        const mat = inp.closest("tr").dataset.m,
          v = parseFloat(String(inp.value).replace(",", "."));
        if (isNum(v) && v > 0) sim[mat] = v;
        else delete sim[mat];
        effSimUpdate(p, planRows);
      };
    });
    effSimUpdate(p, planRows);
  }
}
function effSimUpdate(p, planRows) {
  const sim = (effSim && effSim[p.id]) || {},
    rows = effRows(p),
    onHand = Object.fromEntries(planRows.map((r) => [r[0], r[1]])),
    eff0 = {},
    eff1 = {},
    R = {};
  rows.forEach((r) => {
    R[r.m] = r;
    eff0[r.m] = effSimEff(r);
    eff1[r.m] = eff0[r.m] + (sim[r.m] || 0);
  });
  document.querySelectorAll("#effPanelRows tr[data-m]").forEach((tr) => {
    const m = tr.dataset.m,
      r = R[m],
      add = sim[m] || 0;
    tr.classList.toggle("esChg", !!add);
    if (!r) return;
    const have = onHand[m] || 0,
      m0 = Math.max(0, effCost(r.base, eff0[m]) - have),
      m1 = Math.max(0, effCost(r.base, eff1[m]) - have),
      cell = tr.querySelector(".esMiss"),
      ec = tr.querySelector(".esEff");
    if (cell.dataset.orig === undefined) {
      cell.dataset.orig = cell.innerHTML;
      cell.dataset.cls = cell.className;
    }
    if (add) {
      cell.className = "esMiss";
      cell.innerHTML = `${m0 ? fmt(Math.round(m0)) : "gedeckt"} → <b class="${m1 < m0 || !m1 ? "green" : ""}">${m1 ? fmt(Math.round(m1)) : "gedeckt"}</b>`;
      ec.innerHTML = `${fx(eff0[m])} % → <b>${fx(eff1[m])} %</b>`;
    } else {
      cell.innerHTML = cell.dataset.orig;
      cell.className = cell.dataset.cls;
      ec.textContent = fx(eff0[m]) + " %";
    }
  });
  const sum = $("esSum");
  if (!sum) return;
  if (!Object.keys(sim).length) {
    sum.innerHTML =
      '<div><span class="muted">Einfluss auf den Termin</span><b>Noch nichts eingetragen</b><span class="muted">Trag bei einem Material einen Zusatz ein.</span></div>';
    return;
  }
  const w0 = effEtaWith(p, eff0),
    w1 = effEtaWith(p, eff1);
  let t = "–",
    s2 = "Termin noch nicht berechenbar (zu wenige Daten oder zu weit weg)";
  if (w0 && w1) {
    const dd = (x) => new Date(w0.fc.base + x * 864e5).setHours(0, 0, 0, 0),
      g = Math.round((dd(w0.days) - dd(w1.days)) / 864e5);
    t =
      g === 0
        ? "kein ganzer Tag"
        : `<span class="${g > 0 ? "green" : "red"}">${Math.abs(g)} ${Math.abs(g) === 1 ? "Tag" : "Tage"} ${g > 0 ? "früher" : "später"}</span>`;
    s2 = fmtEta(w0.days, w0.fc.base) + " → " + fmtEta(w1.days, w1.fc.base);
  }
  // Was bremst danach? Material mit den meisten Resttagen bei neuen Effizienzen
  let next = null,
    nd = 0;
  const fc = w1 && w1.fc;
  if (fc)
    for (const x of fc.res) {
      if (x.common || !(x.st && x.st.n >= FC_MIN && x.st.real > 0)) continue;
      const r = R[x.m],
        miss = r ? Math.max(0, effCost(r.base, eff1[x.m]) - (onHand[x.m] || 0)) : x.miss;
      if (miss / x.st.real > nd) {
        nd = miss / x.st.real;
        next = x.m;
      }
    }
  const saved = rows.reduce((a, r) => a + (sim[r.m] ? effCost(r.base, eff0[r.m]) - effCost(r.base, eff1[r.m]) : 0), 0);
  sum.innerHTML =
    `<div><span class="muted">Einfluss auf den Termin</span><b>${t}</b><span class="muted">${s2}</span></div>` +
    `<div><span class="muted">Ersparnis bei den Kosten</span><b class="green">−${fmt(Math.round(saved))}</b><span class="muted">über alle geänderten Materialien</span></div>` +
    `<div><span class="muted">Danach bremst</span><b>${next ? escAttr(next.replace("7★ ", "7★ ")) : "–"}</b><span class="muted">${next ? "braucht dann noch ca. " + Math.ceil(nd) + " Tage" : "nicht berechenbar"}</span></div>`;
}
