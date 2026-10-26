const FC_WINDOW_DAYS = 42,
  FC_MIN = 3,
  // Ab 2.1: Mindestabstand zweier Exporte für einen Abschnitt 20 statt 24 Stunden
  FC_GAP_H = 20,
  FC_GAP_DAYS = FC_GAP_H / 24,
  // Ab 2.1: Über 1 Jahr nur noch Monat und Jahr („ca. Mai 2032“), über 100 Jahre „nicht absehbar“
  // (Schutz vor unsinnigen Werten wie „Invalid Date“).
  FC_YEAR = 365.25,
  FC_MAX_DAYS = 100 * FC_YEAR,
  FC_FAR_TXT = "nicht absehbar";
function fcTooFar(days) {
  return days != null && !(Number.isFinite(days) && days <= FC_MAX_DAYS);
}
function fcYears(days) {
  const y = Math.max(1, Math.round((days / FC_YEAR) * 2) / 2);
  return y.toLocaleString("de-DE") + (y === 1 ? " Jahr" : " Jahre");
}
// Datum eines Termins: bis 1 Jahr Tagesdatum, darüber „ca. Mai 2032“
function fcDate(base, days) {
  const d = new Date(base + days * 864e5);
  return days > FC_YEAR
    ? "ca. " + d.toLocaleDateString("de-DE", { month: "long", year: "numeric" })
    : d.toLocaleDateString("de-DE");
}
// Dauer: „9 Tage“, „~12 Wochen“, „~5,5 Jahre“
function fcDur(days) {
  return days < 14
    ? Math.ceil(days) + (Math.ceil(days) === 1 ? " Tag" : " Tage")
    : days <= FC_YEAR
      ? "~" + Math.round(days / 7) + " Wochen"
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
function planCostAt(p, m, t) {
  const d = p.planData || {},
    h = (d.history || [])
      .filter((x) => x.resources && x.resources[m] && isNum(x.resources[m].cost))
      .sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!h.length) {
    const r = (d.resources || {})[m];
    return r && isNum(r.cost) ? r.cost : null;
  }
  let c = h[0].resources[m].cost;
  for (const x of h) {
    if (new Date(x.at) <= t) c = x.resources[m].cost;
    else break;
  }
  return c;
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
function rateStats(p, m) {
  const iv = snapIntervals(m);
  if (!iv.length) return { rows: [], n: 0, span: 0, cons: null, real: null, opt: null };
  const lastT = iv[iv.length - 1].b.t,
    win = iv.filter((x) => (lastT - x.b.t) / 864e5 <= FC_WINDOW_DAYS),
    ov = s.rateOverrides || {};
  const rows = win.map((x) => {
    const days = (x.b.t - x.a.t) / 864e5,
      ca = planCostAt(p, m, x.a.t),
      cb = planCostAt(p, m, x.b.t),
      built = ca != null && cb != null ? ca - cb : 0,
      delta = x.b.v - x.a.v;
    return {
      key: x.a.id + ">" + x.b.id,
      from: x.a.t,
      to: x.b.t,
      days,
      delta,
      built,
      rate: (delta + built) / days,
    };
  });
  const med = quant(
    rows.filter((r) => ov[r.key] !== "exclude").map((r) => r.rate),
    0.5,
  );
  rows.forEach((r) => {
    r.flag = null;
    if (med != null && med > 0) {
      if (r.rate > 3 * med) r.flag = "pack";
      else if (r.rate < -med) r.flag = "bau";
    }
    const o = ov[r.key];
    r.included = o === "include" ? true : o === "exclude" ? false : !r.flag;
  });
  const inc = rows.filter((r) => r.included).map((r) => ({ v: r.rate, w: r.days }));
  return {
    rows,
    n: inc.length,
    span: inc.reduce((a, x) => a + x.w, 0),
    cons: quantW(inc, 0.25),
    real: quantW(inc, 0.5),
    opt: quantW(inc, 0.75),
  };
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
      share: r && r[2] > 0 ? r[3] / r[2] : 0,
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
      common: /^7★ Common/.test(m),
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
function fmtEta(days, base, far) {
  if (days == null) return far ? FC_FAR_TXT : "nicht absehbar";
  if (fcTooFar(days)) return FC_FAR_TXT;
  if (days <= 0) return "gedeckt";
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
    seg: { vorläufig: 1, brauchbar: 2, stabil: 3 }[lvl],
    n,
    days,
    have: `${n} Abschnitt${n === 1 ? "" : "e"} über ${days} Tag${days === 1 ? "" : "e"}`,
    next: goal ? `${lvl === "vorläufig" ? "brauchbar" : "stabil"} ab ${goal.n} Abschnitten über ${goal.days} Tage` : "",
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
  b.textContent = q.lvl.toUpperCase();
  l.innerHTML = qualityHtml(q);
  return q;
}
function renderForecast(p) {
  const fc = planForecast(p),
    sg = (v) => (v > 0 ? "+" : "") + fmt(v);
  if (!fc) {
    $("etaValue").textContent = "Nicht berechenbar";
    $("etaDetail").textContent = "Keine Kostengrundlage";
    renderQuality(null);
    $("fcSummary").innerHTML = '<p class="muted">Keine Prognose – der Plan ist nicht aktiv.</p>';
    $("fcRows").innerHTML = "";
    $("fcIntervals").innerHTML = "";
    $("fcBuild").textContent = "";
    return;
  }
  const o = fc.overall;
  let val, det;
  if (o.real === 0) {
    val = "Gedeckt";
    det = "Alle Rare-, Uncommon- und Σ-Ressourcen vorhanden";
  } else if (o.real == null) {
    val = "Offen";
    det = o.missingData.length
      ? "Noch zu wenig Daten (" + o.minN + "/" + FC_MIN + " Abschnitte)"
      : o.negative.length
        ? "Keine positive Rate: " + o.negative.join(", ")
        : o.far.length
          ? "Über 100 Jahre bei der jetzigen Rate: " + o.far.join(", ")
          : "Szenario nicht berechenbar";
  } else {
    val = fcDate(fc.base, o.real);
    det =
      (o.real < 14
        ? "in " + Math.ceil(o.real) + (Math.ceil(o.real) === 1 ? " Tag" : " Tagen")
        : o.real <= FC_YEAR
          ? "in ca. " + Math.round(o.real / 7) + " Wochen"
          : "in ca. " + fcYears(o.real).replace(/Jahre$/, "Jahren")) +
      " · konservativ " +
      (o.cons == null ? (o.consFar ? "über 100 Jahre" : "offen") : fcDate(fc.base, o.cons)) +
      " · optimistisch " +
      (o.opt == null ? "offen" : fcDate(fc.base, o.opt));
  }
  $("etaValue").textContent = val;
  $("etaDetail").textContent = det;
  const q = renderQuality(fc);
  $("fcSummary").innerHTML =
    (q
      ? `<div class="fcQuality"><div><span class="muted">Prognose-Qualität</span><span class="qBadge ${q.cls}">${q.lvl.toUpperCase()}</span></div><p>${qualityHtml(q)}.</p><p class="muted">Gezählt wird beim Material mit den wenigsten Daten. Stufen: vorläufig unter ${FC_Q.brauchbar.n} Abschnitten oder ${FC_Q.brauchbar.days} Tagen, brauchbar ab ${FC_Q.brauchbar.n} Abschnitten über ${FC_Q.brauchbar.days} Tage, stabil ab ${FC_Q.stabil.n} Abschnitten über ${FC_Q.stabil.days} Tage. Längere Abschnitte zählen mehr als kurze. Mehr Exporte verbessern die Prognose bis zum Zeitfenster von 6 Wochen; ältere Abschnitte fallen dann heraus, die Prognose bleibt aktuell.</p></div>`
      : "") +
    `<div class="fcCard"><div><span class="muted">Konservativ</span><b>${fmtEta(o.cons, fc.base, o.consFar)}</b><span class="muted">${o.consDriver ? escAttr(o.consDriver) : ""}</span></div><div class="real"><span class="muted">Realistisch</span><b>${fmtEta(o.real, fc.base, o.realFar)}</b><span class="muted">${o.realDriver ? "bestimmt durch " + escAttr(o.realDriver) : ""}</span></div><div><span class="muted">Optimistisch</span><b>${fmtEta(o.opt, fc.base, o.optFar)}</b><span class="muted">${o.optDriver ? escAttr(o.optDriver) : ""}</span></div></div>` +
    (o.missingData.length
      ? `<p class="muted">Noch zu wenig Daten für: ${o.missingData.map(escAttr).join(", ")} (mindestens ${FC_MIN} Abschnitte mit je ≥ ${FC_GAP_H} Stunden Abstand nötig).</p>`
      : "") +
    `<p class="muted" style="font-size:11px">Ausgangspunkt: Datenstand vom ${fdt(fc.base)}.</p>`;
  $("fcRows").innerHTML = fc.res
    .map((x) => {
      const st = x.st,
        dq = st.rows.length
          ? `${st.n} von ${st.rows.length}${st.rows.length - st.n ? " (" + (st.rows.length - st.n) + " markiert)" : ""}`
          : "keine";
      return `<tr${x.common ? ' class="muted"' : ""}><td>${x.m}${x.common ? ' <span class="muted">(zählt nicht)</span>' : ""}</td><td>${fmt(x.miss)}</td><td>${st.n >= FC_MIN ? sg(st.real) + "/Tag" : "–"}</td><td>${x.status === "done" ? "gedeckt" : fmtEta(x.eta.cons, fc.base, x.far.cons)}</td><td>${x.status === "done" ? "gedeckt" : x.status === "data" ? "zu wenig Daten" : fmtEta(x.eta.real, fc.base, x.far.real)}</td><td>${x.status === "done" ? "gedeckt" : fmtEta(x.eta.opt, fc.base, x.far.opt)}</td><td>${dq}</td></tr>`;
    })
    .join("");
  const ivs = new Map();
  for (const x of fc.res) {
    if (x.common) continue;
    for (const r of x.st.rows) {
      if (!ivs.has(r.key))
        ivs.set(r.key, { key: r.key, from: r.from, to: r.to, days: r.days, pack: [], bau: [] });
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
                v.pack.length ? "vermutlich Pack/Ausgleich: " + v.pack.join(", ") : "",
                v.bau.length ? "vermutlich Bau: " + v.bau.join(", ") : "",
              ]
                .filter(Boolean)
                .join(" · ") || "–",
            o = ov[v.key] || "auto";
          return `<tr><td>${new Date(v.from).toLocaleDateString("de-DE")} – ${new Date(v.to).toLocaleDateString("de-DE")}</td><td>${v.days.toFixed(1).replace(".", ",")}</td><td class="${mk === "–" ? "" : "red"}">${escAttr(mk)}</td><td><select data-ov="${v.key}"><option value="auto"${o === "auto" ? " selected" : ""}>Automatisch</option><option value="include"${o === "include" ? " selected" : ""}>Immer mitrechnen</option><option value="exclude"${o === "exclude" ? " selected" : ""}>Nicht mitrechnen</option></select></td></tr>`;
        })
        .join("")
    : '<tr><td colspan="4" class="muted">Noch keine Abschnitte. Es braucht mindestens zwei JSON-Snapshots mit ' + FC_GAP_H + ' Stunden Abstand.</td></tr>';
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
    ? "Bauzeit: " +
      fmtDuration(ct.cost) +
      " · " +
      (ct.needed > 0
        ? "Speedups fehlen: " + fmtDuration(ct.needed)
        : "Speedups ausreichend (laut Spock's Club)") +
      " – wird separat betrachtet und nicht in die Ressourcenprognose eingerechnet."
    : "";
}
function packEmpty() {
  const pk = (s.packs || [])[0];
  return !pk || !Object.values(pk.contents || {}).some((c) => +c.amount > 0);
}
function packCalc(p) {
  const pack = (s.packs || [])[0];
  if (!pack || !p.hasPlanData || packEmpty()) return null;
  const rows = getPlanResources(p),
    fc = planForecast(p),
    out = [];
  for (const r of rows) {
    const m = r[0];
    if (/^7★ Common/.test(m)) continue;
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
  if (!pc) {
    if (p.hasPlanData && packEmpty()) {
      card.innerHTML =
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span><b>Packs bis zum Ziel:</b> <span class="muted">Dein Stationspack ist noch nicht gepflegt. Trag einmal ein, was ein Pack enthält (im Spiel ablesen – der Inhalt hängt von deiner OPS-Stufe ab), dann rechnet der Planner die Packs bis zum Ziel.</span></span><button class="miniBtn" id="packFillBtn">Stationspack pflegen</button></div>';
      $("packFillBtn").onclick = openPacks;
    } else card.innerHTML = '<span class="muted">Packs bis zum Ziel: erst wenn der Plan aktiv ist.</span>';
    return;
  }
  const pk = pc.pack;
  card.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><span class="muted">Packs bis zum Ziel</span><div class="big">${pc.total ? (pc.approx ? "ca. " : "") + fx(pc.total) + " " + escAttr(pk.name) + (pc.total === 1 ? "" : "s") + " · " + (pc.approx ? "ca. " : "") + fx(pc.total * pk.priceEUR) + " €" : "Kein Pack nötig"}</div><span class="muted">${pc.driver ? "bestimmt durch " + escAttr(pc.driver) : "alle relevanten Ressourcen gedeckt"}${pc.uncovered.length ? " · nicht im Pack enthalten: " + pc.uncovered.map(escAttr).join(", ") : ""}</span></div><div style="text-align:right"><button class="miniBtn" id="packEditBtn">Pack bearbeiten</button><div class="muted" style="font-size:11px;margin-top:4px">Inhalt gültig ab ${pk.validFrom ? new Date(pk.validFrom).toLocaleDateString("de-DE") : "–"} · ${fx(pk.priceEUR)} € pro Pack</div></div></div>${pc.weekly && pc.weekly.far ? `<div style="margin-top:6px">Mit <b>1 Pack pro Woche</b> (${fx(pk.priceEUR)} € pro Woche): Ziel nicht absehbar</div>` : pc.weekly ? `<div style="margin-top:6px">Mit <b>1 Pack pro Woche</b> (${fx(pk.priceEUR)} € pro Woche): Ziel ${pc.weekly.days > FC_YEAR ? "" : "ca. am "}<b>${fcDate(pc.weekly.base, pc.weekly.days)}</b> (realistisch), insgesamt ca. ${fx(Math.ceil(pc.weekly.days / 7))} Packs = ${fx(Math.ceil(pc.weekly.days / 7) * pk.priceEUR)} €</div>` : '<div class="muted" style="margin-top:6px;font-size:11px">„Mit 1 Pack pro Woche“ erscheint, sobald die Prognose genügend Daten hat.</div>'}<table class="histTable" style="margin-top:8px"><thead><tr><th>Material</th><th>Fehlt</th><th>Inhalt pro Pack</th><th>Packs nötig</th></tr></thead><tbody>${pc.rows.map((x) => `<tr${x.m === pc.driver ? ' style="color:#ffd993;font-weight:700"' : ""}><td>${x.m}</td><td>${fmt(x.miss)}</td><td>${x.amt ? (x.approx ? "ca. " : "") + fx(x.amt) : "–"}</td><td>${x.miss <= 0 ? "gedeckt" : x.n == null ? "nicht im Pack" : (x.approx ? "ca. " : "") + fx(x.n)}</td></tr>`).join("")}</tbody></table>`;
  $("packEditBtn").onclick = openPacks;
}
function openPacks() {
  const pk = (s.packs || [])[0];
  $("packRows").innerHTML = MATERIALS.map((m) => {
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
  if (packEmpty()) return null;
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
  $("bottleneckLbl").textContent = classic ? "Engpass" : "Engpass · was zuletzt gedeckt ist";
  if (classic) {
    list.innerHTML = "";
    return;
  }
  const max = bn.rows[0].eta.real,
    day = (t) =>
      t > FC_YEAR
        ? fcDate(bn.fc.base, t)
        : new Date(bn.fc.base + t * 864e5).toLocaleDateString("de-DE", { day: "numeric", month: "numeric" }),
    inT = (t) => (t > FC_YEAR ? "~" + fcYears(t) : Math.ceil(t) + " T.");
  let h = bn.rows
    .map(
      (x, i) =>
        `<div class="bnRow${i === 0 ? " first" : ""}"><b>${escAttr(x.m)}</b><div class="bnBar"><i style="width:${Math.max(4, Math.round((100 * x.eta.real) / max))}%"></i></div><span class="bnNum">gedeckt in ${inT(x.eta.real)} · ${day(x.eta.real)}</span></div>`,
    )
    .join("");
  const pe = packEffect(p),
    driver = bn.rows[0].m;
  let foot;
  if (!pe)
    foot =
      'Trag deinen Stationspack ein, dann siehst du hier, was ein Pack bringt. <button class="miniBtn" id="bnPackBtn">Stationspack pflegen</button>';
  else {
    const n = pe.save,
      when = pe.when;
    if (n < 1) {
      const close = bn.rows.filter((x) => max - x.eta.real < 1).map((x) => x.m.replace("7★ ", ""));
      foot =
        "Mit 1 Stationspack: <b class=\"flat\">kein ganzer Tag früher</b>" +
        (close.length > 1 ? " – " + close.join(", ") + " sind fast gleichzeitig gedeckt." : ".");
    } else
      foot =
        `Mit 1 Stationspack: fertig <b>${n} ${n === 1 ? "Tag" : "Tage"} früher</b> (${when})` +
        (pe.next && pe.next !== driver ? " – danach bremst " + escAttr(pe.next) + "." : " – " + escAttr(driver) + " bleibt der Engpass.");
  }
  h += `<div class="bnFoot">${foot}</div>`;
  list.innerHTML = h;
  const b = $("bnPackBtn");
  if (b) b.onclick = openPacks;
}
