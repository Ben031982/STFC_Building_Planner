const ART = {
  operations: asset("img/operations.webp"),
  academy: asset("img/academy.webp"),
  research: asset("img/research.webp"),
  ship: asset("img/ship.webp"),
  defense: asset("img/defense.webp"),
  dock: asset("img/dock.webp"),
  gen: asset("img/gen.webp"),
  std: asset("img/std.webp"),
  // ab 3.0: Schiffsklassen (Bens eigene Grafiken)
  ship_battleship: asset("img/ship-battleship.webp"),
  ship_interceptor: asset("img/ship-interceptor.webp"),
  ship_explorer: asset("img/ship-explorer.webp"),
  ship_survey: asset("img/ship-survey.webp"),
};
const ART_LAB = {
  operations: "Operations",
  academy: "Academy",
  research: "R&D Department",
  ship: "Shipyard / Schiffswerft",
  defense: "Verteidigung (Defense Platforms u. a.)",
  dock: "Dock",
  gen: "Generator / Warehouse / Vault",
  std: "Standard (z. B. Refinery)",
};
function artKey(p) {
  if (isShip(p)) return "ship_" + (SHIP_CLASSES[p.ship.cls] ? p.ship.cls : "explorer");
  return p && p.art && p.art !== "auto" && ART[p.art] ? p.art : autoArt(p);
}
function artOptions() {
  return (
    '<option value="auto">Automatisch</option>' +
    Object.keys(ART_LAB)
      .map((k) => `<option value="${k}">${ART_LAB[k]}</option>`)
      .join("")
  );
}
function autoArtLabel(sel, p) {
  const o = sel && sel.querySelector("option[value=auto]");
  if (o) o.textContent = "Automatisch (erkannt: " + ART_LAB[autoArt(p)] + ")";
}
function autoArt(p) {
  const n = String(
    (p && p.planData && p.planData.target && p.planData.target.building) ||
      ((p && p.name) || "").replace(/\s*\d+\s*$/, ""),
  ).trim();
  return /^Operations$/i.test(n)
    ? "operations"
    : /^Academy|Akademie/i.test(n)
      ? "academy"
      : /^R&D|Research|Forschung/i.test(n)
        ? "research"
        : /^Shipyard|Schiffswerft/i.test(n)
          ? "ship"
          : /Defen[cs]e|Verteidigung/i.test(n)
            ? "defense"
            : /Dock/i.test(n)
              ? "dock"
              : /Generator|Warehouse|Vault|Lager|Tresor/i.test(n)
                ? "gen"
                : "std";
}
const IDS = {
    "7★ Common Ore": 907476275,
    "7★ Common Gas": 1037355501,
    "7★ Common Crystal": 2797655340,
    "7★ Uncommon Ore": 3816701685,
    "7★ Uncommon Gas": 3867315800,
    "7★ Uncommon Crystal": 1348542369,
    "7★ Rare Ore": 3342994272,
    "7★ Rare Gas": 2554075924,
    "7★ Rare Crystal": 592114938,
  },
  K = "bens-stfc";
const seed = { active: null, plans: [], snapshots: [], logs: [], resources: [], milestones: [] };
const MATERIALS = [
    "Σ-Parsteel",
    "Σ-Tritanium",
    "Σ-Dilithium",
    "7★ Common Ore",
    "7★ Common Gas",
    "7★ Common Crystal",
    "7★ Uncommon Ore",
    "7★ Uncommon Gas",
    "7★ Uncommon Crystal",
    "7★ Rare Ore",
    "7★ Rare Gas",
    "7★ Rare Crystal",
  ],
  EFF_ALL = MATERIALS.concat(["Σ-Construction Time"]),
  // ---- ab 3.0: Schiffe ----
  // Schiffsteile je Klasse; Nummern im Spock's-Export am 27.10.2026 mit Bens Daten exakt zugeordnet
  SHIP_CLASSES = {
    battleship: { label: "Kampfschiff", en: "Battleship" },
    interceptor: { label: "Abfangjäger", en: "Interceptor" },
    explorer: { label: "Forschungsschiff", en: "Explorer" },
    survey: { label: "Miner", en: "Survey" },
  },
  SHIP_PART_IDS = {
    "7★ Common Battleship Parts": 1859064055,
    "7★ Uncommon Battleship Parts": 4219900724,
    "7★ Rare Battleship Parts": 1647853662,
    "7★ Common Interceptor Parts": 3897580870,
    "7★ Uncommon Interceptor Parts": 4058791075,
    "7★ Rare Interceptor Parts": 3345814800,
    "7★ Common Explorer Parts": 1253396182,
    "7★ Uncommon Explorer Parts": 2726856885,
    "7★ Rare Explorer Parts": 432240759,
    "7★ Common Survey Parts": 3928665940,
    "7★ Uncommon Survey Parts": 669826007,
    "7★ Rare Survey Parts": 1821527673,
  },
  // G7-Schiffe laut Scopely-Help-Center, von Ben bestätigt (27.10.2026)
  SHIPS = [
    { key: "aphelion", name: "Aphelion", faction: "Neutral", cls: "survey", yard: 71, rarity: "Common" },
    { key: "socrates", name: "U.S.S. Socrates", faction: "Föderation", cls: "interceptor", yard: 73, rarity: "Uncommon" },
    { key: "boreth", name: "I.K.S. Boreth", faction: "Klingonen", cls: "battleship", yard: 73, rarity: "Uncommon" },
    { key: "praefortis", name: "Praefortis", faction: "Romulaner", cls: "explorer", yard: 73, rarity: "Uncommon" },
    { key: "stargazer", name: "U.S.S. Stargazer", faction: "Föderation", cls: "battleship", yard: 76, rarity: "Rare" },
    { key: "akvoh", name: "I.K.S. Ak'voh", faction: "Klingonen", cls: "explorer", yard: 76, rarity: "Rare" },
    { key: "snakehead", name: "Snakehead", faction: "Romulaner", cls: "interceptor", yard: 76, rarity: "Rare" },
    { key: "m414", name: "U.S.S. Enterprise M414", faction: "Föderation", cls: "explorer", yard: 80, rarity: "Epic" },
    { key: "grethor", name: "I.K.S. Gre'thor", faction: "Klingonen", cls: "interceptor", yard: 80, rarity: "Epic" },
    { key: "admonition", name: "Admonition", faction: "Romulaner", cls: "battleship", yard: 80, rarity: "Epic" },
  ],
  SHIPYARD_BUILDING_ID = 15, // Gebäudenummer der Schiffswerft im Export (von Ben über stfc.space bestätigt)
  // ab 3.4: Gebäudenummern im Spock's-Export → Namen wie in „Included upgrades“ (Liste von Ben, 27.10.2026,
  // gegen seinen Export und den Plan „Operations 76“ geprüft). Unbekannte Nummern bleiben unbekannt.
  BUILDING_NAMES = {
    0: "Operations",
    1: "Parsteel Generator A",
    2: "Parsteel Generator B",
    3: "Parsteel Generator C",
    4: "Parsteel Warehouse",
    5: "Tritanium Generator A",
    6: "Tritanium Generator B",
    7: "Tritanium Generator C",
    8: "Tritanium Warehouse",
    9: "Dilithium Generator A",
    10: "Dilithium Generator B",
    11: "Dilithium Generator C",
    12: "Dilithium Warehouse",
    13: "Treasury",
    14: "Engine Technology Lab",
    15: "Shipyard",
    16: "Ship Hangar",
    17: "Drydock A",
    18: "Drydock B",
    19: "Drydock C",
    20: "Drydock D",
    21: "Drydock E",
    22: "Drydock F",
    23: "Armada Control Center",
    24: "Academy",
    25: "R&D Department",
    26: "Astronautics Studio",
    27: "Armory",
    28: "Defense Technologies",
    29: "Science Lab",
    31: "Refinery",
    33: "Shuttle Bay",
    34: "Defense Platform A",
    35: "Defense Platform B",
    36: "Defense Platform C",
    37: "Defense Platform D",
    38: "Defense Platform E",
    39: "Defense Platform F",
    40: "Exocomp Factory",
    41: "Scrapyard",
    43: "Foundry",
    44: "Drydock G",
    45: "Drydock H",
    50: "Parsteel Generator D",
    51: "Parsteel Generator E",
    52: "Parsteel Generator F",
    53: "Parsteel Generator G",
    54: "Parsteel Generator H",
    55: "Parsteel Vault",
    56: "Tritanium Generator D",
    57: "Tritanium Generator E",
    58: "Tritanium Generator F",
    59: "Tritanium Generator G",
    60: "Tritanium Generator H",
    61: "Tritanium Vault",
    62: "Dilithium Generator D",
    63: "Dilithium Generator E",
    64: "Dilithium Generator F",
    65: "Dilithium Generator G",
    66: "Dilithium Generator H",
    67: "Dilithium Vault",
    69: "Holodeck",
    70: "Subspace Relay",
    71: "Command Center",
    72: "Mess Hall",
    73: "Artifact Gallery",
    75: "Court of Q",
    77: "The Facade",
    78: "The War Room",
    79: "District 56",
    80: "The Nova Squadron",
    81: "INDEPENDENT ARCHIVES",
    82: "DTI Headquarters",
    83: "Transogen Forge",
    84: "Recon Locus",
    85: "Outpost Control Center",
    86: "Signal Observatory",
    87: "Starfleet Academy: Remote Campus",
    88: "The Warp Dive Bar",
    89: "Continuum Consulate",
    95: "Iconian Hub",
    1000: "Assembly Chambers",
    1001: "Collisonal Plasma Harvester A",
    1002: "Collisonal Plasma Harvester B",
    1003: "Collisonal Plasma Harvester C",
    1004: "Collisional Plasma Vault A",
    1005: "Collisional Plasma Vault B",
    1006: "Magnetic Plasma Harvester A",
    1007: "Magnetic Plasma Harvester B",
    1008: "Magnetic Plasma Harvester C",
    1009: "Magnetic Plasma Vault A",
    1010: "Magnetic Plasma Vault B",
    1011: "Active Plasma Harvester A",
    1012: "Active Plasma Harvester B",
    1013: "Active Plasma Harvester C",
    1014: "Active Plasma Vault A",
    1015: "Active Plasma Vault B",
    1016: "Plasma Processor",
    1017: "Diplomatic Relations",
    1018: "Tactical Deck",
    1019: "Salvage Yard",
    1020: "Command Control",
    1021: "Shield Modulator",
    1022: "EPS Distributor A",
    1023: "EPS Distributor B",
    1024: "EPS Distributor C",
    1025: "Exographic Targeting Array A",
    1026: "Exographic Targeting Array B",
    1027: "Exographic Targeting Array C",
    1028: "Tachyon Detector",
  },
  SCHEMA = 137,
  LEGACY_KEYS = [
    "bens-stfc-v136",
    "bens-stfc-v135",
    "bens-stfc-v134",
    "bens-stfc-v133",
    "bens-stfc-v132",
    "bens-stfc-v131",
    "bens-stfc-v13",
    "bens-stfc-v121",
    "bens-stfc-v12",
    "bens-stfc-v112",
    "bens-stfc-v111",
    "bens-stfc-v11",
    "bens-stfc-v101",
  ];

// ---- ab 3.0: Hilfsfunktionen Schiffe ----
function isShip(p) {
  return !!(p && p.type === "ship" && p.ship);
}
function partMats(cls) {
  const en = SHIP_CLASSES[cls] ? SHIP_CLASSES[cls].en : null;
  return en ? ["Common", "Uncommon", "Rare"].map((r) => "7★ " + r + " " + en + " Parts") : [];
}
// Materialien eines Plans: Gebäude wie bisher, Schiffe zusätzlich die Teile ihrer Klasse
function planMaterials(p) {
  return isShip(p) ? MATERIALS.concat(partMats(p.ship.cls)) : MATERIALS;
}
// Per Latinum kaufbar und deshalb nicht prognoserelevant: nur 7★ Common Ore/Gas/Crystal (nicht die Schiffsteile)
function isLatinumMat(m) {
  return /^7★ Common (Ore|Gas|Crystal)$/.test(m);
}
// Alle verfolgten Materialien: Σ, 7★-Materialien und die Teile der Klassen, für die es Schiffspläne gibt
function trackedMats() {
  const parts = [];
  for (const q of (typeof s !== "undefined" && s && s.plans) || [])
    if (isShip(q)) for (const m of partMats(q.ship.cls)) if (!parts.includes(m)) parts.push(m);
  return ["Σ-Parsteel", "Σ-Tritanium", "Σ-Dilithium", ...Object.keys(IDS), ...parts];
}
function shipLabel(p) {
  if (!isShip(p)) return "";
  const c = SHIP_CLASSES[p.ship.cls];
  return (p.ship.build ? "Bau → Tier " + p.target : "Tier " + p.start + " → " + p.target) + (c ? " · " + c.label : "");
}
