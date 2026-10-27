let managingPlanId = null;
function openDraft() {
  if (!$("draftArt").options.length) $("draftArt").innerHTML = artOptions();
  $("draftArt").value = "auto";
  autoArtLabel($("draftArt"), { name: "" });
  $("draftName").oninput = () => autoArtLabel($("draftArt"), { name: $("draftName").value });
  $("draftName").value = "";
  $("draftStart").value = "";
  $("draftTarget").value = "";
  if (typeof shipDraftReset === "function") shipDraftReset();
  $("newPlanModal").classList.add("on");
}
function closeDraft() {
  $("newPlanModal").classList.remove("on");
}
$("newPlanBtn").onclick = openDraft;
$("cancelDraft").onclick = closeDraft;
$("saveDraft").onclick = () => {
  if (typeof shipDraftSave === "function" && shipDraftSave()) return;
  let name = $("draftName").value.trim(),
    start = +$("draftStart").value,
    target = +$("draftTarget").value;
  if (!name || !Number.isFinite(target) || target < 1 || start < 0 || target <= start) {
    alert("Bitte Planname und eine gültige Levelspanne eingeben.");
    return;
  }
  let id = "plan-" + Date.now();
  s.plans.push({
    id,
    name,
    kind: "auto",
    art: $("draftArt").value || "auto",
    start,
    target,
    done: 0,
    total: 1,
    isMain: !s.plans.length,
    sources: [],
    planData: null,
    confirmation: null,
  });
  s.active = id;
  s.logs.push("Zielplan als Entwurf angelegt: " + name);
  closeDraft();
  save();
};
function openManage() {
  let p = s.plans.find((x) => x.id === s.active);
  managingPlanId = p.id;
  $("manageTitle").textContent = "Plandaten: " + p.name;
  fillManage(p);
  $("planDataModal").classList.add("on");
}
function fillManage(p) {
  p.status = calcPlanStatus(p);
  $("editPlanName").value = p.name;
  if (!$("editPlanArt").options.length) $("editPlanArt").innerHTML = artOptions();
  $("editPlanArt").value = p.art && ART[p.art] ? p.art : "auto";
  autoArtLabel($("editPlanArt"), { name: p.name, planData: p.planData });
  $("editPlanName").oninput = () =>
    autoArtLabel($("editPlanArt"), { name: $("editPlanName").value, planData: p.planData });
  $("editPlanStart").value = p.start;
  $("editPlanTarget").value = p.target;
  $("editMainPlan").checked = !!p.isMain;
  $("deletePlanBtn").disabled = !!p.isMain;
  $("deletePlanBtn").title = p.isMain ? "Hauptplan kann nicht gelöscht werden" : "";
  $("manageStatus").textContent = statusLabel(p.status);
  $("manageStatus").className = "statusBadge status-" + p.status;
  const ck = planChecks(p),
    pt = (p.planData || {}).target;
  ck.confirmed = !!p.confirmation && ck.confirmationValid;
  let fields = [
    ["target", "Zielgebäude und Ziellevel"],
    ["requiredBuildings", "Pflichtgebäude"],
    ["resourceCosts", "Ressourcenbedarf"],
    ["buildTime", "Bauzeit"],
    ["efficiencies", "Effizienzen"],
    ["confirmed", "Manuell bestätigt"],
  ];
  $("validationGrid").innerHTML = fields
    .map(([k, l]) => {
      const bad = k === "target" && ck.targetMismatch;
      return `<div class="checkCard ${ck[k] ? "ok" : "missing"}"><b>${ck[k] ? "✓" : "!"} ${l}</b><span>${ck[k] ? "vorhanden" : bad ? "passt nicht zum Ziel" : "fehlt"}</span></div>`;
    })
    .join("");
  $("activationLock").textContent =
    {
      active:
        "Alle Pflichtdaten liegen vor und sind bestätigt. Der Zielplan ist für Berechnungen freigegeben.",
      review: "Alle Plandaten liegen vor. Bitte prüfen und unten bestätigen.",
      stale:
        "Veraltet: Die importierten Plandaten gehören zu " +
        (pt ? escAttr(pt.building) + " " + pt.start + " → " + pt.target : "einem anderen Stand") +
        ", das Ziel ist jetzt " +
        p.start +
        " → " +
        p.target +
        ". Bitte den Upgrade-Plan für das aktuelle Ziel neu importieren.",
      incomplete:
        "Aktivierung gesperrt: Es fehlen noch Plandaten (siehe oben). Bitte den Upgrade-Plan vollständig importieren.",
      draft: "Aktivierung gesperrt: Noch keine Plandaten. Bitte den Upgrade-Plan importieren.",
    }[p.status] || "";
  $("sourceList").innerHTML = (p.sources || []).length
    ? p.sources
        .map(
          (x) =>
            `<div class="sourceItem"><b>${escAttr(x.name)}</b><br><span class="muted">${x.role === "text-import" ? "Textimport" : escAttr(x.type)} · ${new Date(x.addedAt).toLocaleString("de-DE")}</span></div>`,
        )
        .join("")
    : '<div class="muted">Noch kein Import durchgeführt.</div>';
  $("vConfirmed").checked = p.status === "active";
  $("vConfirmed").disabled = !(p.status === "review" || p.status === "active");
}
$("managePlanBtn").onclick = () => {
  if (s.plans.length) openManage();
};
$("closeManage").onclick = () => $("planDataModal").classList.remove("on");
$("savePlanData").onclick = () => {
  let p = s.plans.find((x) => x.id === managingPlanId),
    newName = $("editPlanName").value.trim(),
    newKind = p.kind,
    newStart = +$("editPlanStart").value,
    newTarget = +$("editPlanTarget").value;
  if (!newName || newStart < 0 || newTarget <= newStart) {
    alert("Bitte einen gültigen Namen und eine gültige Levelspanne eingeben.");
    return;
  }
  const structural = p.kind !== newKind || p.start !== newStart || p.target !== newTarget,
    nameOnly = p.name !== newName && !structural,
    wasActive = calcPlanStatus(p) === "active";
  if ($("editMainPlan").checked && !p.isMain) {
    const i = s.plans.indexOf(p);
    s.plans.splice(i, 1);
    s.plans.unshift(p);
    s.plans.forEach((x, k) => (x.isMain = k === 0));
    s.logs.push("Hauptplan gewechselt: " + p.name);
  } else if (!$("editMainPlan").checked && p.isMain) {
    alert(
      "Ein Hauptplan kann nicht direkt abgewählt werden. Ziehe einen anderen Plan an die erste Stelle oder markiere ihn als Hauptplan.",
    );
    return;
  }
  const wantConfirm = $("vConfirmed").checked,
    before = calcPlanStatus(p);
  if (!structural && wantConfirm && !p.confirmation && before !== "review") {
    alert(
      "Bestätigen ist erst möglich, wenn alle Plandaten vollständig vorliegen und zum Ziel passen (Status „Prüfbereit“).",
    );
    return;
  }
  p.name = newName;
  p.kind = newKind;
  p.art = $("editPlanArt").value || "auto";
  p.start = newStart;
  p.target = newTarget;
  if (structural) {
    p.confirmation = null;
    p.status = calcPlanStatus(p);
    p.hasPlanData = false;
    s.logs.push("Zielstruktur geändert, Bestätigung zurückgesetzt: " + p.name);
  } else {
    if (wantConfirm && !p.confirmation)
      p.confirmation = {
        at: new Date().toISOString(),
        dataHash: planHash(p),
        start: p.start,
        target: p.target,
      };
    else if (!wantConfirm) p.confirmation = null;
    p.status = calcPlanStatus(p);
    p.hasPlanData = p.status === "active";
    s.logs.push(
      (nameOnly ? "Plan umbenannt: " : "Plandaten aktualisiert: ") +
        p.name +
        " (" +
        statusLabel(p.status) +
        ")",
    );
  }
  $("planDataModal").classList.remove("on");
  save();
};
$("deletePlanBtn").onclick = () => {
  let p = s.plans.find((x) => x.id === managingPlanId);
  if (!p) return;
  if (p.isMain) {
    alert("Der Hauptplan kann nicht gelöscht werden. Markiere zuerst einen anderen Plan als Hauptplan.");
    return;
  }
  if (
    !confirm(
      "Zielplan „" +
        p.name +
        "“ wirklich vollständig löschen? Importquellen und Plandaten dieses Ziels gehen verloren.",
    )
  )
    return;
  s.plans = s.plans.filter((x) => x.id !== p.id);
  s.active = s.plans.length ? (s.plans.find((x) => x.isMain) || s.plans[0]).id : null;
  s.logs.push("Zielplan gelöscht: " + p.name);
  $("planDataModal").classList.remove("on");
  save();
};
$("newPlanModal").onclick = (e) => {
  if (e.target === $("newPlanModal")) closeDraft();
};
$("planDataModal").onclick = (e) => {
  if (e.target === $("planDataModal")) $("planDataModal").classList.remove("on");
};
let ocrState = { buildings: [], resources: {}, construction: null, efficiencies: {} };
// Materialien des gerade bearbeiteten Plans (ab 3.0: Schiffe mit ihren Teilen)
function ocrMats() {
  const p = typeof managingPlanId !== "undefined" ? s.plans.find((x) => x.id === managingPlanId) : null;
  return planMaterials(p);
}
const escAttr = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;"),
  fx = (n) => Number(n).toLocaleString("de-DE");
function normResName(n) {
  return String(n || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function mapResourceName(n) {
  const k = normResName(n);
  if (k === "parsteel") return "Σ-Parsteel";
  if (k === "tritanium") return "Σ-Tritanium";
  if (k === "dilithium") return "Σ-Dilithium";
  if (k === "construction time") return "CONSTRUCTION";
  // ab 3.0: Schiffe – Tier-Up- und Schiffsbauzeit werden bewusst nicht berücksichtigt
  if (k === "tier up time" || k === "ship construction time") return "IGNORE";
  const sp = k.match(/^7 (common|uncommon|rare) (battleship|interceptor|explorer|survey) parts$/);
  if (sp) return "7★ " + sp[1][0].toUpperCase() + sp[1].slice(1) + " " + sp[2][0].toUpperCase() + sp[2].slice(1) + " Parts";
  const m = k.match(/^7 (common|uncommon|rare) refined (ore|gas|crystal)$/);
  return m
    ? "7★ " + m[1][0].toUpperCase() + m[1].slice(1) + " " + m[2][0].toUpperCase() + m[2].slice(1)
    : null;
}
function parseResourceTable(text) {
  const out = { rows: {}, construction: null, errors: [], warnings: [] };
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim());
  if (!lines.length) {
    out.errors.push("Kein Text vorhanden.");
    return out;
  }
  const split = (l) => (l.includes("\t") ? l.split("\t").map((c) => c.trim()) : l.trim().split(/\s{2,}/));
  const hi = lines.findIndex((l) => {
    const k = normResName(l);
    return k.startsWith("resource") && k.includes("needed");
  });
  if (hi < 0) {
    out.errors.push(
      "Kopfzeile „Resource / Base Cost / Cost / On Hand / Needed“ nicht gefunden. Bitte in Spock's Club bei „Total resources“ auf „Copy“ klicken und den Text komplett einfügen.",
    );
    return out;
  }
  const head = split(lines[hi]).map(normResName);
  const col = {
    base: head.indexOf("base cost"),
    cost: head.indexOf("cost"),
    onHand: head.indexOf("on hand"),
    needed: head.indexOf("needed"),
  };
  const missing = Object.entries(col)
    .filter(([, v]) => v < 0)
    .map(([k]) => k);
  if (missing.length) {
    out.errors.push(
      "Spalten in der Kopfzeile nicht gefunden: " +
        missing.join(", ") +
        ". Der Text muss tabulatorgetrennt sein (Copy-Button).",
    );
    return out;
  }
  for (const l of lines.slice(hi + 1)) {
    const c = split(l),
      name = c[0],
      key = mapResourceName(name);
    if (!key) {
      out.warnings.push("Unbekannte Zeile ignoriert: " + String(l).slice(0, 40));
      continue;
    }
    if (key === "IGNORE") continue;
    const nums = {};
    let bad = false;
    for (const f of ["base", "cost", "onHand", "needed"]) {
      const t = String(c[col[f]] == null ? "" : c[col[f]]).replace(/\s/g, "");
      if (!/^\d+$/.test(t) || !Number.isSafeInteger(+t)) {
        bad = true;
        break;
      }
      nums[f] = +t;
    }
    if (bad) {
      out.errors.push(name + ": Zahlen nicht lesbar (erwartet: ganze Zahlen ohne Trennzeichen).");
      continue;
    }
    if (key === "CONSTRUCTION") {
      out.construction = nums;
      continue;
    }
    if (out.rows[key]) out.warnings.push(key + ": doppelt vorhanden, letzter Wert zählt.");
    const calc = Math.max(0, nums.cost - nums.onHand);
    out.rows[key] = { ...nums, calc, consistent: calc === nums.needed };
    if (!out.rows[key].consistent)
      out.warnings.push(
        key +
          ": Needed (" +
          fx(nums.needed) +
          ") weicht von Cost − On Hand (" +
          fx(calc) +
          ") ab. Wert aus Spock's Club wird übernommen.",
      );
  }
  const absent = ocrMats().filter((n) => !out.rows[n]);
  out.absent = Object.keys(out.rows).length ? absent : [];
  if (!Object.keys(out.rows).length && !out.errors.length) out.errors.push("Keine Materialzeilen erkannt.");
  return out;
}
function applyResourcePaste() {
  const raw = $("resPasteText").value;
  if (!raw.trim()) {
    $("resPasteInfo").textContent = "";
    ocrState.resources = {};
    ocrState.construction = null;
    renderOcrTables();
    return;
  }
  const r = parseResourceTable(raw),
    n = Object.keys(r.rows).length,
    msg = [];
  if (n) {
    ocrState.resources = {};
    for (const [name, v] of Object.entries(r.rows))
      ocrState.resources[name] = {
        value: v.needed,
        confidence: v.consistent ? 100 : 70,
        cost: v.cost,
        onHand: v.onHand,
        base: v.base,
      };
    ocrState.construction = r.construction;
    const lsA = latestSnapshot();
    for (const name of r.absent) {
      const oh = lsA && lsA.values && isNum(lsA.values[name]) ? lsA.values[name] : 0;
      ocrState.resources[name] = { value: 0, confidence: 100, cost: 0, onHand: oh, base: 0, assumed: true };
    }
    if (!r.construction) {
      ocrState.construction = { base: 0, cost: 0, onHand: 0, needed: 0, assumed: true };
    }
    if (r.absent.length)
      msg.push("ℹ Nicht im Text, also kein Bedarf (gilt als erfüllt): " + r.absent.join(", ") + ".");
    if (!r.construction) msg.push("ℹ Keine Σ-Construction-Time-Zeile – Bauzeit gilt als erfüllt (0).");
    const dev = Object.values(r.rows).filter((v) => !v.consistent).length;
    msg.push(
      (dev ? "⚠ " : "✔ ") +
        n +
        " Material" +
        (n === 1 ? "" : "ien") +
        " aus dem Text übernommen" +
        (dev
          ? ", " + dev + " mit abweichendem Needed."
          : "; Needed stimmt überall mit Cost − On Hand überein."),
    );
    if (r.construction)
      msg.push(
        "Σ-Construction Time: Needed " +
          fx(r.construction.needed) +
          " s (Wert aus Spock's Club, wird nicht nachgerechnet).",
      );
    const last = latestSnapshot();
    if (last && last.values) {
      const diffs = [];
      let cmp = 0;
      for (const [name, v] of Object.entries(r.rows)) {
        if (last.values[name] === undefined) continue;
        cmp++;
        if (last.values[name] !== v.onHand)
          diffs.push(name + ": Text " + fx(v.onHand) + " / Snapshot " + fx(last.values[name]));
      }
      if (cmp) {
        const sevenDiff = diffs.filter((x) => x.startsWith("7★")),
          sigDiff = diffs.filter((x) => x.startsWith("Σ")),
          sigN = Object.keys(r.rows).filter((n) => n.startsWith("Σ") && last.values[n] !== undefined).length;
        if (sevenDiff.length)
          msg.push("⚠ On Hand weicht vom neuesten JSON-Snapshot ab (anderer Stand?):\n" + diffs.join("\n"));
        else {
          msg.push(
            "✔ On Hand der 7★-Materialien stimmt mit dem neuesten JSON-Snapshot überein (gleicher Stand).",
          );
          if (sigN)
            msg.push(
              sigDiff.length
                ? "⚠ Σ-Selbstkontrolle: Die aus dem JSON berechneten Σ-Werte weichen ab – Token-Zuordnung prüfen:\n" +
                    sigDiff.join("\n")
                : "✔ Σ-Selbstkontrolle: Die aus dem JSON berechneten Σ-Werte stimmen exakt mit Spock's Club überein.",
            );
        }
      }
    }
  } else {
    ocrState.resources = {};
    ocrState.construction = null;
  }
  $("resPasteInfo").textContent = [
    ...r.errors.map((e) => "✖ " + e),
    ...msg,
    ...r.warnings.map((w) => "⚠ " + w),
  ].join("\n");
  renderOcrTables();
}
function resetOcr() {
  ocrState = { buildings: [], resources: {}, construction: null, efficiencies: {} };
  ["upText", "resPasteText", "effText"].forEach((i) => ($(i).value = ""));
  ["upInfo", "resPasteInfo", "effInfo"].forEach((i) => ($(i).textContent = ""));
  ["ocrTargetName", "ocrStartLevel", "ocrTargetLevel"].forEach((i) => ($(i).value = ""));
  renderOcrTables();
}
function renderOcrTables() {
  $("ocrBuildings").innerHTML =
    ocrState.buildings
      .map(
        (b, i) =>
          `<div class="formGrid" style="margin-bottom:5px"><input data-bn="${i}" value="${escAttr(b.name)}" placeholder="Gebäude"><input data-bs="${i}" type="number" value="${b.start ?? ""}" placeholder="Aktuell"><input data-bt="${i}" type="number" value="${b.target ?? ""}" placeholder="Ziel"><button class="btn danger" data-br="${i}">×</button></div>`,
      )
      .join("") || '<div class="muted">Noch keine Pflichtgebäude erkannt.</div>';
  $("ocrBuildings")
    .querySelectorAll("[data-br]")
    .forEach(
      (x) =>
        (x.onclick = () => {
          ocrState.buildings.splice(+x.dataset.br, 1);
          renderOcrTables();
          renderImpSummary();
        }),
    );
  $("ocrResources").innerHTML = ocrMats().map((n) => {
    let r = ocrState.resources[n] || { value: "", confidence: 0 };
    return `<tr><td>${n}${r.cost !== undefined ? `<br><span class="muted">Cost ${fx(r.cost)} − OnHand ${fx(r.onHand)}</span>` : ""}</td><td><input data-rn="${n}" value="${r.value}"></td><td><div class="confidence"><i style="width:${r.confidence}%"></i></div>${r.confidence || 0}%</td></tr>`;
  }).join("");
}
const BUILDING_KIND = {
  shipyard: "ship",
  operations: "operations",
  refinery: "refinery",
  "r&d department": "research",
};
function parseUpgradesText(text) {
  const out = { buildings: [], errors: [], warnings: [], target: null };
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return out;
  const seen = new Set();
  for (const line of lines) {
    if (/^included upgrades\b/i.test(line) || /^plan items\b/i.test(line)) continue;
    let rest = line;
    const pm = line.match(/^([A-Za-z]+)\s*:\s*(.*)$/);
    if (pm) {
      if (pm[1].toLowerCase() !== "building") {
        out.warnings.push("Nicht unterstützter Eintrag übersprungen (" + pm[1] + "): " + line.slice(0, 45));
        continue;
      }
      rest = pm[2];
    }
    const m = rest.match(
      /^(.+?)[\s·•|:\-–—]*Level\s*(\d{1,3})\s*(?:→|->|=>|–|—|-)\s*(?:Level\s*)?(\d{1,3})(?:\s+([A-Za-z].*))?$/i,
    );
    if (!m) {
      out.warnings.push("Zeile nicht erkannt und ignoriert: " + line.slice(0, 45));
      continue;
    }
    const name = m[1].replace(/\s+/g, " ").trim(),
      start = +m[2],
      target = +m[3];
    if (!name || target <= start) {
      out.warnings.push("Ungültige Levelspanne ignoriert: " + line.slice(0, 45));
      continue;
    }
    const k = name.toLowerCase();
    if (seen.has(k)) {
      out.warnings.push(name + ": doppelt vorhanden, erste Zeile zählt.");
      continue;
    }
    seen.add(k);
    out.buildings.push({ name, start, target });
    if (m[4] && /cost counted under an earlier item/i.test(m[4]))
      out.sharedCount = (out.sharedCount || 0) + 1;
  }
  if (!out.buildings.length) {
    out.errors.push(
      "Keine Pflichtgebäude erkannt. Erwartet werden Zeilen wie „Building:Operations · Level 74 → 76“. Bitte den Bereich „Included upgrades“ komplett kopieren.",
    );
    return out;
  }
  if (out.sharedCount)
    out.warnings.unshift(
      "Achtung: Im Spock's-Planer sind mehrere Items (Zusatz „Cost counted under an earlier item“ bei " +
        out.sharedCount +
        " Gebäuden). „Total resources“ gilt dann für alle Items zusammen und passt nicht zu diesem Ziel. Bitte im Planer nur dieses eine Item anlegen und die Texte neu kopieren.",
    );
  // Ziel = Gebäude mit dem höchsten Ziellevel. Steht Operations mit auf diesem Level, ist es nur
  // Voraussetzung (kein Gebäude kann über dem OPS-Level liegen); das Ziel ist dann das andere Gebäude.
  const mx = Math.max(...out.buildings.map((x) => x.target)),
    tops = out.buildings.filter((x) => x.target === mx),
    other = tops.filter((x) => !/^operations$/i.test(x.name));
  out.targets = other.length ? other : tops;
  out.target = out.targets[0];
  if (out.targets.length > 1)
    out.warnings.push(
      "Mehrere mögliche Zielgebäude mit Ziellevel " +
        mx +
        " (" +
        out.targets.map((x) => x.name).join(", ") +
        "). Bitte das Ziel prüfen.",
    );
  return out;
}
// Bei mehreren möglichen Zielgebäuden das nehmen, das zum Plannamen passt (auch deutsche Namen).
function targetForPlan(p, cands) {
  const n = String(p.name).toLowerCase(),
    g = autoArt({ name: p.name });
  return (
    cands.find((c) => n.includes(c.name.toLowerCase())) ||
    cands.find((c) => ["academy", "research", "ship"].includes(g) && autoArt({ name: c.name }) === g) ||
    null
  );
}
function applyUpgradesPaste() {
  const raw = $("upText").value;
  if (!raw.trim()) {
    $("upInfo").textContent = "";
    ocrState.buildings = [];
    renderOcrTables();
    return;
  }
  const r = parseUpgradesText(raw),
    msg = [];
  if (r.buildings.length) {
    ocrState.buildings = r.buildings;
    const p = s.plans.find((x) => x.id === managingPlanId),
      tg = (r.targets.length > 1 && p && targetForPlan(p, r.targets)) || r.target;
    $("ocrTargetName").value = tg.name;
    $("ocrStartLevel").value = tg.start;
    $("ocrTargetLevel").value = tg.target;
    msg.push("✔ " + r.buildings.length + " Pflichtgebäude erkannt.");
    msg.push(
      "Ziel erkannt: " +
        tg.name +
        " " +
        tg.start +
        " → " +
        tg.target +
        " (Gebäude mit dem höchsten Ziellevel, bitte prüfen).",
    );
    if (!/^operations$/i.test(tg.name) && r.buildings.some((b) => /^operations$/i.test(b.name) && b.target === tg.target))
      msg.push("ℹ Operations " + tg.target + " steht auch in der Liste – das ist die Voraussetzung, nicht das Ziel.");
  } else ocrState.buildings = [];
  $("upInfo").textContent = [
    ...r.errors.map((e) => "✖ " + e),
    ...msg,
    ...r.warnings.map((w) => "⚠ " + w),
  ].join("\n");
  renderOcrTables();
}
function dedupeDouble(t) {
  const x = String(t || "").trim(),
    h = x.length / 2;
  return Number.isInteger(h) && h > 0 && x.slice(0, h) === x.slice(h) ? x.slice(0, h) : x;
}
function parsePercentDE(t) {
  const x = String(t).replace(/\s|%/g, "");
  if (!x) return { err: "leer" };
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) return { err: "englisches Zahlenformat" };
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(x) || /^\d+(,\d+)?$/.test(x)) {
    const v = +x.replace(/\./g, "").replace(",", ".");
    return Number.isFinite(v) ? { v } : { err: "nicht lesbar" };
  }
  return { err: "nicht lesbar" };
}
function parseEfficiencyTable(text) {
  const out = { rows: {}, errors: [], warnings: [] };
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim());
  if (!lines.length) return out;
  const split = (l) => (l.includes("\t") ? l.split("\t").map((c) => c.trim()) : l.trim().split(/\s{2,}/));
  let cur = null,
    english = false;
  const set = (key, cell) => {
    const p = parsePercentDE(cell);
    if (p.err) {
      if (p.err === "englisches Zahlenformat") english = true;
      else out.warnings.push(key + ": Effizienz „" + cell + "“ nicht lesbar.");
      return;
    }
    if (out.rows[key] !== undefined) out.warnings.push(key + ": doppelt vorhanden, letzter Wert zählt.");
    out.rows[key] = p.v;
  };
  for (const l of lines) {
    const c = split(l);
    const key0 = mapResourceName(dedupeDouble(c[0]));
    if (key0 === "IGNORE") {
      cur = "IGNORE"; // folgende Prozentzeile gehört zur Tier-Up-/Bauzeit und wird still übergangen
      continue;
    }
    if (key0) {
      cur = key0 === "CONSTRUCTION" ? "Σ-Construction Time" : key0;
      const pc = c.slice(1).find((x) => /%/.test(x));
      if (pc) set(cur, pc);
      continue;
    }
    if (/^[\d.,\s]+%$/.test(l.trim()) && cur === "IGNORE") {
      cur = null;
      continue;
    }
    if (/^[\d.,\s]+%$/.test(l.trim()) && cur) {
      set(cur, l.trim());
      cur = null;
      continue;
    }
    if (/^resource\b/i.test(l.trim()) || /^(item costs|cost efficienc)/i.test(l.trim())) continue;
    out.warnings.push("Zeile ignoriert: " + l.slice(0, 40));
  }
  if (english)
    out.errors.push(
      "Englisches Zahlenformat erkannt (z. B. „1,998 %“). Aktuell werden nur deutsche Zahlen unterstützt (z. B. „1.998 %“).",
    );
  if (!Object.keys(out.rows).length && !out.errors.length)
    out.errors.push(
      "Keine Effizienzzeilen erkannt. Erwartet wird die Tabelle „Item costs & efficiencies“ mit den Spalten Resource, Base Cost, Cost, Efficiency.",
    );
  return out;
}
const EFF_KEYS = EFF_ALL;
// Effizienzen des gerade bearbeiteten Plans (ab 3.0: Schiffe ohne Bauzeit, mit Teilen)
function ocrEffKeys() {
  const p = s.plans.find((x) => x.id === managingPlanId);
  return p ? planEffKeys(p) : EFF_KEYS;
}
function applyEffPaste() {
  const raw = $("effText").value;
  if (!raw.trim()) {
    $("effInfo").textContent = "";
    ocrState.efficiencies = {};
    renderEffTable();
    return;
  }
  const r = parseEfficiencyTable(raw),
    msg = [],
    n = Object.keys(r.rows).length;
  ocrState.efficiencies = r.errors.length ? {} : { ...r.rows };
  const missing = ocrEffKeys().filter((k) => r.rows[k] === undefined);
  if (!r.errors.length && n) {
    msg.push("✔ " + n + " Effizienz" + (n === 1 ? "" : "en") + " erkannt.");
    if (missing.length) {
      const nd = missing.filter((k) => {
          const r = ocrState.resources[k];
          return k === "Σ-Construction Time"
            ? !(ocrState.construction && ocrState.construction.cost === 0)
            : !(r && r.cost === 0);
        }),
        nn = missing.filter((k) => !nd.includes(k));
      if (nd.length) msg.push("Es fehlen: " + nd.join(", "));
      if (nn.length) msg.push("ℹ Ohne Bedarf, daher nicht nötig: " + nn.join(", "));
    }
  }
  $("effInfo").textContent = [
    ...r.errors.map((e) => "✖ " + e),
    ...msg,
    ...r.warnings.map((w) => "⚠ " + w),
  ].join("\n");
  renderEffTable();
}
function renderEffTable() {
  $("effRows").innerHTML = ocrEffKeys().map((k) => {
    const v = ocrState.efficiencies[k];
    return `<tr><td>${k}</td><td>${v === undefined ? '<span class="muted">–</span>' : fx(v) + " %"}</td></tr>`;
  }).join("");
}
function applyResourceStep() {
  applyResourcePaste();
}
$("openOcrBtn").onclick = openImport;
$("closeOcr").onclick = $("discardOcr").onclick = () => {
  $("ocrModal").classList.remove("on");
  resetOcr();
};
$("addOcrBuilding").onclick = () => {
  syncImportInputs();
  ocrState.buildings.push({ name: "", start: "", target: "" });
  renderOcrTables();
};
$("upText").addEventListener("input", applyUpgradesPaste);
$("parseResPaste").onclick = applyResourceStep;
$("resPasteText").addEventListener("input", applyResourceStep);
$("effText").addEventListener("input", applyEffPaste);
function syncImportInputs() {
  document.querySelectorAll("[data-bn]").forEach((x) => {
    let i = +x.dataset.bn;
    if (!ocrState.buildings[i]) return;
    ocrState.buildings[i].name = x.value;
    ocrState.buildings[i].start = +document.querySelector(`[data-bs="${i}"]`).value;
    ocrState.buildings[i].target = +document.querySelector(`[data-bt="${i}"]`).value;
  });
  document.querySelectorAll("[data-rn]").forEach((x) => {
    const t = String(x.value).replace(/\D/g, "");
    if (t !== "")
      ocrState.resources[x.dataset.rn] = { ...(ocrState.resources[x.dataset.rn] || {}), value: +t };
  });
}
// Der Planname bleibt, wie der User ihn vergeben hat. Nur eine Levelzahl am Ende, die zum bisherigen
// Ziellevel gehört, wird bei einem neuen Ziellevel mitgezogen ("Operations 75" -> "Operations 76").
function renameForTarget(p, newTarget) {
  const m = String(p.name).match(/^(.*?)(\d{1,3})\s*$/);
  return m && +m[2] === +p.target && +newTarget !== +p.target ? m[1] + newTarget : p.name;
}
function importDraft(p) {
  const blds = ocrState.buildings.filter((x) => x.name && x.target > x.start),
    hasRes = Object.keys(ocrState.resources).some(
      (k) => Number.isFinite(+ocrState.resources[k].value) && ocrState.resources[k].value !== "",
    ),
    hasEff = Object.keys(ocrState.efficiencies).length > 0;
  const name = $("ocrTargetName").value.trim(),
    start = +$("ocrStartLevel").value,
    target = +$("ocrTargetLevel").value,
    tOk = !!(blds.length && name && Number.isFinite(start) && Number.isFinite(target) && target > start);
  const pd = p.planData
    ? JSON.parse(JSON.stringify(p.planData))
    : {
        importedAt: null,
        target: null,
        requiredBuildings: [],
        resources: null,
        construction: null,
        efficiencies: null,
      };
  if (blds.length) delete pd.outdatedBy;
  if (blds.length) {
    pd.requiredBuildings = blds.map((b) => ({ name: b.name, start: b.start, target: b.target }));
    if (tOk) pd.target = { building: name, start, target };
  }
  if (hasRes) {
    pd.resources = {};
    for (const [k, v] of Object.entries(ocrState.resources)) {
      if (v.value === "" || !Number.isFinite(+v.value)) continue;
      const r = { needed: +v.value };
      if (Number.isFinite(v.cost)) r.cost = v.cost;
      if (Number.isFinite(v.onHand)) r.onHand = v.onHand;
      if (Number.isFinite(v.base)) r.base = v.base;
      pd.resources[k] = r;
    }
  }
  if (ocrState.construction) pd.construction = { ...ocrState.construction };
  if (hasEff) pd.efficiencies = { ...ocrState.efficiencies };
  const bl0 = getBaseline(p),
    same = !!(
      tOk &&
      bl0 &&
      bl0.building &&
      String(bl0.building).toLowerCase() === name.toLowerCase() &&
      bl0.target === target &&
      start >= p.start &&
      p.target === target
    );
  if (blds.length) {
    if (same) {
      const nb = bl0.buildings.map((x) => ({ ...x }));
      for (const b of blds)
        if (!nb.some((x) => x.name.toLowerCase() === b.name.toLowerCase()))
          nb.push({ name: b.name, start: b.start, target: b.target });
      pd.baseline = { ...bl0, buildings: nb };
    } else if (tOk) {
      pd.baseline = {
        at: new Date().toISOString(),
        building: name,
        start,
        target,
        buildings: blds.map((b) => ({ name: b.name, start: b.start, target: b.target })),
      };
      pd.customOrder = null;
    }
  }
  return {
    empty: !blds.length && !hasRes && !ocrState.construction && !hasEff,
    planData: pd,
    name: tOk && !same ? renameForTarget(p, target) : p.name,
    start: tOk && !same ? start : p.start,
    target: tOk ? target : p.target,
    kind: (tOk && BUILDING_KIND[name.toLowerCase()]) || p.kind,
    blds,
    hasRes,
    hasEff,
    tOk,
    same,
  };
}
$("applyOcr").onclick = () => {
  let p = s.plans.find((x) => x.id === managingPlanId);
  if (!p) {
    alert("Kein Zielplan ausgewählt.");
    return;
  }
  syncImportInputs();
  const d = importDraft(p);
  if (d.empty) {
    alert("Es gibt noch nichts zu übernehmen. Bitte mindestens einen Text einfügen.");
    return;
  }
  const oldReq = ((p.planData || {}).requiredBuildings || [])
    .map((b) => ({ ...b }))
    .concat(((getBaseline(p) || {}).buildings || []).map((b) => ({ ...b })));
  const oc = importOutcome(p, d),
    prevConf = p.confirmation,
    oldPoint =
      p.planData && !Array.isArray(p.planData.history) && p.planData.resources && p.planData.importedAt
        ? makeHistPoint(p, "Import", p.planData.importedAt, true, true)
        : null,
    newBase = !!(d.blds.length && d.tOk && !d.same);
  p.name = d.name;
  p.start = d.start;
  p.target = d.target;
  p.kind = d.kind;
  p.planData = d.planData;
  p.planData.importedAt = new Date().toISOString();
  if (d.blds.length) {
    delete p.planData.outdatedBy;
    propagateDone(p, oc.sameTarget ? oldReq : [], d.blds);
  }
  p.confirmation = oc.keepConfirm
    ? {
        ...prevConf,
        dataHash: planHash(p),
        start: p.start,
        target: p.target,
        updatedAt: new Date().toISOString(),
      }
    : null;
  if (oc.keepConfirm) {
    const pr = planProgress(p);
    s.logs.push("Fortschreibung: " + p.name + " – " + pr.done + " von " + pr.total + " Stufen erledigt");
  }
  {
    const pd = p.planData;
    if (newBase || !Array.isArray(pd.history)) {
      pd.history = [];
      if (!newBase && oldPoint) pd.history.push(oldPoint);
    }
    pd.history.push(
      makeHistPoint(
        p,
        oc.keepConfirm ? "Fortschreibung" : newBase ? "Ausgangsstand" : "Import",
        pd.importedAt,
        d.hasRes,
        !!ocrState.construction,
      ),
    );
  }
  p.sources.push({
    id: "src-" + Date.now(),
    name: "Upgrade-Planer-Textimport",
    type: "text",
    addedAt: new Date().toISOString(),
    size: ($("upText").value + $("resPasteText").value + $("effText").value).length,
    role: "text-import",
  });
  p.status = calcPlanStatus(p);
  p.hasPlanData = false;
  s.logs.push("Upgrade-Plan importiert (" + statusLabel(p.status) + "): " + p.name);
  $("ocrModal").classList.remove("on");
  resetOcr();
  fillManage(p);
  save();
};
