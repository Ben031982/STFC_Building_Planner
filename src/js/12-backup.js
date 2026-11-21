const BK_DB = "bens-stfc-fs",
  BK_KEEP = 10,
  BK_DAYS = 14,
  BK_RE = /^STFC-Planner-Backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(_vor-Wiederherstellung)?\.json$/;
// ab 5.2: Ordnerzugriff mit Zeitlimit. Hängt der Browser (z. B. bei einer kaputten gemerkten Ordnerfreigabe), meldet sich
// der Planner, statt stumm stehen zu bleiben (Bens Fund vom 21.11.2026).
// Rechte-Abfragen bekommen mehr Zeit, weil Chrome dabei auf deine Antwort im Erlaubnis-Fenster wartet.
const FS_HANG = { hang: true },
  FS_TIMEOUT = { ms: 5000, perm: 30000 };
function fsTimeout(promise, ms) {
  return Promise.race([promise, new Promise((res) => setTimeout(() => res(FS_HANG), ms || FS_TIMEOUT.ms))]);
}
let bkDir = null,
  bkMsg = "",
  pendingRestore = null;
function bkIdb() {
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(Error("kein IndexedDB"));
    const r = indexedDB.open(BK_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("h");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function bkGet(k) {
  const db = await bkIdb();
  return new Promise((res, rej) => {
    const q = db.transaction("h").objectStore("h").get(k);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function bkSet(k, v) {
  const db = await bkIdb();
  return new Promise((res, rej) => {
    const t = db.transaction("h", "readwrite");
    t.objectStore("h").put(v, k);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
async function bkLoadDir() {
  if (bkDir) return bkDir;
  if (!s.backup.folder) return null;
  try {
    bkDir = (await bkGet("dir")) || null;
  } catch (_) {
    bkDir = null;
  }
  return bkDir;
}
function bkCanPick() {
  return typeof window.showDirectoryPicker === "function";
}
function bkStamp(d) {
  const z = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    z(d.getMonth() + 1) +
    "-" +
    z(d.getDate()) +
    "_" +
    z(d.getHours()) +
    "-" +
    z(d.getMinutes()) +
    "-" +
    z(d.getSeconds())
  );
}
function bkFileName(d, suffix) {
  return "STFC-Planner-Backup_" + bkStamp(d) + (suffix || "") + ".json";
}
function bkPayload(d) {
  return JSON.stringify(
    {
      app: "Bens STFC Progress Planner",
      type: "backup",
      version: "__VERSION__",
      createdAt: d.toISOString(),
      state: JSON.parse(serializeState()),
    },
    null,
    2,
  );
}
async function bkPickDir() {
  try {
    const h = await window.showDirectoryPicker({ id: "stfc-backup", mode: "readwrite" });
    bkDir = h;
    try {
      await bkSet("dir", h);
    } catch (_) {}
    s.backup.folder = h.name;
    return true;
  } catch (e) {
    return false;
  }
}
async function bkPermission(dir) {
  if (!dir.queryPermission) return true;
  let p = await dir.queryPermission({ mode: "readwrite" });
  if (p !== "granted" && dir.requestPermission) p = await dir.requestPermission({ mode: "readwrite" });
  return p === "granted";
}
async function bkWrite(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}
async function bkRotate(dir) {
  const names = [];
  for await (const [n, h] of dir.entries()) if (h.kind === "file" && BK_RE.test(n)) names.push(n);
  names.sort();
  const del = names.slice(0, Math.max(0, names.length - BK_KEEP));
  for (const n of del) await dir.removeEntry(n);
  return del.length;
}
function bkDownload(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function bkDone(d, name, where) {
  s.backup.lastAt = d.toISOString();
  s.backup.lastFile = name;
  s.backup.lastWhere = where;
  s.backup.lastErr = null;
  persist();
  bkMsg = "";
  renderBackup();
}
function bkHang(mode) {
  s.backup.lastErr = _t("bk.haengt");
  persist();
  if (mode !== "auto") {
    bkMsg = s.backup.lastErr;
    toast(bkMsg);
  }
  renderBackup();
  return false;
}
async function doBackup(mode) {
  const d = new Date(),
    name = bkFileName(d, mode === "pre-restore" ? "_vor-Wiederherstellung" : ""),
    text = bkPayload(d);
  if (mode === "auto" && !s.backup.folder) return false;
  if ((await fsTimeout(bkLoadDir())) === FS_HANG) return bkHang(mode);
  if (mode === "auto" && !bkDir) {
    s.backup.lastErr =
      _t("bk.nicht_verbunden");
    s.backup.folder = null;
    persist();
    renderBackup();
    return false;
  }
  if (!bkDir && mode === "manual" && bkCanPick()) {
    if (!(await bkPickDir())) {
      bkMsg = _t("bk.abgebrochen");
      renderBackup();
      return false;
    }
  }
  if (bkDir) {
    let ok = false;
    try {
      ok = await fsTimeout(bkPermission(bkDir), FS_TIMEOUT.perm);
      if (ok === FS_HANG) return bkHang(mode);
    } catch (_) {
      ok = false;
    }
    if (ok) {
      try {
        if ((await fsTimeout(bkWrite(bkDir, name, text))) === FS_HANG) return bkHang(mode);
        try {
          await bkRotate(bkDir);
        } catch (_) {}
        bkDone(d, name, "folder");
        return true;
      } catch (e) {
        s.backup.lastErr = _t("bk.schreibfehler", { e: e.message });
        persist();
      }
    } else {
      s.backup.lastErr = _t("bk.kein_zugriff");
      persist();
    }
    if (mode === "auto") {
      renderBackup();
      return false;
    }
  }
  const why = s.backup.lastErr;
  bkDownload(name, text);
  bkDone(d, name, "download");
  // ab 5.2: Grund nicht verschlucken, wenn der Ordner nicht ging und deshalb heruntergeladen wurde
  if (why) {
    bkMsg = _t("bk.als_download_weil", { e: why });
    renderBackup();
  }
  return true;
}
function bkDue() {
  const ref = s.backup.lastAt || s.backup.since;
  return ref ? (Date.now() - new Date(ref).getTime()) / 864e5 : 0;
}
function fmtMB(n) {
  return n < 1e5 ? "< 0,1 MB" : (n / 1e6).toLocaleString(LOC(), { maximumFractionDigits: 1 }) + " MB";
}
function renderStoreUsage() {
  const el = $("storeUsage");
  if (!el) return;
  const u = storeUsage();
  if (!u) {
    el.innerHTML = `<span class="red">${_t("bk.kein_speicher")}</span>`;
    return;
  }
  const pct = Math.min(100, Math.round(u.pct * 100)),
    warn = u.pct >= STORE_WARN;
  let h =
    `<div class="storeHead"><span>${_t("bk.browser_speicher")}</span><b>${_t("bk.belegt", { a: fmtMB(u.total), p: pct })}</b></div><div class="prog` +
    (warn ? " warn" : "") +
    '"><i style="width:' +
    Math.max(pct, 1) +
    '%"></i></div>';
  if (u.total - u.own > 0.1 * u.total && u.total - u.own > 1e5)
    h +=
      `<div class="muted">${_t("bk.davon", { a: fmtMB(u.own) })}</div>`;
  if (warn)
    h +=
      `<div class="amber">${_t("bk.knapp")}</div>`;
  el.innerHTML = h;
}
function renderStoreAlert() {
  const el = $("storeAlert");
  if (!el) return;
  if (!storeError) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.innerHTML =
    `<div><b>${_t("bk.fehlgeschlagen")}</b> ` +
    (storeError === "voll" ? _t("bk.voll") : _t("bk.kein_zugriff_seite")) +
    " " +
    _t(storeError === "voll" ? "bk.verloren_voll" : "bk.verloren") +
    `</div><button id="storeAlertBackup" class="btn">${_t("bk.jetzt_speichern")}</button>`;
  el.hidden = false;
  $("storeAlertBackup").onclick = async () => {
    await doBackup("manual");
    renderBackup();
  };
}
function renderBackup() {
  renderStoreUsage();
  const el = $("backupInfo");
  if (!el || !s.backup) return;
  const b = s.backup,
    days = bkDue(),
    age = b.lastAt ? Math.floor((Date.now() - new Date(b.lastAt).getTime()) / 864e5) : null;
  let h = "";
  h += b.lastAt
    ? _t("bk.letztes", { d: fdt(b.lastAt) }) +
      " (" +
      (age === 0 ? _t("common.heute") : age === 1 ? _t("common.gestern") : _t("common.vor_tagen", { n: age })) +
      ")" +
      (b.lastWhere === "download" ? _t("bk.als_download") : "")
    : _t("bk.noch_keins");
  if (b.folder)
    h +=
      "<br>" +
      _t("bk.ordner", { f: escAttr(b.folder), n: BK_KEEP }) +
      `<br><button id="bkChange" class="miniBtn">${_t("exp.ordner_aendern")}</button>`;
  else if (bkCanPick())
    h +=
      `<br><span class="muted">${_t("bk.erstes")}</span>`;
  else
    h +=
      `<br><span class="muted">${_t("bk.kein_ordner")}</span>`;
  if (days >= BK_DAYS)
    h +=
      '<div class="red" style="margin-top:4px">' +
      (b.lastAt
        ? _t("bk.tage_her", { n: Math.floor(days) })
        : _t("bk.seit_tagen", { n: Math.floor(days) })) +
      " " +
      _t("bk.bitte_sichern") +
      "</div>";
  if (b.lastErr) h += '<div class="red" style="margin-top:4px">' + escAttr(b.lastErr) + "</div>";
  if (bkMsg) h += '<div class="muted" style="margin-top:4px">' + escAttr(bkMsg) + "</div>";
  el.innerHTML = h;
  const ch = $("bkChange");
  if (ch)
    ch.onclick = async () => {
      if (await bkPickDir()) {
        s.backup.lastErr = null;
        persist();
        bkMsg = _t("bk.neuer_ordner");
      }
      renderBackup();
    };
}
function parseBackup(text, f) {
  let j;
  try {
    j = JSON.parse(text);
  } catch (_) {
    throw Error(_t("bk.kein_json"));
  }
  if (j && Array.isArray(j.resources) && Array.isArray(j.buildings) && !j.plans)
    throw Error(_t("bk.ist_export"));
  const st = j && j.type === "backup" && j.state ? j.state : j;
  if (!st || typeof st !== "object" || !(Array.isArray(st.plans) || Array.isArray(st.snapshots)))
    throw Error(_t("bk.kein_backup"));
  return {
    state: st,
    fileName: (f && f.name) || "Backup",
    createdAt:
      j.type === "backup" ? j.createdAt : f && f.lastModified ? new Date(f.lastModified).toISOString() : null,
    version: j.type === "backup" ? j.version : null,
  };
}
function restoreInfoHtml(r) {
  const st = r.state,
    pl = Array.isArray(st.plans) ? st.plans : [],
    sn = Array.isArray(st.snapshots) ? st.snapshots : [];
  const last = sn
    .map((x) => x.exportedAt || x.createdAt)
    .filter(Boolean)
    .sort()
    .pop();
  return (
    `<table><tbody><tr><td class="muted">${_t("bk.info_datei")}</td><td>` +
    escAttr(r.fileName) +
    `</td></tr><tr><td class="muted">${_t("bk.info_erstellt")}</td><td>` +
    (r.createdAt ? fdt(r.createdAt) : _t("common.unbekannt")) +
    `</td></tr><tr><td class="muted">${_t("bk.info_version")}</td><td>` +
    (r.version ? escAttr(r.version) : _t("bk.info_aelter")) +
    `</td></tr><tr><td class="muted">${_t("bk.info_plaene")}</td><td>` +
    pl.length +
    (pl.length ? " (" + pl.map((p) => escAttr(p.name || "Plan")).join(", ") + ")" : "") +
    '</td></tr><tr><td class="muted">Snapshots</td><td>' +
    sn.length +
    (last ? _t("bk.neuester", { d: fdt(last) }) : "") +
    "</td></tr></tbody></table>"
  );
}
