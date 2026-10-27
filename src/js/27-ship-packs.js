// Schiffs-Packs (ab 3.2): ein Pack je Schiffsklasse, Inhalt von Hand gepflegt (hängt von der OPS-Stufe ab).
// „Anderes Schiff“ hat bewusst keinen Pack (meist Spezialwährung).
// Achtung: läuft schon beim ersten render() bzw. in migrateState() – keine let/const/var-Werte auf oberster Ebene
// benutzen, nur Funktionen.

function shipPackNames() {
  return {
    battleship: "Ultra-Kampfschiffs-Machtpaket",
    interceptor: "Ultra-Abfangjäger-Machtpaket",
    explorer: "Ultra-Forschungsschiff-Machtpaket",
    survey: "Ultra-Vermessungsschiffsmachtpaket",
  };
}
// Startwerte: in der veröffentlichten Datei leer. Ein eigener Build (tools/build.py --seed) setzt hier Werte ein,
// die nur greifen, solange noch kein Schiffs-Pack gepflegt ist.
function shipPackSeed() {
  return /*@@SHIP_PACK_SEED@@*/ null;
}
function packEmptyOf(pk) {
  return !pk || !Object.values(pk.contents || {}).some((c) => c && +c.amount > 0);
}
// s.shipPacks auf die vier Klassen normalisieren (alte Daten, fehlende Felder)
function ensureShipPacks(st) {
  st = st || s;
  if (!st) return;
  const names = shipPackNames(),
    old = st.shipPacks && typeof st.shipPacks === "object" ? st.shipPacks : {},
    out = {};
  for (const cls of Object.keys(names)) {
    const o = old[cls] && typeof old[cls] === "object" ? old[cls] : {};
    out[cls] = {
      name: typeof o.name === "string" && o.name.trim() ? o.name : names[cls],
      priceEUR: Number.isFinite(+o.priceEUR) && o.priceEUR !== "" && o.priceEUR != null ? +o.priceEUR : 100,
      validFrom: typeof o.validFrom === "string" ? o.validFrom : "",
      contents: o.contents && typeof o.contents === "object" ? o.contents : {},
    };
  }
  const seed = shipPackSeed();
  if (seed && Object.values(out).every(packEmptyOf))
    for (const [cls, v] of Object.entries(seed))
      if (out[cls] && v && v.contents) out[cls] = Object.assign({}, out[cls], v, { contents: Object.assign({}, v.contents) });
  st.shipPacks = out;
}
// Materialien, die ein Schiffs-Pack erfasst: Σ-Tritanium, 7★ Materialien, 7★ Teile der Klasse
function shipPackMats(cls) {
  return ["Σ-Tritanium"]
    .concat(MATERIALS.filter((m) => /^7★ /.test(m)))
    .concat(
      partMats(cls)
        .slice()
        .reverse(),
    );
}
// Pack, mit dem ein Plan rechnet: Gebäude → Stationspack, Schiff → Pack seiner Klasse, „Anderes Schiff“ → keiner
function planPack(p) {
  if (!p) return null;
  if (!isShip(p)) return (s.packs || [])[0] || null;
  if (!p.ship || p.ship.key === "other") return null;
  if (!s.shipPacks || !s.shipPacks[p.ship.cls]) ensureShipPacks();
  return s.shipPacks[p.ship.cls] || null;
}
function packEmptyFor(p) {
  return packEmptyOf(planPack(p));
}
// Bezeichnung in Texten: „Stationspack“ bzw. der Name des Schiffs-Packs
function packLabel(p) {
  const pk = planPack(p);
  return isShip(p) && pk ? pk.name : "Stationspack";
}
function packPlural(name, n) {
  return n === 1 ? name : /paket$/i.test(name) ? name + "e" : name + "s";
}
// „inkl. Schiffswerft 76“, wenn ein aktiver Schiffswerft-Plan mitgerechnet wird
function packInclText(p) {
  const anc = typeof chainAncestors === "function" ? chainAncestors(p).filter((q) => calcPlanStatus(q) === "active") : [];
  return anc.length ? "inkl. " + anc.map((q) => q.name).join(", ") : "";
}
// Hinweis für Schiffe ohne nutzbaren Pack (null, wenn ein Pack gepflegt ist oder es kein Schiff ist)
function shipPackMissingText(p) {
  if (!isShip(p)) return null;
  if (!p.ship || p.ship.key === "other") return "Für „Anderes Schiff“ gibt es keinen Pack – hier zählt nur dein Einkommen.";
  if (packEmptyFor(p))
    return "Der Pack für " + SHIP_CLASSES[p.ship.cls].label + " ist noch nicht gepflegt (Daten & Import › Schiffs-Packs).";
  return null;
}
function openPackFor(p) {
  if (isShip(p) && p.ship && p.ship.key !== "other") openPacks(p.ship.cls);
  else openPacks();
}

// ---------------------------------------------------------------- Daten & Import: Schiffs-Packs
function renderShipPacks() {
  const el = $("shipPackRows");
  if (!el) return;
  ensureShipPacks();
  el.innerHTML = Object.entries(s.shipPacks)
    .map(([cls, pk]) => {
      const n = Object.values(pk.contents || {}).filter((c) => c && +c.amount > 0).length;
      return `<tr><td>${SHIP_CLASSES[cls].label}</td><td>${escAttr(pk.name)}</td><td>${
        n ? n + " Material" + (n === 1 ? "" : "ien") : '<span class="muted">noch nicht gepflegt</span>'
      }</td><td>${pk.validFrom ? new Date(pk.validFrom).toLocaleDateString("de-DE") : "–"}</td><td>${fx(pk.priceEUR)} €</td><td><button class="miniBtn" data-shippack="${cls}">Bearbeiten</button></td></tr>`;
    })
    .join("");
  el.querySelectorAll("[data-shippack]").forEach((b) => (b.onclick = () => openPacks(b.dataset.shippack)));
}
