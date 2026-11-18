function propagateDone(src, oldReq, newBlds) {
  const lv = {},
    nm = (n) => String(n || "").toLowerCase();
  for (const b of newBlds) lv[nm(b.name)] = Math.max(lv[nm(b.name)] || 0, +b.start);
  for (const b of oldReq)
    if (!newBlds.some((x) => nm(x.name) === nm(b.name)))
      lv[nm(b.name)] = Math.max(lv[nm(b.name)] || 0, +b.target);
  const at = new Date().toISOString();
  for (const q of s.plans) {
    if (q === src || !q.planData || !Array.isArray(q.planData.requiredBuildings)) continue;
    const items = [];
    for (const rb of q.planData.requiredBuildings) {
      const l = lv[nm(rb.name)];
      if (Number.isFinite(l) && l > +rb.start) items.push({ name: rb.name, level: Math.min(l, +rb.target) });
    }
    if (!items.length) continue;
    const prev =
      q.planData.outdatedBy && Array.isArray(q.planData.outdatedBy.items) ? q.planData.outdatedBy.items : [];
    const merged = [...prev];
    for (const it of items) {
      const e = merged.find((m) => nm(m.name) === nm(it.name));
      if (e) e.level = Math.max(e.level, it.level);
      else merged.push(it);
    }
    q.planData.outdatedBy = { at, source: src.name, items: merged };
    s.logs.push(
      "Veraltet: " +
        q.name +
        " – " +
        items.map((i) => i.name + " → " + i.level).join(", ") +
        " erledigt (erkannt bei " +
        src.name +
        ")",
    );
  }
}
function outdatedText(q) {
  const o = q.planData.outdatedBy;
  return (
    q.name +
    ": veraltet – " +
    o.items.map((i) => i.name + " → " + i.level).join(", ") +
    (o.items.length === 1 ? " wurde" : " wurden") +
    " erledigt (erkannt beim Import von " +
    o.source +
    "). Bitte die Plandaten aus Spock's Club aktualisieren."
  );
}
function sharedPlans(p, x) {
  const nm = (n) => String(n || "").toLowerCase();
  return s.plans
    .filter(
      (q) =>
        q !== p &&
        q.planData &&
        Array.isArray(q.planData.requiredBuildings) &&
        q.planData.requiredBuildings.some(
          (rb) => nm(rb.name) === nm(x.name) && +rb.start < x.to && +rb.target >= x.to,
        ),
    )
    .map((q) => q.name);
}
const CARE_DAYS = 3,
  EV_COL = { plan: "#5fb4ff", pack: "#ffd166", bau: "#ff9f6b", bld: "#7aeab0", manual: "#d9b8ff", goal: "#5bd2a0" },
  EV_LAB = {
    plan: "Plan-Import",
    pack: "Sprung: Pack/Ausgleich",
    bau: "Sprung: Bau",
    bld: "Gebäude",
    manual: "Eigenes Ereignis",
    goal: "Ziel erreicht",
  };
function activePlan() {
  return s.plans.find((x) => x.id === s.active) || s.plans[0];
}
function bldSnaps() {
  return s.snapshots
    .filter((x) => x && x.bld && typeof x.bld === "object")
    .map((x) => ({ snap: x, t: new Date(snapTime(x)).getTime() }))
    .sort((a, b) => a.t - b.t);
}
function bldDiff(a, b) {
  let lv = 0,
    n = 0;
  for (const k of Object.keys(b)) {
    const d = b[k] - (a[k] == null ? b[k] : a[k]);
    if (d > 0) {
      lv += d;
      n++;
    }
  }
  return { lv, n };
}
// ab 3.4: Gebäudenummer ↔ Name (Liste in 00-assets)
function bldName(id) {
  return Object.prototype.hasOwnProperty.call(BUILDING_NAMES, id) ? BUILDING_NAMES[id] : null;
}
function bldIdOf(name) {
  const n = String(name || "").toLowerCase();
  return Object.keys(BUILDING_NAMES).find((k) => BUILDING_NAMES[k].toLowerCase() === n) || null;
}
// Stufe eines Gebäudes (nach Name) in einem Export-Gebäudestand, sonst null
function bldLevelIn(bld, name) {
  const id = bldIdOf(name),
    v = id != null && bld ? bld[id] : undefined;
  return v !== undefined && v !== null && Number.isFinite(+v) ? +v : null;
}
// Stufe im neuesten Export mit Gebäudedaten
function exportLevel(name) {
  const ls = bldSnaps().at(-1);
  return ls ? bldLevelIn(ls.snap.bld, name) : null;
}
// gestiegene Gebäude zwischen zwei Ständen, bekannte mit Namen
function bldChanges(a, b) {
  const out = [];
  for (const k of Object.keys(b || {})) {
    const from = a && a[k] != null ? +a[k] : null,
      to = +b[k];
    if (from != null && to > from) out.push({ id: k, name: bldName(k), from, to });
  }
  return out;
}
function bldChangeText(ch) {
  const known = ch.filter((c) => c.name),
    unk = ch.filter((c) => !c.name);
  return known
    .map((c) => c.name + " " + c.from + " → " + c.to)
    .concat(unk.length ? ["unbekanntes Gebäude Nr. " + unk.map((c) => c.id).join(", ")] : [])
    .join(", ");
}
// ab 3.4: Gebäudeziel laut Export erreicht? (Schiffe: nicht erkennbar)
function goalByExport(p) {
  if (!p || isShip(p) || !p.hasPlanData) return null;
  const t = (p.planData || {}).target,
    name = t && t.building,
    ls = bldSnaps().at(-1);
  if (!name || !ls) return null;
  const l = bldLevelIn(ls.snap.bld, name);
  return l != null && l >= +p.target ? { name, level: l, at: ls.t } : null;
}
function bldEvents() {
  const bs = bldSnaps(),
    out = [];
  for (let i = 1; i < bs.length; i++) {
    const ch = bldChanges(bs[i - 1].snap.bld, bs[i].snap.bld);
    if (ch.length) out.push({ t: bs[i].t, type: "bld", text: bldChangeText(ch) + " (laut JSON)" });
  }
  return out;
}
function planImportEvents(p) {
  return ((p && p.planData && p.planData.history) || []).map((h) => ({
    t: new Date(h.at).getTime(),
    type: "plan",
    text:
      (h.kind || "Import") + (h.progress ? " · " + h.progress.done + "/" + h.progress.total + " Stufen" : ""),
  }));
}
function manualEvents() {
  return (Array.isArray(s.events) ? s.events : []).map((e) => ({
    t: new Date(e.at).getTime(),
    type: "manual",
    text: e.text,
    id: e.id,
  }));
}
// ab 3.1: abgeschlossene Ziele („Ziel erreicht“), unabhängig vom gewählten Plan
function goalEvents() {
  const d = (x) => new Date(x).toLocaleDateString("de-DE");
  return (Array.isArray(s.goals) ? s.goals : []).map((g) => ({
    t: new Date(g.at).getTime(),
    type: "goal",
    text:
      g.name +
      " abgeschlossen" +
      (g.since ? " – geplant seit " + d(g.since) : "") +
      (g.eta ? (g.since ? ", " : " – ") + "letzte Prognose " + d(g.eta) : ""),
  }));
}
// ab 5.0: Treffsicherheit – Abweichung in Tagen (+ = später erreicht als prognostiziert)
function goalDev(g, eta) {
  const t = eta == null ? NaN : typeof eta === "number" ? eta : new Date(eta).getTime();
  return Number.isFinite(t) ? Math.round((new Date(g.at).getTime() - t) / 864e5) : null;
}
function goalAccuracy(gs) {
  const col = (f) => gs.map(f).filter((x) => x != null),
    mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null),
    abs = (a) => (a.length >= 2 ? mean(a.map(Math.abs)) : null),
    start = col((g) => goalDev(g, g.fc && g.fc.start)),
    mid = col((g) => goalDev(g, g.fc && g.fc.mid));
  return { start, mid, startAbs: abs(start), midAbs: abs(mid), midMean: mid.length >= 2 ? mean(mid) : null };
}
// ab 3.3: Liste „Erreichte Ziele“ unter Verlauf, Einträge mit Rückfrage löschbar; ab 5.0 mit Treffsicherheit
function renderGoals() {
  const el = $("goalList");
  if (!el) return;
  const gs = (Array.isArray(s.goals) ? s.goals : []).slice().sort((a, b) => new Date(b.at) - new Date(a.at)),
    d = (x) => (x ? new Date(x).toLocaleDateString("de-DE") : "–"),
    day = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n) + (Math.abs(n) === 1 ? " Tag" : " Tage"),
    cell = (g, eta) => {
      const dv = goalDev(g, eta);
      return dv == null
        ? "<td>–</td>"
        : `<td>${d(eta)}<br><span class="tsDev ${Math.abs(dv) <= 3 ? "ok" : Math.abs(dv) <= 7 ? "mid" : "bad"}">${day(dv)}</span></td>`;
    },
    A = goalAccuracy(gs),
    card = (t, v, n) => `<div class="tsCard"><div class="muted">${t}</div><div class="tsVal">${v}</div><div class="muted">${n}</div></div>`;
  $("goalPanel").classList.toggle("goalEmpty", !gs.length);
  $("goalCount").textContent = gs.length ? gs.length + (gs.length === 1 ? " Ziel" : " Ziele") : "";
  const few = "zu wenig Daten",
    fewN = "Aussagekräftig ab 2 Zielen mit gespeicherter Prognose",
    tend = A.midMean == null ? few : A.midMean > 1 ? "meist zu optimistisch" : A.midMean < -1 ? "meist zu vorsichtig" : "ausgewogen";
  el.innerHTML = gs.length
    ? `<div class="tsCards">${card(
        "Treffsicherheit bei 50 % der Bauzeit",
        A.midAbs == null ? few : "Ø ± " + Math.round(A.midAbs) + " Tage",
        A.midAbs == null ? fewN : A.mid.length + " Ziele · Prognose, als die Hälfte der Zeit um war",
      )}${card(
        "Tendenz",
        tend,
        A.midMean == null
          ? fewN
          : Math.abs(A.midMean) > 1
            ? `Ziele wurden im Schnitt ${Math.round(Math.abs(A.midMean))} Tage ${A.midMean > 0 ? "später" : "früher"} erreicht als bei 50 % prognostiziert`
            : "Im Schnitt keine Vorzugsrichtung der Abweichung",
      )}${card(
        "Prognose bei Planstart",
        A.startAbs == null ? few : "Ø ± " + Math.round(A.startAbs) + " Tage",
        A.startAbs == null ? fewN : "Je früher, desto ungenauer – das ist normal",
      )}</div>
      <table class="histTable" style="width:100%"><thead><tr><th>Ziel</th><th>Erreicht am</th><th>Prognose bei Planstart</th><th>Prognose bei 50 %</th><th>Prognose kurz vor Ende</th><th></th></tr></thead><tbody id="goalRows">${gs
        .map(
          (g) =>
            `<tr><td>${escAttr(g.name)}<br><span class="muted">geplant seit ${d(g.since)}</span></td><td>${d(g.at)}</td>${cell(g, g.fc && g.fc.start)}${cell(g, g.fc && g.fc.mid)}${cell(g, g.eta)}<td><button class="evDel" data-goal="${escAttr(g.id)}" title="Eintrag löschen">✕</button></td></tr>`,
        )
        .join("")}</tbody></table>
      <p class="muted" style="margin-top:10px">Abweichung = tatsächliches Erreichen − damalige Prognose (+ = später als prognostiziert). Prognosen zu Planstart und 50 % werden erst bei neu abgeschlossenen Zielen gespeichert.</p>`
    : '<p class="muted">Noch kein Ziel abgeschlossen.</p>';
  el.querySelectorAll("[data-goal]").forEach(
    (b) =>
      (b.onclick = () => {
        const g = s.goals.find((x) => x.id === b.dataset.goal);
        if (!g || !confirm("Eintrag „Ziel erreicht: " + g.name + "“ löschen? Der Plan kommt dadurch nicht zurück.")) return;
        s.goals = s.goals.filter((x) => x !== g);
        s.logs.push("Eintrag „Ziel erreicht“ gelöscht: " + g.name);
        save();
      }),
  );
}
function jumpEvents(p, mats) {
  const by = {};
  if (!p || !p.hasPlanData) return [];
  for (const m of mats) {
    const st = rateStats(p, m);
    for (const r of st.rows)
      if (r.flag) {
        const k = r.to.getTime() + "|" + r.flag;
        (by[k] = by[k] || { t: r.to.getTime(), type: r.flag, mats: [] }).mats.push(m.replace("7★ ", ""));
      }
  }
  return Object.values(by).map((e) => ({ t: e.t, type: e.type, text: e.mats.join(", ") }));
}
function chartEvents(p, m) {
  return planImportEvents(p)
    .concat(jumpEvents(p, [m]), bldEvents(), manualEvents())
    .filter((e) => Number.isFinite(e.t));
}
function allEvents(p) {
  const mats = ["Σ-Parsteel", "Σ-Tritanium", "Σ-Dilithium", ...Object.keys(IDS)].filter(
    (m) => !isLatinumMat(m),
  );
  return planImportEvents(p)
    .concat(jumpEvents(p, mats), bldEvents(), manualEvents(), goalEvents())
    .filter((e) => Number.isFinite(e.t))
    .sort((a, b) => b.t - a.t);
}
function renderEvents() {
  const el = $("evRows");
  if (!el) return;
  const p = activePlan(),
    ev = allEvents(p);
  if (!$("evDate").value) {
    const d = new Date(),
      z = (n) => String(n).padStart(2, "0");
    $("evDate").value = d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }
  $("evCount").textContent = ev.length ? ev.length + " Ereignis" + (ev.length === 1 ? "" : "se") : "";
  el.innerHTML = ev.length
    ? ev
        .map(
          (e) =>
            `<tr><td>${e.type === "manual" ? new Date(e.t).toLocaleDateString("de-DE") : fdt(e.t)}</td><td><span class="evTag" style="border-left:3px solid ${EV_COL[e.type]}">${escAttr(EV_LAB[e.type])}</span></td><td style="white-space:normal">${escAttr(e.text)}</td><td>${e.type === "manual" ? `<button class="evDel" data-ev="${escAttr(e.id)}" title="Ereignis löschen">✕</button>` : ""}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="4" class="muted">Noch keine Ereignisse.</td></tr>';
  el.querySelectorAll("[data-ev]").forEach(
    (b) =>
      (b.onclick = () => {
        const e = (s.events || []).find((x) => x.id === b.dataset.ev);
        s.events = (s.events || []).filter((x) => x.id !== b.dataset.ev);
        if (e) s.logs.push("Ereignis gelöscht: " + e.text);
        save();
      }),
  );
}
