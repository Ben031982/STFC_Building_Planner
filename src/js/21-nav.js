function navSync() {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  nav.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
  let id = null;
  if ($("impView").classList.contains("on") || $("snapView").classList.contains("on")) id = "ni";
  else if ($("wifView").classList.contains("on")) id = "nw";
  else if ($("wkView").classList.contains("on")) id = "nwk";
  else if (typeof dashTab !== "undefined" && dashTab && dashTab !== "ov") {
    const b = nav.querySelector('[data-tab="' + dashTab + '"]');
    if (b) b.classList.add("on");
  } else id = "nd";
  if (id) $(id).classList.add("on");
  const bk = s.backup || {};
  const due = !bk.lastAt || bkDue() > 14,
    full = !!storeError || storeWarn(),
    dot = $("navDataDot");
  dot.classList.toggle("on", due || full);
  dot.title = full ? "Browser-Speicher knapp" : "Backup fällig";
}
document.addEventListener("click", () => setTimeout(navSync, 0));
$("back").onclick = importPage;
["impBack", "wkBack", "wifBack"].forEach((i) => {
  const e = $(i);
  if (e) e.remove();
});
$("packEditBtn2").onclick = openPacks;
$("careJsonBtn").onclick = () => {
  if (typeof window.showDirectoryPicker === "function") scanExports(false);
  else $("file").click();
};
navSync();
