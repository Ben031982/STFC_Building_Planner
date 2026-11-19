function careHints() {
  const p = activePlan(),
    out = [],
    now = Date.now(),
    ls = latestSnapshot();
  if (!ls)
    out.push({
      warn: true,
      text: _t("care.kein_snapshot"),
      btn: _t("care.json_importieren"),
      act: "json",
    });
  else {
    const age = (now - new Date(snapTime(ls)).getTime()) / 864e5;
    if (age > CARE_DAYS)
      out.push({
        warn: true,
        text:
          _t("care.export_alt", { d: fdt(snapTime(ls)), n: Math.floor(age) }),
        btn: typeof window.showDirectoryPicker === "function" ? _t("care.neue_exporte") : _t("care.json_importieren"),
        act: "json",
      });
  }
  if (p) {
    const stt = calcPlanStatus(p);
    const msg = {
      draft: _t("care.draft"),
      incomplete: _t("care.incomplete"),
      review: _t("care.review"),
      stale:
        _t("care.stale"),
    }[stt];
    if (msg && !isOutdated(p))
      out.push({ warn: true, text: p.name + ": " + msg, btn: _t("care.plandaten_verwalten"), act: "manage" });
  }
  if (p && !isShip(p) && p.hasPlanData && packEmpty())
    out.push({
      warn: false,
      text: _t("care.station_leer"),
      btn: _t("care.station_pflegen"),
      act: "packs",
    });
  const su = storeUsage();
  if (su && su.pct >= STORE_WARN)
    out.push({
      warn: true,
      text:
        _t("care.speicher", { n: Math.round(su.pct * 100) }),
      btn: _t("care.zur_sicherung"),
      act: "store",
    });
  for (const q of s.plans)
    if (isOutdated(q))
      out.push({ warn: true, text: outdatedText(q), btn: _t("care.upgrade_importieren"), act: "ocr:" + q.id });
  if (p && !isShip(p) && p.hasPlanData && p.planData && p.planData.importedAt) {
    const bs = bldSnaps(),
      last = bs[bs.length - 1];
    // ab 3.4: bekannte Gebäude beim Namen – Hinweis nur, wenn ein Gebäude dieses Plans gestiegen ist
    if (last) {
      const ch = (p.planData.requiredBuildings || [])
        .map((b) => {
          const l = bldLevelIn(last.snap.bld, b.name);
          return l != null && l > +b.start && +b.start < +b.target ? { name: b.name, from: +b.start, to: l } : null;
        })
        .filter(Boolean);
      if (ch.length)
        out.push({
          warn: true,
          text:
            _t(ch.length === 1 ? "care.gestiegen1" : "care.gestiegen", {
            d: fdt(p.planData.importedAt),
            list: ch.map((c) => c.name + " " + c.from + " → " + c.to).join(", "),
            name: p.name,
          }),
          btn: _t("care.upgrade_importieren"),
          act: "ocr",
        });
    }
    // Gebäude, deren Nummer der Planner nicht kennt: wie bisher zählen, mit „Gehört nicht zum Plan“
    if (bs.length >= 2) {
      const it = new Date(p.planData.importedAt).getTime();
      let base = bs[0];
      for (const b of bs) if (Math.abs(b.t - it) < Math.abs(base.t - it)) base = b;
      let baseT = base.t,
        baseBld = base.snap.bld;
      const ack = p.bldAck && new Date(p.bldAck.t).getTime();
      if (ack && ack > baseT) {
        baseT = ack;
        baseBld = p.bldAck.bld;
      }
      if (last.t > baseT) {
        // Export für Export vergleichen, damit auch Nummern zählen, die erst nach dem Plan-Import auftauchen
        let prev = Object.assign({}, baseBld);
        const ids = new Set();
        for (const x of bs.filter((y) => y.t > baseT)) {
          for (const c of bldChanges(prev, x.snap.bld)) if (!c.name) ids.add(c.id);
          prev = Object.assign(prev, x.snap.bld);
        }
        const unk = [...ids].map((id) => ({ id }));
        if (unk.length)
          out.push({
            warn: true,
            text:
              _t("care.unbekannt", {
              d: fdt(p.planData.importedAt),
              ack: ack && ack > base.t ? _t("care.und_bestaetigung") : "",
              ids: unk.map((c) => c.id).join(", "),
              name: p.name,
            }),
            btn: _t("care.upgrade_importieren"),
            act: "ocr",
            btn2: _t("care.gehoert_nicht"),
            act2: "bldack:" + p.id,
          });
      }
    }
  }
  if (p && p.hasPlanData && ls) {
    const fc = planForecast(p);
    if (fc && fc.overall && fc.overall.real == null && fc.overall.missingData.length) {
      const n = fc.overall.minN,
        miss = Math.max(0, FC_MIN - n);
      const m = fc.overall.missingData[0],
        pts = s.snapshots
          .filter((x) => x.values && isNum(x.values[m]))
          .map((x) => new Date(snapTime(x)).getTime())
          .sort((a, b) => a - b),
        iv = snapIntervals(m),
        anchor = iv.length ? iv[iv.length - 1].b.t.getTime() : pts[0];
      if (miss > 0 && anchor) {
        const next = anchor + FC_GAP_H * 36e5;
        out.push({
          warn: false,
          text:
            _t(miss === 1 ? "care.prognose_noch1" : "care.prognose_noch", {
            miss,
            n,
            min: FC_MIN,
            ab: next <= now ? _t("care.ab_sofort") : _t("care.ab", { d: fdt(next) }),
            h: FC_GAP_H,
          }),
        });
      }
    }
  }
  return out;
}
function renderCare() {
  renderCareInto("careList", "careCount");
  renderCareInto("impCare", "impCareCount");
  renderCareStrip();
}
function renderCareStrip() {
  const st = $("careState");
  if (!st) return;
  const hs = careHints(),
    w = hs.filter((h) => h.warn).length,
    p = activePlan(),
    ls = latestSnapshot(),
    dm = (t) =>
      new Date(t)
        .toLocaleString(LOC(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        .replace(",", "");
  st.className = "careState " + (w ? "warn" : "ok");
  st.textContent = w
    ? "⚠ " + _t(w === 1 ? "care.hinweise_1" : "care.hinweise_n", { n: w })
    : _t("care.alles_aktuell_klein");
  const imp = p && p.planData && p.planData.importedAt;
  $("careMeta").innerHTML =
    (ls ? _t("care.neuester_export", { d: dm(snapTime(ls)) }) : _t("care.noch_kein_export")) +
    (imp ? _t("care.plan_import_meta", { d: dm(imp) }) : "");
  const b = s.backup || {},
    bl = $("careBackupLink"),
    age = b.lastAt ? Math.floor((Date.now() - new Date(b.lastAt).getTime()) / 864e5) : null;
  bl.className = "linkBtn" + (!b.lastAt || bkDue() > 14 ? " due" : "");
  bl.textContent = !b.lastAt
    ? _t("care.kein_backup")
    : bkDue() > 14
      ? _t("care.backup_faellig", { n: age })
      : _t("care.backup_meta", { v: age === 0 ? _t("common.heute") : age === 1 ? _t("common.gestern") : _t("common.vor_tagen", { n: age }) });
  bl.onclick = () => doBackup("manual");
}
function renderCareInto(lid, cid) {
  const el = $(lid);
  if (!el) return;
  const hs = careHints();
  $(cid).textContent = hs.length ? _t(hs.length === 1 ? "care.hinweise_1" : "care.hinweise_n", { n: hs.length }) : cid === "impCareCount" ? _t("care.alles_aktuell") : "";
  el.innerHTML = hs.length
    ? hs
        .map(
          (h, i) =>
            `<div class="careItem${h.warn ? "" : " info"}"><span>${escAttr(h.text)}</span>${h.btn2 ? `<span class="careBtns"><button class="miniBtn" data-care="${h.act2}">${escAttr(h.btn2)}</button>` : ""}${h.btn ? `<button class="miniBtn" data-care="${h.act}">${escAttr(h.btn)}</button>` : ""}${h.btn2 ? "</span>" : ""}</div>`,
        )
        .join("")
    : `<div class="careOk">${_t("care.alles_aktuell")}</div>`;
  el.querySelectorAll("[data-care]").forEach(
    (b) =>
      (b.onclick = () => {
        const a = b.dataset.care;
        if (a === "json") {
          if (typeof window.showDirectoryPicker === "function") scanExports(false);
          else $("file").click();
        } else if (a === "store") {
          importPage();
          const u = $("storeUsage");
          if (u) u.scrollIntoView({ block: "center" });
        } else if (a === "manage") openManage();
        else if (a === "packs") openPacks();
        else if (a === "ocr") {
          openManage();
          $("openOcrBtn").click();
        } else if (a.startsWith("bldack:")) {
          // Gebäudestand des neuesten Exports für diesen Plan als „gehört nicht dazu“ merken
          const q = s.plans.find((x) => x.id === a.slice(7)),
            last = bldSnaps().at(-1);
          if (q && last) {
            q.bldAck = { t: new Date(last.t).toISOString(), bld: Object.assign({}, last.snap.bld) };
            s.logs.push(_t("care.bldack_log", { name: q.name }));
            save();
            render();
            toast(_t("care.ausgeblendet"));
          }
        } else if (a.startsWith("ocr:")) {
          s.active = a.slice(4);
          render();
          openManage();
          $("openOcrBtn").click();
        }
      }),
  );
}
