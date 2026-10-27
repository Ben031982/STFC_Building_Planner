function wif() {
  $("impView").classList.remove("on");
  $("ni").classList.remove("on");
  $("wkView").classList.remove("on");
  $("nwk").classList.remove("on");
  document.querySelectorAll(".nav [data-tab]").forEach((b) => b.classList.remove("on"));
  $("dash").classList.add("off");
  $("snapView").classList.remove("on");
  $("nd").classList.remove("on");
  $("wifView").classList.add("on");
  $("nw").classList.add("on");
  wifBonusInit(false);
  renderWif();
}
function wifMats() {
  return trackedMats().filter(
    (m) => !isLatinumMat(m),
  );
}
function wifBonusInit(force) {
  const box = $("wifBonusRows");
  if (box.children.length && !force) return;
  box.innerHTML = [0, 1, 2]
    .map(
      (i) =>
        `<div class="wifBonus"><select data-wb="${i}"><option value="">– Material –</option>${wifMats()
          .map((m) => `<option>${m}</option>`)
          .join("")}</select><input data-wv="${i}" type="number" min="0" step="1" placeholder="Menge"></div>`,
    )
    .join("");
  box.querySelectorAll("select,input").forEach((e) => (e.oninput = e.onchange = renderWif));
}
function wifInput() {
  const n = (id) => {
    const v = +$(id).value;
    return Number.isFinite(v) ? v : 0;
  };
  const bonus = {};
  $("wifBonusRows")
    .querySelectorAll("[data-wb]")
    .forEach((sl) => {
      const v = +(($("wifBonusRows").querySelector(`[data-wv="${sl.dataset.wb}"]`) || {}).value || 0);
      if (sl.value && v > 0) bonus[sl.value] = (bonus[sl.value] || 0) + v;
    });
  return {
    now: Math.max(0, Math.floor(n("wifNow"))),
    week: Math.max(0, n("wifWeek")),
    pct: Math.max(-90, n("wifPct")),
    bonus,
  };
}
function wifCalc(p, inp) {
  if (!p || !p.hasPlanData) return null;
  const fc = planForecast(p),
    pack = isShip(p) ? null : (s.packs || [])[0], // ab 3.0: keine Stationspacks für Schiffe
    f = 1 + inp.pct / 100;
  if (!fc) return null;
  const rows = [];
  for (const r of fc.res) {
    if (r.common) continue;
    const c = (pack && pack.contents && pack.contents[r.m]) || {},
      amt = (+c.amount || 0) * f,
      st = r.st,
      miss = r.miss,
      imm = inp.now * amt + (inp.bonus[r.m] || 0),
      rem = Math.max(0, miss - imm),
      wk = (inp.week * amt) / 7;
    const base = {},
      scen = {};
    let packsOnly = false;
    for (const k of ["cons", "real", "opt"]) {
      const rate = st && st.n >= FC_MIN && st[k] != null ? st[k] : null;
      base[k] = miss <= 0 ? 0 : rate > 0 ? miss / rate : null;
      if (rem <= 0) {
        scen[k] = 0;
        continue;
      }
      if (rate == null) {
        if (wk > 0) {
          scen[k] = rem / wk;
          packsOnly = true;
        } else scen[k] = null;
        continue;
      }
      const eff = rate + wk;
      scen[k] = eff > 0 ? rem / eff : null;
    }
    rows.push({ m: r.m, miss, rem, amt, approx: !!c.approx, base, scen, packsOnly });
  }
  const rel = rows.filter((x) => x.miss > 0),
    ov = (src, k) => {
      if (!rel.length) return { d: 0, driver: null };
      if (rel.some((x) => x[src][k] == null))
        return { d: null, driver: null, missing: rel.filter((x) => x[src][k] == null).map((x) => x.m) };
      const mx = rel.reduce((a, b) => (b[src][k] > a[src][k] ? b : a));
      return { d: mx[src][k], driver: mx.m };
    };
  const out = { rows, start: fc.base, price: (pack && +pack.priceEUR) || 100, inp, base: {}, scen: {} };
  for (const k of ["cons", "real", "opt"]) {
    out.base[k] = ov("base", k);
    out.scen[k] = ov("scen", k);
  }
  out.packsOnly = rows.some((x) => x.packsOnly);
  return out;
}
function wifDate(start, d) {
  return d == null ? "offen" : d === 0 ? "gedeckt" : fcTooFar(d) ? FC_FAR_TXT : fcDate(start, d);
}
function wifGain(a, b) {
  if (a == null || b == null) return "–";
  const g = Math.round(a - b);
  return g === 0
    ? "±0 Tage"
    : `<span class="${g > 0 ? "wifGain" : "wifLoss"}">${g > 0 ? g + " Tage früher" : -g + " Tage später"}</span>`;
}
function renderWif() {
  if (typeof renderTarget === "function") renderTarget();
  const p = activePlan(),
    inp = wifInput(),
    w = wifCalc(p, inp);
  $("wifPlan").textContent = p ? "Plan: " + p.name + " (" + statusLabel(calcPlanStatus(p)) + ")" : "";
  if (!w) {
    $("wifSummary").innerHTML =
      '<p class="muted">Was-wäre-wenn braucht einen aktiven Plan mit bestätigten Plandaten. Wähle im Dashboard einen aktiven Plan aus.</p>';
    $("wifRows").innerHTML = "";
    $("wifNote").textContent = "";
    return;
  }
  const B = w.base.real,
    S = w.scen.real,
    weeks = S.d != null ? Math.ceil(S.d / 7) : null,
    cost = inp.now * w.price + (inp.week && weeks != null ? inp.week * weeks * w.price : 0);
  $("wifSummary").innerHTML =
    `<div class="wifSum"><div><span class="muted">Heute (realistisch)</span><b>${wifDate(w.start, B.d)}</b><span class="muted">${B.driver ? "Engpass " + escAttr(B.driver.replace("7★ ", "")) : B.d === 0 ? "alles vorhanden" : "zu wenig Daten für eine Prognose"}</span></div><div><span class="muted">Szenario (realistisch)</span><b>${wifDate(w.start, S.d)}</b><span class="muted">${S.driver ? "Engpass " + escAttr(S.driver.replace("7★ ", "")) : S.d === 0 ? "sofort gedeckt" : "nicht berechenbar"} · konservativ ${wifDate(w.start, w.scen.cons.d)} · optimistisch ${wifDate(w.start, w.scen.opt.d)}</span></div><div><span class="muted">Gewinn · Kosten</span><b>${B.d != null && S.d != null ? wifGain(B.d, S.d) : "–"}</b><span class="muted">${cost ? "≈ " + fx(cost) + " € (" + (inp.now ? inp.now + " sofort" : "") + (inp.now && inp.week ? " + " : "") + (inp.week ? inp.week + " pro Woche" + (weeks != null ? " × " + weeks + " Wochen" : "") : "") + ")" : "keine Packs"}</span></div></div>`;
  $("wifRows").innerHTML = w.rows
    .map(
      (x) =>
        `<tr><td>${escAttr(x.m)}</td><td>${x.miss > 0 ? fmt(x.miss) : "gedeckt"}</td><td>${x.miss <= 0 ? "–" : x.rem > 0 ? fmt(x.rem) : "gedeckt"}${x.miss > 0 && x.approx && x.amt && (inp.now || inp.week) ? ' <span class="muted">(ca.)</span>' : ""}</td><td>${wifDate(w.start, x.base.real)}</td><td>${wifDate(w.start, x.scen.real)}${x.packsOnly ? " *" : ""}</td><td>${x.miss > 0 ? wifGain(x.base.real, x.scen.real) : "–"}</td></tr>`,
    )
    .join("");
  const notes = [];
  if (w.packsOnly)
    notes.push(
      "* Noch zu wenig Daten für eine Einkommensrate: Datum nur aus den Packs pro Woche, ohne dein normales Einkommen – also eher zu spät.",
    );
  if (B.d == null && B.missing)
    notes.push(
      "Für eine Prognose fehlen noch Abschnitte (mindestens " + FC_MIN + " mit je " + FC_GAP_H + " Stunden Abstand).",
    );
  if (w.rows.some((x) => x.miss > 0 && !x.amt && (inp.now || inp.week)))
    notes.push("Materialien ohne Packinhalt profitieren nicht von Packs.");
  notes.push(
    "Gewinn = Unterschied im realistischen Szenario (Median). Packinhalt laut Daten & Import › Stationspack" +
      (inp.pct ? ", hier " + (inp.pct > 0 ? "+" : "") + inp.pct + " %" : "") +
      ". Preis " +
      fx(w.price) +
      " € pro Pack.",
  );
  const yb = typeof shipYardBlock === "function" ? shipYardBlock(p) : null;
  $("wifNote").textContent = isShip(p)
    ? (yb ? "Schiffswerft " + yb.yard + " fehlt – die Termine zeigen nur, wann die Ressourcen gedeckt sind. " : "") +
      "Stationspacks gelten nicht für Schiffe – die Pack-Stellschrauben haben hier keine Wirkung. Einmalige Zuwächse (z. B. Event-Belohnungen) wirken weiter."
    : (packEmpty()
      ? "Hinweis: Dein Stationspack ist noch nicht gepflegt (Daten & Import › Stationspack) – Stationspacks haben deshalb hier noch keine Wirkung. "
      : "") + notes.join(" ");
}
