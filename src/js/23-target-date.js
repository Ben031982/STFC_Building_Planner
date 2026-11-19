// Zieltermin prüfen (ab 2.1, F09) – Seite Was-wäre-wenn.
// Benötigter Tageszuwachs = fehlende Menge ÷ verbleibende Tage. Verglichen wird mit dem Einkommen der
// Prognose (konservativ / realistisch / optimistisch). Packs aus den Stellschrauben fließen nicht ein,
// die Bauzeit ist nicht berücksichtigt. Das Datum wird je Plan gespeichert (p.targetDate, "JJJJ-MM-TT").

// "var": renderWif() kann vor dem Ausführen dieser Datei laufen
var tdPlanId;
// Texte als Getter: werden erst beim Anzeigen in der gewählten Sprache geholt
const TD_LV = {
  1: { get t() { return _t("td.lv1"); }, cls: "t1" },
  2: { get t() { return _t("td.lv2"); }, cls: "t2" },
  3: { get t() { return _t("td.lv3"); }, cls: "t3" },
  4: { get t() { return _t("td.lv4"); }, cls: "t4" },
};
const TD_VERDICT = {
  get 1() { return [_t("td.erreichbar"), _t("td.v1")]; },
  get 2() { return [_t("td.erreichbar"), _t("td.v2")]; },
  get 3() { return [_t("td.knapp"), _t("td.v3")]; },
  get 4() { return [_t("td.nicht_erreichbar"), _t("td.v4")]; },
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
  if (!fc) return { err: _t("td.err_inaktiv") };
  const end = tdEnd(dateStr);
  if (end == null) return { err: _t("td.err_datum") };
  if (end <= Date.now()) return { err: _t("td.err_zukunft") };
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
  const noData = rows.filter((r) => r.kind === "data").map((r) => r.m),
    yard = typeof shipYardBlock === "function" ? shipYardBlock(p) : null;
  if (yard) return { fc, days, rows, lvl: null, crit, noData, allDone: false, yard };
  return { fc, days, rows, lvl: noData.length ? null : worst || 1, crit, noData, allDone: !crit && !noData.length };
}

function tdPlans() {
  return s.plans.filter((p) => calcPlanStatus(p) === "active");
}

function tdVerdict(r) {
  return r.yard
    ? [_t("td.nicht_bewertbar"), _t("common.werft_fehlt", { n: r.yard.yard }), "t3"]
    : r.allDone
    ? [_t("td.erreichbar"), _t("td.alles_gedeckt"), "t1"]
    : r.lvl
      ? TD_VERDICT[r.lvl].concat(TD_LV[r.lvl].cls)
      : [_t("td.nicht_bewertbar"), _t("common.zu_wenig_daten"), "t3"];
}

// Plan-Karten wie im Dashboard: je Plan ein eigenes „Fertig bis“, Bewertung direkt auf der Karte
function renderTdCards(sel) {
  $("tdCards").innerHTML = s.plans
    .map((p) => {
      const act = calcPlanStatus(p) === "active";
      let state;
      if (!act) state = `<span>${_t("td.nicht_aktiv")}</span>`;
      else if (!p.targetDate) state = `<span>${_t("td.datum_waehlen")}</span>`;
      else {
        const r = targetCheck(p, p.targetDate);
        state = r.err
          ? `<span>${escAttr(r.err)}</span>`
          : `<span class="tdV ${tdVerdict(r)[2]}">${tdVerdict(r)[0]}</span><span>${r.yard ? tdVerdict(r)[1] : _t("td.noch_tage", { n: Math.max(0, Math.floor(r.days)) })}</span>`;
      }
      return `<article class="plan${act && p.id === sel ? " active" : ""}${act ? "" : " off"}" data-td="${escAttr(p.id)}"><div class="pt"><img src="${ART[artKey(p)]}" alt=""><div><h3>${escAttr(p.name)}${p.isMain ? '<span class="mainStar"> ★</span>' : ""}</h3><span class="muted">${isShip(p) ? shipLabel(p) : _t("common.level_von_bis", { a: p.start, b: p.target })}</span></div></div><div class="tdRow"><span>${_t("td.fertig_bis")}</span>${act ? `<input type="date" data-tdd="${escAttr(p.id)}" value="${escAttr(p.targetDate || "")}">` : "<span>–</span>"}</div><div class="tdState">${state}</div></article>`;
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
    out.innerHTML = `<p class="muted tdMsg">${_t("td.braucht_aktiv")}</p>`;
    return;
  }
  renderTdCards(tdPlanId);
  if (!plans.length) {
    $("tdSel").textContent = "";
    out.innerHTML = `<p class="muted tdMsg">${_t("td.braucht_aktiv")}</p>`;
    return;
  }
  const p = plans.find((x) => x.id === tdPlanId),
    fc = planForecast(p);
  $("tdSel").innerHTML =
    _t("td.details", { name: escAttr(p.name) }) +
    (fc ? _t("td.prognose_heute", { v: fcRealTxt(fc, p) }) : "") +
    (plans.length > 1 ? _t("td.anderer_plan") : "");
  if (!p.targetDate) {
    out.innerHTML = `<p class="muted tdMsg">${_t("td.wunsch")}</p>`;
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
    `<div class="wifSum tdSum"><div><span class="muted">${_t("td.bewertung")}</span><b><span class="tdV ${vcls}">${V[0]}</span></b><span class="muted">${V[1]}</span></div>` +
    `<div><span class="muted">${_t("td.verbleibend")}</span><b>${Math.max(0, Math.floor(r.days))}</b><span class="muted">${_t("td.ab_stand", { d: new Date(r.fc.base).toLocaleDateString(LOC()) })}</span></div>` +
    `<div><span class="muted">${_t("td.kritisch")}</span><b>${c ? escAttr(c.m) : "–"}</b><span class="muted">${c ? _t("td.braucht", { a: sg(c.need), b: sg(c.h), d: sg(c.diff) }) : r.noData.length ? _t("td.zu_wenig_fuer", { list: r.noData.map(escAttr).join(", ") }) : _t("td.nichts_offen")}</span></div></div>` +
    `<div class="histWrap"><table class="histTable" style="width:100%"><thead><tr><th>${_t("common.material")}</th><th>${_t("pk.th_fehlt")}</th><th>${_t("td.th_ben")}</th><th>${_t("td.th_bisher")}</th><th>${_t("td.th_diff")}</th><th>${_t("td.th_bew")}</th></tr></thead><tbody id="tdRows">` +
    r.rows
      .map((x) =>
        x.kind === "common"
          ? `<tr class="muted"><td>${escAttr(x.m)} (${_t("fc.zaehlt_nicht")})</td><td>${fmt(x.miss)}</td><td>–</td><td>–</td><td>–</td><td>–</td></tr>`
          : x.kind === "done"
            ? `<tr><td>${escAttr(x.m)}</td><td>0</td><td>–</td><td>–</td><td>–</td><td><span class="tdV t1">${_t("common.gedeckt")}</span></td></tr>`
            : x.kind === "data"
              ? `<tr><td>${escAttr(x.m)}</td><td>${fmt(x.miss)}</td><td>${sg(x.need)}</td><td>–</td><td>–</td><td class="muted">${_t("common.zu_wenig_daten")}</td></tr>`
              : `<tr><td>${escAttr(x.m)}</td><td>${fmt(x.miss)}</td><td>${sg(x.need)}</td><td>${sg(x.h)}</td><td class="${x.diff >= 0 ? "green" : "red"}">${sg(x.diff)}</td><td><span class="tdV ${TD_LV[x.lv].cls}">${TD_LV[x.lv].t}</span></td></tr>`,
      )
      .join("") +
    `</tbody></table></div>` +
    `<div class="chartNote" style="margin-top:8px">${_t("td.note", { bz: ct && ct.cost ? _t("td.laut_plan", { d: fmtDuration(ct.cost) }) : "" })}</div>`;
}
