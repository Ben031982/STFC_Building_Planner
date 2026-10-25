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
      title: "Export einlesen",
      done: !!ls,
      doneTxt: s.snapshots.length + " Snapshot" + (s.snapshots.length === 1 ? "" : "s") + " vorhanden",
      txt: "In Spock's Club synchronisieren, dann unter Syncing › Export Data mindestens Buildings und Resources als JSON herunterladen.",
      btn: "Neue Exporte einlesen",
    },
    {
      key: "plan",
      title: "Zielplan aktiv",
      done: !!active,
      doneTxt: active ? active.name + " ist bestätigt" : "",
      txt: s.plans.length
        ? "Upgrade-Plan importieren und unter „Plandaten verwalten“ bestätigen."
        : "Ziel im Spock's-Upgrade-Planer anlegen (nur ein Item), Plan anlegen und die drei Texte importieren.",
      btn: s.plans.length ? "Plandaten verwalten" : "+ Ersten Plan anlegen",
      planId: firstOpen && firstOpen.id,
    },
    {
      key: "pack",
      title: "Stationspack eintragen",
      done: !packEmpty(),
      doneTxt: "Inhalt gepflegt",
      txt: "Der Inhalt hängt von deiner OPS-Stufe ab. Nötig für „Packs bis zum Ziel“ und den Pack-Effekt.",
      btn: "Stationspack pflegen",
    },
    {
      key: "backup",
      title: "Backup-Ordner wählen",
      done: !!(s.backup && s.backup.lastAt),
      doneTxt: "Letztes Backup " + (s.backup && s.backup.lastAt ? fdt(s.backup.lastAt) : ""),
      txt: "Einmal speichern und Ordner wählen – danach sichert der Planner nach jedem Import automatisch.",
      btn: "Backup jetzt speichern",
    },
    {
      key: "fc",
      title: "Prognose",
      done: fcOk,
      doneTxt: "Fertigstellungsdatum wird berechnet",
      txt: !active
        ? "Kommt, sobald ein Plan aktiv ist und genug Exporte vorliegen."
        : "Noch " + missN + " Abschnitt" + (missN === 1 ? "" : "e") + ": an verschiedenen Tagen exportieren (je mindestens 24 Stunden Abstand).",
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
    `<div class="setupHead"><h3>${fresh ? "Willkommen – so startest du" : "Einrichtung"}</h3><span class="prog"><i style="width:${Math.round((100 * n) / steps.length)}%"></i></span><span class="muted">${n} von ${steps.length} erledigt</span><button class="miniBtn" data-setup="tut">Einführung ansehen</button>${
      setupAsk
        ? '<span class="setupAsk">Ausblenden:<button class="miniBtn" data-setup="hide-once">bis zum nächsten Öffnen</button><button class="miniBtn" data-setup="hide-forever">dauerhaft</button><button class="miniBtn" data-setup="hide-cancel">Abbrechen</button></span>'
        : '<button class="miniBtn" data-setup="hide">Ausblenden</button>'
    }</div>` +
    `<div class="setupSteps">` +
    steps
      .map(
        (x) =>
          `<div class="sStep ${x.done ? "done" : "open"}${x === next ? " next" : ""}"><b>${x.title}</b><span class="muted">${escAttr(x.done ? x.doneTxt : x.txt)}</span>${!x.done && x.btn ? `<button class="miniBtn" id="setup-${x.key}" data-setup="${x.key}">${x.btn}</button>` : ""}</div>`,
      )
      .join("") +
    `</div>` +
    (fresh ? `<p class="muted setupFoot">Ausführlich mit Bildern: Userguide <b>STFC_Planner_Userguide.pdf</b>.</p>` : "");
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
          toast("Einrichtung ausgeblendet. Unter Daten & Import kannst du sie wieder einblenden.");
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
  engpass:
    "<b>Engpass</b> ist das Material, das bei deinem Einkommen zuletzt gedeckt ist. Es bestimmt, wann du fertig bist – nicht unbedingt das Material, von dem absolut am meisten fehlt. 7★ Common zählt nicht, weil es per Latinum kaufbar ist.",
  qualitaet:
    "<b>Prognose-Qualität</b> sagt, wie belastbar das Datum ist. Gezählt werden die Abschnitte der letzten 6 Wochen. Vorläufig: unter 6 Abschnitten oder 14 Tagen. Brauchbar: ab 6 Abschnitten über 14 Tage. Stabil: ab 10 Abschnitten über 28 Tage.",
  abschnitt:
    "<b>Abschnitt</b> ist die Zeit zwischen zwei Exporten mit mindestens 24 Stunden Abstand. Daraus ergibt sich dein Tageseinkommen je Material. Abschnitte mit einem Pack oder einem Bau werden markiert und nicht mitgerechnet.",
  snapshot:
    "<b>Snapshot</b> ist ein eingelesener Spock's-Export: dein Ressourcenstand und deine Gebäudestufen zu einem Zeitpunkt. Aus mehreren Snapshots berechnet der Planner dein Einkommen.",
  hauptplan:
    "<b>Zielplan</b> ist ein Ziel aus dem Spock's-Upgrade-Planer, zum Beispiel Operations 76. Der erste Plan ist der <b>Hauptplan</b>; der Wochenbericht bezieht sich auf ihn.",
  status:
    "<b>Entwurf</b>: noch keine Plandaten. <b>Unvollständig</b>: es fehlen Teile. <b>Prüfbereit</b>: alles da, bitte bestätigen. <b>Aktiv</b>: bestätigt, wird berechnet. <b>Veraltet</b>: ein Bau ist erledigt oder das Ziel passt nicht mehr – bitte neu importieren.",
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
