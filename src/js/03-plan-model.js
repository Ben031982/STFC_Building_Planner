function getPlanResources(p) {
  if (!p.hasPlanData) return [];
  const d = p.planData || {},
    res = d.resources || {},
    imp = d.importedAt ? new Date(d.importedAt) : null,
    snap = latestSnapshot(),
    snapNewer = !!snap && (!imp || new Date(snapTime(snap)) > imp),
    // ab 3.0: „startet nach“ – Kosten der Vorgänger werden zuerst vom Bestand abgezogen
    resv = typeof chainReserved === "function" ? chainReserved(p) : null;
  return planMaterials(p).map((n) => {
    const r = res[n] || {};
    let cur = r.onHand,
      missing = r.needed,
      src = "import";
    if (snapNewer && Number.isFinite(snap.values[n])) {
      cur = snap.values[n];
      missing = Math.max(0, r.cost - cur);
      src = "snapshot";
    }
    let need = r.cost;
    if (resv && resv[n] > 0 && isNum(r.cost) && isNum(cur)) {
      need = r.cost + resv[n];
      missing = Math.max(0, need - cur);
    }
    // [Material, Bestand, Kosten, fehlt, Quelle, Bedarf inkl. Vorgänger]
    return [n, cur, r.cost, missing, src, need];
  });
}
function resourceSourceNote(p, rows) {
  if (!rows.length) return "";
  const d = p.planData || {},
    f = (t) =>
      t
        ? new Date(t).toLocaleString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "–",
    snap = latestSnapshot(),
    src = (g) =>
      rows.filter((r) => g(r[0])).some((r) => r[4] === "snapshot")
        ? "aus JSON-Snapshot (Exportstand " +
          f(snapTime(snap)) +
          (snapHasExport(snap) ? "" : ", Importzeit") +
          ")"
        : "aus Plan-Import vom " + f(d.importedAt);
  return (
    "Stand: 7★ " +
    src((n) => n.startsWith("7★")) +
    " · Σ " +
    src((n) => n.startsWith("Σ")) +
    (rows.some((r) => r[0].startsWith("Σ") && r[4] === "snapshot")
      ? " (Σ berechnet aus Rohbestand + Token)"
      : "") +
    ". Benötigt = Cost laut Spock's Club inkl. Effizienzen."
  );
}
function getBottleneck(rows) {
  if (!rows.length) return null;
  const share = (r) => ((r[5] || r[2]) > 0 ? r[3] / (r[5] || r[2]) : 0),
    seven = rows
      .filter((r) => /^7★ (Rare|Uncommon) /.test(r[0]) && r[3] > 0)
      .sort((a, b) => share(b) - share(a) || (/Rare/.test(b[0]) ? 1 : 0) - (/Rare/.test(a[0]) ? 1 : 0));
  if (seven.length) return { name: seven[0][0], missing: seven[0][3], share: share(seven[0]) };
  for (const n of ["Σ-Parsteel", "Σ-Tritanium", "Σ-Dilithium"]) {
    const r = rows.find((x) => x[0] === n);
    if (r && r[3] > 0) return { name: n, missing: r[3], share: share(r) };
  }
  return { name: "Kein Engpass", missing: 0, share: 0, none: true };
}
const CORE_ORDER = (n) =>
  /^Defense Platform/i.test(n)
    ? 0
    : /^Academy$/i.test(n)
      ? 1
      : /^R&D Department$/i.test(n)
        ? 2
        : /^Shipyard$/i.test(n)
          ? 3
          : -1;
const RES_ORDER = (n) => (/Generator/i.test(n) ? 0 : /Warehouse/i.test(n) ? 1 : /Vault/i.test(n) ? 2 : 3);
function getBaseline(p) {
  const d = p.planData || {};
  if (d.baseline && Array.isArray(d.baseline.buildings) && d.baseline.buildings.length) return d.baseline;
  const t = d.target,
    b = d.requiredBuildings || [];
  if (!b.length) return null;
  return {
    at: d.importedAt || null,
    building: t ? t.building : null,
    start: t ? t.start : p.start,
    target: t ? t.target : p.target,
    buildings: b.map((x) => ({ name: x.name, start: x.start, target: x.target })),
  };
}
function currentLevels(p) {
  const d = p.planData || {},
    bl = getBaseline(p),
    cur = {};
  if (!bl) return cur;
  const now = new Map((d.requiredBuildings || []).map((b) => [b.name.toLowerCase(), b]));
  for (const b of bl.buildings) {
    const n = now.get(b.name.toLowerCase());
    cur[b.name.toLowerCase()] = n ? Math.max(b.start, Math.min(n.start, b.target)) : b.target;
  }
  for (const [k, n] of now) if (!(k in cur)) cur[k] = n.start;
  // ab 3.4: bekannte Gebäude laufen mit dem neuesten Export mit (nie über das Ziel, nie zurück)
  if (typeof exportLevel === "function")
    for (const b of bl.buildings) {
      const k = b.name.toLowerCase(),
        el = exportLevel(b.name);
      if (el != null) cur[k] = Math.max(cur[k], Math.min(el, b.target));
    }
  return cur;
}
function planProgress(p) {
  const bl = getBaseline(p);
  if (!bl) return null;
  const cur = currentLevels(p);
  let total = 0,
    done = 0;
  for (const b of bl.buildings) {
    const t = b.target - b.start;
    total += t;
    done += Math.max(0, Math.min(t, cur[b.name.toLowerCase()] - b.start));
  }
  const extra = ((p.planData || {}).requiredBuildings || []).filter(
    (b) => !bl.buildings.some((x) => x.name.toLowerCase() === b.name.toLowerCase()),
  );
  for (const b of extra) total += b.target - b.start;
  return { done, total, pct: total ? Math.round((100 * done) / total) : 0, since: bl.at };
}
function progressSequence(p) {
  const bl = getBaseline(p);
  if (!bl) return [];
  const d = p.planData || {},
    extra = (d.requiredBuildings || []).filter(
      (b) => !bl.buildings.some((x) => x.name.toLowerCase() === b.name.toLowerCase()),
    );
  const seq = buildSequence({
      start: bl.start,
      target: bl.target,
      planData: {
        requiredBuildings: bl.buildings.concat(extra),
        target: bl.building ? { building: bl.building, start: bl.start, target: bl.target } : null,
      },
    }),
    cur = currentLevels(p);
  return seq.map((x) => {
    const lv = cur[x.name.toLowerCase()];
    return { ...x, now: lv, done: Number.isFinite(lv) && lv >= x.to };
  });
}
function importOutcome(p, d) {
  const old = p.planData || {},
    bl = getBaseline(p),
    t = d.planData.target,
    sameTarget = isShip(p) || !!(
      bl &&
      t &&
      bl.building &&
      String(bl.building).toLowerCase() === String(t.building).toLowerCase() &&
      bl.target === t.target
    ),
    newB =
      d.blds.length && bl
        ? d.blds
            .filter((b) => !bl.buildings.some((x) => x.name.toLowerCase() === b.name.toLowerCase()))
            .map((b) => b.name)
        : [];
  const tmp = { ...p, start: d.start, target: d.target, planData: d.planData, confirmation: null },
    ck = planChecks(tmp),
    complete = ck.requiredBuildings && ck.resourceCosts && ck.buildTime && ck.efficiencies && ck.target,
    wasActive = !!p.confirmation && calcPlanStatus(p, true) === "active";
  return {
    sameTarget,
    newBuildings: newB,
    keepConfirm: wasActive && sameTarget && complete && !newB.length,
    complete,
  };
}
function makeHistPoint(p, kind, at, withRes, withCon) {
  const d = p.planData || {},
    pr = planProgress(p),
    pt = {
      at: at || new Date().toISOString(),
      kind,
      progress: pr ? { done: pr.done, total: pr.total } : null,
      resources: null,
      construction: null,
    };
  if (withRes && d.resources) {
    pt.resources = {};
    for (const k of planMaterials(p)) {
      const r = d.resources[k];
      if (r && isNum(r.cost) && isNum(r.onHand))
        pt.resources[k] = { cost: r.cost, onHand: r.onHand, needed: r.needed };
    }
  }
  // ab 2.1: Effizienzen mitschreiben (Grundlage für „Effizienzen: Wirkung und Verlauf“)
  if (d.efficiencies && Object.keys(d.efficiencies).length) pt.efficiencies = { ...d.efficiencies };
  if (withCon && d.construction)
    pt.construction = {
      cost: d.construction.cost,
      onHand: d.construction.onHand,
      needed: d.construction.needed,
    };
  return pt;
}
function planIncome(p) {
  const h = ((p.planData || {}).history || []).filter((x) => x.resources && Object.keys(x.resources).length);
  if (h.length < 2) return { points: h.length, rows: [] };
  const a = h[0],
    b = h[h.length - 1],
    days = (new Date(b.at) - new Date(a.at)) / 864e5;
  return {
    points: h.length,
    days,
    from: a.at,
    to: b.at,
    rows: planMaterials(p).map((k) => {
      const ra = a.resources[k],
        rb = b.resources[k];
      if (!ra || !rb) return { name: k, missing: true };
      const dStock = rb.onHand - ra.onHand,
        built = ra.cost - rb.cost;
      if (built < 0) return { name: k, dStock, built, costUp: true };
      const inc = dStock + built;
      return { name: k, dStock, built, inc, day: days >= FC_GAP_DAYS ? inc / days : null };
    }),
  };
}
