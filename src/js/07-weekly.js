let wkOffset = 0;
function mainPlan() {
  return s.plans.find((x) => x.isMain) || s.plans[0];
}
function dayKey(t) {
  const d = new Date(t),
    z = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
}
function logForecast() {
  const p = mainPlan();
  if (!p || !p.hasPlanData) return;
  const fc = planForecast(p);
  if (!fc) return;
  const pc = packCalc(p),
    o = fc.overall,
    e = {
      d: dayKey(Date.now()),
      // ab 3.0: Schiff ohne nötige Schiffswerft hat kein Fertigdatum
      eta: o.real == null || shipYardBlock(p) ? null : o.real === 0 ? 0 : Math.round(fc.base + o.real * 864e5),
      driver: o.realDriver || null,
      packs: pc ? pc.total : null,
    };
  s.fcLog = s.fcLog && typeof s.fcLog === "object" ? s.fcLog : {};
  const L = (s.fcLog[p.id] = Array.isArray(s.fcLog[p.id]) ? s.fcLog[p.id] : []);
  const last = L[L.length - 1];
  if (last && last.d === e.d) {
    if (last.eta === e.eta && last.driver === e.driver && last.packs === e.packs) return;
    L[L.length - 1] = e;
  } else L.push(e);
  if (L.length > 400) L.splice(0, L.length - 400);
  persist();
}
function weekBounds(off) {
  const n = new Date();
  n.setHours(0, 0, 0, 0);
  const dow = (n.getDay() + 6) % 7;
  const a = new Date(n);
  a.setDate(n.getDate() - dow + 7 * off);
  const b = new Date(a);
  b.setDate(a.getDate() + 7);
  return { a: a.getTime(), b: b.getTime() };
}
function isoWeek(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}
function weekly() {
  $("impView").classList.remove("on");
  $("ni").classList.remove("on");
  document.querySelectorAll(".nav [data-tab]").forEach((b) => b.classList.remove("on"));
  ["nd", "nw"].forEach((i) => $(i).classList.remove("on"));
  $("dash").classList.add("off");
  $("snapView").classList.remove("on");
  $("wifView").classList.remove("on");
  $("wkView").classList.add("on");
  $("nwk").classList.add("on");
  renderWeekly();
}
function snapAt(list, t) {
  let r = null;
  for (const x of list) if (x.t <= t) r = x;
  return r;
}
function weekData(p, off) {
  const W = weekBounds(off),
    now = Date.now(),
    end = Math.min(W.b, now),
    snaps = s.snapshots
      .filter((x) => x && x.values)
      .map((x) => ({ x, t: new Date(snapTime(x)).getTime() }))
      .sort((a, b) => a.t - b.t);
  let s0 = snapAt(snaps, W.a);
  const inWeek = snaps.filter((x) => x.t > W.a && x.t <= end);
  if (!s0) s0 = inWeek[0] || null;
  const s1 = snapAt(snaps, end);
  const res = [];
  const mats = trackedMats();
  if (s0 && s1 && s1.t > s0.t) {
    const days = (s1.t - s0.t) / 864e5;
    for (const m of mats) {
      const a = s0.x.values[m],
        b = s1.x.values[m];
      if (!isNum(a) || !isNum(b)) continue;
      const ca = p && p.planData ? planCostAt(p, m, new Date(s0.t)) : null,
        cb = p && p.planData ? planCostAt(p, m, new Date(s1.t)) : null,
        built = ca != null && cb != null ? ca - cb : 0,
        inc = b - a + built;
      res.push({ m, a, b, delta: b - a, built, inc, perDay: days >= FC_GAP_DAYS ? inc / days : null });
    }
  }
  const hist = ((p && p.planData && p.planData.history) || [])
    .map((h) => ({ t: new Date(h.at).getTime(), pr: h.progress }))
    .filter((h) => h.pr && Number.isFinite(h.t))
    .sort((a, b) => a.t - b.t);
  const h0 = snapAt(hist, W.a),
    h1 = snapAt(hist, end);
  const doneStart = h0 ? h0.pr.done : hist.length && hist[0].t > W.a ? 0 : null,
    doneEnd = h1 ? h1.pr.done : null;
  const L = (s.fcLog && p && s.fcLog[p.id]) || [],
    fcEnd = [...L].reverse().find((e) => e.d <= dayKey(end - 1) && e.d >= dayKey(W.a)) || null,
    fcPrev = [...L].reverse().find((e) => e.d < dayKey(W.a)) || null;
  const ev = p ? allEvents(p).filter((e) => e.t >= W.a && e.t < W.b) : [];
  return {
    W,
    end,
    s0,
    s1,
    res,
    doneStart,
    doneEnd,
    total: h1 ? h1.pr.total : null,
    fcEnd,
    fcPrev,
    ev,
    current: off === 0,
  };
}
function etaTxt(e) {
  return !e
    ? "–"
    : e.eta == null
      ? "offen"
      : e.eta === 0
        ? "gedeckt"
        : fcDate(Date.now(), (e.eta - Date.now()) / 864e5);
}
function renderWeekly() {
  if (!s.plans.length) {
    $("wkPlan").textContent = "";
    $("wkLabel").textContent = "";
    $("wkBody").innerHTML =
      '<section class="panel"><p class="muted">Der Wochenbericht braucht einen Zielplan. Leg im Dashboard deinen ersten Plan an.</p></section>';
    return;
  }
  const p = mainPlan(),
    d = weekData(p, wkOffset),
    dPrev = weekData(p, wkOffset - 1),
    prevPer = Object.fromEntries(dPrev.res.map((r) => [r.m, r.perDay])),
    W = d.W,
    dl = (t) => new Date(t).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  $("wkPlan").textContent = p ? p.name + " (Hauptplan · " + statusLabel(calcPlanStatus(p)) + ")" : "";
  $("wkLabel").textContent =
    "KW " + isoWeek(W.a) + " · " + dl(W.a) + "–" + dl(W.b - 1) + (d.current ? " (laufend)" : "");
  $("wkNext").disabled = wkOffset >= 0;
  const steps = d.doneEnd != null && d.doneStart != null ? d.doneEnd - d.doneStart : null,
    pr = p ? planProgress(p) : null;
  let shift = "";
  if (d.fcEnd && d.fcPrev && d.fcEnd.eta > 0 && d.fcPrev.eta > 0) {
    const g = Math.round((d.fcPrev.eta - d.fcEnd.eta) / 864e5);
    shift =
      g === 0
        ? "unverändert zur Vorwoche"
        : g > 0
          ? `<span class="wifGain">${g} Tage früher als Ende Vorwoche</span>`
          : `<span class="wifLoss">${-g} Tage später als Ende Vorwoche</span>`;
  } else shift = d.fcPrev ? "Vorwoche: " + etaTxt(d.fcPrev) : "noch kein Vergleich zur Vorwoche";
  const fcE = d.fcEnd;
  let h = `<div class="wkCards"><div><span class="muted">Fortschritt in dieser Woche</span><b>${steps == null ? "–" : (steps > 0 ? "+" : "") + steps + " Stufe" + (Math.abs(steps) === 1 ? "" : "n")}</b><span class="muted">${pr ? "gesamt " + pr.done + " von " + pr.total + " Stufen (" + pr.pct + " %)" : "kein Ausgangsstand"}${steps === 0 ? " · kein Plan-Import mit Baufortschritt" : ""}</span></div><div><span class="muted">Fertigstellung (Stand ${d.current ? "heute" : "Wochenende"})</span><b>${d.current && shipYardBlock(p) ? "Schiffswerft " + shipYardBlock(p).yard + " fehlt" : etaTxt(fcE)}</b><span class="muted">${shift}</span></div><div><span class="muted">Engpass</span><b>${fcE && fcE.driver ? escAttr(fcE.driver.replace("7★ ", "")) : "–"}</b><span class="muted">${isShip(p) ? "Packs: für Schiffe nicht berechnet" : fcE && fcE.packs != null ? "Packs bis zum Ziel: " + (fcE.packs ? "≈ " + fcE.packs : "keine nötig") : packEmpty() ? "Stationspack nicht gepflegt" : "keine Pack-Rechnung"}</span></div></div>`;
  h += `<section class="panel"><h3>Ressourcen in dieser Woche</h3>${d.s0 && d.s1 && d.s1.t > d.s0.t ? `<p class="muted" style="margin:4px 0 8px;font-size:12px">Vergleich der Snapshots ${fdt(d.s0.t)} → ${fdt(d.s1.t)}. Einkommen = Bestandsänderung + Verbautes.</p><div class="histWrap"><table class="histTable" style="width:100%"><thead><tr><th>Material</th><th>Bestand Anfang</th><th>Bestand Ende</th><th>Veränderung</th><th>Verbaut</th><th>Einkommen</th><th>Ø pro Tag</th><th>Ø Vorwoche</th><th>Trend</th></tr></thead><tbody id="wkRes">${d.res.map((r) => `<tr><td>${escAttr(r.m)}</td><td>${fmt(r.a)}</td><td>${fmt(r.b)}</td><td class="${r.delta >= 0 ? "green" : "red"}">${r.delta > 0 ? "+" : ""}${fmt(r.delta)}</td><td>${r.built ? fmt(r.built) : "–"}</td><td>${r.inc > 0 ? "+" : ""}${fmt(r.inc)}</td><td>${r.perDay == null ? "< " + FC_GAP_H + " h" : (r.perDay > 0 ? "+" : "") + fmt(r.perDay)}</td>${wkTrend(r.perDay, prevPer[r.m])}</tr>`).join("")}</tbody></table></div>` : '<p class="muted">Für diese Woche gibt es keine zwei Snapshots zum Vergleichen' + (d.s1 ? " (letzter Stand " + fdt(d.s1.t) + ")" : "") + ".</p>"}</section>`;
  // ab 2.1: Effizienz-Zeile unter der Ressourcentabelle
  h = h.replace(/<\/section>$/, wkEffLine(p, W.a, d.end) + "</section>");
  if (d.current) h += wkOutlook(p);
  h += `<section class="panel" style="margin-top:12px"><h3>Ereignisse der Woche</h3>${
    d.ev.length
      ? `<table class="histTable" style="width:100%"><tbody id="wkEv">${d.ev
          .sort((a, b) => a.t - b.t)
          .map(
            (e) =>
              `<tr><td>${e.type === "manual" ? new Date(e.t).toLocaleDateString("de-DE") : fdt(e.t)}</td><td><span class="evTag" style="border-left:3px solid ${EV_COL[e.type]}">${escAttr(EV_LAB[e.type])}</span></td><td style="white-space:normal">${escAttr(e.text)}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : '<p class="muted">Keine Ereignisse in dieser Woche.</p>'
  }</section>`;
  h +=
    '<div class="chartNote" style="margin-top:10px">Wochen laufen Montag bis Sonntag. Die Fertigstellung im Wochenvergleich wird ab 1.8.4 täglich mitprotokolliert – ältere Wochen haben deshalb noch keinen Vergleichswert.</div>';
  $("wkBody").innerHTML = h;
}

// Ab 2.1 (F19): Vergleich mit dem Ø-Einkommen der Vorwoche
function wkTrend(now, prev) {
  if (now == null || prev == null) return '<td class="muted">–</td><td class="muted">kein Vergleich</td>';
  const d = now - prev;
  return (
    `<td>${prev > 0 ? "+" : ""}${fmt(prev)}</td>` +
    (Math.abs(d) < 0.05
      ? '<td class="muted">= gleich</td>'
      : `<td class="${d > 0 ? "green" : "red"}">${d > 0 ? "▲ +" : "▼ −"}${fmt(Math.abs(d))}</td>`)
  );
}
// Ab 2.1 (F19): Ausblick auf die kommende Woche, nur in der laufenden Woche
function wkOutlook(p) {
  const fc = p && p.hasPlanData ? planForecast(p) : null,
    wb = weekBounds(1),
    head = `<section class="panel" id="wkOutlook" style="margin-top:12px"><h3>Ausblick auf KW ${isoWeek(wb.a)}</h3>`;
  if (!fc || !(fc.overall.real > 0))
    return (
      head +
      `<p class="muted">${fc && fc.overall.real === 0 ? "Alle Ressourcen für das Ziel sind schon gedeckt." : "Der Ausblick braucht eine Prognose (mindestens " + FC_MIN + " Abschnitte mit je " + FC_GAP_H + " Stunden Abstand)."}</p></section>`
    );
  const until = (wb.b - fc.base) / 864e5,
    soon = fc.res
      .filter((x) => !x.common && x.miss > 0 && x.eta.real != null && x.eta.real < until)
      .sort((a, b) => a.eta.real - b.eta.real),
    bn = bottleneckRows(p),
    li = soon.length
      ? soon.map((x) => `<li>${escAttr(x.m)} voraussichtlich gedeckt am <b>${fcDate(fc.base, x.eta.real)}</b></li>`).join("")
      : `<li>Bis Ende KW ${isoWeek(wb.a)} wird voraussichtlich kein weiteres Material gedeckt.</li>`;
  return (
    head +
    `<ul class="wkList">${li}` +
    (bn && bn.rows.length
      ? `<li>Engpass bleibt <b>${escAttr(bn.rows[0].m)}</b>${bn.rows[1] ? " – danach " + escAttr(bn.rows[1].m) : ""}</li>`
      : "") +
    (shipYardBlock(p)
      ? `<li>Fertigstellung offen – <b>Schiffswerft ${shipYardBlock(p).yard} fehlt</b> (${escAttr(shipYardHint(shipYardBlock(p)))})</li></ul>`
      : `<li>Fertigstellung <b>${fcRealTxt(fc)}</b>, wenn das Einkommen gleich bleibt</li></ul>`) +
    `<p class="muted" style="font-size:11.5px;margin:6px 0 0">Rechnet mit dem realistischen Einkommen. Fehlen in einer Woche zwei Snapshots, steht beim Vergleich „kein Vergleich“.</p></section>`
  );
}

// Ab 2.1 (F19 Punkt 5): Effizienzänderungen der Woche aus der Planhistorie
function wkEffLine(p, a, end) {
  const h = (((p && p.planData) || {}).history || [])
    .filter((x) => x.efficiencies && Object.keys(x.efficiencies).length)
    .map((x) => ({ t: new Date(x.at).getTime(), e: x.efficiencies }))
    .sort((x, y) => x.t - y.t);
  const lead = '<p class="muted wkEff"><b>Effizienzen diese Woche:</b> ';
  if (!h.length) return lead + "noch kein Verlauf – er beginnt mit dem nächsten Plan-Import.</p>";
  const e1 = snapAt(h, end - 1),
    inWeek = h.filter((x) => x.t > a && x.t < end),
    e0 = snapAt(h, a) || (inWeek.length > 1 ? inWeek[0] : null);
  if (!e1 || !e0 || e0 === e1) return lead + "kein Vergleich (kein Plan-Import mit Effizienzen in dieser Woche).</p>";
  const ch = Object.keys(e1.e)
    .filter((k) => isNum(e1.e[k]) && isNum(e0.e[k]) && e1.e[k] !== e0.e[k])
    .map(
      (k) =>
        `${escAttr(k)} ${fx(e0.e[k])} % → ${fx(e1.e[k])} % <span class="${e1.e[k] > e0.e[k] ? "green" : "red"}">(${e1.e[k] > e0.e[k] ? "+" : "−"}${fx(Math.abs(e1.e[k] - e0.e[k]))})</span>`,
    );
  return lead + (ch.length ? ch.join(" · ") : "keine Änderung") + "</p>";
}
