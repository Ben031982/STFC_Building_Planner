function careHints() {
  const p = activePlan(),
    out = [],
    now = Date.now(),
    ls = latestSnapshot();
  if (!ls)
    out.push({
      warn: true,
      text: "Noch kein JSON-Snapshot importiert. Ohne Snapshots gibt es keine Bestände, Raten und Prognose.",
      btn: "JSON importieren",
      act: "json",
    });
  else {
    const age = (now - new Date(snapTime(ls)).getTime()) / 864e5;
    if (age > CARE_DAYS)
      out.push({
        warn: true,
        text:
          "Letzter Exportstand vom " +
          fdt(snapTime(ls)) +
          " (vor " +
          Math.floor(age) +
          " Tagen). Zeit für einen neuen Export aus Spock's Club – vorher synchronisieren.",
        btn: typeof window.showDirectoryPicker === "function" ? "Neue Exporte einlesen" : "JSON importieren",
        act: "json",
      });
  }
  if (p) {
    const stt = calcPlanStatus(p);
    const msg = {
      draft: "Für diesen Plan wurde noch kein Upgrade-Plan importiert.",
      incomplete: "Die Plandaten sind unvollständig.",
      review: "Die Plandaten sind vollständig, aber noch nicht bestätigt.",
      stale:
        "Die Plandaten passen nicht mehr zum Ziel oder wurden geändert – neu importieren und bestätigen.",
    }[stt];
    if (msg && !isOutdated(p))
      out.push({ warn: true, text: p.name + ": " + msg, btn: "Plandaten verwalten", act: "manage" });
  }
  if (p && p.hasPlanData && packEmpty())
    out.push({
      warn: false,
      text: "Stationspack noch nicht gepflegt. Trag den Inhalt deines Stationspacks ein (im Spiel ablesen), dann zeigt der Planner, wie viele Packs bis zum Ziel nötig wären.",
      btn: "Stationspack pflegen",
      act: "packs",
    });
  const su = storeUsage();
  if (su && su.pct >= STORE_WARN)
    out.push({
      warn: true,
      text:
        "Browser-Speicher zu " +
        Math.round(su.pct * 100) +
        " % belegt. Sichere ein Backup und lösche alte Snapshots, die du nicht mehr brauchst.",
      btn: "Zur Sicherung",
      act: "store",
    });
  for (const q of s.plans)
    if (isOutdated(q))
      out.push({ warn: true, text: outdatedText(q), btn: "Upgrade-Plan importieren", act: "ocr:" + q.id });
  if (p && p.hasPlanData && p.planData && p.planData.importedAt) {
    const bs = bldSnaps();
    if (bs.length >= 2) {
      const it = new Date(p.planData.importedAt).getTime();
      let base = bs[0];
      for (const b of bs) if (Math.abs(b.t - it) < Math.abs(base.t - it)) base = b;
      const last = bs[bs.length - 1];
      if (last.t > base.t) {
        const d = bldDiff(base.snap.bld, last.snap.bld);
        if (d.lv > 0)
          out.push({
            warn: true,
            text:
              "Seit dem letzten Plan-Import (" +
              fdt(p.planData.importedAt) +
              ") sind laut JSON " +
              d.lv +
              " Gebäudestufe" +
              (d.lv === 1 ? "" : "n") +
              " dazugekommen (" +
              d.n +
              " Gebäude). Fortschritt und Kosten von " +
              p.name +
              " sind dadurch nicht mehr aktuell – „Included upgrades“ und „Total resources“ neu importieren.",
            btn: "Upgrade-Plan importieren",
            act: "ocr",
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
            "Prognose: noch " +
            miss +
            " Abschnitt" +
            (miss === 1 ? "" : "e") +
            " bis zur Fertigstellungsprognose (" +
            n +
            "/" +
            FC_MIN +
            "). Der nächste zählende Export ist " +
            (next <= now ? "ab sofort" : "ab " + fdt(next)) +
            " möglich (mindestens " + FC_GAP_H + " Stunden Abstand).",
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
        .toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        .replace(",", "");
  st.className = "careState " + (w ? "warn" : "ok");
  st.textContent = w
    ? "⚠ Datenpflege: " + w + " Hinweis" + (w === 1 ? "" : "e")
    : "✓ Datenpflege: alles aktuell";
  const imp = p && p.planData && p.planData.importedAt;
  $("careMeta").innerHTML =
    (ls ? "Neuester Export <b>" + dm(snapTime(ls)) + "</b>" : "Noch kein Export") +
    (imp ? " · Plan-Import <b>" + dm(imp) + "</b>" : "");
  const b = s.backup || {},
    bl = $("careBackupLink"),
    age = b.lastAt ? Math.floor((Date.now() - new Date(b.lastAt).getTime()) / 864e5) : null;
  bl.className = "linkBtn" + (!b.lastAt || bkDue() > 14 ? " due" : "");
  bl.textContent = !b.lastAt
    ? "● Noch kein Backup – jetzt speichern"
    : bkDue() > 14
      ? "● Backup fällig (vor " + age + " Tagen) – jetzt speichern"
      : "Backup: " + (age === 0 ? "heute" : age === 1 ? "gestern" : "vor " + age + " Tagen");
  bl.onclick = () => doBackup("manual");
}
function renderCareInto(lid, cid) {
  const el = $(lid);
  if (!el) return;
  const hs = careHints();
  $(cid).textContent = hs.length ? hs.length + " Hinweis" + (hs.length === 1 ? "" : "e") : "";
  el.innerHTML = hs.length
    ? hs
        .map(
          (h, i) =>
            `<div class="careItem${h.warn ? "" : " info"}"><span>${escAttr(h.text)}</span>${h.btn ? `<button class="miniBtn" data-care="${h.act}">${escAttr(h.btn)}</button>` : ""}</div>`,
        )
        .join("")
    : '<div class="careOk">✓ Alles aktuell. Nichts zu pflegen.</div>';
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
        } else if (a.startsWith("ocr:")) {
          s.active = a.slice(4);
          render();
          openManage();
          $("openOcrBtn").click();
        }
      }),
  );
}
