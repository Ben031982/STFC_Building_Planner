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
function bldEvents() {
  const bs = bldSnaps(),
    out = [];
  for (let i = 1; i < bs.length; i++) {
    const d = bldDiff(bs[i - 1].snap.bld, bs[i].snap.bld);
    if (d.lv > 0)
      out.push({
        t: bs[i].t,
        type: "bld",
        text: "+" + d.lv + " Gebäudestufe" + (d.lv === 1 ? "" : "n") + " (" + d.n + " Gebäude) laut JSON",
      });
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
// ab 3.3: Liste „Erreichte Ziele“ unter Verlauf, Einträge mit Rückfrage löschbar
function renderGoals() {
  const el = $("goalList");
  if (!el) return;
  const gs = (Array.isArray(s.goals) ? s.goals : []).slice().sort((a, b) => new Date(b.at) - new Date(a.at)),
    d = (x) => (x ? new Date(x).toLocaleDateString("de-DE") : "–");
  $("goalCount").textContent = gs.length ? gs.length + (gs.length === 1 ? " Ziel" : " Ziele") : "";
  el.innerHTML = gs.length
    ? `<table class="histTable" style="width:100%"><thead><tr><th>Erreicht am</th><th>Ziel</th><th>Geplant seit</th><th>Letzte Prognose</th><th></th></tr></thead><tbody id="goalRows">${gs
        .map(
          (g) =>
            `<tr><td>${d(g.at)}</td><td>${escAttr(g.name)}</td><td>${d(g.since)}</td><td>${d(g.eta)}</td><td><button class="evDel" data-goal="${escAttr(g.id)}" title="Eintrag löschen">✕</button></td></tr>`,
        )
        .join("")}</tbody></table>`
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
