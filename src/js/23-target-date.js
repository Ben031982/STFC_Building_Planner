// Zieltermin prüfen (ab 2.1, F09) – Seite Was-wäre-wenn.
// Benötigter Tageszuwachs = fehlende Menge ÷ verbleibende Tage. Verglichen wird mit dem Einkommen der
// Prognose (konservativ / realistisch / optimistisch). Packs aus den Stellschrauben fließen nicht ein,
// die Bauzeit ist nicht berücksichtigt. Das Datum wird je Plan gespeichert (p.targetDate, "JJJJ-MM-TT").

// "var": renderWif() kann vor dem Ausführen dieser Datei laufen
var tdPlanId;
const TD_LV = {
  1: { t: "reicht sicher", cls: "t1" },
  2: { t: "reicht", cls: "t2" },
  3: { t: "knapp", cls: "t3" },
  4: { t: "reicht nicht", cls: "t4" },
};
const TD_VERDICT = {
  1: ["Erreichbar", "auch im konservativen Szenario"],
  2: ["Erreichbar", "im realistischen Szenario"],
  3: ["Knapp", "nur im optimistischen Szenario"],
  4: ["Nicht erreichbar", "bei keinem Szenario"],
};

// Ende des gewählten Tages in Ortszeit
function tdEnd(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!m) return null;
  const t = new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59).getTime();
  return Number.isFinite(t) ? t : null;
}

function targetCheck(p, dateStr) {
  const fc = p && p.hasPlanData ? planForecast(p) : null;
  if (!fc) return { err: "Der Plan ist nicht aktiv – erst Plandaten importieren und bestätigen." };
  const end = tdEnd(dateStr);
  if (end == null) return { err: "Bitte ein Datum wählen." };
  if (end <= Date.now()) return { err: "Das Datum liegt nicht in der Zukunft." };
  const days = (end - fc.base) / 864e5;
  let worst = 0,
    crit = null;
  const rows = fc.res.map((x) => {
    if (x.common) return { m: x.m, miss: x.miss, kind: "common" };
    if (x.miss <= 0) return { m: x.m, miss: 0, kind: "done" };
    const need = x.miss / days;
    if (x.st.n < FC_MIN) return { m: x.m, miss: x.miss, need, kind: "data" };
    const h = x.st.real,
      lv = x.st.cons >= need ? 1 : h >= need ? 2 : x.st.opt >= need ? 3 : 4,
      r = { m: x.m, miss: x.miss, need, h, diff: h - need, lv, kind: "ok" };
    worst = Math.max(worst, lv);
    if (!crit || h / need < crit.h / crit.need) crit = r;
    return r;
  });
  const noData = rows.filter((r) => r.kind === "data").map((r) => r.m);
  return { fc, days, rows, lvl: noData.length ? null : worst || 1, crit, noData, allDone: !crit && !noData.length };
}

function tdPlans() {
  return s.plans.filter((p) => calcPlanStatus(p) === "active");
}

function tdVerdict(r) {
  return r.allDone
    ? ["Erreichbar", "alles schon gedeckt", "t1"]
    : r.lvl
      ? TD_VERDICT[r.lvl].concat(TD_LV[r.lvl].cls)
      : ["Nicht bewertbar", "zu wenig Daten", "t3"];
}

// Plan-Karten wie im Dashboard: je Plan ein eigenes „Fertig bis“, Bewertung direkt auf der Karte
function renderTdCards(sel) {
  $("tdCards").innerHTML = s.plans
    .map((p) => {
      const act = calcPlanStatus(p) === "active";
      let state;
      if (!act) state = "<span>nicht aktiv – erst Plandaten bestätigen</span>";
      else if (!p.targetDate) state = "<span>Datum wählen</span>";
      else {
        const r = targetCheck(p, p.targetDate);
        state = r.err
          ? `<span>${escAttr(r.err)}</span>`
          : `<span class="tdV ${tdVerdict(r)[2]}">${tdVerdict(r)[0]}</span><span>noch ${Math.max(0, Math.floor(r.days))} Tage</span>`;
      }
      return `<article class="plan${act && p.id === sel ? " active" : ""}${act ? "" : " off"}" data-td="${escAttr(p.id)}"><div class="pt"><img src="${ART[artKey(p)]}" alt=""><div><h3>${escAttr(p.name)}${p.isMain ? '<span class="mainStar"> ★</span>' : ""}</h3><span class="muted">${isShip(p) ? shipLabel(p) : "Level " + p.start + " → " + p.target}</span></div></div><div class="tdRow"><span>Fertig bis</span>${act ? `<input type="date" data-tdd="${escAttr(p.id)}" value="${escAttr(p.targetDate || "")}">` : "<span>–</span>"}</div><div class="tdState">${state}</div></article>`;
    })
    .join("");
  $("tdCards")
    .querySelectorAll("[data-td]")
    .forEach((c) => {
      if (c.classList.contains("off")) return;
      c.onclick = () => {
        if (tdPlanId === c.dataset.td) return;
        tdPlanId = c.dataset.td;
        renderTarget();
      };
    });
  $("tdCards")
    .querySelectorAll("[data-tdd]")
    .forEach(
      (i) =>
        (i.onchange = () => {
          const p = s.plans.find((x) => x.id === i.dataset.tdd);
          if (!p) return;
          if (i.value) p.targetDate = i.value;
          else delete p.targetDate;
          tdPlanId = p.id;
          persist();
          renderTarget();
        }),
    );
}

function renderTarget() {
  const out = $("tdResult");
  if (!out) return;
  const plans = tdPlans();
  if (!plans.some((p) => p.id === tdPlanId)) {
    const ap = activePlan();
    tdPlanId = plans.length ? (plans.find((p) => p.id === (ap && ap.id)) || plans[0]).id : null;
  }
  if (!s.plans.length) {
    $("tdCards").innerHTML = "";
    $("tdSel").textContent = "";
    out.innerHTML = '<p class="muted tdMsg">Braucht einen aktiven Plan mit bestätigten Plandaten.</p>';
    return;
  }
  renderTdCards(tdPlanId);
  if (!plans.length) {
    $("tdSel").textContent = "";
    out.innerHTML = '<p class="muted tdMsg">Braucht einen aktiven Plan mit bestätigten Plandaten.</p>';
    return;
  }
  const p = plans.find((x) => x.id === tdPlanId),
    fc = planForecast(p);
  $("tdSel").innerHTML =
    `Details für <b>${escAttr(p.name)}</b>` +
    (fc ? " · Prognose heute: " + fcRealTxt(fc) : "") +
    (plans.length > 1 ? " · auf einen anderen Plan klicken, um seine Details zu sehen" : "");
  if (!p.targetDate) {
    out.innerHTML = '<p class="muted tdMsg">Wunschdatum wählen, dann siehst du, ob dein Einkommen reicht.</p>';
    return;
  }
  const r = targetCheck(p, p.targetDate);
  if (r.err) {
    out.innerHTML = `<p class="muted tdMsg">${escAttr(r.err)}</p>`;
    return;
  }
  const V = tdVerdict(r),
    vcls = V[2],
    c = r.crit,
    sg = (v) => (v > 0 ? "+" : "") + fmt(v),
    ct = (p.planData || {}).construction;
  out.innerHTML =
    `<div class="wifSum tdSum"><div><span class="muted">Rechnerische Bewertung</span><b><span class="tdV ${vcls}">${V[0]}</span></b><span class="muted">${V[1]}</span></div>` +
    `<div><span class="muted">Verbleibende Tage</span><b>${Math.max(0, Math.floor(r.days))}</b><span class="muted">ab Datenstand ${new Date(r.fc.base).toLocaleDateString("de-DE")}</span></div>` +
    `<div><span class="muted">Kritisch</span><b>${c ? escAttr(c.m) : "–"}</b><span class="muted">${c ? "braucht " + sg(c.need) + "/Tag, bisher " + sg(c.h) + "/Tag (" + sg(c.diff) + ")" : r.noData.length ? "zu wenig Daten für: " + r.noData.map(escAttr).join(", ") : "nichts offen"}</span></div></div>` +
    `<div class="histWrap"><table class="histTable" style="width:100%"><thead><tr><th>Material</th><th>Fehlt</th><th>Benötigt pro Tag</th><th>Bisher pro Tag</th><th>Differenz</th><th>Bewertung</th></tr></thead><tbody id="tdRows">` +
    r.rows
      .map((x) =>
        x.kind === "common"
          ? `<tr class="muted"><td>${escAttr(x.m)} (zählt nicht)</td><td>${fmt(x.miss)}</td><td>–</td><td>–</td><td>–</td><td>–</td></tr>`
          : x.kind === "done"
            ? `<tr><td>${escAttr(x.m)}</td><td>0</td><td>–</td><td>–</td><td>–</td><td><span class="tdV t1">gedeckt</span></td></tr>`
            : x.kind === "data"
              ? `<tr><td>${escAttr(x.m)}</td><td>${fmt(x.miss)}</td><td>${sg(x.need)}</td><td>–</td><td>–</td><td class="muted">zu wenig Daten</td></tr>`
              : `<tr><td>${escAttr(x.m)}</td><td>${fmt(x.miss)}</td><td>${sg(x.need)}</td><td>${sg(x.h)}</td><td class="${x.diff >= 0 ? "green" : "red"}">${sg(x.diff)}</td><td><span class="tdV ${TD_LV[x.lv].cls}">${TD_LV[x.lv].t}</span></td></tr>`,
      )
      .join("") +
    `</tbody></table></div>` +
    `<div class="chartNote" style="margin-top:8px">Benötigt pro Tag = Fehlt ÷ verbleibende Tage. Bisher = realistisches Einkommen der letzten 6 Wochen wie in der Prognose. „Reicht sicher“: auch das konservative Einkommen genügt, „knapp“: nur das optimistische. Die Bauzeit ist nicht berücksichtigt${ct && ct.cost ? " (laut Plan " + fmtDuration(ct.cost) + ")" : ""}, die Stellschrauben oben auch nicht. Rechnerische Bewertung, keine Garantie.</div>`;
}
