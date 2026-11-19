// Update-Assistent (ab 1.2)
// Leiste „N Pläne brauchen ein Update“ in der Übersicht und unter Daten & Import. Ein Klick öffnet für
// jeden betroffenen Plan nacheinander den gewohnten Import-Assistenten (drei Schritte).

let updQueue = null; // { ids, pos, inWizard, awaitManage }

function plansNeedingUpdate() {
  return s.plans.filter((p) => p.planData && (isOutdated(p) || calcPlanStatus(p) === "stale"));
}

function renderUpdateBars() {
  const list = plansNeedingUpdate();
  for (const id of ["updBar", "impUpdBar"]) {
    const el = $(id);
    if (!el) continue;
    if (!list.length) {
      el.hidden = true;
      el.innerHTML = "";
      continue;
    }
    el.hidden = false;
    el.innerHTML =
      `<span><b>${list.length === 1 ? _t("upd.braucht1") : _t("upd.braucht", { n: list.length })}</b> ` +
      list.map((p) => escAttr(p.name)).join(", ") +
      `</span><button class="btn" data-upd="1">${list.length === 1 ? _t("upd.jetzt") : _t("upd.nacheinander")}</button>`;
    el.querySelector("[data-upd]").onclick = () => updStart(list.map((p) => p.id));
  }
}

function updStart(ids) {
  updQueue = { ids, pos: 0 };
  updOpen();
}

function updOpen() {
  const p = s.plans.find((x) => x.id === updQueue.ids[updQueue.pos]);
  if (!p) return updNext();
  s.active = p.id;
  render();
  openManage();
  openImport();
  $("impQueue").textContent = _t("upd.von", { a: updQueue.pos + 1, b: updQueue.ids.length });
  $("impQueue").hidden = false;
  $("impSkip").hidden = updQueue.ids.length < 2;
  updQueue.inWizard = true;
}

function updClear() {
  $("impQueue").hidden = true;
  $("impSkip").hidden = true;
}

function updNext() {
  const q = updQueue;
  updQueue = null;
  updClear();
  if (!q) return;
  // Pläne, die inzwischen kein Update mehr brauchen, überspringen
  const need = new Set(plansNeedingUpdate().map((p) => p.id));
  let pos = q.pos + 1;
  while (pos < q.ids.length && !need.has(q.ids[pos])) pos++;
  $("planDataModal").classList.remove("on");
  if (pos < q.ids.length) {
    updQueue = { ids: q.ids, pos };
    updOpen();
  } else
    toast(
      need.size
        ? _t(need.size === 1 ? "upd.beendet_offen1" : "upd.beendet_offen", { n: need.size })
        : _t("upd.alle"),
    );
}

// Übernommen: aktiv -> weiter; sonst erst im Plandialog bestätigen, danach weiter
$("applyOcr").addEventListener("click", () => {
  if (!updQueue || !updQueue.inWizard || $("ocrModal").classList.contains("on")) return;
  updQueue.inWizard = false;
  updClear();
  const p = s.plans.find((x) => x.id === managingPlanId);
  if (p && calcPlanStatus(p) === "active") {
    toast(_t("upd.aktiv", { name: p.name }));
    updNext();
  } else {
    updQueue.awaitManage = true;
    toast(_t("upd.uebernommen", { name: p ? p.name : _t("iw.sum_plan") }));
  }
});
const updManageClosed = () => {
  if (updQueue && updQueue.awaitManage && !$("planDataModal").classList.contains("on")) updNext();
};
["savePlanData", "closeManage"].forEach((id) => $(id).addEventListener("click", updManageClosed));
$("planDataModal").addEventListener("click", updManageClosed);

// Schließen oder Verwerfen beendet den Assistenten
const updStop = () => {
  if (!updQueue || !updQueue.inWizard || $("ocrModal").classList.contains("on")) return;
  updQueue = null;
  updClear();
  toast(_t("upd.beendet"));
};
["closeOcr", "discardOcr"].forEach((id) => $(id).addEventListener("click", updStop));
$("ocrModal").addEventListener("click", updStop);

$("impSkip").onclick = () => {
  if (!updQueue) return;
  updQueue.inWizard = false;
  $("ocrModal").classList.remove("on");
  resetOcr();
  updNext();
};
