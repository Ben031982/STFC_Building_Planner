// ab 5.2: Sprachen (Deutsch, Englisch, später Französisch/Spanisch).
// Achtung: läuft schon beim ersten render() – nur Funktionen (werden hochgezogen), keine Werte auf oberster Ebene.
// Die Wörterbücher stehen in 00-lang-*.js und werden beim ersten Zugriff zusammengesetzt.
var I18N_CACHE = null;
function I18N() {
  if (!I18N_CACHE) I18N_CACHE = { de: langDe(), en: langEn() };
  return I18N_CACHE;
}
// Sprachen, deren Texte vollständig sind (nur diese werden angeboten und automatisch gewählt)
function i18nReady() {
  const d = I18N();
  return Object.keys(d).filter((k) => d[k].meta && d[k].meta.complete);
}
// Browsersprache → erste vollständige Sprache aus navigator.languages; andere Sprachen → Englisch (falls fertig), sonst Deutsch
function i18nDetect() {
  const ready = i18nReady(),
    nav = (typeof navigator !== "undefined" && (navigator.languages || [navigator.language])) || [];
  for (const l of nav) {
    const p = String(l || "").toLowerCase().split("-")[0];
    if (ready.includes(p)) return p;
  }
  return ready.includes("en") ? "en" : "de";
}
// Gewählte Sprache: manuell (s.lang) oder automatisch
function curLang() {
  const v = typeof s !== "undefined" && s ? s.lang : null;
  return v && i18nReady().includes(v) ? v : i18nDetect();
}
// Gebietsschema für Datum und Zahlen
function LOC() {
  return I18N()[curLang()].meta.locale;
}
// Text zu einem Schlüssel; {name} wird durch vars.name ersetzt. Fehlt der Text, gilt Deutsch, dann der Schlüssel selbst.
function t(key, vars) {
  const d = I18N();
  let v = d[curLang()].t[key];
  if (v == null) v = d.de.t[key];
  if (v == null) v = key;
  return vars ? String(v).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : String(v);
}
// statische Texte in index.html: data-i18n (Textinhalt), data-i18n-html (Text mit Markup), data-i18n-title, data-i18n-ph (Platzhalter), data-i18n-aria
function applyLang() {
  document.documentElement.lang = curLang();
  document.querySelectorAll("[data-i18n]").forEach((e) => (e.textContent = t(e.dataset.i18n)));
  document.querySelectorAll("[data-i18n-html]").forEach((e) => (e.innerHTML = t(e.dataset.i18nHtml)));
  document.querySelectorAll("[data-i18n-aria]").forEach((e) => e.setAttribute("aria-label", t(e.dataset.i18nAria)));
  document.querySelectorAll("[data-i18n-title]").forEach((e) => (e.title = t(e.dataset.i18nTitle)));
  document.querySelectorAll("[data-i18n-ph]").forEach((e) => (e.placeholder = t(e.dataset.i18nPh)));
  const box = document.getElementById("langPanel");
  if (box) {
    box.style.display = i18nReady().length > 1 ? "" : "none";
    const sel = document.getElementById("langSel");
    if (sel) {
      sel.innerHTML =
        `<option value="">${t("lang.auto")}</option>` +
        i18nReady()
          .map((k) => `<option value="${k}">${I18N()[k].meta.name}</option>`)
          .join("");
      sel.value = s.lang && i18nReady().includes(s.lang) ? s.lang : "";
    }
  }
}
function setLang(l) {
  s.lang = l && i18nReady().includes(l) ? l : null;
  persist();
  applyLang();
  render();
}
