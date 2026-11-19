// Einrichtung, Begriffserklärungen und automatische Exportsuche (ab 1.5)
// Achtung: render() läuft schon beim Laden (19-wiring) und ruft renderSetup() auf. Funktionen hier dürfen
// deshalb beim Rendern keine let/const-Variablen dieser Datei benutzen (sie wären noch nicht angelegt).

// ---------------------------------------------------------------- Einrichtungs-Karte

// "var" statt "let": wird schon beim ersten render() gelesen, bevor diese Datei ausgeführt ist.
var setupSessionHidden = false,
  setupAsk = false;
function setupHiddenNow() {
  return setupSessionHidden || s.setupHide === "forever";
}
function setupSteps() {
  const ls = latestSnapshot(),
    active = s.plans.find((p) => calcPlanStatus(p) === "active"),
    firstOpen = s.plans.find((p) => calcPlanStatus(p) !== "active"),
    fc = active ? planForecast(active) : null,
    fcOk = !!(fc && fc.overall && fc.overall.real != null),
    missN = fc && fc.overall ? Math.max(0, FC_MIN - (fc.overall.minN || 0)) : null;
  return [
    {
      key: "json",
      title: _t("su.json_title"),
      done: !!ls,
      doneTxt: _t(s.snapshots.length === 1 ? "su.snaps1" : "su.snaps", { n: s.snapshots.length }),
      txt: _t("su.json_txt"),
      btn: _t("care.neue_exporte"),
    },
    {
      key: "plan",
      title: _t("su.plan_title"),
      done: !!active,
      doneTxt: active ? _t("su.bestaetigt", { name: active.name }) : "",
      txt: s.plans.length
        ? _t("su.plan_txt1")
        : _t("su.plan_txt0"),
      btn: s.plans.length ? _t("care.plandaten_verwalten") : _t("su.plan_btn"),
      planId: firstOpen && firstOpen.id,
    },
    {
      key: "pack",
      title: _t("su.pack_title"),
      done: !packEmpty(),
      doneTxt: _t("su.pack_done"),
      txt: _t("su.pack_txt"),
      btn: _t("care.station_pflegen"),
    },
    {
      key: "backup",
      title: _t("su.bk_title"),
      done: !!(s.backup && s.backup.lastAt),
      doneTxt: _t("su.bk_done", { d: s.backup && s.backup.lastAt ? fdt(s.backup.lastAt) : "" }),
      txt: _t("su.bk_txt"),
      btn: _t("bk.jetzt_speichern"),
    },
    {
      key: "fc",
      title: _t("su.fc_title"),
      done: fcOk,
      doneTxt: _t("su.fc_done"),
      txt: !active
        ? _t("su.fc_inaktiv")
        : _t(missN === 1 ? "su.fc_noch1" : "su.fc_noch", { n: missN }),
    },
  ];
}

function renderSetup() {
  const el = $("setupCard");
  if (!el) return;
  const steps = setupSteps(),
    n = steps.filter((x) => x.done).length;
  if (n === steps.length || setupHiddenNow()) {
    el.hidden = true;
    el.innerHTML = "";
    renderSetupToggle();
    return;
  }
  const next = steps.find((x) => !x.done),
    fresh = !s.plans.length && !s.snapshots.length;
  el.hidden = false;
  renderSetupToggle();
  el.innerHTML =
    `<div class="setupHead"><h3>${fresh ? _t("su.willkommen") : _t("su.einrichtung")}</h3><span class="prog"><i style="width:${Math.round((100 * n) / steps.length)}%"></i></span><span class="muted">${_t("su.erledigt", { a: n, b: steps.length })}</span><button class="miniBtn" data-setup="tut">${_t("su.einfuehrung")}</button>${
      setupAsk
        ? `<span class="setupAsk">${_t("su.ausblenden")}:<button class="miniBtn" data-setup="hide-once">${_t("su.bis_naechstes")}</button><button class="miniBtn" data-setup="hide-forever">${_t("su.dauerhaft")}</button><button class="miniBtn" data-setup="hide-cancel">${_t("common.abbrechen")}</button></span>`
        : `<button class="miniBtn" data-setup="hide">${_t("su.ausblenden")}</button>`
    }</div>` +
    `<div class="setupSteps">` +
    steps
      .map(
        (x) =>
          `<div class="sStep ${x.done ? "done" : "open"}${x === next ? " next" : ""}"><b>${x.title}</b><span class="muted">${escAttr(x.done ? x.doneTxt : x.txt)}</span>${!x.done && x.btn ? `<button class="miniBtn" id="setup-${x.key}" data-setup="${x.key}">${x.btn}</button>` : ""}</div>`,
      )
      .join("") +
    `</div>` +
    (fresh ? `<p class="muted setupFoot">${_t("su.userguide")}</p>` : "");
  el.querySelectorAll("[data-setup]").forEach(
    (b) =>
      (b.onclick = () => {
        const a = b.dataset.setup;
        if (a === "hide" || a === "hide-cancel") {
          setupAsk = a === "hide";
          renderSetup();
        } else if (a === "hide-once") {
          setupAsk = false;
          setupSessionHidden = true;
          renderSetup();
          renderSetupToggle();
        } else if (a === "hide-forever") {
          setupAsk = false;
          s.setupHide = "forever";
          save();
          toast(_t("su.ausgeblendet"));
        } else if (a === "tut") tutOpen();
        else if (a === "json") {
          if (typeof window.showDirectoryPicker === "function") scanExports(false);
          else $("file").click();
        } else if (a === "plan") {
          const st = steps.find((x) => x.key === "plan");
          if (st.planId) {
            s.active = st.planId;
            render();
            openManage();
          } else openDraft();
        } else if (a === "pack") openPacks();
        else if (a === "backup") $("backup").click();
      }),
  );
}

// Knopf unter Daten & Import, solange die Einrichtung ausgeblendet und noch nicht fertig ist
function renderSetupToggle() {
  const b = $("setupShowBtn");
  if (!b) return;
  const open = setupSteps().some((x) => !x.done);
  b.hidden = !(open && setupHiddenNow());
  b.onclick = () => {
    setupSessionHidden = false;
    delete s.setupHide;
    save();
    $("nd").click();
  };
}

// ---------------------------------------------------------------- Begriffe erklärt

const TERMS = {
  get engpass() {
    return _t("term.engpass");
  },
  get qualitaet() {
    return _t("term.qualitaet");
  },
  get abschnitt() {
    return _t("term.abschnitt");
  },
  get datenquelle() {
    return _t("term.datenquelle");
  },
  get snapshot() {
    return _t("term.snapshot");
  },
  get hauptplan() {
    return _t("term.hauptplan");
  },
  get status() {
    return _t("term.status");
  },
};
function showTerm(el) {
  const t = TERMS[el.dataset.term];
  if (!t) return;
  let tip = $("termTip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "termTip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
  }
  tip.innerHTML = t;
  tip.classList.add("on");
  const r = el.getBoundingClientRect(),
    w = Math.min(320, window.innerWidth - 24);
  tip.style.width = w + "px";
  tip.style.left = Math.max(12, Math.min(r.left - 20, window.innerWidth - w - 12)) + "px";
  const below = r.bottom + 8 + tip.offsetHeight < window.innerHeight;
  tip.style.top = (below ? r.bottom + 8 : r.top - 8 - tip.offsetHeight) + "px";
}
function hideTerm() {
  const tip = $("termTip");
  if (tip) tip.classList.remove("on");
}
document.addEventListener("mouseover", (e) => {
  const el = e.target.closest && e.target.closest(".termInfo[data-term]");
  if (el) showTerm(el);
});
document.addEventListener("mouseout", (e) => {
  if (e.target.closest && e.target.closest(".termInfo[data-term]")) hideTerm();
});
document.addEventListener("focusin", (e) => {
  if (e.target.matches && e.target.matches(".termInfo[data-term]")) showTerm(e.target);
});
document.addEventListener("focusout", hideTerm);
document.addEventListener("click", (e) => {
  const el = e.target.closest && e.target.closest(".termInfo[data-term]");
  if (el) {
    e.stopPropagation();
    showTerm(el);
  } else hideTerm();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideTerm();
});

// ---------------------------------------------------------------- Exporte beim Öffnen suchen

// Nur wenn der Browser den Zugriff auf den Export-Ordner ohne Nachfrage erlaubt. Sonst bleibt es beim
// Knopf „Neue Exporte einlesen“. Ohne neue Exporte passiert nichts Sichtbares.
async function autoScanOnOpen() {
  if (typeof window.showDirectoryPicker !== "function" || !(s.exportScan && s.exportScan.folder)) return;
  try {
    const d = await expLoadDir();
    if (!d || !d.queryPermission || (await d.queryPermission({ mode: "read" })) !== "granted") return;
    await scanExports(false, true);
  } catch (_) {}
}
// ---------------------------------------------------------------- Bewegung (ab 1.6)

// Kennzahlen, die sich beim selben Plan ändern (z. B. nach einem Import), leuchten einmal kurz auf.
var flashPrev; // ohne Startwert: render() hat es beim Laden evtl. schon gesetzt
function flashChanged(p) {
  const ids = ["etaValue", "packsValue", "buildTimeValue", "pProg"],
    now = { plan: p && p.id, v: ids.map((id) => ($(id) ? $(id).textContent : "")) };
  if (flashPrev && flashPrev.plan === now.plan)
    ids.forEach((id, i) => {
      if (now.v[i] === flashPrev.v[i]) return;
      const e = $(id);
      e.classList.remove("flash");
      void e.offsetWidth;
      e.classList.add("flash");
    });
  flashPrev = now;
}
// Balken füllen sich nur beim Öffnen der Datei, nicht bei jedem Neuzeichnen
document.body.classList.add("firstPaint");
setTimeout(() => document.body.classList.remove("firstPaint"), 1500);

renderSetup();
autoScanOnOpen();
