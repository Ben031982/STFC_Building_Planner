const FC_WINDOW_DAYS = 42,
  FC_MIN = 3,
  // Ab 2.1: Mindestabstand zweier Exporte für einen Abschnitt 20 statt 24 Stunden
  FC_GAP_H = 20,
  FC_GAP_DAYS = FC_GAP_H / 24,
  // Ab 2.1: Über 1 Jahr nur noch Monat und Jahr („ca. Mai 2032“), über 100 Jahre „nicht absehbar“
  // (Schutz vor unsinnigen Werten wie „Invalid Date“).
  FC_YEAR = 365.25,
  FC_MAX_DAYS = 100 * FC_YEAR;
function fcTooFar(days) {
  return days != null && !(Number.isFinite(days) && days <= FC_MAX_DAYS);
}
function fcYearsN(days) {
  return Math.max(1, Math.round((days / FC_YEAR) * 2) / 2);
}
function fcYears(days) {
  const y = fcYearsN(days);
  return _t(y === 1 ? "fc.jahr" : "fc.jahre", { n: y.toLocaleString(LOC()) });
}
// Datum eines Termins: bis 1 Jahr Tagesdatum, darüber „ca. Mai 2032“
function fcDate(base, days) {
  const d = new Date(base + days * 864e5);
  return days > FC_YEAR
    ? _t("fc.ca_monat", { d: d.toLocaleDateString(LOC(), { month: "long", year: "numeric" }) })
    : d.toLocaleDateString(LOC());
}
// Dauer: „9 Tage“, „~12 Wochen“, „~5,5 Jahre“
function fcDur(days) {
  return days < 14
    ? _t(Math.ceil(days) === 1 ? "fc.dur_tag" : "fc.dur_tage", { n: Math.ceil(days) })
    : days <= FC_YEAR
      ? _t("fc.dur_wochen", { n: Math.round(days / 7) })
      : "~" + fcYears(days);
}
function quant(arr, q) {
  const a = [...arr].sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * q,
    lo = Math.floor(pos),
    hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
// Gewichtetes Quantil (ab 1.4): längere Abschnitte zählen mehr. Bei gleichen Gewichten ergibt es exakt
// dasselbe wie quant() (Verallgemeinerung der üblichen linearen Interpolation).
function quantW(items, q) {
  const a = items.filter((x) => x.w > 0).sort((x, y) => x.v - y.v),
    n = a.length;
  if (!n) return null;
  if (n === 1) return a[0].v;
  let cum = 0;
  const S = a.map((x, k) => {
    const s = k * x.w + (n - 1) * cum;
    cum += x.w;
    return s;
  });
  const t = q * S[n - 1];
  for (let k = 0; k < n - 1; k++)
    if (t <= S[k + 1]) return S[k + 1] === S[k] ? a[k].v : a[k].v + ((a[k + 1].v - a[k].v) * (t - S[k])) / (S[k + 1] - S[k]);
  return a[n - 1].v;
}
function snapIntervals(m) {
  const pts = s.snapshots
      .filter((x) => x.values && isNum(x.values[m]))
      .map((x) => ({ id: x.id, t: new Date(snapTime(x)), v: x.values[m] }))
      .sort((a, b) => a.t - b.t),
    out = [];
  let i = 0;
  for (let j = 1; j < pts.length; j++) {
    if ((pts[j].t - pts[i].t) / 864e5 >= FC_GAP_DAYS) {
      out.push({ a: pts[i], b: pts[j] });
      i = j;
    }
  }
  return out;
}
// ---------------------------------------------------------------- Einkommen (ab 5.3)
// Verbautes aus der Plan-Historie: nur Kostensenkungen, bei denen der Baufortschritt gestiegen ist. Ein Neuimport mit
// neuen Effizienzen oder anderem Umfang senkt die Kosten auch, ist aber kein Bau (Bens Daten 13.11.2026).
function buildSteps(p, m) {
  const h = ((p.planData || {}).history || [])
    .filter((x) => x.resources && x.resources[m] && isNum(x.resources[m].cost))
    .map((x) => ({
      t: new Date(x.at).getTime(),
      c: x.resources[m].cost,
      done: x.progress && isNum(x.progress.done) ? x.progress.done : null,
    }))
    .sort((a, b) => a.t - b.t);
  const out = [];
  for (let i = 1; i < h.length; i++) {
    const a = h[i - 1],
      b = h[i];
    if (a.done != null && b.done != null && b.done > a.done && a.c > b.c) out.push({ t: b.t, d: a.c - b.c });
  }
  return out;
}
// Verbautes zwischen zwei Zeitpunkten, unabhängig vom Plan. Gebaut wurde vor dem Export, der dem Plan-Import vorausging –
// deshalb zählt der Zeitpunkt dieses Exports. Derselbe Bau steht oft in mehreren Plänen: je Zeitraum das Maximum.
function builtBetween(m, ta, tb) {
  const ts = s.snapshots.map((x) => new Date(snapTime(x)).getTime()).sort((a, b) => a - b),
    before = (t) => {
      let r = null;
      for (const x of ts) {
        if (x > t) break;
        r = x;
      }
      return r;
    };
  let best = 0;
  for (const p of s.plans || []) {
    if (!p.planData) continue;
    let sum = 0;
    for (const st of buildSteps(p, m)) {
      const L = before(st.t);
      if (L != null && L > ta && L <= tb) sum += st.d;
    }
    best = Math.max(best, sum);
  }
  return best;
}
// Eingetragene Packkäufe zwischen zwei Zeitpunkten: Anzahl × bekannter Packinhalt
function packBuyPack(b) {
  return b.pack === "station" ? (s.packs || [])[0] : (s.shipPacks || {})[b.pack];
}
function packsBetween(m, ta, tb) {
  let sum = 0;
  for (const b of s.packBuys || []) {
    const t = new Date(b.t).getTime(),
      pk = packBuyPack(b),
      c = pk && pk.contents && pk.contents[m];
    if (t > ta && t <= tb && c && +c.amount > 0) sum += (+b.n || 0) * +c.amount;
  }
  return sum;
}
// Raten je Material (ab 5.3, für alle Pläne gleich):
// realistisch = Durchschnitt über die zählenden Abschnitte der letzten 6 Wochen (Event-Belohnungen zählen mit),
// konservativ/optimistisch = schwache bzw. starke 7-Tage-Blöcke. Eingetragene Packkäufe werden abgezogen.
// Nicht mitgezählt: große ungeklärte Abnahmen (vermutlich Bau) und Abschnitte, die du selbst ausschließt.
// p bleibt als Parameter, damit alle Aufrufer unverändert bleiben.
function rateStats(p, m) {
  const iv = snapIntervals(m);
  if (!iv.length) return { rows: [], n: 0, span: 0, cons: null, real: null, opt: null };
  const lastT = iv[iv.length - 1].b.t,
    ov = s.rateOverrides || {};
  const rows = iv
    .filter((x) => (lastT - x.b.t) / 864e5 <= FC_WINDOW_DAYS)
    .map((x) => {
      const ta = x.a.t.getTime(),
        tb = x.b.t.getTime(),
        days = (tb - ta) / 864e5,
        built = builtBetween(m, ta, tb),
        packs = packsBetween(m, ta, tb),
        delta = x.b.v - x.a.v;
      return { key: x.a.id + ">" + x.b.id, from: x.a.t, to: x.b.t, days, delta, built, packs, rate: (delta + built - packs) / days };
    });
  const free = rows.filter((r) => ov[r.key] !== "exclude" && r.rate >= 0),
    fd = free.reduce((a, r) => a + r.days, 0),
    ref = fd > 0 ? free.reduce((a, r) => a + r.rate * r.days, 0) / fd : null;
  rows.forEach((r) => {
    r.flag = null;
    if (ref != null && ref > 0) {
      if (r.rate < -ref) r.flag = "bau";
      else if (r.rate > 3 * ref) r.flag = "spike";
    }
    r.included = ov[r.key] === "exclude" ? false : r.flag !== "bau";
  });
  const inc = rows.filter((r) => r.included),
    span = inc.reduce((a, r) => a + r.days, 0),
    real = span > 0 ? inc.reduce((a, r) => a + r.rate * r.days, 0) / span : null;
  // Bandbreite aus gleitenden 7-Tage-Blöcken der zählenden Abschnitte: Event-Spitzen verteilen sich über die Woche.
  // konservativ = schwache Wochen (unteres Viertel), optimistisch = starke Wochen (oberstes Zehntel). Das obere Viertel
  // reicht nicht: bei Einkommen aus wenigen großen Event-Sprüngen liegt der Durchschnitt oft darüber.
  // Unter 7 Tagen Daten: einzelne Abschnitte.
  const blocks = [];
  for (let i = 0; i < inc.length; i++) {
    let d = 0,
      g = 0;
    for (let j = i; j < inc.length && d < 7; j++) {
      d += inc[j].days;
      g += inc[j].rate * inc[j].days;
    }
    if (d >= 7) blocks.push({ v: g / d, w: 1 });
  }
  const src = blocks.length >= 3 ? blocks : inc.map((r) => ({ v: r.rate, w: r.days }));
  let cons = quantW(src, 0.25),
    opt = quantW(src, 0.9);
  if (real != null) {
    cons = cons == null ? real : Math.min(cons, real);
    opt = opt == null ? real : Math.max(opt, real);
  }
  return { rows, n: inc.length, span, blocks: blocks.length, cons, real, opt };
}
function planBottleneck(p, rows) {
  const b = getBottleneck(rows);
  if (!b || b.none || !p.hasPlanData) return b;
  const fc = planForecast(p),
    o = fc && fc.overall;
  if (o && o.real > 0 && o.realDriver) {
    const r = rows.find((x) => x[0] === o.realDriver);
    return {
      name: o.realDriver,
      missing: r ? r[3] : 0,
      share: r && (r[5] || r[2]) > 0 ? r[3] / (r[5] || r[2]) : 0,
      days: o.real,
      fc: true,
    };
  }
  return Object.assign({}, b, { provisional: true });
}
function planForecast(p) {
  if (!p.hasPlanData) return null;
  const rows = getPlanResources(p),
    snap = latestSnapshot(),
    imp = (p.planData || {}).importedAt,
    base =
      Math.max(snap ? new Date(snapTime(snap)).getTime() : 0, imp ? new Date(imp).getTime() : 0) ||
      Date.now();
  const res = rows.map((r) => {
    const m = r[0],
      miss = r[3],
      st = rateStats(p, m),
      raw = (k) => (miss <= 0 ? 0 : st.n >= FC_MIN && st[k] > 0 ? miss / st[k] : null),
      far = (k) => fcTooFar(raw(k)),
      eta = (k) => (far(k) ? null : raw(k));
    return {
      m,
      miss,
      st,
      common: isLatinumMat(m),
      eta: { cons: eta("cons"), real: eta("real"), opt: eta("opt") },
      far: { cons: far("cons"), real: far("real"), opt: far("opt") },
      status: miss <= 0 ? "done" : st.n < FC_MIN ? "data" : st.real > 0 ? (far("real") ? "far" : "ok") : "neg",
    };
  });
  const rel = res.filter((x) => !x.common && x.miss > 0),
    overall = {};
  for (const k of ["cons", "real", "opt"]) {
    if (!rel.length) {
      overall[k] = 0;
      continue;
    }
    const bad = rel.filter((x) => x.eta[k] == null);
    if (bad.length) {
      overall[k] = null;
      overall[k + "Far"] = bad.every((x) => x.far[k]);
      continue;
    }
    const mx = rel.reduce((a, b) => (b.eta[k] > a.eta[k] ? b : a));
    overall[k] = mx.eta[k];
    overall[k + "Driver"] = mx.m;
  }
  overall.missingData = rel.filter((x) => x.status === "data").map((x) => x.m);
  overall.negative = rel.filter((x) => x.status === "neg").map((x) => x.m);
  overall.far = rel.filter((x) => x.status === "far").map((x) => x.m);
  overall.minN = rel.length ? Math.min(...rel.map((x) => x.st.n)) : 0;
  overall.minSpan = rel.length ? Math.min(...rel.map((x) => x.st.span || 0)) : 0;
  return { res, overall, base };
}
// Gesamtprognose (realistisch) als Text – „zu wenig Daten“ statt „nicht absehbar“, solange Daten fehlen
function fcRealTxt(fc, p) {
  const yb = p && typeof shipYardBlock === "function" ? shipYardBlock(p) : null;
  if (yb) return _t("common.werft_fehlt", { n: yb.yard });
  const o = fc.overall;
  return o.real == null && !o.realFar && o.missingData.length ? _t("common.zu_wenig_daten") : fmtEta(o.real, fc.base, o.realFar);
}
function fmtEta(days, base, far) {
  if (days == null) return _t("fc.far");
  if (fcTooFar(days)) return _t("fc.far");
  if (days <= 0) return _t("common.gedeckt");
  return fcDate(base, days) + " (" + fcDur(days) + ")";
}
// Prognose-Qualität (ab 1.4): nach Zahl der zählenden Abschnitte und abgedecktem Zeitraum.
// Maßgeblich ist das Material mit den wenigsten Daten.
const FC_Q = { brauchbar: { n: 6, days: 14 }, stabil: { n: 10, days: 28 } };
function fcQuality(fc) {
  const o = fc && fc.overall;
  if (!o || !(o.real > 0)) return null;
  const n = o.minN,
    days = Math.round(o.minSpan),
    lvl =
      n >= FC_Q.stabil.n && days >= FC_Q.stabil.days
        ? "stabil"
        : n >= FC_Q.brauchbar.n && days >= FC_Q.brauchbar.days
          ? "brauchbar"
          : "vorläufig",
    goal = lvl === "vorläufig" ? FC_Q.brauchbar : lvl === "brauchbar" ? FC_Q.stabil : null;
  return {
    lvl,
    cls: { vorläufig: "qv", brauchbar: "qb", stabil: "qs" }[lvl],
    // lvl bleibt der interne (deutsche) Wert, label ist die Anzeige
    label: _t({ vorläufig: "q.vorlaeufig", brauchbar: "q.brauchbar", stabil: "q.stabil" }[lvl]),
    seg: { vorläufig: 1, brauchbar: 2, stabil: 3 }[lvl],
    n,
    days,
    have: _t("q.have", { a: _t(n === 1 ? "q.abschnitt1" : "q.abschnitte", { n }), b: _t(days === 1 ? "fc.dur_tag" : "fc.dur_tage", { n: days }) }),
    next: goal ? _t("q.next", { l: _t(lvl === "vorläufig" ? "q.brauchbar" : "q.stabil"), n: goal.n, d: goal.days }) : "",
  };
}
function qualityHtml(q, withText) {
  const segs = [1, 2, 3].map((k) => `<i class="${k <= q.seg ? q.cls : ""}"></i>`).join("");
  return `<span class="qSeg">${segs}</span>${q.have}${q.next ? " · " + q.next : ""}`;
}
function renderQuality(fc) {
  const q = fcQuality(fc),
    b = $("fcQBadge"),
    l = $("fcQLine");
  b.hidden = l.hidden = !q;
  if (!q) return null;
  b.className = "qBadge " + q.cls;
  b.textContent = q.label.toUpperCase();
  l.innerHTML = qualityHtml(q);
  return q;
}
function renderForecast(p) {
  const fc = planForecast(p),
    sg = (v) => (v > 0 ? "+" : "") + fmt(v);
  if (!fc) {
    $("etaValue").textContent = _t("dash.nicht_berechenbar");
    $("etaDetail").textContent = _t("fc.keine_kosten");
    renderQuality(null);
    $("fcSummary").innerHTML = `<p class="muted">${_t("fc.nicht_aktiv")}</p>`;
    $("fcRows").innerHTML = "";
    $("fcIntervals").innerHTML = "";
    $("fcBuild").textContent = "";
    return;
  }
  const o = fc.overall;
  let val, det;
  if (o.real === 0) {
    val = _t("fc.gedeckt_val");
    det = _t("fc.alle_vorhanden");
  } else if (o.real == null) {
    val = _t("fc.offen_val");
    det = o.missingData.length
      ? _t("fc.zu_wenig", { n: o.minN, min: FC_MIN })
      : o.negative.length
        ? _t("fc.negativ", { list: o.negative.join(", ") })
        : o.far.length
          ? _t("fc.ueber100", { list: o.far.join(", ") })
          : _t("fc.szen_nicht");
  } else {
    val = fcDate(fc.base, o.real);
    det =
      (o.real < 14
        ? _t(Math.ceil(o.real) === 1 ? "fc.in_tag" : "fc.in_tagen", { n: Math.ceil(o.real) })
        : o.real <= FC_YEAR
          ? _t("fc.in_wochen", { n: Math.round(o.real / 7) })
          : _t(fcYearsN(o.real) === 1 ? "fc.in_jahr" : "fc.in_jahren", { n: fcYearsN(o.real).toLocaleString(LOC()) })) +
      " · " +
      _t("wif.kons_opt", {
        a: o.cons == null ? (o.consFar ? _t("fc.ueber100_kurz") : _t("common.offen")) : fcDate(fc.base, o.cons),
        b: o.opt == null ? _t("common.offen") : fcDate(fc.base, o.opt),
      });
  }
  if (typeof chainAncestors === "function" && chainAncestors(p).some((q) => calcPlanStatus(q) === "active"))
    det += " · " + _t("dash.nach", { name: chainAncestors(p).map((q) => q.name).join(" → ") });
  // ab 3.0: Schiff ohne nötige Schiffswerft – kein Fertigdatum, nur wann die Ressourcen gedeckt sind
  const yb = typeof shipYardBlock === "function" ? shipYardBlock(p) : null;
  if (yb) {
    val = _t("common.werft_fehlt", { n: yb.yard });
    det =
      (o.real === 0
        ? _t("fc.res_gedeckt")
        : o.real != null
          ? _t(o.real > FC_YEAR ? "fc.res_vorauss" : "fc.res_vorauss_am", { d: fcDate(fc.base, o.real) })
          : det) +
      " · " +
      shipYardHint(yb);
  }
  $("etaValue").textContent = val;
  $("etaValue").classList.toggle("etaBlock", !!yb);
  $("etaDetail").textContent = det;
  // ab 3.3: alles gedeckt → dezenter Hinweis aufs Abschließen (gedeckt heißt noch nicht gebaut)
  if (o.real === 0 && !yb) {
    $("etaDetail").insertAdjacentHTML(
      "beforeend",
      `<span class="etaGoal">${_t("fc.sobald_gebaut")} <a href="#" id="etaGoalLink">${_t("fc.link_ziel")}</a> ${_t("fc.dann_erscheint")}</span>`,
    );
    $("etaGoalLink").onclick = (e) => {
      e.preventDefault();
      openManage();
      const b = $("completePlanBtn");
      if (b) b.scrollIntoView({ block: "center" });
    };
  }
  const q = renderQuality(fc),
    // fehlen Daten, ist das Szenario offen – nicht „nicht absehbar“ (das heißt: über 100 Jahre)
    card = (d, far) => (d == null && !far && o.missingData.length ? _t("common.zu_wenig_daten") : fmtEta(d, fc.base, far));
  if (yb) $("fcQBadge").hidden = $("fcQLine").hidden = true;
  $("fcSummary").innerHTML =
    (yb
      ? `<div class="yardBlock"><b>${_t("common.werft_fehlt", { n: yb.yard })}</b> ${_t("fc.yard_block", { n: yb.have })} ${escAttr(shipYardHint(yb))}.</div>`
      : "") +
    (q
      ? `<div class="fcQuality"><div><span class="muted">${_t("fc.qualitaet")}</span><span class="qBadge ${q.cls}">${q.label.toUpperCase()}</span></div><p>${qualityHtml(q)}.</p><details class="fcNote"><summary>${_t("fc.so_bewertet")}</summary><p class="muted">${_t("fc.q_erkl", { bn: FC_Q.brauchbar.n, bd: FC_Q.brauchbar.days, sn: FC_Q.stabil.n, sd: FC_Q.stabil.days })}</p></details></div>`
      : "") +
    `<div class="fcCard"><div><span class="muted">${_t("fc.card_kons")}</span><b>${card(o.cons, o.consFar)}</b><span class="muted">${o.consDriver ? escAttr(o.consDriver) : ""}</span></div><div class="real"><span class="muted">${_t("fc.card_real")}</span><b>${card(o.real, o.realFar)}</b><span class="muted">${o.realDriver ? _t("fc.bestimmt", { m: escAttr(o.realDriver) }) : ""}</span></div><div><span class="muted">${_t("fc.card_opt")}</span><b>${card(o.opt, o.optFar)}</b><span class="muted">${o.optDriver ? escAttr(o.optDriver) : ""}</span></div></div>` +
    (o.missingData.length
      ? `<p class="muted">${_t("fc.zu_wenig_fuer", { list: o.missingData.map(escAttr).join(", "), n: FC_MIN, h: FC_GAP_H })}</p>`
      : "") +
    `<p class="muted" style="font-size:11px">${_t("fc.ausgang", { d: fdt(fc.base) })}</p>`;
  $("fcRows").innerHTML = fc.res
    .map((x) => {
      const st = x.st,
        dq = st.rows.length
          ? _t("dash.von", { a: st.n, b: st.rows.length }) + (st.rows.length - st.n ? _t("fc.markiert", { n: st.rows.length - st.n }) : "")
          : _t("fc.keine");
      return `<tr${x.common ? ' class="muted"' : ""}><td>${x.m}${x.common ? ` <span class="muted">(${_t("fc.zaehlt_nicht")})</span>` : ""}</td><td>${fmt(x.miss)}</td><td>${st.n >= FC_MIN ? sg(st.real) + "/" + _t("common.tag") : "–"}</td><td>${x.status === "done" ? _t("common.gedeckt") : x.status === "data" ? "–" : fmtEta(x.eta.cons, fc.base, x.far.cons)}</td><td>${x.status === "done" ? _t("common.gedeckt") : x.status === "data" ? _t("common.zu_wenig_daten") : fmtEta(x.eta.real, fc.base, x.far.real)}</td><td>${x.status === "done" ? _t("common.gedeckt") : x.status === "data" ? "–" : fmtEta(x.eta.opt, fc.base, x.far.opt)}</td><td>${dq}</td></tr>`;
    })
    .join("");
  const ivs = new Map();
  for (const x of fc.res) {
    if (x.common) continue;
    for (const r of x.st.rows) {
      if (!ivs.has(r.key))
        ivs.set(r.key, { key: r.key, from: r.from, to: r.to, days: r.days, spike: [], bau: [] });
      if (r.flag) ivs.get(r.key)[r.flag].push(x.m.replace("7★ ", ""));
    }
  }
  const ov = s.rateOverrides || {};
  $("fcIntervals").innerHTML = ivs.size
    ? [...ivs.values()]
        .sort((a, b) => b.to - a.to)
        .map((v) => {
          const mk =
              [
                v.spike.length ? _t("fc.spike", { list: v.spike.join(", ") }) : "",
                v.bau.length ? _t("fc.verm_bau", { list: v.bau.join(", ") }) : "",
              ]
                .filter(Boolean)
                .join(" · ") || "–",
            o = ov[v.key] || "auto";
          return `<tr><td>${new Date(v.from).toLocaleDateString(LOC())} – ${new Date(v.to).toLocaleDateString(LOC())}</td><td>${v.days.toLocaleString(LOC(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td><td class="${v.bau.length ? "red" : ""}">${escAttr(mk)}</td><td><select data-ov="${v.key}"><option value="auto"${o !== "exclude" ? " selected" : ""}>${_t("fc.ov_auto")}</option><option value="exclude"${o === "exclude" ? " selected" : ""}>${_t("fc.ov_excl")}</option></select></td></tr>`;
        })
        .join("")
    : `<tr><td colspan="4" class="muted">${_t("fc.keine_abschnitte", { h: FC_GAP_H })}</td></tr>`;
  $("fcIntervals")
    .querySelectorAll("[data-ov]")
    .forEach(
      (el) =>
        (el.onchange = () => {
          s.rateOverrides = s.rateOverrides || {};
          if (el.value === "auto") delete s.rateOverrides[el.dataset.ov];
          else s.rateOverrides[el.dataset.ov] = el.value;
          save();
        }),
    );
  const ct = (p.planData || {}).construction;
  $("fcBuild").textContent = ct
    ? _t("fc.build_bauzeit", { d: fmtDuration(ct.cost) }) +
      " · " +
      (ct.needed > 0 ? _t("dash.speedups_fehlen", { d: fmtDuration(ct.needed) }) : _t("dash.speedups_ok")) +
      _t("fc.build")
    : "";
}
function packEmpty() {
  const pk = (s.packs || [])[0];
  return !pk || !Object.values(pk.contents || {}).some((c) => +c.amount > 0);
}
function packCalc(p) {
  // ab 3.2: Schiffe rechnen mit dem Pack ihrer Klasse („Anderes Schiff“: keiner)
  const pack = planPack(p);
  if (!pack || !p.hasPlanData || packEmptyOf(pack)) return null;
  const rows = getPlanResources(p),
    fc = planForecast(p),
    out = [];
  for (const r of rows) {
    const m = r[0];
    if (isLatinumMat(m)) continue;
    const c = pack.contents[m] || {},
      amt = +c.amount || 0,
      miss = r[3];
    out.push({ m, miss, amt, approx: !!c.approx, n: miss <= 0 ? 0 : amt > 0 ? Math.ceil(miss / amt) : null });
  }
  const open = out.filter((x) => x.miss > 0),
    uncovered = open.filter((x) => x.n == null),
    cov = open.filter((x) => x.n != null),
    top = cov.reduce((a, b) => (!a || b.n > a.n ? b : a), null);
  let weekly = null;
  if (fc && open.length) {
    const per = open.map((x) => {
      const f = fc.res.find((y) => y.m === x.m),
        st = f && f.st;
      if (!st || st.n < FC_MIN || st.real == null) return null;
      const eff = st.real + x.amt / 7;
      return eff > 0 ? x.miss / eff : Infinity;
    });
    if (per.every((v) => v != null)) {
      const days = Math.max(...per);
      weekly = { days, base: fc.base, far: fcTooFar(days) };
    }
  }
  return {
    pack,
    rows: out,
    total: top ? top.n : 0,
    driver: top && top.m,
    approx: !!(top && top.approx),
    uncovered: uncovered.map((x) => x.m),
    weekly,
  };
}
function renderPacks(p) {
  const pc = packCalc(p),
    card = $("packCard");
  if (isShip(p) && (!p.ship || p.ship.key === "other")) {
    card.innerHTML = `<span class="muted">${_t("pk.anderes")}</span>`;
    return;
  }
  if (!pc && isShip(p) && p.hasPlanData) {
    card.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span><b>${_t("pk.bis_ziel")}</b> <span class="muted">${_t("pk.schiff_leer", { k: SHIP_CLASSES[p.ship.cls].label, name: escAttr(planPack(p).name) })}</span></span><button class="miniBtn" id="packFillBtn">${_t("pk.schiff_pflegen")}</button></div>`;
    $("packFillBtn").onclick = () => openPackFor(p);
    return;
  }
  if (!pc) {
    if (p.hasPlanData && packEmpty()) {
      card.innerHTML =
        `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span><b>${_t("pk.bis_ziel")}</b> <span class="muted">${_t("pk.station_leer")}</span></span><button class="miniBtn" id="packFillBtn">${_t("care.station_pflegen")}</button></div>`;
      $("packFillBtn").onclick = openPacks;
    } else card.innerHTML = `<span class="muted">${_t("pk.erst_aktiv")}</span>`;
    return;
  }
  const pk = pc.pack;
  card.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><span class="muted">${_t("pk.titel")}</span><div class="big">${pc.total ? (pc.approx ? _t("common.ca") + " " : "") + fx(pc.total) + " " + escAttr(packPlural(packLabel(p), pc.total)) + " · " + (pc.approx ? _t("common.ca") + " " : "") + _t("pk.eur", { p: fx(pc.total * pk.priceEUR) }) : _t("pk.kein_noetig")}</div><span class="muted">${pc.driver ? _t("fc.bestimmt", { m: escAttr(pc.driver) }) : _t("dash.alle_relevanten")}${packInclText(p) ? " · " + escAttr(packInclText(p)) : ""}${pc.uncovered.length ? _t("pk.nicht_im_pack", { list: pc.uncovered.map(escAttr).join(", ") }) : ""}</span></div><div style="text-align:right"><button class="miniBtn" id="packEditBtn">${_t("pk.bearbeiten")}</button><div class="muted" style="font-size:11px;margin-top:4px">${_t("pk.gueltig", { d: pk.validFrom ? new Date(pk.validFrom).toLocaleDateString(LOC()) : "–", p: fx(pk.priceEUR) })}</div></div></div>${pc.weekly && pc.weekly.far ? `<div style="margin-top:6px">${_t("pk.woche_far", { p: fx(pk.priceEUR) })}</div>` : pc.weekly ? `<div style="margin-top:6px">${_t(pc.weekly.days > FC_YEAR ? "pk.woche" : "pk.woche_am", { p: fx(pk.priceEUR), d: fcDate(pc.weekly.base, pc.weekly.days), n: fx(Math.ceil(pc.weekly.days / 7)), e: fx(Math.ceil(pc.weekly.days / 7) * pk.priceEUR) })}</div>` : `<div class="muted" style="margin-top:6px;font-size:11px">${_t("pk.woche_spaeter")}</div>`}<table class="histTable" style="margin-top:8px"><thead><tr><th>${_t("common.material")}</th><th>${_t("pk.th_fehlt")}</th><th>${_t("pk.th_inhalt")}</th><th>${_t("pk.th_noetig")}</th></tr></thead><tbody>${pc.rows.map((x) => `<tr${x.m === pc.driver ? ' style="color:#ffd993;font-weight:700"' : ""}><td>${x.m}</td><td>${fmt(x.miss)}</td><td>${x.amt ? (x.approx ? _t("common.ca") + " " : "") + fx(x.amt) : "–"}</td><td>${x.miss <= 0 ? _t("common.gedeckt") : x.n == null ? _t("pk.nicht_im") : (x.approx ? _t("common.ca") + " " : "") + fx(x.n)}</td></tr>`).join("")}</tbody></table>`;
  $("packEditBtn").onclick = () => openPackFor(p);
}
// Stationspack oder (ab 3.2) Schiffs-Pack einer Klasse bearbeiten
var packEditCls = null;
function openPacks(cls) {
  packEditCls = typeof cls === "string" && SHIP_CLASSES[cls] ? cls : null;
  if (packEditCls) ensureShipPacks();
  const pk = packEditCls ? s.shipPacks[packEditCls] : (s.packs || [])[0],
    mats = packEditCls ? shipPackMats(packEditCls) : MATERIALS;
  $("packTitle").textContent = packEditCls ? _t("pk.titel_schiff", { k: SHIP_CLASSES[packEditCls].label }) : _t("care.station_pflegen");
  $("packSub").textContent = packEditCls
    ? _t("pk.gilt_klasse", { k: SHIP_CLASSES[packEditCls].label })
    : _t("pk.gilt_gebaeude");
  $("packIntro").textContent = packEditCls
    ? _t("pk.intro_schiff")
    : _t("pk.intro_station");
  $("packNameLab").hidden = !packEditCls;
  $("packName").value = packEditCls ? shipPackName(packEditCls, pk) : "";
  $("packRows").innerHTML = mats.map((m) => {
    const c = pk.contents[m] || {};
    return `<tr><td>${m}</td><td><input type="number" min="0" step="1" data-pm="${m}" value="${c.amount ?? ""}"></td><td><input type="checkbox" data-pa="${m}"${c.approx ? " checked" : ""}></td></tr>`;
  }).join("");
  $("packPrice").value = Number.isFinite(pk.priceEUR) ? pk.priceEUR : 100;
  $("packValid").value = pk.validFrom || "";
  $("packModal").classList.add("on");
}
// Engpass-Karte (ab 1.3): die drei Materialien, die zuletzt gedeckt sind, und was ein Stationspack bringt.
// Ohne Prognose bleibt die bisherige Anzeige (ein Engpass, „vorläufig“).
function bottleneckRows(p) {
  const fc = planForecast(p);
  if (!fc || !(fc.overall.real > 0)) return null;
  const rows = fc.res
    .filter((x) => !x.common && x.miss > 0 && x.eta.real != null)
    .sort((a, b) => b.eta.real - a.eta.real);
  const i = rows.findIndex((x) => x.m === fc.overall.realDriver);
  if (i > 0) rows.unshift(rows.splice(i, 1)[0]);
  return { fc, rows: rows.slice(0, 3) };
}
function packEffect(p) {
  if (packEmptyFor(p)) return null;
  const w = wifCalc(p, { now: 1, week: 0, pct: 0, bonus: {} });
  if (!w || w.base.real.d == null || w.scen.real.d == null) return null;
  // in Kalendertagen, damit Zahl und Datum zusammenpassen
  const day = (d) => new Date(w.start + d * 864e5).setHours(0, 0, 0, 0);
  return {
    save: Math.round((day(w.base.real.d) - day(w.scen.real.d)) / 864e5),
    date: new Date(w.start + w.scen.real.d * 864e5),
    when: fcDate(w.start, w.scen.real.d),
    next: w.scen.real.driver,
  };
}
function renderBottleneckCard(p) {
  const list = $("bottleneckList"),
    bn = bottleneckRows(p);
  const classic = !bn || !bn.rows.length;
  $("bottleneckValue").hidden = !classic;
  $("bottleneckDetail").hidden = !classic;
  list.hidden = classic;
  list.closest(".heroCards").classList.toggle("bnWide", !classic);
  $("bottleneckLbl").textContent = classic ? _t("common.engpass") : _t("bn.lbl");
  if (classic) {
    list.innerHTML = "";
    return;
  }
  const max = bn.rows[0].eta.real,
    day = (t) =>
      t > FC_YEAR
        ? fcDate(bn.fc.base, t)
        : new Date(bn.fc.base + t * 864e5).toLocaleDateString(LOC(), { day: "numeric", month: "numeric" }),
    inT = (t) => (t > FC_YEAR ? "~" + fcYears(t) : _t("bn.t", { n: Math.ceil(t) }));
  let h = bn.rows
    .map(
      (x, i) =>
        `<div class="bnRow${i === 0 ? " first" : ""}"><b>${escAttr(x.m)}</b><div class="bnBar"><i style="width:${Math.max(4, Math.round((100 * x.eta.real) / max))}%"></i></div><span class="bnNum">${_t("bn.gedeckt_in", { a: inT(x.eta.real), b: day(x.eta.real) })}</span></div>`,
    )
    .join("");
  const pe = packEffect(p),
    driver = bn.rows[0].m;
  let foot;
  if (shipPackMissingText(p))
    foot =
      escAttr(shipPackMissingText(p)) +
      (p.ship && p.ship.key !== "other" ? ` <button class="miniBtn" id="bnPackBtn">${_t("pk.schiff_pflegen")}</button>` : "");
  else if (!pe)
    foot =
      `${_t("bn.eintragen")} <button class="miniBtn" id="bnPackBtn">${_t("care.station_pflegen")}</button>`;
  else {
    const n = pe.save,
      when = pe.when;
    if (n < 1) {
      const close = bn.rows.filter((x) => max - x.eta.real < 1).map((x) => x.m.replace("7★ ", ""));
      foot =
        _t("bn.kein_tag", { k: escAttr(packLabel(p)) }) +
        (close.length > 1 ? _t("bn.gleichzeitig", { list: close.join(", ") }) : ".");
    } else
      foot =
        _t(n === 1 ? "bn.frueher1" : "bn.frueher", { k: escAttr(packLabel(p)), n, d: when }) +
        (pe.next && pe.next !== driver ? _t("bn.danach_bremst", { m: escAttr(pe.next) }) : _t("bn.bleibt", { m: escAttr(driver) }));
  }
  h += `<div class="bnFoot">${foot}</div>`;
  list.innerHTML = h;
  const b = $("bnPackBtn");
  if (b) b.onclick = () => openPackFor(p);
}
