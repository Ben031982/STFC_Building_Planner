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
    return "später als Q" + (Math.floor(lim.getMonth() / 3) + 1) + " " + String(lim.getFullYear()).slice(2);
  }
  const part = d.getDate() <= 10 ? "Anfang" : d.getDate() <= 20 ? "Mitte" : "Ende",
    mon = d.toLocaleDateString("de-DE", { month: "short" }).replace(".", "") + ".";
  return part + " " + mon + (d.getFullYear() !== new Date().getFullYear() ? " " + String(d.getFullYear()).slice(2) : "");
}
function shareExactDate(t, long) {
  const now = Date.now();
  if (t - now > 365 * 864e5) return "später als Q" + (Math.floor(new Date(now + 365 * 864e5).getMonth() / 3) + 1) + " " + String(new Date(now + 365 * 864e5).getFullYear()).slice(2);
  return long
    ? new Date(t).toLocaleDateString("de-DE", { day: "numeric", month: "long" })
    : new Date(t).toLocaleDateString("de-DE", { day: "numeric", month: "numeric" }).replace(/\.?$/, ".");
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
function buildShareModel(o) {
  o = o || shareOpts();
  const now = Date.now(),
    who = o.name && o.playerName.trim() ? " · " + o.playerName.trim() : "",
    stand = "Stand " + new Date(now).toLocaleDateString("de-DE") + who,
    plans = shareActivePlans(),
    doneN = (Array.isArray(s.goals) ? s.goals : []).length;
  if (o.plan === "all" || !plans.some((p) => p.id === o.plan)) {
    const rows = plans.map((p) => {
        const e = shareEta(p),
          pc = vzProgress(p) || 0;
        return {
          name: p.name,
          pct: o.exact ? Math.round(pc * 10) / 10 : Math.round(pc),
          date: e.blocked ? "nach Werft" : e.t == null ? "–" : o.exact ? shareExactDate(e.t) : shareCoarseDate(e.t),
          t: e.t || null,
        };
      }),
      next = rows.filter((r) => r.t).sort((a, b) => a.t - b.t)[0];
    return {
      kind: "all",
      title: "Meine Ziele",
      stand,
      badge: rows.length + (rows.length === 1 ? " PLAN" : " PLÄNE"),
      chips: (doneN ? ["✓ " + doneN + (doneN === 1 ? " Ziel" : " Ziele") + " erreicht"] : []).concat(next ? ["Nächstes: " + next.name] : []),
      rows: rows.slice(0, 10),
      more: Math.max(0, rows.length - 10),
      note: o.exact ? "Jeder Plan einzeln gerechnet" : "Nur Prozent & Datum",
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
  if (o.inc.bottleneck && bn && !bn.none) chips.push({ warn: true, text: "⚠ Engpass: " + bn.name });
  if (!o.exact && o.inc.res && rows.length) chips.push({ text: "fehlt noch ~" + Math.max(1, 100 - Math.round(pc)) + " %" });
  if (o.exact && o.inc.eta) chips.push({ text: "Prognose realistisch" });
  if (pk && pk.total > 0) chips.push({ text: pk.total + " Packs" + (pk.pack.priceEUR ? " · " + fx(Math.round(pk.total * pk.pack.priceEUR)) + " €" : "") });
  return {
    kind: "single",
    title: p.name,
    stand,
    badge: statusLabel(p.status).toUpperCase(),
    pct: o.inc.goal ? (o.exact ? pc.toLocaleString("de-DE", { maximumFractionDigits: 1 }) : String(Math.round(pc))) + " %" : null,
    pctValue: pc,
    etaLabel: o.inc.eta ? (e.blocked ? "Wartet auf" : "Voraussichtlich fertig") : null,
    eta: o.inc.eta ? (e.blocked ? "Schiffswerft " + e.blocked : e.t == null ? "nicht absehbar" : o.exact ? shareExactDate(e.t, true) : shareCoarseDate(e.t)) : null,
    etaSub: diff == null ? null : diff > 0 ? "▲ " + diff + (diff === 1 ? " Tag" : " Tage") + " früher als vor 7 Tagen" : diff < 0 ? "▼ " + -diff + (diff === -1 ? " Tag" : " Tage") + " später als vor 7 Tagen" : "unverändert gegenüber vor 7 Tagen",
    etaSubUp: diff != null && diff >= 0,
    chips,
    res:
      o.exact && o.inc.res
        ? rows.length
          ? rows.slice(0, 3).map((r) => ({ name: r[0], val: fx(Math.round(r[3])) }))
          : [{ name: "Alles gedeckt", val: "✓" }]
        : null,
    timeline: o.inc.timeline ? shareTimeline(p) : null,
    note: o.exact ? "Schätzung aus meinem Einkommen" : "Nur Prozent & Datum",
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
  shText(c, "MEINE ZIELE", 38, y, 12, "#9fc2d9", 500);
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
      shText(c, (m.exact ? String(r.pct).replace(".", ",") : r.pct) + " %", 436, y + rh / 2 + 5, 13.5, "#46c2ee", 600, "right");
      shText(c, r.date, 530, y + rh / 2 + 5, 13.5, "#ffc98b", 600, "right");
      c.fillStyle = "rgba(255,255,255,.08)";
      c.fillRect(38, y + rh, 492, 1);
    });
    if (m.more) shText(c, "+ " + m.more + " weitere", 38, y0 + m.rows.length * rh + 18, 12, "#9fc2d9", 400);
    if (!m.rows.length) shText(c, "Noch kein aktiver Plan", 38, 180, 14, "#9fc2d9", 400);
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
      shText(c, m.pct, cx, cy + 5, 34, "#eaf4fb", 700, "center");
      shText(c, "geschafft", cx, cy + 26, 12, "#9fc2d9", 400, "center");
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
      shText(c, "ES FEHLEN NOCH", 54, 384, 12, "#9fc2d9", 500);
      m.res.forEach((q, i) => {
        shText(c, q.name, 54, 408 + i * 22, 14, "#eaf4fb", 400);
        shText(c, q.val, 514, 408 + i * 22, 14, q.val === "✓" ? "#7aeab0" : "#eaf4fb", 700, "right");
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
  $("shPlan").innerHTML =
    '<option value="all">Alle Ziele</option>' + plans.map((p) => `<option value="${escAttr(p.id)}">${escAttr(p.name)}</option>`).join("");
  $("shPlan").value = plans.some((p) => p.id === o.plan) ? o.plan : "all";
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
  $("shInc").style.display = o.plan === "all" ? "none" : "";
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
  return (
    "STFC_" + (p && o.plan !== "all" ? p.name.replace(/[^\wäöüÄÖÜß-]+/g, "_") : "Ziele") + "_" + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + ".png"
  );
}
function shareSave() {
  $("shCanvas").toBlob((b) => {
    if (!b) return toast("Das Bild konnte nicht erzeugt werden.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = shareFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Bild gespeichert: " + a.download);
  }, "image/png");
}
function shareCopy() {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") return toast("Kopieren geht in diesem Browser nicht – bitte „Bild speichern“.");
  $("shCanvas").toBlob((b) => {
    navigator.clipboard.write([new ClipboardItem({ "image/png": b })]).then(
      () => toast("Bild in die Zwischenablage kopiert."),
      () => toast("Kopieren wurde blockiert – bitte „Bild speichern“."),
    );
  }, "image/png");
}
