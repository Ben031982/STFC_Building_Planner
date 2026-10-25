const ART = {
  operations: asset("img/operations.webp"),
  academy: asset("img/academy.webp"),
  research: asset("img/research.webp"),
  ship: asset("img/ship.webp"),
  defense: asset("img/defense.webp"),
  dock: asset("img/dock.webp"),
  gen: asset("img/gen.webp"),
  std: asset("img/std.webp"),
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
