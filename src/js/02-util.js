const isNum = (v) => typeof v === "number" && Number.isFinite(v);
function effNeeded(d, k) {
  if (k === "Σ-Construction Time") return !(d.construction && d.construction.cost === 0);
  const r = (d.resources || {})[k];
  return !(r && r.cost === 0);
}
// ab 3.0: Effizienzen, die ein Plan braucht – Schiffe ohne Bauzeit, dafür mit ihren Teilen
function planEffKeys(p) {
  return isShip(p) ? planMaterials(p) : EFF_ALL;
}
function planChecks(p) {
  const d = p.planData || {},
    t = d.target,
    res = d.resources || {},
    eff = d.efficiencies || {};
  if (isShip(p)) {
    // Schiffe: Ziel und Tiers kommen aus dem Plan selbst, es gibt keine Pflichtgebäude und keine Bauzeit
    return {
      hasData: !!(Object.keys(res).length || Object.keys(eff).length),
      target: true,
      targetMismatch: false,
      requiredBuildings: true,
      resourceCosts: planMaterials(p).every(
        (k) => res[k] && isNum(res[k].cost) && isNum(res[k].onHand) && isNum(res[k].needed),
      ),
      buildTime: true,
      efficiencies: planEffKeys(p).every((k) => isNum(eff[k]) || !effNeeded(d, k)),
      confirmationValid:
        !!p.confirmation &&
        p.confirmation.dataHash === planHash(p) &&
        p.confirmation.start === p.start &&
        p.confirmation.target === p.target,
    };
  }
  return {
    hasData: !!(
      t ||
      (d.requiredBuildings && d.requiredBuildings.length) ||
      Object.keys(res).length ||
      d.construction ||
      Object.keys(eff).length
    ),
    target: !!t && t.target === p.target && t.start >= p.start && t.start <= p.target,
    targetMismatch: !!t && !(t.target === p.target && t.start >= p.start && t.start <= p.target),
    requiredBuildings: Array.isArray(d.requiredBuildings) && d.requiredBuildings.length > 0,
    resourceCosts: MATERIALS.every(
      (k) => res[k] && isNum(res[k].cost) && isNum(res[k].onHand) && isNum(res[k].needed),
    ),
    buildTime: !!d.construction && isNum(d.construction.needed),
    efficiencies: EFF_ALL.every((k) => isNum(eff[k]) || !effNeeded(d, k)),
    confirmationValid:
      !!p.confirmation &&
      p.confirmation.dataHash === planHash(p) &&
      p.confirmation.start === p.start &&
      p.confirmation.target === p.target,
  };
}
let pending = null;
const $ = (x) => document.getElementById(x),
  fmt = (n) =>
    new Intl.NumberFormat("de-DE", {
      maximumFractionDigits: 1,
      notation: Math.abs(n) >= 1e6 ? "compact" : "standard",
    }).format(n),
  save = () => {
    persist();
    render();
  };
function isOutdated(p) {
  return !!(p && p.planData && p.planData.outdatedBy && ["active", "review"].includes(calcPlanStatus0(p)));
}
function calcPlanStatus(p, ignoreOutdated) {
  const st0 = calcPlanStatus0(p);
  return !ignoreOutdated && isOutdated(p) ? "stale" : st0;
}
function calcPlanStatus0(p) {
  const c = planChecks(p);
  if (!c.hasData) return "draft";
  if (c.targetMismatch) return "stale";
  if (p.confirmation && !c.confirmationValid) return "stale";
  const n = ["requiredBuildings", "resourceCosts", "buildTime", "efficiencies"].filter((k) => c[k]).length;
  if (n < 4 || !c.target) return "incomplete";
  return p.confirmation ? "active" : "review";
}
function statusLabel(st) {
  return (
    {
      active: "Aktiv",
      draft: "Entwurf",
      incomplete: "Unvollständig",
      review: "Prüfbereit",
      stale: "Veraltet",
    }[st] || st
  );
}
const SIGMA = {
  "Σ-Parsteel": {
    raw: 4275314946,
    tokens: [
      [[606960769], 1000],
      [[3569229621], 10000],
    ],
  },
  "Σ-Tritanium": {
    raw: 1734940706,
    tokens: [
      [[155492671], 100],
      [[2516876655], 10000],
    ],
  },
  "Σ-Dilithium": {
    raw: 733419347,
    tokens: [
      [[3016797203], 100],
      [[101891666], 1000],
      [[1970361654, 3175891366], 10000],
    ],
  },
};
function computeSigma(map) {
  const values = {},
    parts = {},
    warn = [];
  const get = (id) => (map.has(String(id)) ? map.get(String(id)) : null);
  for (const [n, c] of Object.entries(SIGMA)) {
    const raw = get(c.raw);
    if (raw === null) continue;
    let sum = raw,
      ok = true;
    parts[n] = { raw };
    for (const [ids, val] of c.tokens) {
      const vs = ids.map(get).map((v) => (v === null ? 0 : v));
      if (new Set(vs).size > 1) {
        warn.push(n);
        ok = false;
      }
      parts[n][ids[0]] = vs[0];
      sum += val * vs[0];
    }
    values[n] = sum;
    if (!ok) parts[n].unsicher = true;
  }
  return { values, parts, warn };
}
function exportTimeFromName(n) {
  const m = String(n || "").match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})[-:](\d{2})[-:](\d{2})(?:[-.](\d{1,3}))?Z/);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +(m[7] || 0));
  if (!Number.isFinite(t) || t > Date.now() + 864e5) return null;
  return new Date(t).toISOString();
}
function snapTime(x) {
  return x.exportedAt || exportTimeFromName(x.fileName) || x.createdAt;
}
function snapHasExport(x) {
  return !!(x.exportedAt || exportTimeFromName(x.fileName));
}
const fdt = (t) => new Date(t).toLocaleString("de-DE");
function latestSnapshot() {
  let b = null;
  for (const x of s.snapshots)
    if (x && x.values && (!b || new Date(snapTime(x)) > new Date(snapTime(b)))) b = x;
  return b;
}
