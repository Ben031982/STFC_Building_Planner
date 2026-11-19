const TUT_KEY = "bens-stfc-tutorial",
  // ab 5.2: Texte in den Sprachdateien (tut.N.step/title/body)
  TUT = [1, 2, 3, 4, 5].map((n) => ["step", "title", "body"].map((k) => "tut." + n + "." + k));
let tutI = 0;
function tutRender() {
  const t = TUT[tutI];
  $("tutStep").textContent = _t(t[0]).toUpperCase();
  $("tutTitle").textContent = _t(t[1]);
  $("tutBody").innerHTML = _t(t[2]);
  $("tutDots").innerHTML = TUT.map((_, i) => '<i class="' + (i === tutI ? "on" : "") + '"></i>').join("");
  $("tutPrev").style.visibility = tutI ? "visible" : "hidden";
  $("tutNext").textContent = tutI === TUT.length - 1 ? _t("tut.los") : _t("tut.weiter");
  $("tutSkip").style.visibility = tutI === TUT.length - 1 ? "hidden" : "visible";
}
function tutOpen() {
  tutI = 0;
  tutRender();
  $("tutModal").classList.add("on");
  setTimeout(() => $("tutNext").focus(), 0);
}
function tutClose() {
  $("tutModal").classList.remove("on");
  try {
    localStorage.setItem(TUT_KEY, "1");
  } catch (_) {}
}
$("tutNext").onclick = () => {
  if (tutI < TUT.length - 1) {
    tutI++;
    tutRender();
  } else tutClose();
};
$("tutPrev").onclick = () => {
  if (tutI > 0) {
    tutI--;
    tutRender();
  }
};
$("tutSkip").onclick = tutClose;
$("ntut").onclick = tutOpen;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("tutModal").classList.contains("on")) tutClose();
});
(function () {
  let seen = false;
  try {
    seen = localStorage.getItem(TUT_KEY) === "1";
  } catch (_) {}
  if (!seen && !(s.snapshots || []).length) tutOpen();
})();
