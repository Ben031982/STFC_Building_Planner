const BK_DB = "bens-stfc-fs",
  BK_KEEP = 10,
  BK_DAYS = 14,
  BK_RE = /^STFC-Planner-Backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(_vor-Wiederherstellung)?\.json$/;
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
async function doBackup(mode) {
  const d = new Date(),
    name = bkFileName(d, mode === "pre-restore" ? "_vor-Wiederherstellung" : ""),
    text = bkPayload(d);
  if (mode === "auto" && !s.backup.folder) return false;
  await bkLoadDir();
  if (mode === "auto" && !bkDir) {
    s.backup.lastErr =
      "Der Backup-Ordner ist nicht mehr verbunden. Bitte „Backup jetzt speichern“ klicken und ihn neu wählen.";
    s.backup.folder = null;
    persist();
    renderBackup();
    return false;
  }
  if (!bkDir && mode === "manual" && bkCanPick()) {
    if (!(await bkPickDir())) {
      bkMsg = "Abgebrochen – kein Backup gespeichert.";
      renderBackup();
      return false;
    }
  }
  if (bkDir) {
    let ok = false;
    try {
      ok = await bkPermission(bkDir);
    } catch (_) {
      ok = false;
    }
    if (ok) {
      try {
        await bkWrite(bkDir, name, text);
        try {
          await bkRotate(bkDir);
        } catch (_) {}
        bkDone(d, name, "folder");
        return true;
      } catch (e) {
        s.backup.lastErr = "Backup konnte nicht in den Ordner geschrieben werden (" + e.message + ").";
        persist();
      }
    } else {
      s.backup.lastErr = "Zugriff auf den Backup-Ordner wurde nicht erlaubt.";
      persist();
    }
    if (mode === "auto") {
      renderBackup();
      return false;
    }
  }
  bkDownload(name, text);
  bkDone(d, name, "download");
  return true;
}
function bkDue() {
  const ref = s.backup.lastAt || s.backup.since;
  return ref ? (Date.now() - new Date(ref).getTime()) / 864e5 : 0;
}
function fmtMB(n) {
  return n < 1e5 ? "< 0,1 MB" : (n / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " MB";
}
function renderStoreUsage() {
  const el = $("storeUsage");
  if (!el) return;
  const u = storeUsage();
  if (!u) {
    el.innerHTML = '<span class="red">Der Browser erlaubt keinen Zugriff auf den Speicher.</span>';
    return;
  }
  const pct = Math.min(100, Math.round(u.pct * 100)),
    warn = u.pct >= STORE_WARN;
  let h =
    '<div class="storeHead"><span>Browser-Speicher</span><b>' +
    fmtMB(u.total) +
    " von ca. 5 MB · " +
    pct +
    ' %</b></div><div class="prog' +
    (warn ? " warn" : "") +
    '"><i style="width:' +
    Math.max(pct, 1) +
    '%"></i></div>';
  if (u.total - u.own > 0.1 * u.total && u.total - u.own > 1e5)
    h +=
      '<div class="muted">Davon Planner: ' +
      fmtMB(u.own) +
      ". Den Rest belegen andere lokal geöffnete Dateien im selben Browser.</div>";
  if (warn)
    h +=
      '<div class="amber">Der Speicher wird knapp. Sichere ein Backup und lösche alte Snapshots, die du nicht mehr brauchst (Snapshot-Historie).</div>';
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
    "<div><b>Speichern im Browser fehlgeschlagen.</b> " +
    (storeError === "voll"
      ? "Der Browser-Speicher ist voll."
      : "Der Browser erlaubt dieser Seite gerade keinen Speicherzugriff.") +
    " Deine letzten Änderungen gehen beim Schließen der Seite verloren. Sichere sie jetzt als Backup" +
    (storeError === "voll" ? " und lösche danach alte Snapshots in der Snapshot-Historie." : ".") +
    '</div><button id="storeAlertBackup" class="btn">Backup jetzt speichern</button>';
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
    ? "Letztes Backup: " +
      fdt(b.lastAt) +
      (age === 0 ? " (heute)" : age === 1 ? " (gestern)" : " (vor " + age + " Tagen)") +
      (b.lastWhere === "download" ? " · als Download" : "")
    : "Noch kein Backup gespeichert.";
  if (b.folder)
    h +=
      "<br>Ordner: <b>" +
      escAttr(b.folder) +
      "</b> · automatisch nach jedem Import, die letzten " +
      BK_KEEP +
      ' bleiben.<br><button id="bkChange" class="miniBtn">Ordner ändern</button>';
  else if (bkCanPick())
    h +=
      '<br><span class="muted">Beim ersten Speichern wählst du den Ordner. Danach sichert die App nach jedem Import automatisch.</span>';
  else
    h +=
      '<br><span class="muted">Dieser Browser kann sich keinen Ordner merken. Das Backup wird als Download gespeichert.</span>';
  if (days >= BK_DAYS)
    h +=
      '<div class="red" style="margin-top:4px">' +
      (b.lastAt
        ? "Das letzte Backup ist " + Math.floor(days) + " Tage her."
        : "Seit " + Math.floor(days) + " Tagen kein Backup.") +
      " Bitte jetzt sichern.</div>";
  if (b.lastErr) h += '<div class="red" style="margin-top:4px">' + escAttr(b.lastErr) + "</div>";
  if (bkMsg) h += '<div class="muted" style="margin-top:4px">' + escAttr(bkMsg) + "</div>";
  el.innerHTML = h;
  const ch = $("bkChange");
  if (ch)
    ch.onclick = async () => {
      if (await bkPickDir()) {
        s.backup.lastErr = null;
        persist();
        bkMsg = "Neuer Ordner gewählt. Das nächste Backup landet dort.";
      }
      renderBackup();
    };
}
function parseBackup(text, f) {
  let j;
  try {
    j = JSON.parse(text);
  } catch (_) {
    throw Error("Die Datei ist kein gültiges JSON.");
  }
  if (j && Array.isArray(j.resources) && Array.isArray(j.buildings) && !j.plans)
    throw Error("Das ist ein Spock's-Club-Export, kein Backup. Bitte über „Daten importieren“ einlesen.");
  const st = j && j.type === "backup" && j.state ? j.state : j;
  if (!st || typeof st !== "object" || !(Array.isArray(st.plans) || Array.isArray(st.snapshots)))
    throw Error("Die Datei ist kein Backup des Planners.");
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
    '<table><tbody><tr><td class="muted">Datei</td><td>' +
    escAttr(r.fileName) +
    '</td></tr><tr><td class="muted">Erstellt</td><td>' +
    (r.createdAt ? fdt(r.createdAt) : "unbekannt") +
    '</td></tr><tr><td class="muted">App-Version</td><td>' +
    (r.version ? escAttr(r.version) : "älter als 1.7.2") +
    '</td></tr><tr><td class="muted">Zielpläne</td><td>' +
    pl.length +
    (pl.length ? " (" + pl.map((p) => escAttr(p.name || "Plan")).join(", ") + ")" : "") +
    '</td></tr><tr><td class="muted">Snapshots</td><td>' +
    sn.length +
    (last ? " · neuester Stand " + fdt(last) : "") +
    "</td></tr></tbody></table>"
  );
}
