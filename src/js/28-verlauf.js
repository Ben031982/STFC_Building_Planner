// 4.0 Teil 1: Zeitleiste aller Ziele, Verlauf der Prognose, Einkommen je Woche.
// Achtung: läuft schon beim ersten render() – keine let/const/var-Werte auf oberster Ebene, nur Funktionen.

function vzDay() {
  return 864e5;
}
function vzFmtD(t) {
  return new Date(t).toLocaleDateString("de-DE", { day: "numeric", month: "numeric" });
}
// Datum mit Jahr, wenn es nicht im laufenden Jahr liegt
function vzFmtDY(t) {
  const d = new Date(t);
  return d.getFullYear() === new Date().getFullYear()
    ? vzFmtD(t)
    : d.toLocaleDateString("de-DE", { day: "numeric", month: "numeric", year: "2-digit" });
}
function vzSvgOpen(W, H) {
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block" role="img">`;
}
// Fortschritt eines Plans in % (Fehlmenge gegen Bedarf, relevante Materialien ohne 7★ Common)
function vzProgress(p) {
  if (!p || !p.hasPlanData) return null;
  let need = 0,
    miss = 0;
  for (const r of getPlanResources(p)) {
    if (isLatinumMat(r[0])) continue;
    const n = r[5] || r[2];
    if (!(n > 0)) continue;
    need += n;
    miss += Math.min(Math.max(r[3], 0), n);
  }
  return need > 0 ? Math.max(0, Math.min(100, (1 - miss / need) * 100)) : null;
}

// ---------------------------------------------------------------- Zeitleiste aller Ziele
function timelineRows(now) {
  const rows = [],
    D = vzDay();
  for (const g of Array.isArray(s.goals) ? s.goals : []) {
    const b = new Date(g.at).getTime(),
      a = g.since ? new Date(g.since).getTime() : b - 7 * D;
    rows.push({ name: g.name, a: Math.min(a, b), b, kind: "done" });
  }
  const etaOf = {};
  for (const p of s.plans) {
    const st = calcPlanStatus(p);
    p.status = st;
    p.hasPlanData = st === "active"; // render() setzt das sonst nur für den gewählten Plan
    const fc = p.hasPlanData ? planForecast(p) : null,
      o = fc && fc.overall,
      blocked = isShip(p) && typeof shipYardBlock === "function" ? shipYardBlock(p) : null,
      real = o && o.real != null && !blocked ? fc.base + o.real * D : null;
    if (real) etaOf[p.id] = real;
    const since = planSince(p),
      pred = typeof validAfter === "function" ? validAfter(p) : null,
      predEnd = pred ? etaOf[pred.id] || null : null;
    if (st === "active" && real) {
      rows.push({
        name: p.name,
        a: since ? new Date(since).getTime() : now,
        b: real,
        lo: o.cons != null && o.opt != null ? fc.base + Math.min(o.cons, o.opt) * D : null,
        hi: o.cons != null && o.opt != null ? fc.base + Math.max(o.cons, o.opt) * D : null,
        pct: vzProgress(p),
        kind: "active",
      });
    } else {
      rows.push({
        name: p.name,
        a: predEnd || now,
        b: null,
        kind: "wait",
        note: pred ? "wartet auf " + pred.name : blocked ? "wartet auf Schiffswerft " + blocked.yard : "noch nicht aktiv",
      });
    }
  }
  return rows;
}
function renderTimeline() {
  const el = $("tlBody");
  if (!el) return;
  const now = Date.now(),
    D = vzDay(),
    rows = timelineRows(now);
  if (!rows.length) {
    el.innerHTML = '<p class="muted">Noch keine Ziele oder Pläne.</p>';
    return;
  }
  // Zeitraum: bis zum spätesten Fertigdatum (ohne Band), höchstens 3 Jahre – spätere Termine werden abgeschnitten
  let t0 = Math.min(...rows.map((r) => r.a), now),
    t1 = Math.min(Math.max(...rows.map((r) => r.b || now), now + 30 * D) + 45 * D, now + 3 * 365 * D);
  t0 -= 5 * D;
  const W = 1100,
    L = 190,
    R = 150,
    T = 34,
    RH = 50,
    H = T + rows.length * RH + 34,
    X = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  let g = "";
  const m0 = new Date(t0);
  m0.setDate(1);
  m0.setHours(0, 0, 0, 0);
  // Beschriftung nach Länge des Zeitraums: Monate, Quartale oder Halbjahre
  const months = (t1 - t0) / (30.4 * D),
    stepM = months > 30 ? 6 : months > 14 ? 3 : 1;
  for (let m = new Date(m0); m.getTime() <= t1; m.setMonth(m.getMonth() + stepM)) {
    const x = X(m.getTime());
    if (x < L - 1) continue;
    g += `<line x1="${x}" x2="${x}" y1="${T - 8}" y2="${H - 26}" class="vzGrid"/><text x="${x + 4}" y="${T - 14}" class="vzAx">${m.toLocaleDateString("de-DE", { month: "short", year: "2-digit" })}</text>`;
  }
  rows.forEach((r, i) => {
    const y = T + i * RH,
      xa = X(r.a),
      cut = r.b != null && r.b > t1,
      xb = r.b != null ? X(Math.min(r.b, t1)) : xa + 90;
    g += `<text x="${L - 12}" y="${y + 22}" class="vzName${r.kind === "done" ? " dim" : ""}" text-anchor="end">${escAttr(r.name)}</text>`;
    if (r.kind === "done")
      g += `<rect x="${xa}" y="${y + 8}" width="${Math.max(xb - xa, 8)}" height="20" rx="6" class="vzDone"/><text x="${xb + 8}" y="${y + 23}" class="vzOk">✓</text><text x="${xb + 26}" y="${y + 23}" class="vzAx">erreicht ${vzFmtDY(r.b)}</text>`;
    else if (r.kind === "active") {
      if (r.lo != null && r.hi != null)
        g += `<rect x="${X(Math.min(r.lo, t1))}" y="${y + 31}" width="${Math.max(X(Math.min(r.hi, t1)) - X(Math.min(r.lo, t1)), 4)}" height="6" rx="3" class="vzBand"/>${r.hi > t1 ? `<text x="${X(t1) + 4}" y="${y + 38}" class="vzAx">…</text>` : ""}`;
      const w = Math.max(xb - xa, 8),
        pc = r.pct == null ? 0 : r.pct / 100;
      g += `<rect x="${xa}" y="${y + 8}" width="${w}" height="20" rx="6" class="vzAct"/><rect x="${xa}" y="${y + 8}" width="${w * pc}" height="20" rx="6" class="vzActFill"/><text x="${xb + 8}" y="${y + 23}" class="vzLbl">${cut ? "erst " : "voraussichtlich "}${vzFmtDY(r.b)}</text>`;
    } else
      g += `<rect x="${xa}" y="${y + 8}" width="90" height="20" rx="6" class="vzWait"/><text x="${xa + 98}" y="${y + 23}" class="vzAx">${escAttr(r.note)}</text>`;
  });
  g += `<line x1="${X(now)}" x2="${X(now)}" y1="${T - 8}" y2="${H - 26}" class="vzNow"/><text x="${X(now)}" y="${H - 8}" class="vzNowT" text-anchor="middle">heute</text>`;
  el.innerHTML =
    vzSvgOpen(W, H) +
    g +
    '</svg><p class="muted" style="margin:6px 0 0;font-size:12px">Jeder Plan ist einzeln gerechnet – so, als bekäme er dein gesamtes Einkommen. Mehrere Pläne nacheinander dauern entsprechend länger.</p>';
}

// ---------------------------------------------------------------- Verlauf der Prognose
function renderFcHistory() {
  const el = $("fhBody");
  if (!el) return;
  const p = activePlan(),
    L = ((s.fcLog || {})[p && p.id] || []).filter((x) => x.eta != null && Number.isFinite(x.eta) && x.eta > 0);
  if (!p || L.length < 2) {
    el.innerHTML =
      '<p class="muted">Der Verlauf entsteht, sobald die Prognose an mindestens zwei verschiedenen Tagen berechnet wurde (ein Eintrag pro Tag, solange der Planner geöffnet wird).</p>';
    return;
  }
  const D = vzDay(),
    W = 1100,
    H = 300,
    Lm = 70,
    Rm = 20,
    T = 20,
    B = 40,
    tOf = (x) => new Date(x.d + "T12:00:00").getTime(),
    tmin = tOf(L[0]),
    tmax = Math.max(tOf(L[L.length - 1]), tmin + D),
    lo = Math.min(...L.map((x) => x.opt || x.eta)) - 3 * D,
    hi = Math.max(...L.map((x) => x.cons || x.eta)) + 3 * D,
    X = (t) => Lm + ((t - tmin) / (tmax - tmin)) * (W - Lm - Rm),
    Y = (e) => T + ((hi - e) / (hi - lo)) * (H - T - B);
  let g = "";
  for (let k = 0; k <= 4; k++) {
    const e = lo + ((hi - lo) * k) / 4;
    g += `<line x1="${Lm}" x2="${W - Rm}" y1="${Y(e)}" y2="${Y(e)}" class="vzGrid"/><text x="${Lm - 8}" y="${Y(e) + 4}" class="vzAx" text-anchor="end">${vzFmtD(e)}</text>`;
  }
  const step = Math.max(1, Math.round(L.length / 6));
  for (let i = 0; i < L.length; i += step) g += `<text x="${X(tOf(L[i]))}" y="${H - 12}" class="vzAx" text-anchor="middle">${vzFmtD(tOf(L[i]))}</text>`;
  const bandPts = L.filter((x) => x.cons && x.opt);
  if (bandPts.length > 1)
    g += `<polygon points="${bandPts.map((x) => X(tOf(x)) + "," + Y(x.cons)).join(" ")} ${bandPts
      .slice()
      .reverse()
      .map((x) => X(tOf(x)) + "," + Y(x.opt))
      .join(" ")}" class="vzBandFill"/>`;
  g += `<polyline points="${L.map((x) => X(tOf(x)) + "," + Y(x.eta)).join(" ")}" class="vzLine"/>`;
  // Marker: Plan-Importe und geänderte Packs
  const marks = [];
  for (const e of planImportEvents(p)) if (e.t >= tmin && e.t <= tmax + D) marks.push({ t: e.t, l: "Plan-Import" });
  for (let i = 1; i < L.length; i++)
    if (L[i].packs != null && L[i - 1].packs != null && L[i].packs !== L[i - 1].packs) marks.push({ t: tOf(L[i]), l: L[i].packs + " Packs" });
  marks.sort((a, b) => a.t - b.t);
  let lastX = -99;
  for (const m of marks) {
    const x = X(m.t);
    g += `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - B}" class="vzMark"/>`;
    if (x - lastX > 70) {
      g += `<text x="${x > W - 110 ? x - 4 : x + 4}" y="${T + 12}" class="vzMarkT" text-anchor="${x > W - 110 ? "end" : "start"}">${escAttr(m.l)}</text>`;
      lastX = x;
    }
  }
  const last = L[L.length - 1],
    wk = L.filter((x) => tOf(last) - tOf(x) >= 6.5 * D).pop(),
    diff = wk ? Math.round((wk.eta - last.eta) / D) : null,
    sub =
      diff == null
        ? "noch kein Wert von vor 7 Tagen"
        : diff > 0
          ? diff + (diff === 1 ? " Tag" : " Tage") + " früher als vor 7 Tagen"
          : diff < 0
            ? -diff + (diff === -1 ? " Tag" : " Tage") + " später als vor 7 Tagen"
            : "unverändert gegenüber vor 7 Tagen";
  g += `<circle cx="${X(tOf(last))}" cy="${Y(last.eta)}" r="5" class="vzDot"/>`;
  el.innerHTML =
    vzSvgOpen(W, H) +
    g +
    `</svg><div class="wkCards" style="margin-top:10px"><div><span class="muted">Aktuell (realistisch)</span><b>${new Date(last.eta).toLocaleDateString("de-DE")}</b><span class="muted">${sub}</span></div><div><span class="muted">Früheste / späteste Prognose</span><b>${vzFmtD(Math.min(...L.map((x) => x.eta)))} – ${vzFmtD(Math.max(...L.map((x) => x.eta)))}</b><span class="muted">im gezeigten Zeitraum</span></div><div><span class="muted">Einträge</span><b>${L.length}</b><span class="muted">seit ${new Date(tOf(L[0])).toLocaleDateString("de-DE")}</span></div></div>`;
}

// ---------------------------------------------------------------- Einkommen je Woche
function incomeMats() {
  return ["Σ-Tritanium", "Σ-Parsteel", "Σ-Dilithium"]
    .concat(MATERIALS.filter((m) => /^7★ (Rare|Uncommon) /.test(m)));
}
// Gebäude, die für Plan p oder Material m eine Rolle spielen
function bldRelevant(p, m, name) {
  if (!name) return false;
  const short = String(m).replace(/^Σ-/, "").replace(/^7★ /, ""),
    mine = name.toLowerCase().includes(short.toLowerCase()) && /Generator|Warehouse|Vault|Lager|Tresor/i.test(name);
  const req = ((p && p.planData && p.planData.requiredBuildings) || []).some((b) => b.name === name);
  return mine || req;
}
function weeklyIncome(p, m) {
  const D = vzDay(),
    st = rateStats(p, m),
    ov = s.rateOverrides || {},
    wk = {};
  const wkKey = (t) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  };
  for (const r of st.rows) {
    // Abschnitt anteilig auf die Wochen verteilen (Wochenstart per Datum, nicht per +7·24h – Sommerzeit)
    for (let t = wkKey(+r.from); t < +r.to; ) {
      const nx = new Date(t);
      nx.setDate(nx.getDate() + 7);
      const a = Math.max(t, +r.from),
        b = Math.min(nx.getTime(), +r.to),
        days = (b - a) / D;
      if (days <= 0) {
        t = nx.getTime();
        continue;
      }
      const w = (wk[t] = wk[t] || { t, days: 0, sum: 0, incDays: 0, incSum: 0, rows: [] });
      w.days += days;
      w.sum += r.rate * days;
      if (r.included) {
        w.incDays += days;
        w.incSum += r.rate * days;
      }
      w.rows.push(r.key);
      t = nx.getTime();
    }
  }
  // unabhängige Gebäude je Woche
  const bs = bldSnaps();
  for (let i = 1; i < bs.length; i++)
    for (const c of bldChanges(bs[i - 1].snap.bld, bs[i].snap.bld)) {
      const w = wk[wkKey(bs[i].t)];
      if (w) (c.name && bldRelevant(p, m, c.name) ? (w.rel = w.rel || []) : (w.side = w.side || [])).push(c);
    }
  const pin = s.weekIncomeOk || {};
  return Object.values(wk)
    .sort((a, b) => a.t - b.t)
    .map((w) => {
      const unsure = !!w.side && !pin[m + "|" + w.t];
      return Object.assign(w, { rate: w.incDays > 0 ? w.incSum / w.incDays : null, unsure });
    })
    .filter((w) => w.rate != null);
}
var incomeSel = null;
function renderIncomeWeeks() {
  const el = $("iwBody");
  if (!el) return;
  const p = activePlan(),
    mats = incomeMats();
  incomeSel = mats.includes(incomeSel) ? incomeSel : mats[0];
  const sel = $("iwSel");
  if (sel && sel.options.length !== mats.length) sel.innerHTML = mats.map((m) => `<option>${escAttr(m)}</option>`).join("");
  if (sel) sel.value = incomeSel;
  const m = incomeSel,
    W6 = p && p.hasPlanData ? weeklyIncome(p, m).slice(-8) : [];
  if (W6.length < 2) {
    el.innerHTML = '<p class="muted">Zu wenig Daten – es braucht Snapshots aus mindestens zwei Wochen.</p>';
    return;
  }
  const D = vzDay(),
    W = 1100,
    H = 280,
    Lm = 78,
    Rm = 20,
    T = 20,
    B = 40,
    mx = Math.max(...W6.map((w) => w.rate), 1) * 1.15,
    X = (i) => Lm + ((i + 0.5) * (W - Lm - Rm)) / W6.length,
    Y = (v) => T + ((mx - v) / mx) * (H - T - B),
    bw = ((W - Lm - Rm) / W6.length) * 0.55,
    fv = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " Mio." : Math.round(v).toLocaleString("de-DE"));
  let g = "";
  for (let k = 0; k <= 4; k++) {
    const v = (mx * k) / 4;
    g += `<line x1="${Lm}" x2="${W - Rm}" y1="${Y(v)}" y2="${Y(v)}" class="vzGrid"/><text x="${Lm - 8}" y="${Y(v) + 4}" class="vzAx" text-anchor="end">${fv(v)}</text>`;
  }
  W6.forEach((w, i) => {
    const last = i === W6.length - 1,
      cls = w.unsure ? "vzBarX" : last ? "vzBarNow" : "vzBar";
    g += `<rect x="${X(i) - bw / 2}" y="${Y(Math.max(w.rate, 0))}" width="${bw}" height="${Math.max(Y(0) - Y(Math.max(w.rate, 0)), 1)}" rx="4" class="${cls}" data-wk="${w.t}"/><text x="${X(i)}" y="${Y(Math.max(w.rate, 0)) - 6}" class="vzAx" text-anchor="middle">${fv(w.rate)}</text>`;
    if (w.unsure)
      g += `<text x="${X(i)}" y="${Y(Math.max(w.rate, 0)) + 18}" class="vzAx" text-anchor="middle">Nebengebäude</text><text x="${X(i)}" y="${Y(Math.max(w.rate, 0)) + 31}" class="vzAx" text-anchor="middle">Wert unsicher</text>`;
    if (w.rel)
      g += `<line x1="${X(i) - bw / 2 - 8}" x2="${X(i) - bw / 2 - 8}" y1="${T}" y2="${H - B}" class="vzMarkG"/><text x="${X(i) - bw / 2 - 4}" y="${T + 12}" class="vzMarkGT">${escAttr(bldChangeText(w.rel))}</text>`;
    g += `<text x="${X(i)}" y="${H - 12}" class="vzAx" text-anchor="middle">KW ${isoWeek(w.t)}</text>`;
  });
  const ok = W6.filter((w) => !w.unsure),
    avg = ok.length ? ok.reduce((a, w) => a + w.rate * w.incDays, 0) / ok.reduce((a, w) => a + w.incDays, 0) : null,
    cur = W6[W6.length - 1],
    tr = ok.length >= 3 && ok[0].rate > 0 ? (ok[ok.length - 1].rate / ok[0].rate - 1) * 100 : null;
  el.innerHTML =
    vzSvgOpen(W, H) +
    g +
    `</svg><div class="wkCards" style="margin-top:10px"><div><span class="muted">Diese Woche</span><b>${fv(cur.rate)}/Tag</b><span class="muted">bisher ${Math.round(cur.incDays)} ${Math.round(cur.incDays) === 1 ? "Tag" : "Tage"}${cur.unsure ? " · Nebengebäude" : ""}</span></div><div><span class="muted">Ø ${W6.length} Wochen</span><b>${avg == null ? "–" : fv(avg) + "/Tag"}</b><span class="muted">${ok.length} von ${W6.length} Wochen${W6.length - ok.length ? ", " + (W6.length - ok.length) + " ausgelassen" : ""}</span></div><div><span class="muted">Trend</span><b>${tr == null ? "zu wenig Daten" : (tr > 0 ? "+" : "") + Math.round(tr) + " %"}</b><span class="muted">erste → letzte Woche (ohne unsichere)</span></div></div>`;
  el.querySelectorAll("rect.vzBarX").forEach((r) => {
    r.style.cursor = "pointer";
    r.onclick = () => {
      s.weekIncomeOk = s.weekIncomeOk || {};
      s.weekIncomeOk[m + "|" + r.dataset.wk] = true;
      save();
    };
  });
}
function renderVerlauf() {
  renderTimeline();
  renderFcHistory();
  renderIncomeWeeks();
}
