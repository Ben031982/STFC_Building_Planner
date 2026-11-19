// 4.0 Teil 2: Als Bild teilen (Karte für den Allianz-Chat). Alles läuft im Browser, gezeichnet wird auf ein Canvas.
// Achtung: läuft schon beim ersten render() – keine let/const/var-Werte auf oberster Ebene, nur Funktionen.

function shareDefaults() {
  return {
    plan: "all",
    exact: true,
    inc: { goal: true, eta: true, bottleneck: true, res: true, packs: false, timeline: false },
    name: true,
    playerName: "",
  };
}
function shareOpts() {
  const d = shareDefaults(),
    o = s.share && typeof s.share === "object" ? s.share : {};
  return {
    plan: typeof o.plan === "string" ? o.plan : d.plan,
    exact: o.exact !== false,
    inc: Object.assign({}, d.inc, o.inc && typeof o.inc === "object" ? o.inc : {}),
    name: o.name !== false,
    playerName: typeof o.playerName === "string" ? o.playerName : "",
  };
}
// Datum grob: „Mitte Dez.“, ab einem Jahr Abstand „später als Q4 27“
function shareCoarseDate(t) {
  const now = Date.now(),
    d = new Date(t);
  if (t - now > 365 * 864e5) {
    const lim = new Date(now + 365 * 864e5);
    return _t("sh.spaeter_q", { q: Math.floor(lim.getMonth() / 3) + 1, y: String(lim.getFullYear()).slice(2) });
  }
  const part = _t(d.getDate() <= 10 ? "sh.anfang" : d.getDate() <= 20 ? "sh.mitte" : "sh.ende"),
    mon = d.toLocaleDateString(LOC(), { month: "short" }).replace(".", "") + ".";
  return part + " " + mon + (d.getFullYear() !== new Date().getFullYear() ? " " + String(d.getFullYear()).slice(2) : "");
}
function shareExactDate(t, long) {
  const now = Date.now();
  if (t - now > 365 * 864e5)
    return _t("sh.spaeter_q", { q: Math.floor(new Date(now + 365 * 864e5).getMonth() / 3) + 1, y: String(new Date(now + 365 * 864e5).getFullYear()).slice(2) });
  return long
    ? new Date(t).toLocaleDateString(LOC(), { day: "numeric", month: "long" })
    : ((x) => (curLang() === "de" ? x.replace(/\.?$/, ".") : x))(new Date(t).toLocaleDateString(LOC(), { day: "numeric", month: "numeric" }));
}
// aktive Pläne mit Prognose (hasPlanData je Plan selbst setzen – render() tut das nur für den gewählten)
function shareActivePlans() {
  return s.plans.filter((p) => {
    p.status = calcPlanStatus(p);
    p.hasPlanData = p.status === "active";
    return p.hasPlanData;
  });
}
function shareEta(p) {
  const fc = planForecast(p),
    o = fc && fc.overall,
    blocked = isShip(p) && typeof shipYardBlock === "function" ? shipYardBlock(p) : null;
  if (blocked) return { blocked: blocked.yard };
  if (!o || o.real == null) return { t: null };
  return { t: o.real === 0 ? Date.now() : fc.base + o.real * 864e5 };
}
// Vergleich mit der Vorwoche aus dem Prognose-Protokoll (Tage früher > 0)
function shareWeekDiff(p) {
  const L = ((s.fcLog || {})[p.id] || []).filter((x) => x.eta > 0);
  if (L.length < 2) return null;
  const last = L[L.length - 1],
    old = L.filter((x) => new Date(last.d) - new Date(x.d) >= 6.5 * 864e5).pop();
  return old ? Math.round((old.eta - last.eta) / 864e5) : null;
}
function shareTimeline(cur) {
  const done = (Array.isArray(s.goals) ? s.goals : [])
      .slice()
      .sort((a, b) => new Date(a.at) - new Date(b.at))
      .map((g) => ({ name: g.name, st: "done" })),
    rest = shareActivePlans()
      .filter((p) => !cur || p.id !== cur.id)
      .map((p) => ({ name: p.name, st: "future" }));
  const list = done.slice(-2).concat(cur ? [{ name: cur.name, st: "now" }] : [], rest).slice(0, 6);
  return list;
}
// Modell: alles, was die Karte zeigt, als Daten (so lässt es sich testen, ohne Pixel zu lesen)
// ab 5.1: „Ziel erreicht“-Karte für ein abgeschlossenes Ziel (s.goals)
function buildGoalShareModel(g, o, stand) {
  const at = new Date(g.at).getTime(),
    since = g.since ? new Date(g.since).getTime() : NaN,
    days = Number.isFinite(since) ? Math.max(1, Math.round((at - since) / 864e5)) : null,
    chips = [];
  if (o.exact) {
    const dv = typeof goalDev === "function" ? goalDev(g, g.fc && g.fc.mid) : null;
    if (dv != null) chips.push((Math.abs(dv) <= 1 ? _t("sh.wie_halbzeit") : _t(dv > 0 ? "sh.spaeter_halbzeit" : "sh.frueher_halbzeit", { n: Math.abs(dv) })));
  }
  return {
    kind: "goal",
    title: g.name,
    stand,
    badge: _t("sh.badge_ziel"),
    etaLabel: _t("ev.th_erreicht"),
    eta: o.exact ? new Date(at).toLocaleDateString(LOC(), { day: "numeric", month: "long", year: "numeric" }) : shareCoarseDate(at),
    etaSub: days ? (o.exact ? _t(days === 1 ? "sh.geschafft1" : "sh.geschafft", { n: days }) : null) : null,
    etaSubUp: true,
    chips: chips.map((t) => ({ text: t })),
    note: o.exact ? _t("sh.ziel_abg") : _t("sh.nur_datum"),
    exact: o.exact,
  };
}
// ab 5.1: Wochenbericht als Bild (laufende Woche des Hauptplans)
function buildWeekShareModel(o, who) {
  const p = mainPlan(),
    d = weekData(p, 0),
    dPrev = weekData(p, -1),
    prevPer = Object.fromEntries(dPrev.res.map((r) => [r.m, r.perDay])),
    W = d.W,
    dl = (x) => new Date(x).toLocaleDateString(LOC(), { day: "2-digit", month: "2-digit" }),
    e = shareEta(p),
    pc = vzProgress(p) || 0,
    // ein Minus ist nicht möglich (Bezug des Plans hat sich geändert, z. B. neuer Import) → keine Stufen anzeigen
    steps = d.doneEnd != null && d.doneStart != null && d.doneEnd >= d.doneStart ? d.doneEnd - d.doneStart : null,
    r0 = (v) => fmt(Math.abs(v) >= 1e6 ? v : Math.round(v)),
    bn = planBottleneck(p, getPlanResources(p)),
    chips = [];
  let sub = null,
    up = true;
  if (d.fcEnd && d.fcPrev && d.fcEnd.eta > 0 && d.fcPrev.eta > 0) {
    const g = Math.round((d.fcPrev.eta - d.fcEnd.eta) / 864e5);
    sub = g === 0 ? _t("sh.wb_unv") : (g > 0 ? "▲ " : "▼ ") + _t((g > 0 ? "sh.wb_frueher" : "sh.wb_spaeter") + (Math.abs(g) === 1 ? "1" : ""), { n: Math.abs(g) });
    up = g >= 0;
  }
  if (bn && !bn.none) chips.push({ warn: true, text: _t("sh.engpass", { m: bn.name }) });
  let inc = null;
  if (o.exact) {
    const want = [bn && !bn.none ? bn.name : null, "Σ-Parsteel", "Σ-Tritanium", "Σ-Dilithium"].filter((x, i, a) => x && a.indexOf(x) === i),
      rows = want
        .map((n) => d.res.find((r) => r.m === n))
        .filter((r) => r && isNum(r.perDay))
        .slice(0, 3)
        .map((r) => {
          const pv = prevPer[r.m],
            dd = isNum(pv) ? r.perDay - pv : null;
          return {
            name: r.m,
            val: (r.perDay > 0 ? "+" : "") + r0(r.perDay),
            trend: dd == null ? _t("common.kein_vergleich") : Math.abs(dd) < 0.5 ? _t("wk.gleich") : (dd > 0 ? "▲ +" : "▼ −") + r0(Math.abs(dd)),
            up: dd == null || dd >= 0,
          };
        });
    if (rows.length) inc = rows;
  }
  return {
    kind: "week",
    title: _t("sh.meine_woche"),
    stand:
      _t("wk.kw_label", { w: isoWeek(W.a), a: dl(W.a), b: new Date(W.b - 1).toLocaleDateString(LOC(), { day: "2-digit", month: "2-digit", year: "numeric" }) }) + who,
    badge: _t("sh.badge_woche"),
    pct: steps != null ? (steps > 0 ? "+" : "") + steps : o.exact ? pc.toLocaleString(LOC(), { maximumFractionDigits: 1 }) + " %" : Math.round(pc) + " %",
    pctValue: pc,
    ringSub: steps != null ? _t(Math.abs(steps) === 1 ? "sh.ring_stufe" : "sh.ring_stufen") : _t("sh.ring_geschafft"),
    ringNote: steps != null ? _t("sh.ring_gesamt", { p: Math.round(pc) }) : null,
    etaLabel: (p.name.length > 24 ? p.name.slice(0, 23) + "…" : p.name) + " · " + _t(e.blocked ? "sh.wartet_klein" : "sh.vorauss_klein"),
    eta: e.blocked ? _t("ship.werft_grp", { n: e.blocked }) : e.t == null ? _t("fc.far") : o.exact ? shareExactDate(e.t, true) : shareCoarseDate(e.t),
    etaSub: o.exact ? sub : null,
    etaSubUp: up,
    chips,
    inc,
    note: o.exact ? _t("sh.note_schaetz") : _t("ui.nur_prozent_und_datum"),
    exact: o.exact,
  };
}
function buildShareModel(o) {
  o = o || shareOpts();
  const now = Date.now(),
    who = o.name && o.playerName.trim() ? " · " + o.playerName.trim() : "",
    stand = _t("sh.stand", { d: new Date(now).toLocaleDateString(LOC()) }) + who,
    plans = shareActivePlans(),
    doneN = (Array.isArray(s.goals) ? s.goals : []).length;
  const goal = typeof o.plan === "string" && o.plan.startsWith("goal:") ? (s.goals || []).find((g) => g.id === o.plan.slice(5)) : null;
  if (goal) return buildGoalShareModel(goal, o, stand);
  if (o.plan === "week" && s.plans.length) return buildWeekShareModel(o, who);
  if (o.plan === "all" || !plans.some((p) => p.id === o.plan)) {
    const rows = plans.map((p) => {
        const e = shareEta(p),
          pc = vzProgress(p) || 0;
        return {
          name: p.name,
          pct: o.exact ? Math.round(pc * 10) / 10 : Math.round(pc),
          date: e.blocked ? _t("sh.nach_werft") : e.t == null ? "–" : o.exact ? shareExactDate(e.t) : shareCoarseDate(e.t),
          t: e.t || null,
        };
      }),
      next = rows.filter((r) => r.t).sort((a, b) => a.t - b.t)[0];
    return {
      kind: "all",
      title: _t("sh.meine_ziele"),
      stand,
      badge: _t(rows.length === 1 ? "sh.plaene1" : "sh.plaene", { n: rows.length }),
      chips: (doneN ? [_t(doneN === 1 ? "sh.ziele_erreicht1" : "sh.ziele_erreicht", { n: doneN })] : []).concat(next ? [_t("sh.naechstes", { name: next.name })] : []),
      rows: rows.slice(0, 10),
      more: Math.max(0, rows.length - 10),
      note: o.exact ? _t("sh.einzeln") : _t("ui.nur_prozent_und_datum"),
      exact: o.exact,
    };
  }
  const p = plans.find((x) => x.id === o.plan),
    e = shareEta(p),
    pc = vzProgress(p) || 0,
    rows = getPlanResources(p).filter((r) => !isLatinumMat(r[0]) && r[3] > 0),
    bn = planBottleneck(p, getPlanResources(p)),
    pk = o.inc.packs && o.exact ? packCalc(p) : null,
    diff = o.exact && o.inc.eta ? shareWeekDiff(p) : null;
  const chips = [];
  if (o.inc.bottleneck && bn && !bn.none) chips.push({ warn: true, text: _t("sh.engpass", { m: bn.name }) });
  if (!o.exact && o.inc.res && rows.length) chips.push({ text: _t("sh.fehlt_noch", { p: Math.max(1, 100 - Math.round(pc)) }) });
  if (o.exact && o.inc.eta) chips.push({ text: _t("sh.prog_real") });
  if (pk && pk.total > 0) chips.push({ text: _t("dash.n_packs", { n: pk.total }) + (pk.pack.priceEUR ? " · " + _t("pk.eur", { p: fx(Math.round(pk.total * pk.pack.priceEUR)) }) : "") });
  return {
    kind: "single",
    title: p.name,
    stand,
    badge: statusLabel(p.status).toUpperCase(),
    pct: o.inc.goal ? (o.exact ? pc.toLocaleString(LOC(), { maximumFractionDigits: 1 }) : String(Math.round(pc))) + " %" : null,
    pctValue: pc,
    etaLabel: o.inc.eta ? (e.blocked ? _t("sh.wartet_auf") : _t("sh.vorauss_fertig")) : null,
    eta: o.inc.eta ? (e.blocked ? _t("ship.werft_grp", { n: e.blocked }) : e.t == null ? _t("fc.far") : o.exact ? shareExactDate(e.t, true) : shareCoarseDate(e.t)) : null,
    etaSub: diff == null ? null : diff > 0 ? "▲ " + _t(diff === 1 ? "vz.frueher1" : "vz.frueher", { n: diff }) : diff < 0 ? "▼ " + _t(diff === -1 ? "vz.spaeter1" : "vz.spaeter", { n: -diff }) : _t("vz.unveraendert"),
    etaSubUp: diff != null && diff >= 0,
    chips,
    res:
      o.exact && o.inc.res
        ? rows.length
          ? rows.slice(0, 3).map((r) => ({ name: r[0], val: fx(Math.round(r[3])) }))
          : [{ name: _t("sh.alles_gedeckt"), val: "✓" }]
        : null,
    timeline: o.inc.timeline ? shareTimeline(p) : null,
    note: o.exact ? _t("sh.note_schaetz") : _t("ui.nur_prozent_und_datum"),
    exact: o.exact,
  };
}

// ---------------------------------------------------------------- Zeichnen (Canvas, 560er-Raster auf 1080 px)
function shRound(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function shText(c, t, x, y, size, color, weight, align, fam) {
  c.font = (weight || 400) + " " + size + 'px "' + (fam || "IBM Plex Sans") + '", system-ui, sans-serif';
  c.fillStyle = color;
  c.textAlign = align || "left";
  c.textBaseline = "alphabetic";
  c.fillText(t, x, y);
}
function shPill(c, t, x, y, size, fg, bg, border) {
  c.font = "500 " + size + 'px "IBM Plex Sans", system-ui, sans-serif';
  const w = c.measureText(t).width + 26,
    h = size + 13;
  shRound(c, x, y, w, h, h / 2);
  c.fillStyle = bg;
  c.fill();
  if (border) {
    c.strokeStyle = border;
    c.lineWidth = 1;
    c.stroke();
  }
  shText(c, t, x + 13, y + h / 2 + size * 0.35, size, fg, 500);
  return w;
}
function shBackground(c) {
  const S = 560;
  c.save();
  shRound(c, 0, 0, S, S, 26);
  c.clip();
  let g = c.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, "#0c2236");
  g.addColorStop(1, "#070d14");
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  g = c.createRadialGradient(440, 70, 0, 440, 70, 260);
  g.addColorStop(0, "rgba(27,79,122,.95)");
  g.addColorStop(1, "rgba(27,79,122,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  g = c.createRadialGradient(56, 560, 0, 56, 560, 280);
  g.addColorStop(0, "rgba(59,42,110,.95)");
  g.addColorStop(1, "rgba(59,42,110,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  c.fillStyle = "rgba(255,255,255,.55)";
  [[67, 120, 1.2], [185, 45, 1], [342, 190, 1.4], [493, 392, 1], [263, 493, 1.2], [112, 358, 1], [515, 67, 1.3], [420, 300, 1]].forEach(([x, y, r]) => {
    c.beginPath();
    c.arc(x, y, r, 0, 7);
    c.fill();
  });
  [["#ff9c3b", 0, 0.22], ["#c26cff", 0.22, 0.46], ["#46c2ee", 0.46, 1]].forEach(([col, a, b]) => {
    c.fillStyle = col;
    c.fillRect(0, S * a, 14, S * (b - a));
  });
  c.restore();
  shRound(c, 0.5, 0.5, S - 1, S - 1, 26);
  c.strokeStyle = "#2f5f86";
  c.lineWidth = 1;
  c.stroke();
}
function shHeader(c, m) {
  shText(c, m.title, 38, 62, 26, "#eaf4fb", 700);
  shText(c, m.stand, 38, 84, 13, "#9fc2d9", 400);
  c.font = "700 12px \"IBM Plex Sans\", system-ui, sans-serif";
  const w = c.measureText(m.badge).width + 26;
  shRound(c, 530 - w, 36, w, 26, 13);
  c.fillStyle = "#ff9c3b";
  c.fill();
  shText(c, m.badge, 530 - w / 2, 53, 12, "#2a1600", 700, "center");
}
function shFooter(c, m) {
  shText(c, "Bens G7 STFC Progress Planner", 38, 542, 11, "#7f9db2", 400);
  shText(c, m.note, 530, 542, 11, "#7f9db2", 400, "right");
}
function shTimeline(c, list, y) {
  if (!list || !list.length) return;
  shText(c, _t("sh.meine_ziele_up"), 38, y, 12, "#9fc2d9", 500);
  const n = list.length,
    x0 = 50,
    x1 = 518,
    ty = y + 24,
    cx = (i) => (n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1)),
    nowI = Math.max(0, list.findIndex((q) => q.st === "now"));
  c.fillStyle = "rgba(255,255,255,.14)";
  c.fillRect(x0, ty - 2, x1 - x0, 4);
  c.fillStyle = "#46c2ee";
  c.fillRect(x0, ty - 2, cx(nowI) - x0, 4);
  list.forEach((q, i) => {
    const x = cx(i);
    c.beginPath();
    c.arc(x, ty, 10, 0, 7);
    if (q.st === "done") {
      c.fillStyle = "#7aeab0";
      c.fill();
      shText(c, "✓", x, ty + 4, 12, "#06301d", 700, "center");
    } else if (q.st === "now") {
      c.save();
      c.shadowColor = "#ffd166";
      c.shadowBlur = 12;
      c.fillStyle = "#ffd166";
      c.fill();
      c.restore();
    } else {
      c.fillStyle = "#0c2236";
      c.fill();
      c.setLineDash([3, 2]);
      c.strokeStyle = "#7f9db2";
      c.lineWidth = 2;
      c.stroke();
      c.setLineDash([]);
    }
    let t = q.name;
    c.font = '400 11px "IBM Plex Sans", system-ui, sans-serif';
    while (c.measureText(t).width > 80 && t.length > 4) t = t.slice(0, -2);
    if (t !== q.name) t += "…";
    shText(c, t, Math.min(Math.max(x, 48), 512), ty + 25, 11, q.st === "now" ? "#46c2ee" : "#9fc2d9", 400, "center");
  });
}
function drawShare(c, m) {
  c.save();
  c.scale(1080 / 560, 1080 / 560);
  shBackground(c);
  shHeader(c, m);
  if (m.kind === "all") {
    let x = 38;
    m.chips.forEach((t) => {
      x += shPill(c, t, x, 100, 12, "#eaf4fb", "rgba(255,255,255,.08)", "rgba(255,255,255,.13)") + 6;
    });
    const n = Math.max(m.rows.length, 1),
      rh = Math.min(46, 340 / n),
      y0 = 150;
    m.rows.forEach((r, i) => {
      const y = y0 + i * rh;
      shText(c, r.name, 38, y + rh / 2 + 5, 13.5, "#eaf4fb", 500);
      shRound(c, 196, y + rh / 2 - 4.5, 184, 9, 4.5);
      c.fillStyle = "#16344a";
      c.fill();
      const w = Math.max(9, (184 * Math.min(r.pct, 100)) / 100),
        g = c.createLinearGradient(196, 0, 196 + 184, 0);
      g.addColorStop(0, "#46c2ee");
      g.addColorStop(1, "#7aeab0");
      shRound(c, 196, y + rh / 2 - 4.5, w, 9, 4.5);
      c.fillStyle = g;
      c.fill();
      shText(c, (m.exact ? r.pct.toLocaleString(LOC()) : r.pct) + " %", 436, y + rh / 2 + 5, 13.5, "#46c2ee", 600, "right");
      shText(c, r.date, 530, y + rh / 2 + 5, 13.5, "#ffc98b", 600, "right");
      c.fillStyle = "rgba(255,255,255,.08)";
      c.fillRect(38, y + rh, 492, 1);
    });
    if (m.more) shText(c, _t("sh.weitere", { n: m.more }), 38, y0 + m.rows.length * rh + 18, 12, "#9fc2d9", 400);
    if (!m.rows.length) shText(c, _t("sh.kein_aktiv"), 38, 180, 14, "#9fc2d9", 400);
  } else if (m.kind === "goal") {
    shText(c, "✓", 280, 250, 120, "#7aeab0", 700, "center");
    shText(c, m.etaLabel, 280, 300, 14, "#9fc2d9", 400, "center");
    const g = c.createLinearGradient(100, 0, 460, 0);
    g.addColorStop(0, "#ffd166");
    g.addColorStop(1, "#ff9c3b");
    c.font = "700 " + (m.eta.length > 16 ? 32 : 40) + 'px "IBM Plex Sans", system-ui, sans-serif';
    c.fillStyle = g;
    c.textAlign = "center";
    c.fillText(m.eta, 280, 346);
    if (m.etaSub) shText(c, m.etaSub, 280, 374, 15, "#7aeab0", 400, "center");
    let w = 0;
    c.font = '500 13px "IBM Plex Sans", system-ui, sans-serif';
    m.chips.forEach((ch) => (w += c.measureText(ch.text).width + 32));
    let x = 280 - w / 2;
    m.chips.forEach((ch) => (x += shPill(c, ch.text, x, 420, 13, "#eaf4fb", "rgba(255,255,255,.08)", "rgba(255,255,255,.13)") + 6));
  } else {
    // Ring
    const cx = 133,
      cy = 203,
      R = 95,
      r = 75;
    if (m.pct) {
      c.save();
      c.shadowColor = "rgba(70,194,238,.45)";
      c.shadowBlur = 24;
      c.beginPath();
      c.arc(cx, cy, (R + r) / 2, 0, 7);
      c.lineWidth = R - r;
      c.strokeStyle = "#16344a";
      c.stroke();
      c.beginPath();
      c.arc(cx, cy, (R + r) / 2, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(m.pctValue, 100)) / 100);
      c.strokeStyle = "#46c2ee";
      c.stroke();
      c.restore();
      c.beginPath();
      c.arc(cx, cy, r - 1, 0, 7);
      c.fillStyle = "rgba(9,24,37,.6)";
      c.fill();
      shText(c, m.pct, cx, cy + (m.ringNote ? -2 : 5), 34, "#eaf4fb", 700, "center");
      shText(c, m.ringSub || "geschafft", cx, cy + (m.ringNote ? 17 : 26), 12, "#9fc2d9", 400, "center");
      if (m.ringNote) shText(c, m.ringNote, cx, cy + 33, 11, "#7f9db2", 400, "center");
    }
    if (m.eta) {
      const ex = m.pct ? 253 : 38;
      shText(c, m.etaLabel, ex, 190, 13, "#9fc2d9", 400);
      const g = c.createLinearGradient(ex, 0, ex + 240, 0);
      g.addColorStop(0, "#ffd166");
      g.addColorStop(1, "#ff9c3b");
      c.font = '700 ' + (m.eta.length > 14 ? 28 : 34) + 'px "IBM Plex Sans", system-ui, sans-serif';
      c.fillStyle = g;
      c.textAlign = "left";
      c.fillText(m.eta, ex, 232);
      if (m.etaSub) shText(c, m.etaSub, ex, 256, 13, m.etaSubUp ? "#7aeab0" : "#ffb07a", 400);
    }
    let x = 38;
    m.chips.forEach((ch) => {
      x += shPill(c, ch.text, x, 322, 13, ch.warn ? "#ffc98b" : "#eaf4fb", ch.warn ? "rgba(255,156,59,.15)" : "rgba(255,255,255,.08)", ch.warn ? "rgba(255,156,59,.55)" : "rgba(255,255,255,.13)") + 6;
    });
    if (m.res) {
      const h = 34 + m.res.length * 22;
      shRound(c, 38, 362, 492, h, 14);
      c.fillStyle = "rgba(10,26,40,.6)";
      c.fill();
      c.strokeStyle = "rgba(255,255,255,.1)";
      c.stroke();
      shText(c, _t("sh.es_fehlen"), 54, 384, 12, "#9fc2d9", 500);
      m.res.forEach((q, i) => {
        shText(c, q.name, 54, 408 + i * 22, 14, "#eaf4fb", 400);
        shText(c, q.val, 514, 408 + i * 22, 14, q.val === "✓" ? "#7aeab0" : "#eaf4fb", 700, "right");
      });
    }
    if (m.inc) {
      const h = 40 + m.inc.length * 24;
      shRound(c, 38, 352, 492, h, 14);
      c.fillStyle = "rgba(10,26,40,.6)";
      c.fill();
      c.strokeStyle = "rgba(255,255,255,.1)";
      c.stroke();
      shText(c, _t("sh.eink"), 54, 374, 12, "#9fc2d9", 500);
      shText(c, _t("sh.zur_vorwoche"), 514, 374, 12, "#9fc2d9", 500, "right");
      m.inc.forEach((q, i) => {
        const y = 398 + i * 24;
        shText(c, q.name, 54, y, 14, "#eaf4fb", 400);
        shText(c, q.val, 380, y, 14, "#7aeab0", 700, "right");
        shText(c, q.trend, 514, y, 13, q.trend === _t("common.kein_vergleich") || q.trend === _t("wk.gleich") ? "#9fc2d9" : q.up ? "#7aeab0" : "#ffb07a", 400, "right");
      });
    }
    if (m.timeline) shTimeline(c, m.timeline, 474);
  }
  shFooter(c, m);
  c.restore();
}

// ---------------------------------------------------------------- Dialog
function shareReadForm() {
  const o = {
    plan: $("shPlan").value,
    exact: $("shExact").checked,
    inc: {},
    name: $("shName").checked,
    playerName: $("shPlayer").value,
  };
  document.querySelectorAll("#shInc input[data-inc]").forEach((i) => (o.inc[i.dataset.inc] = i.checked));
  return o;
}
function shareFillForm() {
  const o = shareOpts(),
    plans = shareActivePlans();
  const goals = (Array.isArray(s.goals) ? s.goals : []).slice().sort((a, b) => new Date(b.at) - new Date(a.at));
  $("shPlan").innerHTML =
    `<option value="all">${_t("sh.alle_ziele")}</option>` +
    (s.plans.length ? `<option value="week">${_t("sh.opt_woche")}</option>` : "") +
    plans.map((p) => `<option value="${escAttr(p.id)}">${escAttr(p.name)}</option>`).join("") +
    (goals.length
      ? `<optgroup label="${_t("sh.erreichte")}">` + goals.map((g) => `<option value="goal:${escAttr(g.id)}">✓ ${escAttr(g.name)}</option>`).join("") + "</optgroup>"
      : "");
  $("shPlan").value = plans.some((p) => p.id === o.plan) || (o.plan === "week" && s.plans.length) || goals.some((g) => "goal:" + g.id === o.plan) ? o.plan : "all";
  $("shExact").checked = o.exact;
  $("shCoarse").checked = !o.exact;
  document.querySelectorAll("#shInc input[data-inc]").forEach((i) => (i.checked = !!o.inc[i.dataset.inc]));
  $("shName").checked = o.name;
  $("shPlayer").value = o.playerName;
}
function shareRefresh() {
  const o = shareReadForm();
  s.share = o;
  persist();
  $("shInc").style.display = o.plan === "all" || o.plan === "week" || o.plan.startsWith("goal:") ? "none" : "";
  $("shAllNote").style.display = o.plan === "all" ? "" : "none";
  $("shPlayer").disabled = !o.name;
  const run = () => drawShare($("shCanvas").getContext("2d"), buildShareModel(o));
  if (document.fonts && document.fonts.load)
    Promise.all([document.fonts.load('700 20px "IBM Plex Sans"'), document.fonts.load('400 20px "IBM Plex Sans"'), document.fonts.load('500 20px "IBM Plex Sans"')]).then(run, run);
  else run();
}
function openShare() {
  shareFillForm();
  $("shareModal").classList.add("on");
  shareRefresh();
}
function shareFileName() {
  const o = shareOpts(),
    p = s.plans.find((x) => x.id === o.plan),
    z = (n) => String(n).padStart(2, "0"),
    d = new Date();
  const gl = o.plan.startsWith("goal:") ? (s.goals || []).find((x) => x.id === o.plan.slice(5)) : null;
  return (
    "STFC_" + (o.plan === "week" ? "Woche" : gl ? "Ziel_" + gl.name.replace(/[^\wäöüÄÖÜß-]+/g, "_") : p && o.plan !== "all" ? p.name.replace(/[^\wäöüÄÖÜß-]+/g, "_") : "Ziele") + "_" + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + ".png"
  );
}
function shareSave() {
  $("shCanvas").toBlob((b) => {
    if (!b) return toast(_t("sh.fehler"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = shareFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(_t("sh.gespeichert", { f: a.download }));
  }, "image/png");
}
function shareCopy() {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") return toast(_t("sh.kopieren_nicht"));
  $("shCanvas").toBlob((b) => {
    navigator.clipboard.write([new ClipboardItem({ "image/png": b })]).then(
      () => toast(_t("sh.kopiert")),
      () => toast(_t("sh.blockiert")),
    );
  }, "image/png");
}
