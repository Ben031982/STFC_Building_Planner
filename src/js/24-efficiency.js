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
    `<div class="histWrap"><table class="histTable" style="width:100%"><thead><tr><th>Material</th><th>Effizienz</th><th>Vorher${prev ? " (" + prevAt + ")" : ""}</th><th>Änderung</th><th>Grundkosten</th><th>Kosten</th><th>Ersparnis</th></tr></thead><tbody id="effPanelRows">` +
    rows
      .map((r) => {
        const o = prev && isNum(prev[r.m]) ? prev[r.m] : null,
          ch =
            o == null || r.eff == null
              ? '<td class="muted">–</td>'
              : r.eff === o
                ? '<td class="muted">±0</td>'
                : `<td class="${r.eff > o ? "green" : "red"}">${r.eff > o ? "+" : "−"}${fx(Math.abs(r.eff - o))} %-P.</td>`,
          save = r.base - r.cost;
        return `<tr><td>${escAttr(r.m)}</td><td>${r.eff == null ? "–" : fx(r.eff) + " %"}</td><td>${o == null ? "–" : fx(o) + " %"}</td>${ch}<td>${fmt(r.base)}</td><td>${fmt(r.cost)}</td><td class="green">−${fmt(save)} (${Math.round((100 * save) / r.base)} %)</td></tr>`;
      })
      .join("") +
    `</tbody></table></div>` +
    `<div class="chartNote" style="margin-top:8px">Kosten = Grundkosten ÷ (1 + Effizienz). Der Verlauf beginnt mit Version 2.1: Ab jetzt merkt sich der Planner die Effizienzen bei jedem Plan-Import. „Einfluss auf den Termin“ rechnet die heutigen Grundkosten mit den früheren Effizienzen, bei gleichem Bestand und Einkommen. Frühere Termine und Raten werden nicht nachträglich umgerechnet.</div>`;
}

// Effizienzrechner (ab 5.0): Was wäre, wenn ein Material mehr Effizienz bekäme? Nichts davon wird gespeichert.
// Zusatzwerte in %-Punkten (Effizienzen addieren sich), Kosten = Grundkosten ÷ (1 + Effizienz/100).
var effSim; // erst in renderEffSim angelegt: render() läuft schon beim Laden
function effSimEff(r) {
  return r.eff != null ? r.eff : (r.base / r.cost - 1) * 100;
}
function renderEffSim(p) {
  const box = $("effSimBody");
  if (!box) return;
  if (!p || !p.hasPlanData) {
    box.innerHTML = '<p class="muted">Braucht einen aktiven Plan mit bestätigten Plandaten.</p>';
    return;
  }
  const rows = effRows(p);
  if (!rows.length) {
    box.innerHTML = '<p class="muted">Für diesen Plan liegen keine Grundkosten vor.</p>';
    return;
  }
  if (!effSim) effSim = {};
  const sim = effSim[p.id] || (effSim[p.id] = {});
  box.innerHTML =
    '<p class="muted" style="margin:4px 0 8px">Trag ein, wie viele %-Punkte Effizienz bei einem Material dazukommen, und sieh, wie sich Kosten, Fehlmenge und Termin ändern. Bestand und Einkommen bleiben wie heute. Es wird nichts gespeichert.</p>' +
    '<div id="esSum" class="wifSum effSum"></div>' +
    '<div class="histWrap"><table class="histTable" style="width:100%"><thead><tr><th>Material</th><th>Effizienz heute</th><th>Zusatz (%-Punkte)</th><th>Effizienz neu</th><th>Kosten</th><th>Fehlt</th></tr></thead><tbody>' +
    rows
      .map(
        (r, i) =>
          `<tr data-i="${i}"><td>${escAttr(r.m)}</td><td>${fx(effSimEff(r))} %</td><td><input class="esIn" type="number" step="any" min="0" inputmode="decimal" style="width:90px" value="${sim[r.m] ? sim[r.m] : ""}" placeholder="0" aria-label="Zusätzliche Effizienz ${escAttr(r.m)}"></td><td class="esEff"></td><td class="esCost"></td><td class="esMiss"></td></tr>`,
      )
      .join("") +
    '</tbody></table></div><div style="margin-top:8px"><button class="btn" id="esReset">Zurücksetzen</button></div>';
  box.querySelectorAll(".esIn").forEach((inp) => {
    inp.oninput = () => {
      const m = rows[+inp.closest("tr").dataset.i].m,
        v = parseFloat(String(inp.value).replace(",", "."));
      if (isNum(v) && v > 0) sim[m] = v;
      else delete sim[m];
      effSimUpdate(p, rows);
    };
  });
  $("esReset").onclick = () => {
    effSim[p.id] = {};
    renderEffSim(p);
  };
  effSimUpdate(p, rows);
}
function effSimUpdate(p, rows) {
  const sim = (effSim && effSim[p.id]) || {},
    cur = Object.fromEntries(getPlanResources(p).map((r) => [r[0], r[1]])),
    tb = document.querySelectorAll("#effSimBody tbody tr");
  const eff0 = {},
    eff1 = {};
  rows.forEach((r, i) => {
    const e = effSimEff(r),
      add = sim[r.m] || 0;
    eff0[r.m] = e;
    eff1[r.m] = e + add;
    const c0 = effCost(r.base, e),
      c1 = effCost(r.base, e + add),
      have = cur[r.m] || 0,
      m0 = Math.max(0, c0 - have),
      m1 = Math.max(0, c1 - have),
      tr = tb[i];
    if (!tr) return;
    tr.querySelector(".esEff").innerHTML = add ? `<b>${fx(e + add)} %</b>` : '<span class="muted">–</span>';
    tr.querySelector(".esCost").innerHTML = add
      ? `${fmt(Math.round(c0))} → <b class="green">${fmt(Math.round(c1))}</b>`
      : `<span class="muted">${fmt(Math.round(c0))}</span>`;
    tr.querySelector(".esMiss").innerHTML = add
      ? `${fmt(Math.round(m0))} → <b class="${m1 < m0 ? "green" : ""}">${fmt(Math.round(m1))}</b>`
      : `<span class="muted">${fmt(Math.round(m0))}</span>`;
  });
  const sum = $("esSum");
  if (!sum) return;
  if (!Object.keys(sim).length) {
    sum.innerHTML = '<div><span class="muted">Einfluss auf den Termin</span><b>Noch nichts eingetragen</b><span class="muted">Trag bei einem Material einen Zusatz ein.</span></div>';
    return;
  }
  const w0 = effEtaWith(p, eff0),
    w1 = effEtaWith(p, eff1);
  let t = "–",
    s = "Termin noch nicht berechenbar (zu wenige Daten oder zu weit weg)";
  if (w0 && w1) {
    const dd = (x) => new Date(w0.fc.base + x * 864e5).setHours(0, 0, 0, 0),
      g = Math.round((dd(w0.days) - dd(w1.days)) / 864e5);
    t =
      g === 0
        ? "kein ganzer Tag"
        : `<span class="${g > 0 ? "green" : "red"}">${Math.abs(g)} ${Math.abs(g) === 1 ? "Tag" : "Tage"} ${g > 0 ? "früher" : "später"}</span>`;
    s = fmtEta(w0.days, w0.fc.base) + " → " + fmtEta(w1.days, w1.fc.base);
  }
  const saved = rows.reduce((a, r) => a + (sim[r.m] ? effCost(r.base, eff0[r.m]) - effCost(r.base, eff1[r.m]) : 0), 0);
  sum.innerHTML =
    `<div><span class="muted">Einfluss auf den Termin</span><b>${t}</b><span class="muted">${s}</span></div>` +
    `<div><span class="muted">Ersparnis bei den Kosten</span><b class="green">−${fmt(Math.round(saved))}</b><span class="muted">über alle geänderten Materialien</span></div>`;
}
