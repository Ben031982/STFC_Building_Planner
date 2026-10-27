$("ni").onclick = importPage;
$("impBack").onclick = () => {
  dash();
  setTab("ov");
};
$("impScan").onclick = () => scanExports(false);
$("impSnapsBtn").onclick = snaps;
$("impNewPlan").onclick = openDraft;
$("impDrop").onclick = () => $("file").click();
["dragenter", "dragover"].forEach((t) =>
  $("impDrop").addEventListener(t, (e) => {
    e.preventDefault();
    $("impDrop").classList.add("drag");
  }),
);
$("impDrop").addEventListener("dragleave", () => $("impDrop").classList.remove("drag"));
$("impDrop").addEventListener("drop", (e) => {
  e.preventDefault();
  $("impDrop").classList.remove("drag");
  ingestFiles([...e.dataTransfer.files]);
});
$("nw").onclick = wif;
$("nwk").onclick = () => {
  wkOffset = 0;
  weekly();
};
$("wkBack").onclick = () => {
  dash();
  setTab("ov");
};
$("wkPrev").onclick = () => {
  wkOffset--;
  renderWeekly();
};
$("wkNext").onclick = () => {
  if (wkOffset < 0) {
    wkOffset++;
    renderWeekly();
  }
};
$("wifBack").onclick = () => {
  dash();
  setTab("ov");
};
["wifNow", "wifWeek", "wifPct"].forEach((id) => ($(id).oninput = renderWif));
$("wifReset").onclick = () => {
  $("wifNow").value = 0;
  $("wifWeek").value = 0;
  $("wifPct").value = 0;
  wifBonusInit(true);
  renderWif();
};
$("closePack").onclick = $("cancelPack").onclick = () => $("packModal").classList.remove("on");
$("packModal").onclick = (e) => {
  if (e.target === $("packModal")) $("packModal").classList.remove("on");
};
$("savePack").onclick = () => {
  const pk = s.packs[0],
    c = {};
  let bad = false;
  document.querySelectorAll("[data-pm]").forEach((i) => {
    const v = i.value.trim();
    if (v === "") return;
    const n = Math.round(+v);
    if (!Number.isFinite(n) || n < 0) {
      bad = true;
      return;
    }
    c[i.dataset.pm] = { amount: n };
    if (document.querySelector(`[data-pa="${i.dataset.pm}"]`).checked) c[i.dataset.pm].approx = true;
  });
  if (bad) {
    alert("Bitte nur ganze, nicht negative Zahlen eingeben.");
    return;
  }
  pk.contents = c;
  {
    const pv = $("packPrice").value.trim();
    if (pv !== "") {
      const n = +pv;
      if (!Number.isFinite(n) || n < 0) {
        alert("Bitte einen gültigen Preis in € eingeben.");
        return;
      }
      pk.priceEUR = n;
    }
  }
  pk.validFrom = $("packValid").value || pk.validFrom;
  s.logs.push("Stationspack aktualisiert");
  $("packModal").classList.remove("on");
  save();
};
$("compare").onclick = () => {
  let a = s.snapshots.find((x) => x.id === $("from").value),
    b = s.snapshots.find((x) => x.id === $("to").value);
  if (!a || !b || a.id === b.id) {
    $("compareResult").innerHTML = "<p>Bitte zwei unterschiedliche Snapshots wählen.</p>";
    return;
  }
  const days = (new Date(snapTime(b)) - new Date(snapTime(a))) / 864e5;
  $("compareResult").innerHTML =
    '<p class="muted" style="font-size:12px">' +
    fdt(snapTime(a)) +
    " → " +
    fdt(snapTime(b)) +
    " (" +
    Math.abs(days).toFixed(1).replace(".", ",") +
    ' Tage)</p><table class="histTable" style="width:100%"><thead><tr><th>Material</th><th>Stand A</th><th>Stand B</th><th>Veränderung</th></tr></thead><tbody>' +
    trackedMats()
      .map((n) => {
        const ok = Number.isFinite(b.values[n]) && Number.isFinite(a.values[n]),
          d = ok ? b.values[n] - a.values[n] : null;
        return `<tr><td>${n}</td><td>${ok ? fmt(a.values[n]) : "–"}</td><td>${ok ? fmt(b.values[n]) : "–"}</td><td class="${d > 0 ? "green" : d < 0 ? "red" : ""}">${d == null ? "–" : (d > 0 ? "+" : "") + fmt(d)}</td></tr>`;
      })
      .join("") +
    "</tbody></table>";
};
$("backup").onclick = () => doBackup("manual");
$("chartBox").onclick = () => {
  $("chartModal").classList.add("on");
  renderChart();
};
$("closeChartBig").onclick = () => $("chartModal").classList.remove("on");
$("chartModal").onclick = (e) => {
  if (e.target === $("chartModal")) $("chartModal").classList.remove("on");
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $("chartModal").classList.remove("on");
});
$("chartBigSelect").onchange = () => {
  $("resourceSelect").value = $("chartBigSelect").value;
  renderChart();
};
$("reset").onclick = () => {
  if (confirm("Alles löschen?")) {
    const ks = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("bens-stfc")) ks.push(k);
    }
    ks.forEach((k) => localStorage.removeItem(k));
    try {
      indexedDB.deleteDatabase(BK_DB);
    } catch (_) {}
    setTimeout(() => location.reload(), 150);
  }
};
["confirm", "applyOcr"].forEach((id) => {
  const el = $(id),
    h = el.onclick;
  el.onclick = function (e) {
    const before = serializeState();
    const r = h.call(this, e);
    if (serializeState() !== before) doBackup("auto");
    return r;
  };
});
$("restoreBtn").onclick = () => $("restoreFile").click();
$("evAdd").onclick = () => {
  const d = $("evDate").value,
    t = $("evText").value.trim();
  if (!d || !t) {
    $("evText").focus();
    return;
  }
  s.events = Array.isArray(s.events) ? s.events : [];
  s.events.push({ id: "ev-" + Date.now(), at: new Date(d + "T12:00:00").toISOString(), text: t });
  s.logs.push("Ereignis eingetragen: " + t);
  $("evText").value = "";
  save();
};
$("batchCancel").onclick = () => {
  pendingBatch = null;
  $("batchModal").classList.remove("on");
};
$("batchOk").onclick = () => applyBatch();
$("restoreFile").onchange = async (e) => {
  const f = e.target.files[0];
  $("restoreFile").value = "";
  if (!f) return;
  try {
    const r = parseBackup(await f.text(), f);
    pendingRestore = r;
    $("restoreInfo").innerHTML = restoreInfoHtml(r);
    $("restoreModal").classList.add("on");
  } catch (err) {
    alert("Wiederherstellen nicht möglich: " + err.message);
  }
};
$("restoreCancel").onclick = () => {
  pendingRestore = null;
  $("restoreModal").classList.remove("on");
};
$("restoreOk").onclick = async () => {
  const r = pendingRestore;
  if (!r) return;
  $("restoreOk").disabled = true;
  await doBackup("pre-restore");
  const st = r.state;
  st.backup = s.backup;
  st.exportScan = s.exportScan;
  st.logs = Array.isArray(st.logs) ? st.logs : [];
  st.logs.push("Backup wiederhergestellt: " + r.fileName);
  capLogs(st);
  const err = storeWrite(K, JSON.stringify(st));
  if (err) {
    $("restoreOk").disabled = false;
    $("restoreInfo").insertAdjacentHTML(
      "beforeend",
      '<div class="red" style="margin-top:8px">Wiederherstellen fehlgeschlagen: ' +
        (err === "voll"
          ? "Das Backup passt nicht in den Browser-Speicher. Lösche andere lokal gespeicherte Daten oder alte Snapshots und versuche es erneut."
          : "Der Browser erlaubt keinen Speicherzugriff.") +
        " Deine bisherigen Daten sind unverändert.</div>",
    );
    return;
  }
  $("restoreModal").classList.remove("on");
  setTimeout(() => location.reload(), 700);
};
if (!s.backup || typeof s.backup !== "object") s.backup = { since: new Date().toISOString() };
render();
