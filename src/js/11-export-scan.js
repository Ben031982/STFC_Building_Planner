async function parseExport(raw, name) {
  let j;
  try {
    j = JSON.parse(raw);
  } catch (_) {
    throw Error(_t("exp.kein_json"));
  }
  const h = await hash(raw);
  if (!j || !Array.isArray(j.resources) || !Array.isArray(j.buildings)) throw Error(_t("exp.ungueltig"));
  // Ab 2.1: Jeder Wert, den der Planner nutzt, muss eine Zahl ≥ 0 sein. Sonst wird die ganze Datei
  // abgelehnt (keine stille Übernahme von leeren, negativen oder Text-Werten).
  const used = new Map(Object.entries(IDS).map(([n, id]) => [String(id), n]));
  // ab 3.0: Schiffsteile – optional (ältere oder schmale Exporte enthalten sie evtl. nicht)
  for (const [n, id] of Object.entries(SHIP_PART_IDS)) used.set(String(id), n);
  for (const [n, c] of Object.entries(SIGMA)) {
    used.set(String(c.raw), n);
    for (const [ids] of c.tokens) for (const id of ids) used.set(String(id), n);
  }
  let map = new Map(),
    values = {};
  for (const x of j.resources) {
    if (!x || x.id == null) continue;
    const id = String(x.id);
    if (!used.has(id)) continue;
    const v = x.amount;
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? +v : NaN;
    if (!Number.isFinite(n) || n < 0)
      throw Error(_t("exp.ungueltiger_wert", { n: used.get(id), v: v === undefined ? _t("exp.fehlt_wert") : JSON.stringify(v) }));
    map.set(id, n);
  }
  for (let [n, id] of Object.entries(IDS)) {
    if (!map.has(String(id))) throw Error(_t("exp.fehlt", { n }));
    values[n] = map.get(String(id));
  }
  for (const [n, id] of Object.entries(SHIP_PART_IDS)) if (map.has(String(id))) values[n] = map.get(String(id));
  const sg = computeSigma(map);
  Object.assign(values, sg.values);
  const bld = {};
  for (const b of j.buildings) if (b && b.id != null && Number.isFinite(+b.level)) bld[b.id] = +b.level;
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    exportedAt: exportTimeFromName(name),
    fileName: name,
    hash: h,
    values,
    bld,
    resourceCount: j.resources.length,
    buildingCount: j.buildings.length,
    sigmaParts: sg.parts,
    sigmaWarn: sg.warn,
  };
}
const EXP_RE = /^spocksclub-data-export.*\.json$/i;
let expDir = null,
  pendingBatch = null,
  batchSource = "",
  scanMsg = "";
// Ab 2.1: Der gespeicherte Bestand folgt immer dem zeitlich neuesten Snapshot – egal in welcher
// Reihenfolge importiert oder gelöscht wurde. Ohne Snapshot: Startwerte.
function syncResources() {
  const ls = latestSnapshot();
  if (!ls) {
    s.resources = seed.resources.map((r) => [...r]);
    return;
  }
  s.resources = s.resources.map((r) => (ls.values[r[0]] !== undefined ? [r[0], ls.values[r[0]], r[2]] : r));
  for (const [n, v] of Object.entries(ls.values))
    if (!s.resources.some((r) => r[0] === n)) s.resources.push([n, v, 0]);
}
// ab 3.0: Ältere Snapshots (eingelesen vor 3.0) kennen die Schiffsteile noch nicht. Sie werden aus der
// ursprünglichen Exportdatei nachgetragen – nur fehlende Teile, sonst ändert sich nichts.
function snapNeedsParts(sn) {
  return !!(sn && sn.values && Object.keys(SHIP_PART_IDS).some((k) => sn.values[k] === undefined));
}
function backfillParts(sn, values) {
  let n = 0;
  for (const k of Object.keys(SHIP_PART_IDS))
    if (sn.values[k] === undefined && isNum(values[k])) {
      sn.values[k] = values[k];
      n++;
    }
  return n > 0;
}
function partsBackfillDone(n) {
  if (!n) return;
  s.logs.push(_t(n === 1 ? "exp.teile1" : "exp.teile", { n }));
  persist();
  render();
  toast(_t(n === 1 ? "exp.teile1" : "exp.teile", { n }) + ".");
}
function sameValues(a, b) {
  if (!a || !b || !a.values || !b.values) return false;
  const ks = Object.keys(a.values);
  return (
    ks.some((k) => b.values[k] !== undefined) &&
    ks.every((k) => b.values[k] === undefined || b.values[k] === a.values[k])
  );
}
async function ingestFiles(files) {
  $("file").value = "";
  files = (files || []).filter(Boolean);
  if (!files.length) return;
  if (files.length === 1) return ingest(files[0]);
  return openBatch(
    files.map((f) => ({ name: f.name, read: () => f.text() })),
    "auswahl",
  );
}
async function openBatch(entries, source, skipped, quiet) {
  const known = new Set(s.snapshots.map((x) => x.hash)),
    items = [];
  let filled = 0;
  for (const e of entries) {
    try {
      const snap = await parseExport(await e.read(), e.name);
      if (known.has(snap.hash)) {
        const old = s.snapshots.find((x) => x.hash === snap.hash);
        if (snapNeedsParts(old) && backfillParts(old, snap.values)) filled++;
      }
      items.push({ snap, status: known.has(snap.hash) ? "dup" : "new" });
    } catch (err) {
      items.push({ snap: { fileName: e.name }, status: "err", msg: err.message });
    }
  }
  const seen = new Set();
  for (const it of items) {
    if (it.status !== "new") continue;
    if (seen.has(it.snap.hash)) {
      it.status = "dup";
      it.msg = _t("exp.doppelt");
    } else seen.add(it.snap.hash);
  }
  const t = (x) => new Date(snapTime(x)).getTime();
  items.sort((a, b) => (a.status === "err") - (b.status === "err") || t(a.snap) - t(b.snap));
  const ls = latestSnapshot(),
    newest = ls ? t(ls) : -Infinity,
    pool = s.snapshots
      .filter((x) => x && x.values)
      .concat(items.filter((i) => i.status === "new").map((i) => i.snap));
  for (const it of items) {
    if (it.status !== "new") continue;
    const tt = t(it.snap);
    let prev = null;
    for (const p of pool) {
      if (p === it.snap) continue;
      const pt = t(p);
      if (pt < tt && (!prev || pt > t(prev))) prev = p;
    }
    if (prev && sameValues(it.snap, prev)) {
      it.status = "same";
      it.msg = _t("exp.identisch", { d: fdt(snapTime(prev)) });
    } else if (tt < newest) {
      it.status = "old";
      it.msg = _t("exp.aelter");
    }
    if (!it.snap.exportedAt)
      it.msg = (it.msg ? it.msg + " " : "") + _t("exp.keine_zeit");
    if (it.snap.sigmaWarn && it.snap.sigmaWarn.length)
      it.msg =
        (it.msg ? it.msg + " " : "") + _t("exp.sigma_unklar", { list: it.snap.sigmaWarn.join(", ") });
    it.sel = it.status === "new";
  }
  partsBackfillDone(filled);
  const cand = items.filter((i) => ["new", "old", "same"].includes(i.status));
  if (source === "ordner" && !cand.length) {
    scanMsg =
      _t("exp.keine_neuen") + (skipped ? _t("exp.skipped", { n: skipped }) : ".");
    renderScan();
    if (!quiet) toast(scanMsg);
    return;
  }
  pendingBatch = items;
  batchSource = source;
  const lab = {
    new: [_t("exp.lab_neu"), "bNew"],
    old: [_t("exp.lab_aelter"), "bOld"],
    same: [_t("exp.lab_identisch"), "bSame"],
    dup: [_t("exp.lab_dup"), "bDup"],
    err: [_t("exp.lab_err"), "bErr"],
  };
  $("batchHead").textContent =
    (source === "ordner"
      ? _t("exp.head_ordner", { f: (s.exportScan && s.exportScan.folder) || "" })
      : _t("exp.head_dateien")) +
    _t("exp.uebernehmbar", { n: cand.length }) +
    (skipped ? _t("exp.ausgeblendet", { n: skipped }) : "") +
    (source === "ordner" ? _t("exp.nicht_ausgewaehlt") : "") +
    _t("exp.zeitlich");
  $("batchRows").innerHTML = items
    .map((it, i) => {
      const ok = ["new", "old", "same"].includes(it.status);
      return `<tr class="${ok ? "" : "bDis"}"><td><input type="checkbox" data-bi="${i}"${it.sel ? " checked" : ""}${ok ? "" : " disabled"}></td><td title="${escAttr(it.snap.fileName)}">${it.snap.values ? fdt(snapTime(it.snap)) : escAttr(it.snap.fileName)}</td><td><span class="bTag ${lab[it.status][1]}">${lab[it.status][0]}</span></td><td class="muted">${escAttr(it.status === "err" ? it.msg : it.msg || "")}</td></tr>`;
    })
    .join("");
  $("batchRows")
    .querySelectorAll("[data-bi]")
    .forEach(
      (c) =>
        (c.onchange = () => {
          pendingBatch[+c.dataset.bi].sel = c.checked;
          batchBtn();
        }),
    );
  batchBtn();
  $("batchModal").classList.add("on");
}
function batchBtn() {
  const n = (pendingBatch || []).filter((i) => i.sel).length;
  $("batchOk").disabled = !n;
  $("batchOk").textContent = n ? _t("exp.ausgewaehlte", { n }) : _t("exp.nichts");
}
function applyBatch() {
  const sel = (pendingBatch || []).filter((i) => i.sel).map((i) => i.snap);
  if (!sel.length) return;
  if (batchSource === "ordner") {
    s.exportScan = s.exportScan || {};
    const ig = new Set(s.exportScan.ignored || []);
    for (const i of pendingBatch) if (!i.sel && i.snap.fileName) ig.add(i.snap.fileName);
    s.exportScan.ignored = [...ig].slice(-300);
  }
  for (const sn of sel) s.snapshots.push(sn);
  syncResources();
  toast(sel.length === 1 ? _t("exp.uebernommen1") : _t("exp.uebernommen", { n: sel.length }));
  s.logs.push(
    sel.length === 1
      ? _t("exp.log_snap", { f: sel[0].fileName })
      : _t("exp.log_snaps", { n: sel.length, a: fdt(snapTime(sel[0])), b: fdt(snapTime(sel[sel.length - 1])) }),
  );
  pendingBatch = null;
  scanMsg = "";
  $("batchModal").classList.remove("on");
  save();
  doBackup("auto");
}
async function expLoadDir() {
  if (expDir) return expDir;
  if (!(s.exportScan && s.exportScan.folder)) return null;
  try {
    expDir = (await bkGet("exp")) || null;
  } catch (_) {
    expDir = null;
  }
  return expDir;
}
async function expPick() {
  try {
    const h = await window.showDirectoryPicker({ id: "stfc-exports", mode: "read", startIn: "downloads" });
    expDir = h;
    try {
      await bkSet("exp", h);
    } catch (_) {}
    s.exportScan = s.exportScan || {};
    s.exportScan.folder = h.name;
    persist();
    return true;
  } catch (_) {
    return false;
  }
}
function expHang(quiet) {
  scanMsg = _t("exp.haengt");
  renderScan();
  if (!quiet) toast(scanMsg);
}
async function scanExports(change, quiet) {
  scanMsg = "";
  s.exportScan = s.exportScan || {};
  const have = change ? null : await fsTimeout(expLoadDir());
  if (have === FS_HANG) return expHang(quiet);
  if (change || !have) {
    if (!(await expPick())) {
      scanMsg = _t("exp.abgebrochen");
      renderScan();
      toast(scanMsg);
      return;
    }
  }
  let ok = false;
  try {
    ok = await fsTimeout(
      (async () =>
        !expDir.queryPermission ||
        (await expDir.queryPermission({ mode: "read" })) === "granted" ||
        (expDir.requestPermission && (await expDir.requestPermission({ mode: "read" })) === "granted"))(),
      FS_TIMEOUT.perm,
    );
  } catch (_) {
    ok = false;
  }
  if (ok === FS_HANG) return expHang(quiet);
  if (!ok) {
    scanMsg = _t("exp.kein_zugriff");
    renderScan();
    toast(scanMsg);
    return;
  }
  const names = new Set(s.snapshots.map((x) => x.fileName).concat(s.exportScan.ignored || [])),
    entries = [],
    backfill = [];
  let skipped = 0;
  try {
    for await (const [n, h] of expDir.entries()) {
      if (h.kind !== "file" || !EXP_RE.test(n)) continue;
      if (names.has(n)) {
        skipped++;
        // ab 3.0: Schiffsteile in älteren Snapshots nachtragen
        const old = s.snapshots.find((x) => x.fileName === n);
        if (snapNeedsParts(old)) backfill.push({ old, h, n });
        continue;
      }
      entries.push({ name: n, read: async () => (await h.getFile()).text() });
    }
  } catch (e) {
    scanMsg = _t("exp.nicht_lesbar", { e: e.message });
    renderScan();
    if (!quiet) toast(scanMsg);
    return;
  }
  let filled = 0;
  for (const b of backfill) {
    try {
      const snap = await parseExport(await (await b.h.getFile()).text(), b.n);
      if (snap.hash === b.old.hash && backfillParts(b.old, snap.values)) filled++;
    } catch (_) {}
  }
  partsBackfillDone(filled);
  s.exportScan.lastScan = new Date().toISOString();
  persist();
  await openBatch(entries, "ordner", skipped, quiet);
}
let toastT = null;
function toast(m) {
  const t = $("toast");
  if (!t || !m) return;
  t.textContent = m;
  t.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("on"), 4500);
}
function renderScan() {
  const el = $("impScanInfo");
  if (!el) return;
  const can = typeof window.showDirectoryPicker === "function";
  $("impScan").style.display = can ? "" : "none";
  if (!can) {
    el.innerHTML = "";
    return;
  }
  const f = s.exportScan && s.exportScan.folder;
  let h = f
    ? `<div class="folderRow"><span>${_t("exp.ordner")} <b>${escAttr(f)}</b></span><button id="scanChange" class="miniBtn">${_t("exp.ordner_aendern")}</button></div>`
    : _t("exp.erstes_mal");
  if (scanMsg) h += '<div style="margin-top:4px">' + escAttr(scanMsg) + "</div>";
  el.innerHTML = h;
  const c = $("scanChange");
  if (c) c.onclick = () => scanExports(true);
}
