let dragPlanId = null;
function movePlan(id, to) {
  const i = s.plans.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [pl] = s.plans.splice(i, 1);
  to = Math.max(0, Math.min(s.plans.length, to));
  s.plans.splice(to, 0, pl);
  const prev = s.plans.find((x) => x.isMain);
  s.plans.forEach((x, k) => (x.isMain = k === 0));
  if (prev !== s.plans[0]) s.logs.push(_t("seq.hauptplan_gewechselt", { name: s.plans[0].name }));
  save();
}
function seqKey(x) {
  return x.name + "|" + x.from + "|" + x.to;
}
function phaseLabel(list) {
  const ops = list.map((x, i) => (x.kind === "ops" ? i : -1)).filter((i) => i >= 0);
  return list.map((x, i) => {
    if (x.kind === "target") return { ...x, phase: _t("seq.zielgebaeude") };
    const nx = ops.find((k) => k >= i);
    if (nx != null) return { ...x, phase: _t("seq.bis_ops", { n: list[nx].to }) };
    const lo = ops.length ? list[ops[ops.length - 1]].to : null;
    return { ...x, phase: lo ? _t("seq.nach_ops", { n: lo }) : _t("seq.pflichtgebaeude") };
  });
}
function orderedSequence(p) {
  const seq = progressSequence(p),
    co = (p.planData || {}).customOrder;
  if (!Array.isArray(co) || !co.length) return seq;
  const idx = new Map(co.map((k, i) => [k, i]));
  let last = -1,
    c = 0;
  const w = seq.map((x) => {
    const k = seqKey(x);
    let pos;
    if (idx.has(k)) {
      pos = idx.get(k);
      last = pos;
      c = 0;
    } else {
      c++;
      pos = last + c * 0.001;
    }
    return { x, pos };
  });
  w.sort((a, b) => a.pos - b.pos);
  return phaseLabel(w.map((v) => v.x));
}
function opsStartOf(p) {
  const bl = getBaseline(p),
    o = bl && bl.buildings.find((b) => /^Operations$/i.test(b.name));
  return o ? o.start : null;
}
function orderProblem(list, opsStart) {
  let ops = opsStart;
  const lvl = {};
  for (const x of list) {
    if (x.kind === "ops") {
      if (ops != null && x.to !== ops + 1)
        return _t("seq.ops_aufsteigend");
      ops = x.to;
      continue;
    }
    if (ops != null && x.to > ops)
      return _t("seq.braucht_ops", { name: x.name, n: x.to });
    const k = x.name.toLowerCase();
    if (lvl[k] != null && x.from < lvl[k])
      return _t("seq.stufen_aufsteigend", { name: x.name });
    lvl[k] = x.to;
  }
  return null;
}
function applySeqOrder(p, list) {
  const pr = orderProblem(list, opsStartOf(p));
  if (pr) {
    $("seqMsg").textContent = _t("seq.nicht_moeglich", { why: pr });
    return false;
  }
  p.planData.customOrder = list.map(seqKey);
  s.logs.push(_t("seq.reihenfolge_angepasst", { name: p.name }));
  save();
  return true;
}
function moveSeqStep(p, key, to) {
  const list = orderedSequence(p),
    i = list.findIndex((x) => seqKey(x) === key);
  if (i < 0) return;
  const [it] = list.splice(i, 1);
  to = Math.max(0, Math.min(list.length, to));
  list.splice(to, 0, it);
  applySeqOrder(p, list);
}
let dragSeqKey = null;
