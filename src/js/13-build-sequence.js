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
function seqRowsHtml(seq, limit, onlyOpen, ctl, share, cover) {
  let html = "",
    ph = null,
    n = 0,
    shown = 0;
  const cs = ctl ? 6 : 4;
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
      `<tr class="${x.kind === "ops" || x.kind === "target" ? "seqOps" : ""}${x.done ? " seqDone" : ""}"><td>${x.done ? "✓" : n}</td><td>${escAttr(x.name)}${share && !x.done ? ((o) => (o.length ? `<span class="seqShare">auch in: ${escAttr(o.join(", "))}</span>` : ""))(share(x)) : ""}</td><td>${x.from} → ${x.to}${part}</td><td>${x.done ? "erledigt" : KIND_LABEL[x.kind]}</td>${ctl ? coverCell(x, cover) : ""}${ctl ? `<td class="seqMv"><button data-sm="-1" data-k="${escAttr(seqKey(x))}" aria-label="Nach oben"${n === 1 ? " disabled" : ""}>↑</button><button data-sm="1" data-k="${escAttr(seqKey(x))}" aria-label="Nach unten"${n === seq.length ? " disabled" : ""}>↓</button></td>` : ""}</tr>`.replace(
        "<tr class=",
        ctl ? `<tr draggable="true" data-sk="${escAttr(seqKey(x))}" class=` : "<tr class=",
      );
  }
  return html;
}

// ---- ab 5.1: „Kosten gedeckt“ je Bauschritt (Schätzung) ----
// Kosten pro Schritt sind nicht bekannt (nur Summen je Ressource). Deshalb werden die Gesamtkosten nach
// Level-Gewicht auf die offenen Schritte verteilt: Spanne von „jedes Level gleich teuer“ bis „+30 % je Level“.
// Gebäudetypen werden gleich gewichtet. Ein Schritt ist gedeckt, wenn Bestand + Einkommen (Prognose-Rate)
// die bis dahin aufgelaufenen Kosten tragen; Einkommen nach der Prognose-Mitte (rateStats.real).
const REACH_GROWTH = [1, 1.3];
function coverEstimate(p, seq) {
  const rows = getPlanResources(p).filter((r) => !isLatinumMat(r[0]) && isNum(r[1]) && isNum(r[2]) && r[2] > 0);
  const open = [];
  seq.forEach((x, i) => {
    if (x.done) return;
    const from = Number.isFinite(x.now) && x.now > x.from && x.now < x.to ? x.now : x.from;
    open.push({ key: seqKey(x), name: x.name, from, to: x.to });
  });
  if (!open.length || !rows.length) return null;
  const fc = planForecast(p),
    rate = {};
  if (fc) for (const r of fc.res) rate[r.m] = r.st.n >= FC_MIN && r.st.real > 0 ? r.st.real : 0;
  // kumulierter Kostenanteil je Schritt und Wachstumsannahme
  const share = REACH_GROWTH.map((g) => {
    const w = open.map((x) => {
        let v = 0;
        for (let L = x.from + 1; L <= x.to; L++) v += Math.pow(g, L - x.to);
        return v;
      }),
      tot = w.reduce((a, b) => a + b, 0);
    let c = 0;
    return w.map((v) => (c += v) / tot);
  });
  const steps = open.map((x, k) => {
    const d = share.map((sh) => {
      let worst = 0,
        drv = null;
      for (const r of rows) {
        const need = sh[k] * r[2];
        if (need <= r[1]) continue;
        const dd = rate[r[0]] > 0 ? (need - r[1]) / rate[r[0]] : Infinity;
        if (dd > worst) {
          worst = dd;
          drv = r[0];
        }
      }
      return { d: worst, drv };
    });
    return { key: x.key, name: x.name, dMin: Math.min(d[0].d, d[1].d), dMax: Math.max(d[0].d, d[1].d), drv: (d[1].d >= d[0].d ? d[1] : d[0]).drv };
  });
  return { steps, base: fc ? fc.base : Date.now() };
}
// Spalte „Kosten gedeckt“: ✓ heute gedeckt, ! hier geht der Bestand aus (gedeckt ab …), ✗ danach (gedeckt ab …)
function coverMap(p, seq) {
  const e = coverEstimate(p, seq);
  if (!e) return null;
  const m = new Map();
  let brk = false; // erster nicht (sicher) gedeckter Schritt = Stelle, an der der Bestand ausgeht
  for (const s of e.steps) {
    let c = "ok";
    if (s.dMax > 0) {
      if (s.dMin <= 0) c = "warn";
      else if (!brk) {
        c = "warn";
        brk = true;
      } else c = "bad";
    }
    m.set(s.key, { c, dMin: s.dMin, dMax: s.dMax, drv: s.drv });
  }
  return { m, base: e.base };
}
const COVER_ICON = { ok: "✓", warn: "!", bad: "✗" };
function coverDate(base, d) {
  return Number.isFinite(d) ? (fcTooFar(d) ? FC_FAR_TXT : fcDate(base, Math.ceil(d))) : null;
}
function coverCell(x, cover) {
  if (x.done || !cover) return '<td class="cvr"></td>';
  const v = cover.m.get(seqKey(x));
  if (!v) return '<td class="cvr"></td>';
  if (v.c === "ok") return '<td class="cvr cvr-ok" title="Mit deinem Bestand gedeckt (Schätzung)">✓</td>';
  const mid = Number.isFinite(v.dMin) && Number.isFinite(v.dMax) ? (v.dMin + v.dMax) / 2 : Infinity,
    dt = coverDate(cover.base, mid),
    a = coverDate(cover.base, Math.max(0, v.dMin)),
    b = coverDate(cover.base, v.dMax),
    tip =
      (v.c === "warn" ? "Hier reicht dein Bestand vermutlich nicht mehr" : "Bestand reicht nicht mehr") +
      (dt ? "; gedeckt ab " + (a === b || !b ? a : a + " bis " + b) : "; ohne bekanntes Einkommen nicht absehbar") +
      (v.drv ? " (Engpass: " + v.drv + ")" : "") +
      " – Schätzung";
  return `<td class="cvr cvr-${v.c}" title="${escAttr(tip)}">${COVER_ICON[v.c]}<span class="cvrD">${dt ? "ab " + dt : "–"}</span></td>`;
}
