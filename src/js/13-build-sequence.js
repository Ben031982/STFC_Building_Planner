function applyMoveKeep(p, key, to) {
  const list = orderedSequence(p),
    i = list.findIndex((x) => seqKey(x) === key);
  if (i < 0) return false;
  const [it] = list.splice(i, 1);
  to = Math.max(0, Math.min(list.length, to));
  list.splice(to, 0, it);
  const ok = applySeqOrder(p, list);
  if (!ok) {
    $("seqMsg").dataset.keep = "1";
  }
  return ok;
}
function buildSequence(p) {
  const d = p.planData || {},
    list = (d.requiredBuildings || []).map((b, i) => ({ ...b, i })),
    tgt = d.target || null,
    out = [];
  if (!list.length) return out;
  const ops = list.find((b) => /^Operations$/i.test(b.name)),
    tgtName = tgt && !/^Operations$/i.test(tgt.building) ? String(tgt.building).toLowerCase() : null;
  const core = [],
    block = [],
    final = [];
  for (const b of list) {
    if (ops && b === ops) continue;
    if (CORE_ORDER(b.name) >= 0) {
      for (let L = b.start + 1; L <= b.target; L++) {
        const st = { name: b.name, from: L - 1, to: L, kind: "step", i: b.i };
        if (tgtName && b.name.toLowerCase() === tgtName && L === b.target) {
          st.kind = "target";
          final.push(st);
        } else core.push(st);
      }
    } else {
      const st = { name: b.name, from: b.start, to: b.target, kind: "block", i: b.i };
      if (tgtName && b.name.toLowerCase() === tgtName) {
        st.kind = "target";
        final.push(st);
      } else block.push(st);
    }
  }
  const coreSort = (a, b) => a.to - b.to || CORE_ORDER(a.name) - CORE_ORDER(b.name) || a.i - b.i,
    blockSort = (a, b) => a.to - b.to || RES_ORDER(a.name) - RES_ORDER(b.name) || a.i - b.i;
  core.sort(coreSort);
  block.sort(blockSort);
  const used = new Set();
  const take = (arr, lim, phase) => {
    for (const x of arr)
      if (!used.has(x) && x.to <= lim) {
        used.add(x);
        out.push({ ...x, phase });
      }
  };
  if (ops) {
    for (let N = ops.start + 1; N <= ops.target; N++) {
      const ph = "Bis OPS " + N;
      take(core, N - 1, ph);
      take(block, N - 1, ph);
      out.push({ name: ops.name, from: N - 1, to: N, kind: "ops", phase: ph, i: ops.i });
    }
  }
  const after = ops ? "Nach OPS " + ops.target : "Pflichtgebäude";
  take(core, Infinity, after);
  take(block, Infinity, after);
  final.sort(coreSort).forEach((x) => out.push({ ...x, phase: tgtName ? "Zielgebäude" : after }));
  return out;
}
const KIND_LABEL = {
  step: "Kerngebäude",
  block: "Ressourcen-Block",
  ops: "OPS-Stufe",
  target: "Zielgebäude",
};
function seqRowsHtml(seq, limit, onlyOpen, ctl, share) {
  let html = "",
    ph = null,
    n = 0,
    shown = 0;
  const cs = ctl ? 5 : 4;
  for (const x of seq) {
    n++;
    if (onlyOpen && x.done) continue;
    if (limit && shown >= limit) break;
    shown++;
    if (x.phase !== ph) {
      ph = x.phase;
      html += `<tr class="seqPhase"><td colspan="${cs}">${escAttr(ph)}</td></tr>`;
    }
    const part =
      x.kind === "block" && Number.isFinite(x.now) && x.now > x.from && x.now < x.to
        ? ` <span class="muted">(jetzt ${x.now})</span>`
        : "";
    html +=
      `<tr class="${x.kind === "ops" || x.kind === "target" ? "seqOps" : ""}${x.done ? " seqDone" : ""}"><td>${x.done ? "✓" : n}</td><td>${escAttr(x.name)}${share && !x.done ? ((o) => (o.length ? `<span class="seqShare">auch in: ${escAttr(o.join(", "))}</span>` : ""))(share(x)) : ""}</td><td>${x.from} → ${x.to}${part}</td><td>${x.done ? "erledigt" : KIND_LABEL[x.kind]}</td>${ctl ? `<td class="seqMv"><button data-sm="-1" data-k="${escAttr(seqKey(x))}" aria-label="Nach oben"${n === 1 ? " disabled" : ""}>↑</button><button data-sm="1" data-k="${escAttr(seqKey(x))}" aria-label="Nach unten"${n === seq.length ? " disabled" : ""}>↓</button></td>` : ""}</tr>`.replace(
        "<tr class=",
        ctl ? `<tr draggable="true" data-sk="${escAttr(seqKey(x))}" class=` : "<tr class=",
      );
  }
  return html;
}
