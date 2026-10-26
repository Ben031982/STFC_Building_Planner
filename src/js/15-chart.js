function drawChart(boxId, W, H, big) {
  let p = s.plans.find((x) => x.id === s.active) || s.plans[0];
  if (!p) return;
  let name = $("resourceSelect").value || "7★ Rare Ore";
  if (big) {
    $("chartBigTitle").textContent = "Ressourcenentwicklung · " + p.name;
  }
  const empty = (msg, note) => {
    $(boxId).innerHTML = '<div style="padding:80px 20px;text-align:center;color:#8ca5b7">' + msg + "</div>";
    if (big) {
      $("chartBigNote").textContent = note;
      $("chartBigStats").innerHTML = "";
      return;
    }
    $("lastDelta").textContent = $("daily").textContent = $("weekly").textContent = "–";
    $("chartNote").textContent = note;
  };
  if (!p.hasPlanData) {
    empty(
      "Keine planabhängige Kostengrundlage für " + escAttr(p.name) + ".",
      "Die Bedarfslinie und planabhängige Kennzahlen werden erst nach Import und Bestätigung des Upgrade-Plans angezeigt.",
    );
    return;
  }
  const pts = s.snapshots
      .filter((x) => x.values && Number.isFinite(x.values[name]))
      .map((x) => ({ t: new Date(snapTime(x)).getTime(), v: x.values[name] }))
      .sort((a, b) => a.t - b.t),
    row = getPlanResources(p).find((r) => r[0] === name),
    need = row ? row[2] : 0,
    miss = row ? row[3] : 0;
  if (!pts.length) {
    empty(
      "Noch keine Snapshot-Daten für diese Ressource.",
      name.startsWith("Σ")
        ? "Σ-Werte gibt es in Snapshots ab Version 1.4.4. Importiere einen neuen JSON-Export."
        : "Importiere mindestens einen Snapshot, um den Verlauf zu starten.",
    );
    return;
  }
  const st = rateStats(p, name),
    sg = (v) => (v > 0 ? "+" : "") + fmt(v),
    last = pts.at(-1),
    first = pts[0],
    spanDays = (last.t - first.t) / 864e5;
  {
    const a = pts.length > 1 ? sg(last.v - pts.at(-2).v) : "Nur Startwert",
      b =
        st.n >= FC_MIN
          ? sg(st.real)
          : spanDays < FC_GAP_DAYS
            ? "Zeitraum < " + FC_GAP_H + " h"
            : "zu wenig Daten (" + st.n + "/" + FC_MIN + ")",
      c = st.n >= FC_MIN ? sg(st.real * 7) : "Noch nicht belastbar";
    if (big)
      $("chartBigStats").innerHTML =
        `<div><span class="muted">Aktuell</span><b>${fmt(last.v)}</b></div><div><span class="muted">Benötigt · fehlt</span><b>${need > 0 ? fmt(need) + " · " + (miss > 0 ? fmt(miss) : "gedeckt") : "–"}</b></div><div><span class="muted">Letzte Änderung</span><b>${a}</b></div><div><span class="muted">Ø pro Tag</span><b>${b}</b></div><div><span class="muted">Ø pro Woche</span><b>${c}</b></div>`;
    else {
      $("lastDelta").textContent = a;
      $("daily").textContent = b;
      $("weekly").textContent = c;
    }
  }
  const sc =
    st.n >= FC_MIN
      ? [
          ["cons", st.cons, "fcCons", "konservativ"],
          ["real", st.real, "fcReal", "realistisch"],
          ["opt", st.opt, "fcOpt", "optimistisch"],
        ].filter((x) => x[1] > 0)
      : [];
  let tEnd = sc.length
      ? last.t + Math.max(7 * 864e5, 0.3 * (last.t - first.t))
      : last.t + (pts.length === 1 ? 864e5 : 0),
    tMin = pts.length === 1 ? first.t - 864e5 : first.t;
  {
    const evT = chartEvents(p, name)
      .map((e) => e.t)
      .filter((t) => t >= first.t - 14 * 864e5 && t <= Math.max(tEnd, Date.now()));
    if (evT.length) {
      tMin = Math.min(tMin, ...evT);
      tEnd = Math.max(tEnd, ...evT);
    }
  }
  const lines = sc.map(([k, r, cls, lab]) => {
    let t2 = tEnd,
      v2 = last.v + (r * (tEnd - last.t)) / 864e5;
    if (need > 0 && last.v < need && v2 > need) {
      t2 = last.t + ((need - last.v) / r) * 864e5;
      v2 = need;
    }
    return { k, cls, lab, t2, v2 };
  });
  let vals = pts.map((x) => x.v).concat(lines.map((l) => l.v2)),
    ymin = Math.min(...vals),
    ymax = Math.max(...vals);
  const range = ymax - ymin || Math.max(Math.abs(ymax) * 0.1, 1),
    needIn = need > 0 && need <= ymax + range * 1.5 && need >= ymin - range;
  if (needIn) {
    ymin = Math.min(ymin, need);
    ymax = Math.max(ymax, need);
  }
  const pad = (ymax - ymin || Math.max(Math.abs(ymax) * 0.1, 1)) * 0.08;
  ymin = Math.max(0, ymin - pad);
  ymax = ymax + pad;
  if (ymax === ymin) ymax = ymin + 1;
  const rawStep = (ymax - ymin) / 4,
    p10 = Math.pow(10, Math.floor(Math.log10(rawStep))),
    step = [1, 2, 2.5, 5, 10].map((m) => m * p10).find((q) => q >= rawStep);
  ymin = Math.max(0, Math.floor(ymin / step) * step);
  ymax = Math.ceil(ymax / step) * step;
  const FS = big ? 13 : 10,
    L = big ? 84 : 60,
    R = 14,
    T = big ? 44 : 34,
    B = big ? 32 : 26,
    HY = big ? 18 : 13,
    x = (t) => L + ((t - tMin) / (tEnd - tMin || 1)) * (W - L - R),
    y = (v) => T + ((ymax - v) / (ymax - ymin)) * (H - T - B);
  let g = "";
  for (let v = ymin; v <= ymax + step / 2; v += step) {
    g += `<line class="gridLine" x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}"/><text class="chartText" x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${fmt(v)}</text>`;
  }
  const dl = (t) => new Date(t).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  let xl = `<text class="chartText" x="${x(first.t)}" y="${H - 8}" text-anchor="middle">${dl(first.t)}</text>`;
  if (pts.length > 1)
    xl += `<text class="chartText" x="${x(last.t)}" y="${H - 8}" text-anchor="middle">${dl(last.t)}</text>`;
  if (big) {
    const n = 8;
    for (let i = 1; i < n; i++) {
      const t = tMin + ((tEnd - tMin) * i) / n;
      if (
        Math.abs(x(t) - x(first.t)) > 60 &&
        Math.abs(x(t) - x(last.t)) > 60 &&
        (!sc.length || Math.abs(x(t) - x(tEnd)) > 60)
      )
        xl += `<line class="gridLine" x1="${x(t)}" y1="${T}" x2="${x(t)}" y2="${H - B}" opacity=".5"/><text class="chartText" x="${x(t)}" y="${H - 8}" text-anchor="middle">${dl(t)}</text>`;
    }
  }
  if (sc.length)
    xl += `<text class="chartText" x="${W - R}" y="${H - 8}" text-anchor="end">${dl(tEnd)}</text><line class="axis" x1="${x(last.t)}" y1="${T}" x2="${x(last.t)}" y2="${H - B}" opacity=".35"/>`;
  const path = pts.map((q, i) => (i ? "L" : "M") + x(q.t) + " " + y(q.v)).join(" ");
  const needSvg = needIn
    ? `<line class="need" x1="${L}" y1="${y(need)}" x2="${W - R}" y2="${y(need)}"/><text class="chartText" x="${W - R - 4}" y="${y(need) - 5}" text-anchor="end">Benötigt ${fmt(need)}</text>`
    : need > 0
      ? `<text class="chartText" x="${W - R - 4}" y="${HY}" text-anchor="end" style="fill:${need > ymax ? "#F4A53A" : "#5BD2A0"}">Benötigt ${fmt(need)} ${need > ymax ? "↑ · fehlt " + fmt(miss) : "↓ · gedeckt"}</text>`
      : "";
  const evSvg = chartEvents(p, name)
    .filter((e) => e.t >= tMin && e.t <= tEnd)
    .map((e) => {
      const c = EV_COL[e.type] || "#cfe6f7";
      return `<line class="evMark" x1="${x(e.t)}" y1="${T}" x2="${x(e.t)}" y2="${H - B}" stroke="${c}"/><path class="evDot" d="M${x(e.t)} ${T - 6} l5 5 l-5 5 l-5 -5 z" fill="${c}"><title>${new Date(e.t).toLocaleString("de-DE")} · ${escAttr(EV_LAB[e.type])}: ${escAttr(e.text)}</title></path>`;
    })
    .join("");
  const fcSvg = lines
    .map((l) => `<path class="fcLine ${l.cls}" d="M${x(last.t)} ${y(last.v)} L${x(l.t2)} ${y(l.v2)}"/>`)
    .join("");
  $(boxId).innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" style="--fs:${FS}px">${g}<line class="axis" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/>${evSvg}${needSvg}${fcSvg}<path class="series" d="${path}"/>${pts.map((q) => `<circle class="point" cx="${x(q.t)}" cy="${y(q.v)}" r="4"></circle>`).join("")}${xl}${lines
      .map((l, i) => {
        const sp = big ? 130 : 92;
        return `<line class="fcLine ${l.cls}" x1="${L + i * sp}" y1="${HY - 4}" x2="${L + 18 + i * sp}" y2="${HY - 4}"/><text class="chartText" x="${L + 22 + i * sp}" y="${HY}">${l.lab}</text>`;
      })
      .join("")}</svg>`;
  attachChartHover(
    $(boxId),
    pts.map((q, i) => ({ t: q.t, v: q.v, px: x(q.t), py: y(q.v), prev: i ? pts[i - 1] : null })),
    T,
    H - B,
  );
  $(big ? "chartBigNote" : "chartNote").textContent =
    pts.length === 1
      ? "Ein Startwert ist vorhanden. Raten und Prognose entstehen ab drei Abschnitten mit je mindestens " + FC_GAP_H + " Stunden Abstand."
      : st.n < FC_MIN
        ? spanDays < FC_GAP_DAYS
          ? "Die Snapshots liegen weniger als " + FC_GAP_H + " Stunden auseinander. Deshalb werden bewusst keine Raten gezeigt."
          : "Noch zu wenig Abschnitte für eine Rate (" + st.n + " von " + FC_MIN + ")."
        : "Ø-Werte = nach Länge gewichteter Median der Abschnitte der letzten 6 Wochen, Bauvorgänge herausgerechnet. Gestrichelt: Prognose bis zum Bedarf.";
}

// Werte beim Darüberfahren (ab 1.6): Hilfslinie am nächsten Messpunkt, Datum, Bestand, Veränderung pro Tag
function attachChartHover(box, P, y0, y1) {
  const svg = box && box.querySelector("svg");
  if (!svg || !P.length) return;
  box.style.position = "relative";
  svg.insertAdjacentHTML(
    "beforeend",
    `<g class="hov" style="display:none"><line class="hovLine" y1="${y0}" y2="${y1}"/><circle class="hovDot" r="6"/></g>`,
  );
  const g = svg.querySelector(".hov"),
    line = g.querySelector("line"),
    dot = g.querySelector("circle");
  let tip = box.querySelector(".chartTip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "chartTip";
    box.appendChild(tip);
  }
  const hide = () => {
    g.style.display = "none";
    tip.classList.remove("on");
  };
  // am Kasten statt am SVG lauschen: die Vergrößern-Fläche (::after) liegt über dem Diagramm
  box.onmousemove = (e) => {
    const m = svg.getScreenCTM();
    if (!m) return;
    const mx = (e.clientX - m.e) / m.a;
    let q = P[0];
    for (const c of P) if (Math.abs(c.px - mx) < Math.abs(q.px - mx)) q = c;
    line.setAttribute("x1", q.px);
    line.setAttribute("x2", q.px);
    dot.setAttribute("cx", q.px);
    dot.setAttribute("cy", q.py);
    g.style.display = "";
    const days = q.prev ? (q.t - q.prev.t) / 864e5 : 0,
      rate = q.prev && days >= FC_GAP_DAYS ? (q.v - q.prev.v) / days : null;
    tip.innerHTML =
      new Date(q.t).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) +
      `<br>Bestand <b>${fmt(q.v)}</b>` +
      (rate != null
        ? `<br>Veränderung seit vorigem Export <b class="${rate >= 0 ? "green" : "red"}">${rate > 0 ? "+" : ""}${fmt(rate)}/Tag</b>`
        : q.prev
          ? '<br><span class="muted">weniger als ' + FC_GAP_H + ' Stunden nach dem vorigen Export</span>'
          : '<br><span class="muted">erster Messpunkt</span>');
    tip.classList.add("on");
    const br = box.getBoundingClientRect(),
      sx = m.a * q.px + m.e - br.left,
      sy = m.d * q.py + m.f - br.top;
    let left = sx + 14;
    if (left + tip.offsetWidth > box.clientWidth - 4) left = sx - tip.offsetWidth - 14;
    tip.style.left = Math.max(4, left) + "px";
    tip.style.top = Math.max(4, sy - tip.offsetHeight - 10) + "px";
  };
  box.onmouseleave = hide;
}
