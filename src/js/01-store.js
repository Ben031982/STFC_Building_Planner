function readStore(k) {
  try {
    return JSON.parse(localStorage.getItem(k) || "null");
  } catch (e) {
    return null;
  }
}
function serializeState() {
  return JSON.stringify(s, (k, v) =>
    k === "status" || k === "hasPlanData" || k === "validation" ? undefined : v,
  );
}
// Browser erlauben je Seite meist rund 5 Mio. Zeichen im localStorage (Chrome, Edge, Firefox).
const STORE_LIMIT = 5e6,
  STORE_WARN = 0.7,
  LOG_MAX = 200;
let storeError = null; // null | "voll" | "gesperrt"
function capLogs(st) {
  if (Array.isArray(st.logs) && st.logs.length > LOG_MAX) st.logs.splice(0, st.logs.length - LOG_MAX);
}
function storeWrite(key, text) {
  try {
    localStorage.setItem(key, text);
    return null;
  } catch (e) {
    return e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22)
      ? "voll"
      : "gesperrt";
  }
}
function persist() {
  capLogs(s);
  const err = storeWrite(K, serializeState());
  if (err !== storeError) {
    storeError = err;
    renderStoreAlert();
  }
  return !err;
}
function storeUsage() {
  let total = 0,
    own = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i),
        n = k.length + (localStorage.getItem(k) || "").length;
      total += n;
      if (k.startsWith("bens-stfc")) own += n;
    }
  } catch (_) {
    return null;
  }
  return { total, own, pct: total / STORE_LIMIT };
}
function storeWarn() {
  const u = storeUsage();
  return !!(u && u.pct >= STORE_WARN);
}
function migrateState(st) {
  st.snapshots = Array.isArray(st.snapshots) ? st.snapshots : [];
  st.logs = Array.isArray(st.logs) ? st.logs : [];
  capLogs(st);
  st.resources = Array.isArray(st.resources) ? st.resources : [];
  st.milestones = Array.isArray(st.milestones) ? st.milestones : [];
  if (!Array.isArray(st.plans)) st.plans = [];
  const old = (st.schema || 0) < SCHEMA,
    reimport = [];
  st.plans = st.plans.map((p) => {
    const q = {
      id: p.id,
      name: String(p.name || "Plan"),
      kind: p.kind || "ship",
      art: typeof p.art === "string" ? p.art : "auto",
      start: +p.start,
      target: +p.target,
      done: Number.isFinite(+p.done) ? +p.done : 0,
      total: +p.total > 0 ? +p.total : 1,
      isMain: p.isMain !== undefined ? !!p.isMain : p.id === "ship",
      sources: Array.isArray(p.sources) ? p.sources : [],
      planData: null,
      confirmation: null,
    };
    // ab 2.1: Wunschdatum für „Zieltermin prüfen“
    if (typeof p.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.targetDate)) q.targetDate = p.targetDate;
    if (!old) {
      q.planData = p.planData || null;
      q.confirmation = p.confirmation || null;
      return q;
    }
    const d = p.planData;
    if (d) {
      const imp =
        q.sources
          .filter((x) => x.role === "text-import")
          .map((x) => x.addedAt)
          .sort()
          .pop() || null;
      const nd = {
        importedAt: imp,
        target: null,
        requiredBuildings: Array.isArray(d.requiredBuildings)
          ? d.requiredBuildings.map((b) => ({ name: b.name, start: +b.start, target: +b.target }))
          : [],
        resources: null,
        construction: d.constructionTime ? { ...d.constructionTime } : null,
        efficiencies: d.efficiencies ? { ...d.efficiencies } : null,
      };
      const t = nd.requiredBuildings.find(
        (b) =>
          b.start === q.start &&
          b.target === q.target &&
          q.name.toLowerCase().startsWith(String(b.name).toLowerCase()),
      );
      if (t) nd.target = { building: t.name, start: t.start, target: t.target };
      if (d.resourceCosts) reimport.push(q.name);
      q.planData = nd;
    }
    return q;
  });
  if (old && reimport.length)
    st.logs.push(
      "Umstellung auf Version 1.3.7: Ressourcen für " +
        reimport.join(", ") +
        " bitte einmal neu importieren.",
    );
  st.schema = SCHEMA;
  if (st.plans.length && !st.plans.some((p) => p.isMain)) st.plans[0].isMain = true;
  {
    const mi = st.plans.findIndex((p) => p.isMain);
    if (mi > 0) {
      const [m] = st.plans.splice(mi, 1);
      st.plans.unshift(m);
    }
    st.plans.forEach((p, i) => (p.isMain = i === 0));
  }
  if (!st.plans.find((p) => p.id === st.active))
    st.active = st.plans.length ? (st.plans.find((p) => p.isMain) || st.plans[0]).id : null;
  if (st.plans.length && !st.plans.some((p) => p.isMain)) st.plans[0].isMain = true;
  return st;
}
let s = readStore(K),
  loadedFrom = s ? K : null;
if (!s) {
  for (const k of LEGACY_KEYS) {
    const v = readStore(k);
    if (v) {
      s = v;
      loadedFrom = k;
      break;
    }
  }
}
if (!s) s = JSON.parse(JSON.stringify(seed));
const needsPersist = (s.schema || 0) < SCHEMA;
s = migrateState(s);
for (const pk of s.packs || []) if (!Number.isFinite(pk.priceEUR)) pk.priceEUR = 100;
if (!Array.isArray(s.packs) || !s.packs.length)
  s.packs = [{ id: "station", name: "Stationspack", validFrom: "", priceEUR: 100, source: "", contents: {} }];
if (needsPersist && loadedFrom) persist();
function stableJSON(v) {
  if (Array.isArray(v)) return "[" + v.map(stableJSON).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stableJSON(v[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v === undefined ? null : v);
}
function planHash(p) {
  const d = p.planData || {};
  const t = stableJSON({
    t: d.target || null,
    b: d.requiredBuildings || null,
    r: d.resources || null,
    c: d.construction || null,
    e: d.efficiencies || null,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
