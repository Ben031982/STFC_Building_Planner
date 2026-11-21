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
      _t("ev.veraltet_log", { name: q.name, list: items.map((i) => i.name + " → " + i.level).join(", "), src: src.name }),
    );
  }
}
function outdatedText(q) {
  const o = q.planData.outdatedBy;
  return (
    _t(o.items.length === 1 ? "ev.outdated1" : "ev.outdated", {
      name: q.name,
      list: o.items.map((i) => i.name + " → " + i.level).join(", "),
      src: o.source,
    })
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
  EV_COL = { plan: "#5fb4ff", pack: "#ff8fcf", spike: "#ffd166", bau: "#ff9f6b", bld: "#7aeab0", manual: "#d9b8ff", goal: "#5bd2a0" },
  EV_LAB = {
    get plan() {
      return _t("ev.lab_plan");
    },
    get pack() {
      return _t("ev.lab_pack");
    },
    get spike() {
      return _t("ev.lab_spike");
    },
    get bau() {
      return _t("ev.lab_bau");
    },
    get bld() {
      return _t("ev.lab_bld");
    },
    get manual() {
      return _t("ev.lab_manual");
    },
    get goal() {
      return _t("ev.lab_goal");
    },
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
    .concat(unk.length ? [_t("ev.unbekannt_geb", { ids: unk.map((c) => c.id).join(", ") })] : [])
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
    if (ch.length) out.push({ t: bs[i].t, type: "bld", text: bldChangeText(ch) + _t("ev.laut_json") });
  }
  return out;
}
function planImportEvents(p) {
  return ((p && p.planData && p.planData.history) || []).map((h) => ({
    t: new Date(h.at).getTime(),
    type: "plan",
    text:
      histKindLabel(h.kind) + (h.progress ? _t("ev.stufen", { a: h.progress.done, b: h.progress.total }) : ""),
  }));
}
// Art des Plan-Imports ist auf Deutsch gespeichert (interner Wert) – nur die Anzeige wird übersetzt
function histKindLabel(k) {
  return { Import: _t("ev.kind_import"), Fortschreibung: _t("ev.kind_fort"), Ausgangsstand: _t("ev.kind_base") }[k || "Import"] || k;
}
// ab 5.3: eingetragene Packkäufe
function packBuyName(b) {
  return b.pack === "station" ? _t("common.stationspack") : SHIP_CLASSES[b.pack] ? shipPackName(b.pack, (s.shipPacks || {})[b.pack]) : b.pack;
}
function packBuyEvents() {
  return (s.packBuys || []).map((b) => ({ t: new Date(b.t).getTime(), type: "pack", text: _t("pb.ev_text", { n: b.n, name: packBuyName(b) }), pb: b.id }));
}
function renderPackBuys() {
  const sel = $("pbPack");
  if (!sel) return;
  ensureShipPacks();
  if (sel.dataset.lang !== curLang() || !sel.options.length) {
    const v = sel.value;
    sel.innerHTML =
      `<option value="station">${escAttr(_t("common.stationspack"))}</option>` +
      Object.keys(SHIP_CLASSES)
        .map((c) => `<option value="${c}">${escAttr(shipPackName(c, s.shipPacks[c]))}</option>`)
        .join("");
    sel.dataset.lang = curLang();
    if (v) sel.value = v;
  }
  if (!$("pbTime").value) {
    const d = new Date(),
      z = (n) => String(n).padStart(2, "0");
    $("pbTime").value = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
  }
  const n = (s.packBuys || []).length;
  $("pbCount").textContent = n ? _t(n === 1 ? "pb.anzahl1" : "pb.anzahl", { n }) : "";
}
function addPackBuy() {
  const t = new Date($("pbTime").value),
    n = Math.floor(+$("pbN").value),
    pack = $("pbPack").value;
  if (!$("pbTime").value || !Number.isFinite(t.getTime()) || !(n >= 1)) {
    $("pbMsg").textContent = _t("pb.ungueltig");
    return;
  }
  s.packBuys = Array.isArray(s.packBuys) ? s.packBuys : [];
  const b = { id: "pb-" + Date.now(), t: t.toISOString(), pack, n };
  s.packBuys.push(b);
  s.logs.push(_t("pb.log", { n, name: packBuyName(b), d: fdt(t) }));
  const pk = packBuyPack(b);
  $("pbMsg").textContent = packEmptyOf(pk) ? _t("pb.leer", { name: packBuyName(b) }) : _t("pb.ok", { n, name: packBuyName(b) });
  $("pbN").value = "1";
  $("pbTime").value = "";
  save();
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
  const d = (x) => new Date(x).toLocaleDateString(LOC());
  return (Array.isArray(s.goals) ? s.goals : []).map((g) => ({
    t: new Date(g.at).getTime(),
    type: "goal",
    text:
      _t("ev.goal_text", { name: g.name }) +
      (g.since ? _t("ev.geplant_seit", { d: d(g.since) }) : "") +
      (g.eta ? (g.since ? ", " : " – ") + _t("ev.letzte_prognose", { d: d(g.eta) }) : ""),
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
    d = (x) => (x ? new Date(x).toLocaleDateString(LOC()) : "–"),
    day = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n) + " " + _t(Math.abs(n) === 1 ? "common.tag" : "common.tage"),
    cell = (g, eta) => {
      const dv = goalDev(g, eta);
      return dv == null
        ? "<td>–</td>"
        : `<td>${d(eta)}<br><span class="tsDev ${Math.abs(dv) <= 3 ? "ok" : Math.abs(dv) <= 7 ? "mid" : "bad"}">${day(dv)}</span></td>`;
    },
    A = goalAccuracy(gs),
    card = (t, v, n) => `<div class="tsCard"><div class="muted">${t}</div><div class="tsVal">${v}</div><div class="muted">${n}</div></div>`;
  $("goalPanel").classList.toggle("goalEmpty", !gs.length);
  $("goalCount").textContent = gs.length ? _t(gs.length === 1 ? "ev.ziele_1" : "ev.ziele_n", { n: gs.length }) : "";
  const few = _t("common.zu_wenig_daten"),
    fewN = _t("ev.aussagekraeftig"),
    tend = A.midMean == null ? few : A.midMean > 1 ? _t("ev.tend_opt") : A.midMean < -1 ? _t("ev.tend_vors") : _t("ev.tend_ausg");
  el.innerHTML = gs.length
    ? `<div class="tsCards">${card(
        _t("ev.treff50"),
        A.midAbs == null ? few : _t("ev.avg_tage", { n: Math.round(A.midAbs) }),
        A.midAbs == null ? fewN : _t("ev.ziele_haelfte", { n: A.mid.length }),
      )}${card(
        _t("ev.tendenz"),
        tend,
        A.midMean == null
          ? fewN
          : Math.abs(A.midMean) > 1
            ? _t(A.midMean > 0 ? "ev.im_schnitt_spaeter" : "ev.im_schnitt_frueher", { n: Math.round(Math.abs(A.midMean)) })
            : _t("ev.keine_richtung"),
      )}${card(
        _t("ev.prog_start"),
        A.startAbs == null ? few : _t("ev.avg_tage", { n: Math.round(A.startAbs) }),
        A.startAbs == null ? fewN : _t("ev.je_frueher"),
      )}</div>
      <table class="histTable" style="width:100%"><thead><tr><th>${_t("ev.th_ziel")}</th><th>${_t("ev.th_erreicht")}</th><th>${_t("ev.prog_start")}</th><th>${_t("ev.th_p50")}</th><th>${_t("ev.th_pend")}</th><th></th></tr></thead><tbody id="goalRows">${gs
        .map(
          (g) =>
            `<tr><td>${escAttr(g.name)}<br><span class="muted">${_t("ev.geplant_seit2", { d: d(g.since) })}</span></td><td>${d(g.at)}</td>${cell(g, g.fc && g.fc.start)}${cell(g, g.fc && g.fc.mid)}${cell(g, g.eta)}<td style="white-space:nowrap"><button class="btn" data-goalshare="${escAttr(g.id)}" title="${_t("common.als_bild")}">${_t("common.bild")}</button> <button class="evDel" data-goal="${escAttr(g.id)}" title="${_t("ev.eintrag_loeschen")}">✕</button></td></tr>`,
        )
        .join("")}</tbody></table>
      <p class="muted" style="margin-top:10px">${_t("ev.abw_note")}</p>`
    : `<p class="muted">${_t("ev.kein_ziel")}</p>`;
  el.querySelectorAll("[data-goalshare]").forEach(
    (b) =>
      (b.onclick = () => {
        s.share = Object.assign({}, shareOpts(), { plan: "goal:" + b.dataset.goalshare });
        openShare();
      }),
  );
  el.querySelectorAll("[data-goal]").forEach(
    (b) =>
      (b.onclick = () => {
        const g = s.goals.find((x) => x.id === b.dataset.goal);
        if (!g || !confirm(_t("ev.confirm_goal_del", { name: g.name }))) return;
        s.goals = s.goals.filter((x) => x !== g);
        s.logs.push(_t("ev.goal_del_log", { name: g.name }));
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
    .concat(jumpEvents(p, [m]), bldEvents(), manualEvents(), packBuyEvents())
    .filter((e) => Number.isFinite(e.t));
}
function allEvents(p) {
  const mats = ["Σ-Parsteel", "Σ-Tritanium", "Σ-Dilithium", ...Object.keys(IDS)].filter(
    (m) => !isLatinumMat(m),
  );
  return planImportEvents(p)
    .concat(jumpEvents(p, mats), bldEvents(), manualEvents(), packBuyEvents(), goalEvents())
    .filter((e) => Number.isFinite(e.t))
    .sort((a, b) => b.t - a.t);
}
function renderEvents() {
  const el = $("evRows");
  if (!el) return;
  renderPackBuys();
  const p = activePlan(),
    ev = allEvents(p);
  if (!$("evDate").value) {
    const d = new Date(),
      z = (n) => String(n).padStart(2, "0");
    $("evDate").value = d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }
  $("evCount").textContent = ev.length ? _t(ev.length === 1 ? "ev.ereignisse_1" : "ev.ereignisse_n", { n: ev.length }) : "";
  el.innerHTML = ev.length
    ? ev
        .map(
          (e) =>
            `<tr><td>${e.type === "manual" ? new Date(e.t).toLocaleDateString(LOC()) : fdt(e.t)}</td><td><span class="evTag" style="border-left:3px solid ${EV_COL[e.type]}">${escAttr(EV_LAB[e.type])}</span></td><td style="white-space:normal">${escAttr(e.text)}</td><td>${e.type === "manual" ? `<button class="evDel" data-ev="${escAttr(e.id)}" title="${_t("ev.ereignis_loeschen")}">✕</button>` : e.pb ? `<button class="evDel" data-pb="${escAttr(e.pb)}" title="${_t("ev.ereignis_loeschen")}">✕</button>` : ""}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="muted">${_t("ev.keine_ereignisse")}</td></tr>`;
  el.querySelectorAll("[data-ev]").forEach(
    (b) =>
      (b.onclick = () => {
        const e = (s.events || []).find((x) => x.id === b.dataset.ev);
        s.events = (s.events || []).filter((x) => x.id !== b.dataset.ev);
        if (e) s.logs.push(_t("ev.ereignis_geloescht", { t: e.text }));
        save();
      }),
  );
  el.querySelectorAll("[data-pb]").forEach(
    (b) =>
      (b.onclick = () => {
        const x = (s.packBuys || []).find((y) => y.id === b.dataset.pb);
        s.packBuys = (s.packBuys || []).filter((y) => y.id !== b.dataset.pb);
        if (x) s.logs.push(_t("pb.geloescht", { t: _t("pb.ev_text", { n: x.n, name: packBuyName(x) }) + " · " + fdt(new Date(x.t)) }));
        save();
      }),
  );
}
