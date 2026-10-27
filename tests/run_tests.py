#!/usr/bin/env python3
"""Automatische Tests für Ben's G7 STFC Progress Planner.

    python tests/run_tests.py                  # baut zuerst (tools/build.py) und testet dist/…
    python tests/run_tests.py datei.html       # testet eine fertige Datei
    python tests/run_tests.py -k backup        # nur Tests, deren Name "backup" enthält

Voraussetzung: Python-Paket playwright mit Chromium
    pip install playwright && python -m playwright install chromium

Alle Testdaten sind erfunden (tests/fixtures/). Die Spock's-Exporte werden pro Lauf
aus den Material-IDs der getesteten Datei erzeugt.
"""
import argparse
import datetime as dt
import json
import pathlib
import subprocess
import sys
import tempfile
import traceback

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIX = ROOT / "tests" / "fixtures"
NOW = dt.datetime(2026, 10, 25, 9, 0, 0, tzinfo=dt.timezone.utc)
TESTS = []


def test(fn):
    TESTS.append(fn)
    return fn


class Fail(Exception):
    pass


def check(cond, msg):
    if not cond:
        raise Fail(msg)


def fixture(name):
    return (FIX / name).read_text(encoding="utf-8")


def combined_text():
    """Alle drei Spock's-Texte in einem Stück, absichtlich in anderer Reihenfolge und mit Fremdzeilen."""
    return "\n".join(["Upgrade Planner", "Total resources", "Copy", fixture("plan_resources.txt"), "",
                      fixture("plan_upgrades.txt"), "Some footer text", fixture("plan_efficiencies.txt"), "© Spock's"])


class App:
    """Eine Browser-Seite mit dem Planner, festem Datum und Fehlersammlung."""

    def __init__(self, browser, html, tmp, state=None, tutorial_seen=True, extra=None):
        # Feste Zeitzone, damit die Tests überall gleich laufen (lokal wie in der GitHub-Action)
        self.ctx = browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True,
                                       timezone_id="Europe/Berlin")
        self.p = self.ctx.new_page()
        self.p.set_default_timeout(5000)
        self.html, self.tmp, self.errors = html, tmp, []
        self.p.on("pageerror", lambda e: self.errors.append("Seitenfehler: " + str(e)))
        self.p.on("console", lambda m: m.type == "error" and self.errors.append("Konsole: " + m.text))
        self.p.on("dialog", lambda d: d.accept())
        self.p.clock.set_fixed_time(NOW.isoformat())
        seed = {"bens-stfc": json.dumps(state) if state is not None else None,
                "bens-stfc-tutorial": "1" if tutorial_seen else None}
        seed.update(extra or {})
        self.p.add_init_script(
            "(seed=>{if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','1');"
            "for(const [k,v] of Object.entries(seed)) if(v!==null) localStorage.setItem(k,v);})(" + json.dumps(seed) + ")"
        )
        self.p.goto(html.as_uri())
        self.p.wait_for_timeout(500)

    def __getattr__(self, name):
        return getattr(self.p, name)

    def js(self, expr, arg=None):
        return self.p.evaluate(expr, arg) if arg is not None else self.p.evaluate(expr)

    def close_modals(self):
        self.p.evaluate("document.querySelectorAll('.modal.on').forEach(m=>m.classList.remove('on'))")

    def has_class(self, sel, cls):
        return self.p.eval_on_selector(sel, "(e,c)=>e.classList.contains(c)", cls)

    def text(self, sel):
        return self.p.inner_text(sel)

    def make_exports(self, days=(10, 8, 6, 4, 2, 0)):
        """Erfundene Spock's-Exporte mit gleichmäßigem Einkommen erzeugen."""
        r = self.js("()=>({ids:IDS, sigma:Object.fromEntries(Object.entries(SIGMA).map(([k,v])=>[k,v.raw]))})")
        ids, sigma = r["ids"], r["sigma"]
        files = []
        for i, d in enumerate(sorted(days, reverse=True)):
            t = NOW - dt.timedelta(days=d, hours=1)
            age = days[0] - d  # Tage seit dem ersten Export
            res = [{"id": v, "amount": 20000 + 1500 * age + 37 * j} for j, v in enumerate(ids.values())]
            res += [{"id": v, "amount": 400_000_000 + 60_000_000 * age} for v in sigma.values()]
            data = {"buildings": [{"id": 0, "level": 75}, {"id": 1, "level": 74}], "resources": res}
            name = "spocksclub-data-export_" + t.strftime("%Y-%m-%dT%H-%M-%S") + "-000Z.json"
            f = self.tmp / name
            f.write_text(json.dumps(data), encoding="utf-8")
            files.append(str(f))
        return files

    def import_exports(self, files):
        self.p.set_input_files("#file", files)
        self.p.wait_for_selector("#batchModal.on", timeout=5000)
        self.p.click("#batchOk")
        self.p.wait_for_timeout(300)

    def create_plan(self, name="Operations 76", start="75", target="76"):
        self.p.click("#newPlanBtn")
        self.p.fill("#draftName", name)
        self.p.fill("#draftStart", start)
        self.p.fill("#draftTarget", target)
        self.p.click("#saveDraft")
        self.p.wait_for_timeout(200)

    def import_texts(self, up=None, res=None, eff=None):
        """Geführter Import-Assistent: drei Schritte nacheinander."""
        for field, text in (("#upText", up), ("#resPasteText", res), ("#effText", eff)):
            if text is not None:
                self.p.fill(field, text)
                self.p.dispatch_event(field, "input")
            if field != "#effText":
                self.p.click("#impNext")
        self.p.click("#applyOcr")
        self.p.wait_for_timeout(300)

    def confirm_plan(self):
        if not self.has_class("#planDataModal", "on"):
            self.p.click("#managePlanBtn")
        self.p.check("#vConfirmed")
        self.p.click("#savePlanData")
        self.p.wait_for_timeout(300)

    def create_active_plan(self, name="Operations 76", start="75", target="76"):
        self.create_plan(name, start, target)
        self.p.click("#managePlanBtn")
        self.p.click("#openOcrBtn")
        self.import_texts(fixture("plan_upgrades.txt"), fixture("plan_resources.txt"), fixture("plan_efficiencies.txt"))
        self.confirm_plan()

    def stored(self):
        return json.loads(self.js("()=>localStorage.getItem('bens-stfc')") or "null")

    def done(self):
        errs = list(self.errors)
        self.ctx.close()
        check(not errs, "Fehler auf der Seite: " + "; ".join(errs[:3]))


def reopen(a, b, html, tmp):
    """Seite schließen und mit dem gespeicherten Stand neu öffnen (wie die Datei erneut öffnen)."""
    st = a.stored()
    a.done()
    return App(b, html, tmp, state=st)


# ---------------------------------------------------------------- Tests


@test
def leerer_start_zeigt_einfuehrung(b, html, tmp):
    a = App(b, html, tmp, tutorial_seen=False)
    check(a.has_class("#tutModal", "on"), "Einführung erscheint beim ersten Öffnen nicht")
    a.click("#tutSkip")
    check(a.js("()=>s.plans.length") == 0, "Leerer Start hat schon Pläne")
    check(a.is_visible("#setupCard") and "Willkommen" in a.text("#setupCard"), "Willkommens-/Einrichtungs-Karte fehlt")
    a.done()
    a = App(b, html, tmp, state=None, tutorial_seen=True)
    check(not a.has_class("#tutModal", "on"), "Einführung erscheint erneut, obwohl schon gesehen")
    a.done()


@test
def alle_seiten_ohne_daten_fehlerfrei(b, html, tmp):
    a = App(b, html, tmp)
    for sel in ("#navBld", "#navRes", "#navFc", "#navHist", "#nwk", "#nw", "#ni", "#ntut", "#nd"):
        a.close_modals()
        a.click(sel)
        a.wait_for_timeout(150)
    a.done()


@test
def exporte_einlesen(b, html, tmp):
    a = App(b, html, tmp)
    files = a.make_exports()
    a.import_exports(files)
    check(a.js("()=>s.snapshots.length") == len(files), "Nicht alle Exporte übernommen")
    check(len(a.stored()["snapshots"]) == len(files), "Snapshots nicht gespeichert")
    # Dieselben Dateien noch einmal: nichts Neues
    a.set_input_files("#file", files)
    a.wait_for_timeout(800)
    check(a.js("()=>s.snapshots.length") == len(files), "Doppelte Exporte wurden übernommen")
    a.done()


@test
def plan_importieren_und_prognose(b, html, tmp):
    a = App(b, html, tmp)
    a.import_exports(a.make_exports())
    a.create_active_plan()
    check(a.js("()=>calcPlanStatus(s.plans[0])") == "active", "Plan ist nach Import und Bestätigung nicht aktiv")
    a.click("#nd")
    eta = a.text("#etaValue")
    check(eta and "absehbar" not in eta and eta.strip() not in ("–", ""), f"Keine Prognose: {eta!r}")
    check(a.js("()=>!!planForecast(s.plans[0])"), "planForecast liefert nichts")
    # Σ-Dilithium fehlt im Ressourcentext -> gilt als erfüllt
    dil = a.js("()=>getPlanResources(s.plans[0]).find(r=>r[0]==='Σ-Dilithium')")
    check(dil is None or dil[2] == 0, f"Fehlendes Material nicht als erfüllt gewertet: {dil}")
    for sel in ("#navBld", "#navRes", "#navFc", "#navHist", "#nwk", "#nw", "#ni", "#nd"):
        a.close_modals()
        a.click(sel)
        a.wait_for_timeout(150)
    a.done()


@test
def backup_und_wiederherstellen(b, html, tmp):
    a = App(b, html, tmp)
    a.import_exports(a.make_exports())
    a.create_active_plan()
    before = a.stored()
    f = tmp / "backup.json"
    f.write_text(a.js("()=>bkPayload(new Date())"), encoding="utf-8")
    a.click("#ni")
    a.click("#impView details.dangerZone summary")
    a.click("#reset")
    a.wait_for_timeout(800)
    check(a.js("()=>s.plans.length") == 0, "Zurücksetzen hat die Daten nicht gelöscht")
    a.close_modals()
    a.click("#ni")
    a.set_input_files("#restoreFile", str(f))
    a.wait_for_selector("#restoreModal.on", timeout=5000)
    with a.p.expect_navigation(timeout=5000):  # die Seite lädt nach dem Wiederherstellen neu
        a.click("#restoreOk")
    a.wait_for_load_state()
    after = a.stored()
    check(len(after["plans"]) == len(before["plans"]) == 1, "Plan nach Wiederherstellen nicht da")
    check(len(after["snapshots"]) == len(before["snapshots"]), "Snapshots nach Wiederherstellen unvollständig")
    check(a.js("()=>calcPlanStatus(s.plans[0])") == "active", "Plan nach Wiederherstellen nicht aktiv")
    a.done()


@test
def daten_aus_version_1_0_werden_uebernommen(b, html, tmp):
    state = json.loads((FIX / "state_v1.0.json").read_text(encoding="utf-8"))
    a = App(b, html, tmp, state=state)
    check(a.js("()=>s.plans.length") == len(state["plans"]), "Pläne aus 1.0 fehlen")
    check(a.js("()=>s.snapshots.length") == len(state["snapshots"]), "Snapshots aus 1.0 fehlen")
    check(a.js("()=>s.plans.map(p=>calcPlanStatus(p))") == ["active"], "Status des 1.0-Plans hat sich geändert")
    check(a.js("()=>!!planForecast(s.plans[0])"), "Prognose aus 1.0-Daten fehlt")
    a.done()


FULL = """()=>{window.__realSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){
  throw new DOMException('Speicher voll (Test)','QuotaExceededError')}}"""
NOT_FULL = "()=>{Storage.prototype.setItem=window.__realSet}"


def load_v10_state():
    return json.loads((FIX / "state_v1.0.json").read_text(encoding="utf-8"))


@test
def speicher_voll_zeigt_meldung_statt_stillem_fehler(b, html, tmp):
    a = App(b, html, tmp, state=load_v10_state())
    check(not a.is_visible("#storeAlert"), "Speicherwarnung ohne Grund sichtbar")
    a.js(FULL)
    files = a.make_exports(days=(1, 0))
    a.import_exports(files)
    check(a.is_visible("#storeAlert"), "Keine Meldung, obwohl das Speichern fehlschlug")
    check("voll" in a.text("#storeAlert"), "Meldung nennt den vollen Speicher nicht")
    check(a.is_visible("#storeAlertBackup"), "Backup-Knopf in der Meldung fehlt")
    check(a.has_class("#navDataDot", "on"), "Punkt an „Daten & Import“ fehlt bei Speicherfehler")
    a.js(NOT_FULL)
    check(a.js("()=>persist()") is True, "Speichern klappt nach Freigabe nicht wieder")
    check(not a.is_visible("#storeAlert"), "Meldung verschwindet nach erfolgreichem Speichern nicht")
    a.done()


@test
def belegungsanzeige_und_warnung_ab_70_prozent(b, html, tmp):
    a = App(b, html, tmp, state=load_v10_state())
    a.click("#ni")
    txt = a.text("#storeUsage")
    check("Browser-Speicher" in txt and "%" in txt, f"Belegungsanzeige fehlt: {txt!r}")
    check("knapp" not in txt, "Warnung erscheint, obwohl kaum etwas belegt ist")
    a.done()
    a = App(b, html, tmp, state=load_v10_state(), extra={"fremde-datei": "x" * 3_600_000})
    a.click("#ni")
    txt = a.text("#storeUsage")
    check("knapp" in txt, f"Keine Warnung ab 70 %: {txt!r}")
    check("andere lokal geöffnete Dateien" in txt, "Fremdbelegung wird nicht erklärt")
    a.click("#nd")
    check("Browser-Speicher zu" in a.text(".careStrip") or "Browser-Speicher zu" in a.text("#careList"),
          "Datenpflege zeigt den knappen Speicher nicht")
    check(a.has_class("#navDataDot", "on"), "Punkt an „Daten & Import“ fehlt bei knappem Speicher")
    a.done()


@test
def ereignisprotokoll_auf_200_begrenzt(b, html, tmp):
    st = load_v10_state()
    st["logs"] = [f"Eintrag {i}" for i in range(500)]
    a = App(b, html, tmp, state=st)
    check(a.js("()=>s.logs.length") == 200, "Protokoll wird beim Laden nicht begrenzt")
    check(a.js("()=>s.logs.at(-1)") == "Eintrag 499", "Begrenzung hat die neuesten Einträge entfernt")
    a.js("()=>{for(let i=0;i<50;i++)s.logs.push('neu '+i);persist()}")
    check(len(a.stored()["logs"]) == 200, "Gespeichertes Protokoll wächst über 200")
    a.done()


@test
def wiederherstellen_bei_vollem_speicher_laesst_daten_unveraendert(b, html, tmp):
    a = App(b, html, tmp, state=load_v10_state())
    before = a.js("()=>localStorage.getItem('bens-stfc')")
    f = tmp / "backup.json"
    st = load_v10_state()
    st["plans"][0]["name"] = "Aus dem Backup"
    f.write_text(json.dumps({"app": "Bens STFC Progress Planner", "type": "backup", "version": "1.0",
                             "createdAt": NOW.isoformat(), "state": st}), encoding="utf-8")
    a.click("#ni")
    a.set_input_files("#restoreFile", str(f))
    a.wait_for_selector("#restoreModal.on")
    a.js(FULL)
    a.click("#restoreOk")
    a.wait_for_timeout(1200)
    check(a.has_class("#restoreModal", "on"), "Dialog schließt trotz Fehler")
    check("fehlgeschlagen" in a.text("#restoreInfo"), "Keine Fehlermeldung beim Wiederherstellen")
    check(a.js("()=>localStorage.getItem('bens-stfc')") == before, "Bisherige Daten wurden verändert")
    check(a.is_enabled("#restoreOk"), "Knopf bleibt gesperrt")
    a.done()


# ---------------------------------------------------------------- 1.2: Zielerkennung und Update-Assistent

ACADEMY_UP = """Included upgrades
Building:Defense Platform D · Level 73 → 74
Building:Operations · Level 74 → 76
Building:Academy · Level 74 → 76
Building:Refinery · Level 73 → 75
"""

# Format wie aus Spock's kopiert (Bens Text vom 25.10.): Überschrift „Cost efficiencies“, Namen doppelt,
# Prozentwert in eigener Zeile. Werte erfunden.
EFF_COPIED = """Cost efficiencies
Σ-ParsteelΣ-Parsteel
3.000 %
Σ-TritaniumΣ-Tritanium
3.000 %
7★ Common Refined Ore7★ Common Refined Ore
2.000 %
7★ Uncommon Refined Gas7★ Uncommon Refined Gas
3.500 %
7★ Rare Refined Ore7★ Rare Refined Ore
2.300 %
7★ Rare Refined Crystal7★ Rare Refined Crystal
2.300 %
Σ-Construction Time
3.700 %
"""


@test
def ziel_ist_nicht_operations_und_planname_bleibt(b, html, tmp):
    """Bens Fund in 1.2: Akademie 76 wurde zu „Operations 76“ umbenannt."""
    a = App(b, html, tmp)
    a.create_plan("Akademie 76", "74", "76")
    a.click("#managePlanBtn")
    a.click("#openOcrBtn")
    a.fill("#upText", ACADEMY_UP)
    a.dispatch_event("#upText", "input")
    check(a.eval_on_selector("#ocrTargetName", "e=>e.value") == "Academy", "Falsches Zielgebäude erkannt")
    check("Voraussetzung" in a.text("#upInfo"), "Hinweis zu Operations als Voraussetzung fehlt")
    a.import_texts(None, fixture("plan_resources.txt"), EFF_COPIED)
    a.confirm_plan()
    check(a.js("()=>s.plans.map(p=>p.name)") == ["Akademie 76"], f"Planname geändert: {a.js('()=>s.plans.map(p=>p.name)')}")
    check(a.js("()=>s.plans[0].planData.target.building") == "Academy", "Zielgebäude falsch gespeichert")
    check(a.js("()=>calcPlanStatus(s.plans[0])") == "active", "Plan nicht aktiv")
    check(a.js("()=>orderedSequence(s.plans[0]).at(-1).name") == "Academy", "Zielgebäude steht nicht am Ende der Bau-Reihenfolge")
    a.done()


@test
def effizienzen_im_kopierten_spocks_format(b, html, tmp):
    a = App(b, html, tmp)
    a.create_plan()
    a.click("#managePlanBtn")
    a.click("#openOcrBtn")
    a.click(".impStepBtn[data-step='3']")
    a.fill("#effText", EFF_COPIED)
    a.dispatch_event("#effText", "input")
    check(a.js("()=>Object.keys(ocrState.efficiencies).length") == 7, f"Effizienzen nicht erkannt: {a.text('#effInfo')!r}")
    a.done()


@test
def mehrdeutiges_ziel_folgt_dem_plannamen(b, html, tmp):
    a = App(b, html, tmp)
    a.create_plan("Shuttle Bay 76", "71", "76")
    a.click("#managePlanBtn")
    a.click("#openOcrBtn")
    a.fill("#upText", ACADEMY_UP + "Building:Shuttle Bay · Level 71 → 76\n")
    a.dispatch_event("#upText", "input")
    check(a.eval_on_selector("#ocrTargetName", "e=>e.value") == "Shuttle Bay", "Ziel folgt nicht dem Plannamen")
    check("Mehrere mögliche Zielgebäude" in a.text("#upInfo"), "Keine Warnung bei mehrdeutigem Ziel")
    a.done()


@test
def levelzahl_im_plannamen_folgt_neuem_ziel(b, html, tmp):
    a = App(b, html, tmp, state=load_v10_state())
    a.click("#managePlanBtn")
    a.click("#openOcrBtn")
    a.import_texts(fixture("plan_upgrades.txt").replace("Operations · Level 75 → 76", "Operations · Level 75 → 77"))
    check(a.js("()=>s.plans[0].name") == "Operations 77", f"Name passt nicht zum neuen Ziel: {a.js('()=>s.plans[0].name')}")
    a.done()


@test
def update_assistent_oeffnet_gefuehrten_import_nacheinander(b, html, tmp):
    st = load_v10_state()
    p0 = st["plans"][0]
    p1 = json.loads(json.dumps(p0))
    p1.update(id="plan-zwei", name="Operations 76 (Kopie)", isMain=False)
    for p in (p0, p1):
        p["planData"]["outdatedBy"] = {"at": NOW.isoformat(), "source": "Test", "items": [{"name": "Refinery", "level": 74}]}
    st["plans"].append(p1)
    a = App(b, html, tmp, state=st)
    check("2 Pläne brauchen ein Update" in a.text("#updBar"), f"Leiste fehlt oder falsch: {a.text('#updBar')!r}")
    a.click("#updBar [data-upd]")
    check(a.has_class("#ocrModal", "on") and a.has_class("#impPane1", "on"), "Geführter Assistent öffnet nicht bei Schritt 1")
    check("UPDATE 1 VON 2" in a.text("#impQueue"), "Fortschritt „Update 1 von 2“ fehlt")
    check(a.js("()=>managingPlanId") == p0["id"], "Falscher Plan im Assistenten")
    a.import_texts(fixture("plan_upgrades.txt"), fixture("plan_resources.txt"))
    check(a.js(f"()=>calcPlanStatus(s.plans.find(p=>p.id==='{p0['id']}'))") == "active", "Plan nach Update nicht aktiv")
    check(a.has_class("#ocrModal", "on") and "UPDATE 2 VON 2" in a.text("#impQueue"), "Assistent geht nicht zum zweiten Plan")
    check(a.js("()=>managingPlanId") == "plan-zwei", "Zweiter Plan nicht im Assistenten")
    a.click("#impSkip")
    a.wait_for_timeout(200)
    check(not a.has_class("#ocrModal", "on"), "Assistent bleibt nach dem letzten Plan offen")
    check(not a.is_visible("#impQueue"), "Fortschrittsanzeige bleibt stehen")
    check("1 Plan braucht ein Update" in a.text("#updBar"), "Übersprungener Plan fehlt in der Leiste")
    a.click("#ni")
    check(a.is_visible("#impUpdBar"), "Leiste fehlt auf der Seite Daten & Import")
    # normaler Import danach ohne Fortschrittsanzeige
    a.close_modals()
    a.click("#nd")
    a.click("#managePlanBtn")
    a.click("#openOcrBtn")
    check(not a.is_visible("#impQueue") and not a.is_visible("#impSkip"), "Assistent zeigt Update-Elemente außerhalb des Update-Assistenten")
    a.done()


@test
def alle_wege_fuehren_zum_gefuehrten_import(b, html, tmp):
    a = App(b, html, tmp)
    a.create_plan("Akademie 76", "74", "76")
    wege = {
        "Nächster Schritt": lambda: a.click("#nextBtn"),
        "Plandaten › Upgrade-Plan importieren": lambda: (a.click("#managePlanBtn"), a.click("#openOcrBtn")),
        "Daten & Import › Importieren": lambda: (a.click("#ni"), a.click("#impPlans [data-impo]")),
    }
    for name, go in wege.items():
        a.close_modals()
        a.click("#nd")
        go()
        a.wait_for_timeout(150)
        check(a.has_class("#ocrModal", "on") and a.has_class("#impPane1", "on"), f"{name}: geführter Assistent öffnet nicht")
    a.done()


# ---------------------------------------------------------------- 1.3: Engpass-Karte

PACK = {"7★ Uncommon Gas": {"amount": 30000}, "7★ Rare Ore": {"amount": 20000}, "7★ Rare Crystal": {"amount": 20000},
        "7★ Common Ore": {"amount": 50000}, "Σ-Parsteel": {"amount": 200000000}}


@test
def engpass_karte_zeigt_die_drei_langsamsten_materialien(b, html, tmp):
    a = App(b, html, tmp, state=load_v10_state())
    check(a.is_visible("#bottleneckList"), "Liste der langsamsten Materialien fehlt")
    rows = a.locator("#bottleneckList .bnRow")
    check(1 <= rows.count() <= 3, f"Falsche Zeilenzahl: {rows.count()}")
    check(a.js("()=>planBottleneck(s.plans[0],getPlanResources(s.plans[0])).name") in rows.first.inner_text(),
          "Erste Zeile ist nicht der Engpass der Prognose")
    check(not any("Common" in rows.nth(i).inner_text() for i in range(rows.count())), "Common-Material in der Liste")
    check("Stationspack ein" in a.text("#bottleneckList"), "Hinweis zum leeren Stationspack fehlt")
    a.click("#bnPackBtn")
    check(a.has_class("#packModal", "on"), "Knopf öffnet den Stationspack nicht")
    check("können vom Spiel abweichen" in a.text(".heroNote"), "Abweichungshinweis fehlt in der Übersicht")
    a.close_modals()
    a.click("#navRes")
    check("können vom Spiel abweichen" in a.text("#pane-res"), "Abweichungshinweis fehlt auf der Seite Ressourcen")
    a.done()


@test
def engpass_karte_zeigt_was_ein_pack_bringt(b, html, tmp):
    st = load_v10_state()
    st["packs"][0]["contents"] = PACK
    a = App(b, html, tmp, state=st)
    foot = a.text("#bottleneckList .bnFoot")
    check(foot.startswith("Mit 1 Stationspack"), f"Pack-Effekt fehlt: {foot!r}")
    pe = a.js("()=>{const e=packEffect(s.plans[0]);return {n:e.save,d:e.date.toLocaleDateString('de-DE')}}")
    if pe["n"] >= 1:
        check(f"{pe['n']} Tag" in foot and pe["d"] in foot, f"Tage und Datum passen nicht: {foot!r} / {pe}")
        base = a.js("()=>new Date(planForecast(s.plans[0]).base+planForecast(s.plans[0]).overall.real*864e5).setHours(0,0,0,0)")
        scen = a.js("()=>new Date(packEffect(s.plans[0]).date).setHours(0,0,0,0)")
        check(round((base - scen) / 864e5) == pe["n"], "Gesparte Tage passen nicht zu den Daten")
    else:
        check("kein ganzer Tag" in foot, f"Text bei unter einem Tag falsch: {foot!r}")
    a.done()


@test
def engpass_karte_ohne_prognose_wie_bisher(b, html, tmp):
    st = load_v10_state()
    st["snapshots"] = st["snapshots"][-1:]
    a = App(b, html, tmp, state=st)
    check(not a.is_visible("#bottleneckList"), "Liste erscheint ohne Prognose")
    check(a.is_visible("#bottleneckValue") and "vorläufig" in a.text("#bottleneckDetail"),
          f"Vorläufiger Engpass fehlt: {a.text('#bottleneckDetail')!r}")
    a.done()


# ---------------------------------------------------------------- 1.4: Prognose-Qualität


def quality_after(b, html, tmp, days):
    a = App(b, html, tmp)
    a.import_exports(a.make_exports(days=days))
    a.create_active_plan()
    a.click("#nd")
    return a


@test
def prognose_qualitaet_vorlaeufig_brauchbar_stabil(b, html, tmp):
    for days, want in (((10, 8, 6, 4, 2, 0), "VORLÄUFIG"), (tuple(range(27, -1, -3)), "BRAUCHBAR"),
                       (tuple(range(40, -1, -2)), "STABIL")):
        a = quality_after(b, html, tmp, days)
        check(a.is_visible("#fcQBadge") and a.text("#fcQBadge") == want, f"Erwartet {want}, angezeigt {a.text('#fcQBadge')!r}")
        line = a.text("#fcQLine")
        check("Abschnitte über" in line, f"Zeile zur Qualität fehlt: {line!r}")
        check(("ab 10 Abschnitten" in line) == (want == "BRAUCHBAR"), f"Nächste Stufe falsch: {line!r}")
        a.click("#navFc")
        check(want in a.text("#fcSummary") and "Längere Abschnitte zählen mehr" in a.text("#fcSummary"),
              "Erklärung auf der Seite Prognose & Packs fehlt")
        a.done()
    a = App(b, html, tmp, state=dict(load_v10_state(), snapshots=load_v10_state()["snapshots"][-2:]))
    check(not a.is_visible("#fcQBadge"), "Plakette erscheint ohne Prognose")
    a.done()


@test
def gewichtung_gleich_lange_abschnitte_unveraendert(b, html, tmp):
    a = App(b, html, tmp)
    r = a.js("""()=>{let bad=0;for(let t=0;t<500;t++){const n=1+Math.floor(Math.random()*10),v=Array.from({length:n},()=>Math.random()*900-100);
      for(const q of [0.25,0.5,0.75]){if(Math.abs(quant(v,q)-quantW(v.map(x=>({v:x,w:3})),q))>1e-9)bad++}}
      return {bad, w:quantW([{v:100,w:4},{v:200,w:1},{v:300,w:1}],0.5)}}""")
    check(r["bad"] == 0, f"Gleich lange Abschnitte ergeben andere Werte als bisher ({r['bad']} Fälle)")
    check(r["w"] < 200, "Längerer Abschnitt zählt nicht stärker")
    a.done()


@test
def engpass_karte_breit_nur_mit_prognose_und_packhinweis(b, html, tmp):
    st = load_v10_state()
    a = App(b, html, tmp, state=st)
    check(a.eval_on_selector(".heroCards", "e=>e.classList.contains('bnWide')"), "Mit Prognose ist die Karte nicht breit")
    check("Daten & Import › Stationspack" in a.text("#packsDetail"), f"Pack-Hinweis falsch: {a.text('#packsDetail')!r}")
    a.click("#nw")
    check("„Packs“" not in a.text("#wifView"), "Was-wäre-wenn verweist noch auf den Menüpunkt „Packs“")
    a.done()
    a = App(b, html, tmp, state=dict(st, snapshots=st["snapshots"][-1:]))
    check(not a.eval_on_selector(".heroCards", "e=>e.classList.contains('bnWide')"), "Ohne Prognose ist die Karte breit")
    a.done()


# ---------------------------------------------------------------- 1.5: Einrichtung, Begriffe, Automatik


@test
def einrichtung_beim_ersten_start(b, html, tmp):
    a = App(b, html, tmp)
    check(a.is_visible("#setupCard"), "Einrichtungs-Karte fehlt beim ersten Start")
    check("0 von 5 erledigt" in a.text("#setupCard"), f"Fortschritt falsch: {a.text('#setupCard .setupHead')!r}")
    a.click("#setup-plan")
    check(a.has_class("#newPlanModal", "on"), "„+ Ersten Plan anlegen“ öffnet den Dialog nicht")
    a.close_modals()
    a.click("#setupCard [data-setup='tut']")
    check(a.has_class("#tutModal", "on"), "„Einführung ansehen“ öffnet die Einführung nicht")
    a.done()


@test
def einrichtung_zeigt_fortschritt_und_laesst_sich_ausblenden(b, html, tmp):
    st = load_v10_state()
    a = App(b, html, tmp, state=st)
    check("3 von 5 erledigt" in a.text("#setupCard"), f"Fortschritt falsch: {a.text('#setupCard .setupHead')!r}")
    check(a.eval_on_selector("#setupCard .sStep.next b", "e=>e.textContent") == "Stationspack eintragen",
          "Nächster Schritt ist nicht der Stationspack")
    a.click("#setup-pack")
    check(a.has_class("#packModal", "on"), "Knopf öffnet den Stationspack nicht")
    a.close_modals()
    # einmalig: weg bis zum nächsten Öffnen
    a.click("#setupCard [data-setup='hide']")
    check(a.is_visible("#setupCard [data-setup='hide-once']") and a.is_visible("#setupCard [data-setup='hide-forever']"),
          "Auswahl einmalig/dauerhaft fehlt")
    a.click("#setupCard [data-setup='hide-once']")
    check(not a.is_visible("#setupCard"), "Karte lässt sich nicht einmalig ausblenden")
    # „Nächstes Öffnen“ = neue Seite mit dem gespeicherten Stand. Kein reload(): Headless-Chromium verliert
    # beim Neuladen einer file://-Seite gelegentlich den kompletten localStorage (Ursache des flaky Tests in 2.0).
    a = reopen(a, b, html, tmp)
    check(a.is_visible("#setupCard"), "Nach einmaligem Ausblenden fehlt die Karte beim nächsten Öffnen")
    # dauerhaft: bleibt weg, lässt sich unter Daten & Import zurückholen
    a.click("#setupCard [data-setup='hide']")
    a.click("#setupCard [data-setup='hide-forever']")
    a = reopen(a, b, html, tmp)
    check(not a.is_visible("#setupCard"), "Dauerhaft ausgeblendete Karte erscheint wieder")
    a.click("#ni")
    check(a.is_visible("#setupShowBtn"), "Knopf „Einrichtung wieder einblenden“ fehlt")
    a.click("#setupShowBtn")
    a.wait_for_timeout(200)
    check(a.is_visible("#setupCard"), "Einrichtung lässt sich nicht wieder einblenden")
    a.done()
    # Stand aus 1.5 (altes „Ausblenden“ ohne Auswahl) zeigt die Karte wieder
    a = App(b, html, tmp, state=dict(st, setupHidden=True))
    check(a.is_visible("#setupCard"), "Altes Ausblenden aus 1.5 versteckt die Karte weiter")
    a.done()
    st["packs"][0]["contents"] = PACK
    st["backup"] = {"since": NOW.isoformat(), "lastAt": NOW.isoformat()}
    a = App(b, html, tmp, state=st)
    check(not a.is_visible("#setupCard"), "Karte bleibt sichtbar, obwohl alles erledigt ist")
    a.done()


@test
def begriffe_werden_erklaert(b, html, tmp):
    a = App(b, html, tmp, state=load_v10_state())
    terms = a.js("()=>[...document.querySelectorAll('.termInfo[data-term]')].map(e=>e.dataset.term)")
    for t in ("engpass", "qualitaet", "abschnitt", "snapshot", "hauptplan", "status"):
        check(t in terms, f"Erklärung „{t}“ fehlt")
    a.hover(".statHead .termInfo[data-term='engpass']")
    check(a.is_visible("#termTip") and "Engpass" in a.text("#termTip"), "Erklärung erscheint nicht beim Darüberfahren")
    a.keyboard.press("Escape")
    check(not a.is_visible("#termTip"), "Erklärung bleibt nach Esc stehen")
    a.done()


@test
def exporte_werden_beim_oeffnen_gesucht(b, html, tmp):
    a = App(b, html, tmp)
    f = a.make_exports(days=(0,))[0]
    name, data = pathlib.Path(f).name, pathlib.Path(f).read_text(encoding="utf-8")
    js = """async ([perm, name, data]) => {
      window.showDirectoryPicker = window.showDirectoryPicker || (() => {});
      s.exportScan = { folder: 'Downloads' };
      expDir = { queryPermission: async () => perm,
        entries: async function* () { yield [name, { kind: 'file', getFile: async () => ({ text: async () => data }) }]; } };
      await autoScanOnOpen(); }"""
    a.evaluate(js, ["prompt", name, data])
    a.wait_for_timeout(300)
    check(not a.has_class("#batchModal", "on") and not a.has_class("#toast", "on"),
          "Ohne erteilten Zugriff darf beim Öffnen nichts passieren")
    a.evaluate(js, ["granted", name, data])
    a.wait_for_timeout(500)
    check(a.has_class("#batchModal", "on"), "Neue Exporte werden beim Öffnen nicht angeboten")
    a.click("#batchOk")
    a.wait_for_timeout(300)
    a.evaluate(js, ["granted", name, data])
    a.wait_for_timeout(400)
    check(not a.has_class("#batchModal", "on") and "Keine neuen Exporte" not in a.text("#toast"),
          "Ohne neue Exporte darf beim Öffnen keine Meldung erscheinen")
    a.done()


@test
def datenpflege_hinweise_normal_breit(b, html, tmp):
    """Bens Fund in 1.5: Info-Hinweise der Datenpflege wurden durch das ⓘ-Styling zu einem schmalen Kästchen."""
    st = load_v10_state()
    a = App(b, html, tmp, state=dict(st, snapshots=st["snapshots"][-2:]))
    a.click("#ni")
    w = a.js("()=>[...document.querySelectorAll('#impView .careItem')].map(e=>e.getBoundingClientRect().width)")
    check(w and min(w) > 200, f"Hinweise zu schmal: {w}")
    a.done()


@test
def exportordner_und_knopf_nebeneinander(b, html, tmp):
    a = App(b, html, tmp, state=dict(load_v10_state(), exportScan={"folder": "STFC_Planner_1.0"}))
    a.click("#ni")
    if not a.is_visible("#scanChange"):  # Browser ohne Ordnerzugriff zeigt keinen Knopf
        a.done()
        return
    y1 = a.eval_on_selector("#impScanInfo .folderRow span", "e=>e.getBoundingClientRect().top")
    y2 = a.eval_on_selector("#scanChange", "e=>e.getBoundingClientRect().top")
    check(abs(y1 - y2) < 12, f"Ordnername und Knopf stehen nicht nebeneinander ({y1} / {y2})")
    a.done()


# ---------------------------------------------------------------- 1.6: Optik-Feinschliff


@test
def symbole_in_navigation_und_karten(b, html, tmp):
    a = App(b, html, tmp, state=load_v10_state())
    missing = a.js("()=>['nd','navBld','navRes','navFc','navHist','nwk','nw','ni'].filter(id=>!document.querySelector('#'+id+' svg.ico'))")
    check(not missing, f"Symbole fehlen in: {missing}")
    check(a.locator(".heroCards .cIco").count() == 3, "Symbole in den Kennzahl-Karten fehlen")
    a.done()


@test
def diagramm_zeigt_werte_beim_darueberfahren(b, html, tmp):
    a = App(b, html, tmp, state=load_v10_state())
    box = a.locator("#chartBox svg")
    box.scroll_into_view_if_needed()
    bb = box.bounding_box()
    a.mouse.move(bb["x"] + bb["width"] * 0.5, bb["y"] + bb["height"] * 0.5)
    a.wait_for_timeout(150)
    check(a.is_visible("#chartBox .chartTip") and "Bestand" in a.text("#chartBox .chartTip"), "Kein Wert beim Darüberfahren")
    check(a.eval_on_selector("#chartBox .hov", "e=>e.style.display!=='none'"), "Hilfslinie fehlt")
    a.mouse.move(5, 5)
    a.wait_for_timeout(100)
    check(not a.is_visible("#chartBox .chartTip"), "Wert bleibt nach dem Verlassen stehen")
    a.done()


@test
def engpass_materialien_in_der_tabelle_markiert(b, html, tmp):
    a = App(b, html, tmp, state=load_v10_state())
    slow = a.js("()=>bottleneckRows(s.plans[0]).rows.slice(1).map(x=>x.m)")
    marked = a.js("()=>[...document.querySelectorAll('tr.resSlow td:first-child')].map(e=>e.textContent.trim())")
    check(slow and all(any(m in x for x in marked) for m in slow), f"Markierung fehlt: {slow} / {marked}")
    a.done()


@test
def kennzahlen_leuchten_bei_aenderung_und_bewegung_abschaltbar(b, html, tmp):
    a = App(b, html, tmp, state=load_v10_state())
    a.js("()=>{flashPrev.v[0]='anders';render()}")
    check(a.eval_on_selector("#etaValue", "e=>e.classList.contains('flash')"), "Geänderte Kennzahl leuchtet nicht auf")
    check(a.eval_on_selector("#etaValue", "e=>getComputedStyle(e).animationName") == "flash", "Animation läuft nicht")
    a.emulate_media(reduced_motion="reduce")
    check(a.eval_on_selector("#etaValue", "e=>getComputedStyle(e).animationName") == "none",
          "Bei „Bewegung reduzieren“ läuft trotzdem eine Animation")
    a.done()


# ---------------------------------------------------------------- Ablauf


# ---------------------------------------------------------------- 2.1: Datenintegrität und Prognose-Grenzfälle


def second_plan(a):
    """Zweiten aktiven Plan anlegen. Die Uhr läuft im Test nicht; Plan-IDs enthalten die Uhrzeit."""
    a.p.clock.set_fixed_time((NOW + dt.timedelta(minutes=1)).isoformat())
    a.create_active_plan("Zweitplan")


def first_value(a):
    return a.js("()=>s.resources.find(r=>r[0]===Object.keys(IDS)[0])[1]")


def newest_value(a):
    return a.js("()=>latestSnapshot().values[Object.keys(IDS)[0]]")


def single_import(a, f):
    a.set_input_files("#file", [str(f)])
    a.wait_for_selector("#modal.on", timeout=5000)
    a.click("#confirm")
    a.wait_for_timeout(200)


def edited_export(a, tmp, change, name="spocksclub-data-export_2026-10-25T08-30-00-000Z.json"):
    """Gültigen Export erzeugen und mit change(data) verändern."""
    src = pathlib.Path(a.make_exports((0,))[0])
    data = json.loads(src.read_text(encoding="utf-8"))
    src.unlink()
    change(data)
    f = tmp / name
    f.write_text(data if isinstance(data, str) else json.dumps(data), encoding="utf-8")
    return f


@test
def aelterer_einzelexport_ueberschreibt_den_bestand_nicht(b, html, tmp):
    a = App(b, html, tmp)
    f = a.make_exports()
    a.import_exports(f[1:])
    now = first_value(a)
    a.set_input_files("#file", [f[0]])
    a.wait_for_selector("#modal.on", timeout=5000)
    check(a.is_visible("#olderHint"), "Hinweis „älter“ fehlt im Einzelimport")
    a.click("#confirm")
    a.wait_for_timeout(200)
    check(a.js("()=>s.snapshots.length") == len(f), "Älterer Export wurde nicht übernommen")
    check(first_value(a) == now == newest_value(a), f"Bestand überschrieben: {first_value(a)} statt {now}")
    check(a.stored()["resources"] == a.js("()=>s.resources"), "Gespeicherter Bestand weicht ab")
    a.done()


@test
def snapshot_loeschen_nimmt_den_zeitlich_neuesten(b, html, tmp):
    a = App(b, html, tmp)
    f = a.make_exports()
    a.import_exports(f[1:])
    single_import(a, f[0])  # der älteste steht jetzt am Ende der Liste
    a.js("()=>snaps()")
    a.wait_for_timeout(150)
    mid = a.js("()=>s.snapshots[2].id")
    a.click(f'[data-del="{mid}"]')
    a.wait_for_timeout(200)
    check(first_value(a) == newest_value(a), "Nach Löschen eines mittleren Snapshots falscher Bestand")
    newest = a.js("()=>latestSnapshot().id")
    a.click(f'[data-del="{newest}"]')
    a.wait_for_timeout(200)
    check(a.js("()=>latestSnapshot().id") != newest, "Neuester Snapshot nicht gelöscht")
    check(first_value(a) == newest_value(a), "Nach Löschen des neuesten Snapshots falscher Bestand")
    a.done()


@test
def ungueltige_werte_lehnen_die_datei_ab(b, html, tmp):
    a = App(b, html, tmp)
    a.import_exports(a.make_exports((4, 2)))
    msgs = []
    a.p.on("dialog", lambda d: msgs.append(d.message))
    before = a.js("()=>localStorage.getItem('bens-stfc')")

    def setv(v, i=0):
        def ch(d):
            if v is KeyError:
                del d["resources"][i]["amount"]
            else:
                d["resources"][i]["amount"] = v
        return ch

    sigma_idx = a.js("()=>Object.keys(IDS).length")  # erster Σ-Eintrag nach den Materialien
    for k, (v, i) in enumerate((("abc", 0), (-5, 1), (KeyError, 2), (None, 3), ("", 4), (-1, sigma_idx))):
        f = edited_export(a, tmp, setv(v, i), f"spocksclub-data-export_2026-10-25T08-0{k}-00-000Z.json")
        a.set_input_files("#file", [str(f)])
        a.wait_for_timeout(300)
        check(not a.has_class("#modal", "on"), f"Datei mit Wert {v!r} nicht abgelehnt")
        check(msgs and "Ungültiger Wert bei" in msgs[-1], f"Meldung fehlt oder falsch: {msgs[-1:]}")
    check(a.js("()=>localStorage.getItem('bens-stfc')") == before, "Abgelehnte Dateien haben Daten verändert")
    # In einer Auswahl: fehlerhafte Datei nicht übernehmbar, die gültige schon
    bad = edited_export(a, tmp, setv("abc"), "spocksclub-data-export_2026-10-25T08-40-00-000Z.json")
    good = edited_export(a, tmp, lambda d: d["resources"][0].update(amount=12345), "spocksclub-data-export_2026-10-25T08-50-00-000Z.json")
    a.set_input_files("#file", [str(bad), str(good)])
    a.wait_for_selector("#batchModal.on", timeout=5000)
    st = a.js("()=>pendingBatch.map(i=>i.status)")
    check(sorted(st) == ["err", "new"], f"Status in der Auswahl falsch: {st}")
    a.click("#batchOk")
    a.wait_for_timeout(200)
    check(a.js("()=>s.snapshots.length") == 3, "Nicht genau die gültige Datei übernommen")
    a.done()


@test
def kaputte_dateien_aendern_nichts(b, html, tmp):
    a = App(b, html, tmp)
    a.import_exports(a.make_exports((4, 2)))
    before = a.js("()=>localStorage.getItem('bens-stfc')")
    for k, txt in enumerate(("{kein json", json.dumps({"resources": []}), json.dumps({"buildings": [], "resources": {}}))):
        f = tmp / f"spocksclub-data-export_2026-10-25T07-0{k}-00-000Z.json"
        f.write_text(txt, encoding="utf-8")
        a.set_input_files("#file", [str(f)])
        a.wait_for_timeout(300)
        check(not a.has_class("#modal", "on"), f"Kaputte Datei {k} nicht abgelehnt")
    check(a.js("()=>localStorage.getItem('bens-stfc')") == before, "Kaputte Dateien haben Daten verändert")
    a.done()


@test
def duplikate_werden_nicht_uebernommen(b, html, tmp):
    a = App(b, html, tmp)
    f = a.make_exports()
    a.import_exports(f[:3])
    copy = tmp / "kopie.json"
    copy.write_text(pathlib.Path(f[3]).read_text(encoding="utf-8"), encoding="utf-8")
    a.set_input_files("#file", [f[2], f[3], str(copy)])
    a.wait_for_selector("#batchModal.on", timeout=5000)
    st = a.js("()=>pendingBatch.map(i=>[i.snap.fileName,i.status])")
    stat = dict(st)
    check(stat[pathlib.Path(f[2]).name] == "dup", f"Schon importierter Export nicht erkannt: {st}")
    check(sorted([stat[pathlib.Path(f[3]).name], stat["kopie.json"]]) == ["dup", "new"],
          f"Doppelter Export in derselben Auswahl nicht erkannt: {st}")
    a.click("#batchOk")
    a.wait_for_timeout(200)
    check(a.js("()=>s.snapshots.length") == 4, "Duplikat übernommen")
    a.done()


@test
def reihenfolge_des_imports_aendert_die_prognose_nicht(b, html, tmp):
    a = App(b, html, tmp)
    f = a.make_exports()
    a.import_exports(f)
    a.create_active_plan()
    ref = a.js("()=>({fc:planForecast(s.plans[0]).overall, res:s.resources})")
    a.done()
    a = App(b, html, tmp)
    for x in reversed(f):
        single_import(a, x)
    a.create_active_plan()
    got = a.js("()=>({fc:planForecast(s.plans[0]).overall, res:s.resources})")
    check(got["fc"]["real"] == ref["fc"]["real"] and got["fc"]["cons"] == ref["fc"]["cons"],
          f"Prognose hängt von der Importreihenfolge ab: {got['fc']} / {ref['fc']}")
    check(got["res"] == ref["res"], "Bestand hängt von der Importreihenfolge ab")
    a.done()


BAD_TEXT = ("Invalid", "NaN", "Infinity", "undefined")


def page_texts(a):
    out = []
    for sel in ("#nd", "#navFc", "#navRes", "#nw", "#nwk", "#nd"):
        a.close_modals()
        a.click(sel)
        a.wait_for_timeout(150)
        out.append(a.js("()=>document.body.innerText"))
    return "\n".join(out)


def with_rare_ore(values):
    st = load_v10_state()
    for sn, v in zip(st["snapshots"], values):
        sn["values"]["7★ Rare Ore"] = v
    return st


@test
def prognose_grenzfaelle_ohne_ungueltige_termine(b, html, tmp):
    cases = {
        "ein Snapshot": dict(load_v10_state(), snapshots=load_v10_state()["snapshots"][-1:]),
        "Stillstand": with_rare_ore([30000] * 6),
        "negativ": with_rare_ore([40000 - 1000 * i for i in range(6)]),
        "Jahrzehnte": with_rare_ore([30000 + 10 * i for i in range(6)]),  # ~49 Jahre
        "über 100 Jahre": with_rare_ore([30000 + 1 * i for i in range(6)]),  # ~490 Jahre
    }
    for name, st in cases.items():
        a = App(b, html, tmp, state=st)
        txt = page_texts(a)
        bad = [w for w in BAD_TEXT if w in txt]
        check(not bad, f"{name}: ungültige Anzeige {bad}")
        if name == "Jahrzehnte":
            check(a.text("#etaValue").startswith("ca. ") and "20" in a.text("#etaValue"),
                  f"Langer Termin nicht als Monat und Jahr: {a.text('#etaValue')!r}")
            check("Jahren" in a.text("#etaDetail"), f"Dauer nicht in Jahren: {a.text('#etaDetail')!r}")
            check("Jahre · ca. " in a.text("#bottleneckList"), f"Engpass-Karte ohne Jahre: {a.text('#bottleneckList')!r}")
            a.done()
            continue
        check(a.text("#etaValue") == "Offen", f"{name}: Termin trotz fehlender Grundlage: {a.text('#etaValue')!r}")
        if name == "über 100 Jahre":
            check("Über 100 Jahre" in a.text("#etaDetail"), f"Hinweis über 100 Jahre fehlt: {a.text('#etaDetail')!r}")
            a.click("#navFc")
            check("nicht absehbar" in a.text("#pane-fc"), "Tabelle zeigt die Grenze nicht")
        if name in ("Stillstand", "negativ"):
            check("Keine positive Rate" in a.text("#etaDetail"), f"{name}: Hinweis fehlt: {a.text('#etaDetail')!r}")
        a.done()
    a = App(b, html, tmp)
    check(a.js("()=>fmtEta(2e9, Date.now())") == "nicht absehbar", "fmtEta ohne Grenze")
    check(a.js("()=>fmtEta(Infinity, Date.now())") == "nicht absehbar", "fmtEta(Infinity) ungültig")
    check(a.js("()=>wifDate(Date.now(), 1e9)") == "nicht absehbar", "Was-wäre-wenn ohne Grenze")
    check(a.js("()=>fmtEta(6, Date.parse('2026-10-25T09:00:00Z'))") == "31.10.2026 (6 Tage)", "Kurzer Termin falsch")
    check(a.js("()=>fmtEta(84, Date.parse('2026-10-25T09:00:00Z'))") == "17.1.2027 (~12 Wochen)", "Termin in Wochen falsch")
    check(a.js("()=>fmtEta(2040, Date.parse('2026-10-25T09:00:00Z'))") == "ca. Mai 2032 (~5,5 Jahre)",
          f"Termin über 1 Jahr falsch: {a.js('()=>fmtEta(2040, Date.parse(\'2026-10-25T09:00:00Z\'))')!r}")
    check(a.js("()=>wifDate(Date.parse('2026-10-25T09:00:00Z'), 2040)") == "ca. Mai 2032", "Was-wäre-wenn über 1 Jahr falsch")
    a.done()


@test
def ausreisser_durch_pack_wird_markiert_und_nicht_gezaehlt(b, html, tmp):
    st = with_rare_ore([30000 + 2000 * i + (60000 if i >= 3 else 0) for i in range(6)])
    a = App(b, html, tmp, state=st)
    r = a.js("()=>{const x=rateStats(s.plans[0],'7★ Rare Ore');return {flags:x.rows.map(r=>r.flag),inc:x.rows.map(r=>r.included),n:x.n,real:x.real}}")
    check(r["flags"].count("pack") == 1, f"Pack-Sprung nicht markiert: {r['flags']}")
    check(r["n"] == len(r["flags"]) - 1 and abs(r["real"] - 1000) < 1e-6, f"Sprung wird mitgezählt: {r}")
    a.done()


@test
def zielwechsel_setzt_die_bestaetigung_zurueck(b, html, tmp):
    a = App(b, html, tmp, state=load_v10_state())
    check(a.js("()=>calcPlanStatus(s.plans[0])") == "active", "Ausgangsplan nicht aktiv")
    a.click("#managePlanBtn")
    a.fill("#editPlanTarget", "77")
    a.click("#savePlanData")
    a.wait_for_timeout(200)
    p = a.js("()=>({c:s.plans[0].confirmation, st:calcPlanStatus(s.plans[0]), fc:planForecast(s.plans[0])})")
    check(p["c"] is None, "Bestätigung bleibt trotz neuem Ziel")
    check(p["st"] != "active" and p["fc"] is None, f"Plan rechnet trotz Zielwechsel weiter: {p['st']}")
    check(a.js("()=>s.logs.at(-1)").startswith("Zielstruktur geändert"), "Kein Eintrag im Protokoll")
    a.done()


@test
def erledigter_bau_macht_andere_plaene_veraltet(b, html, tmp):
    a = App(b, html, tmp)
    a.import_exports(a.make_exports())
    a.create_active_plan()
    second_plan(a)
    check(a.js("()=>s.plans.map(p=>calcPlanStatus(p))") == ["active", "active"], "Zwei aktive Pläne erwartet")
    a.js("()=>{s.active=s.plans[0].id;render()}")
    a.click("#managePlanBtn")
    a.click("#openOcrBtn")
    up = fixture("plan_upgrades.txt").replace("Refinery · Level 73 → 75", "Refinery · Level 74 → 75")
    a.import_texts(up, fixture("plan_resources.txt"), fixture("plan_efficiencies.txt"))
    a.close_modals()
    st = a.js("()=>({b:calcPlanStatus(s.plans[1]), o:s.plans[1].planData.outdatedBy, upd:plansNeedingUpdate().map(p=>p.name)})")
    check(st["b"] == "stale", f"Zweitplan nicht veraltet: {st['b']}")
    check(st["o"] and st["o"]["items"][0]["name"].lower() == "refinery" and st["o"]["items"][0]["level"] == 74,
          f"Falsche Angabe, was erledigt ist: {st['o']}")
    check("Zweitplan" in st["upd"], "Update-Leiste nennt den Zweitplan nicht")
    a.done()


@test
def plan_loeschen_schuetzt_den_hauptplan(b, html, tmp):
    a = App(b, html, tmp)
    a.import_exports(a.make_exports())
    a.create_active_plan()
    second_plan(a)
    snaps = a.js("()=>s.snapshots.length")
    a.js("()=>{s.active=s.plans[0].id;render()}")
    a.click("#managePlanBtn")
    check(a.js("()=>$('deletePlanBtn').disabled"), "Hauptplan lässt sich löschen")
    a.close_modals()
    a.js("()=>{s.active=s.plans[1].id;render()}")
    a.click("#managePlanBtn")
    a.click("#planDataModal details.dangerZone summary")
    a.click("#deletePlanBtn")
    a.wait_for_timeout(200)
    r = a.js("()=>({n:s.plans.length, name:s.plans[0].name, act:s.active===s.plans[0].id, st:calcPlanStatus(s.plans[0]), snaps:s.snapshots.length})")
    check(r["n"] == 1 and r["name"] == "Operations 76", f"Falscher Plan gelöscht: {r}")
    check(r["act"] and r["st"] == "active" and r["snaps"] == snaps, f"Hauptplan oder Daten verändert: {r}")
    check(len(a.stored()["plans"]) == 1, "Löschen nicht gespeichert")
    a.done()


# ---------------------------------------------------------------- 2.1 Phase 2: Zieltermin, Wochenbericht


def set_target(a, v, idx=0):
    sel = f"#tdCards input[type=date] >> nth={idx}"
    a.fill(sel, v)
    a.dispatch_event(sel, "change")
    a.wait_for_timeout(150)


@test
def zieltermin_bewertet_und_speichert_je_plan(b, html, tmp):
    a = App(b, html, tmp, state=load_v10_state())
    a.click("#nw")
    check("Wunschdatum wählen" in a.text("#tdPanel"), "Hinweis ohne Datum fehlt")
    set_target(a, "2026-10-01")
    check("nicht in der Zukunft" in a.text("#tdResult"), "Vergangenes Datum nicht abgefangen")
    set_target(a, "2026-11-01")
    check("NICHT ERREICHBAR" in a.text("#tdResult").upper(), f"Zu frühes Datum: {a.text('#tdResult')[:120]!r}")
    # Benötigt pro Tag = Fehlt ÷ verbleibende Tage
    r = a.js("""()=>{const p=s.plans[0],c=targetCheck(p,'2026-11-01'),x=c.rows.find(r=>r.kind==='ok');
      return {need:x.need, miss:x.miss, days:c.days, fc:c.fc.overall.real}}""")
    check(abs(r["need"] - r["miss"] / r["days"]) < 1e-6, f"Formel falsch: {r}")
    eta = a.js("()=>{const fc=planForecast(s.plans[0]);return new Date(fc.base+fc.overall.real*864e5+3*864e5).toISOString().slice(0,10)}")
    set_target(a, eta)
    check("ERREICHBAR" in a.text("#tdResult").upper() and "NICHT ERREICHBAR" not in a.text("#tdResult").upper(),
          f"Datum nach der Prognose nicht erreichbar: {eta} / {a.text('#tdResult')[:120]!r}")
    check(a.stored()["plans"][0].get("targetDate") == eta, "Datum nicht beim Plan gespeichert")
    check(a.js("()=>calcPlanStatus(s.plans[0])") == "active", "Zieltermin verändert den Plan-Status")
    a = reopen(a, b, html, tmp)
    a.click("#nw")
    check(a.input_value("#tdCards input[type=date]") == eta, "Datum nach erneutem Öffnen weg")
    card = a.text("#tdCards .plan.active")
    check("ERREICHBAR" in card.upper() and "noch" in card, f"Bewertung fehlt auf der Karte: {card!r}")
    check(not [w for w in BAD_TEXT if w in a.text("#tdPanel")], "Ungültige Werte im Zieltermin")
    a.done()


@test
def zieltermin_ohne_aktiven_plan_und_ohne_daten(b, html, tmp):
    a = App(b, html, tmp)
    a.click("#nw")
    check("aktiven Plan" in a.text("#tdPanel"), "Hinweis ohne aktiven Plan fehlt")
    a.done()
    st = load_v10_state()
    st["snapshots"] = st["snapshots"][-2:]
    st["plans"][0]["targetDate"] = "2027-01-15"
    a = App(b, html, tmp, state=st)
    a.click("#nw")
    txt = a.text("#tdResult")
    check("NICHT BEWERTBAR" in txt.upper() and "zu wenig Daten" in txt, f"Zu wenig Daten nicht gekennzeichnet: {txt[:160]!r}")
    a.done()


@test
def wochenbericht_vergleicht_mit_vorwoche_und_gibt_ausblick(b, html, tmp):
    a = App(b, html, tmp, state=load_v10_state())
    a.click("#nwk")
    a.wait_for_timeout(200)
    head = a.text("#wkView table thead")
    check("Ø VORWOCHE" in head.upper() and "TREND" in head.upper(), "Spalten Vorwoche/Trend fehlen")
    rows = a.js("()=>[...document.querySelectorAll('#wkRes tr')].map(r=>r.lastElementChild.textContent)")
    check(rows and any(x != "kein Vergleich" for x in rows), f"Kein Vergleich trotz Vorwoche: {rows[:3]}")
    check(a.is_visible("#wkOutlook"), "Ausblick fehlt")
    out = a.text("#wkOutlook")
    check("Engpass bleibt" in out and "Fertigstellung" in out, f"Ausblick unvollständig: {out!r}")
    a.click("#wkPrev")
    a.wait_for_timeout(150)
    check(not a.is_visible("#wkOutlook"), "Ausblick erscheint in einer vergangenen Woche")
    a.click("#wkPrev")
    a.wait_for_timeout(150)
    rows = a.js("()=>[...document.querySelectorAll('#wkRes tr')].map(r=>r.lastElementChild.textContent)")
    check(all(x == "kein Vergleich" for x in rows), "Fehlender Vergleich nicht markiert")
    check(not [w for w in BAD_TEXT if w in a.text("#wkBody")], "Ungültige Werte im Wochenbericht")
    a.done()


@test
def zieltermin_plan_karten_je_plan_eigenes_datum(b, html, tmp):
    a = App(b, html, tmp)
    a.import_exports(a.make_exports())
    a.create_active_plan()
    second_plan(a)
    a.p.clock.set_fixed_time((NOW + dt.timedelta(minutes=2)).isoformat())
    a.create_plan("Entwurf")
    check(len(set(a.js("()=>s.plans.map(p=>p.id)"))) == 3, "Plan-IDs nicht eindeutig")
    a.click("#nw")
    check(a.locator("#tdCards .plan").count() == 3, "Nicht alle Pläne als Karte")
    check(a.locator("#tdCards .plan.off").count() == 1 and "nicht aktiv" in a.text("#tdCards .plan.off"),
          "Entwurf nicht ausgegraut")
    check(a.locator("#tdCards .plan.off input").count() == 0, "Entwurf hat ein Datumsfeld")
    set_target(a, "2026-11-01", 0)
    set_target(a, "2027-06-01", 1)
    st = [p.get("targetDate") for p in a.stored()["plans"]]
    check(st[:2] == ["2026-11-01", "2027-06-01"], f"Datum nicht je Plan gespeichert: {st}")
    check("Zweitplan" in a.text("#tdSel"), "Details folgen nicht dem zuletzt geänderten Plan")
    a.click("#tdCards .plan >> nth=0")
    a.wait_for_timeout(150)
    check("Operations 76" in a.text("#tdSel") and a.has_class("#tdCards .plan >> nth=0", "active"),
          "Klick auf die Karte zeigt nicht deren Details")
    check("NICHT ERREICHBAR" in a.text("#tdCards .plan >> nth=0").upper(), "Bewertung der ersten Karte falsch")
    check("NICHT ERREICHBAR" not in a.text("#tdCards .plan >> nth=1").upper(), "Bewertung der zweiten Karte falsch")
    a.done()


@test
def abschnitte_ab_20_stunden_abstand(b, html, tmp):
    st = load_v10_state()
    # Abstände 23 h, 23 h, 19 h, 25 h: zählen sollen 23, 23 und (19+25 →) 44 h = 3 Abschnitte
    times = ["2026-10-20T20:00:00.000Z", "2026-10-21T19:00:00.000Z", "2026-10-22T18:00:00.000Z",
             "2026-10-23T13:00:00.000Z", "2026-10-24T14:00:00.000Z"]
    st["snapshots"] = st["snapshots"][:5]
    for sn, tm in zip(st["snapshots"], times):
        sn["exportedAt"] = tm
    a = App(b, html, tmp, state=st)
    iv = a.js("()=>snapIntervals('7★ Rare Ore').map(x=>Math.round((x.b.t-x.a.t)/36e5))")
    check(iv == [23, 23, 44], f"Abschnitte falsch: {iv}")
    check("20 Stunden" in a.js("()=>TERMS.abschnitt"), "Erklärung „Abschnitt“ nennt nicht 20 Stunden")
    txt = page_texts(a)
    check("24 Stunden" not in txt and "< 24 h" not in txt, "Irgendwo steht noch 24 Stunden")
    a.done()


# ---------------------------------------------------------------- 2.1 Phase 3: Effizienzen


@test
def effizienzen_wirkung_und_verlauf(b, html, tmp):
    a = App(b, html, tmp)
    a.import_exports(a.make_exports())
    a.create_active_plan()
    a.click("#navRes")
    check(a.is_visible("#effPanel"), "Panel Effizienzen fehlt")
    body = a.text("#effBody")
    check("Noch kein Vergleich" in body, f"Ohne zweiten Import kein Hinweis: {body[:120]!r}")
    rows = a.locator("#effPanelRows tr").count()
    check(rows >= 3, f"Zu wenige Zeilen: {rows}")
    hist = a.js("()=>s.plans[0].planData.history.map(h=>!!h.efficiencies)")
    check(hist and all(hist), f"Effizienzen nicht in der Planhistorie: {hist}")
    # Kosten = Grundkosten ÷ (1 + Effizienz): Ersparnis-Spalte = Grundkosten − Kosten
    r = a.js("()=>{const r=s.plans[0].planData.resources['Σ-Parsteel'];return [r.base,r.cost]}")
    check(f"−{a.js('(v)=>fmt(v)', r[0] - r[1])}" in a.text("#effPanelRows"), "Ersparnis falsch")
    # Zweiter Import mit höherer Parsteel-Effizienz
    a.p.clock.set_fixed_time((NOW + dt.timedelta(hours=2)).isoformat())
    a.close_modals()
    a.click("#nd")
    a.click("#managePlanBtn")
    a.click("#openOcrBtn")
    eff = fixture("plan_efficiencies.txt").replace("Σ-Parsteel\t60000000000\t2000000000\t3.000 %",
                                                   "Σ-Parsteel\t60000000000\t2000000000\t3.500 %")
    check(eff != fixture("plan_efficiencies.txt"), "Testdaten nicht geändert")
    a.import_texts(fixture("plan_upgrades.txt"), fixture("plan_resources.txt"), eff)
    a.close_modals()
    a.click("#navRes")
    body = a.text("#effBody")
    check("1 Effizienz gestiegen" in body, f"Änderung nicht erkannt: {body[:200]!r}")
    check("+500 %-P." in a.text("#effPanelRows"), f"Änderung in der Tabelle fehlt: {a.text('#effPanelRows')[:200]!r}")
    check(any(w in body for w in ("früher", "später", "kein ganzer Tag", "nicht berechenbar")),
          "Einfluss auf den Termin fehlt")
    check(not [w for w in BAD_TEXT if w in body], "Ungültige Werte im Panel")
    a.done()


@test
def wochenbericht_zeigt_effizienzaenderungen(b, html, tmp):
    st = load_v10_state()
    pd = st["plans"][0]["planData"]
    old = dict(pd["efficiencies"])
    new = dict(old)
    k = next(iter(new))
    new[k] = old[k] + 50
    pd["history"] = (pd.get("history") or []) + [
        {"at": "2026-10-17T10:00:00.000Z", "kind": "Import", "progress": None, "resources": None, "construction": None, "efficiencies": old},
        {"at": "2026-10-22T10:00:00.000Z", "kind": "Import", "progress": None, "resources": None, "construction": None, "efficiencies": new},
    ]
    a = App(b, html, tmp, state=st)
    a.click("#nwk")
    a.wait_for_timeout(150)
    line = a.text(".wkEff")
    check(k in line and "(+" in line, f"Effizienzänderung fehlt: {line!r}")
    a.click("#wkPrev")
    a.wait_for_timeout(150)
    check("kein Vergleich" in a.text(".wkEff"), f"Vorwoche ohne Vergleichsmarkierung: {a.text('.wkEff')!r}")
    a.done()
    a = App(b, html, tmp, state=load_v10_state())
    a.click("#nwk")
    a.wait_for_timeout(150)
    check("noch kein Verlauf" in a.text(".wkEff"), "Hinweis ohne Verlauf fehlt")
    a.done()


@test
def keine_doppelten_element_ids(b, html, tmp):
    """Fund nach 2.1.0: Die Effizienz-Tabelle hatte dieselbe ID wie die Liste im Import-Assistenten."""
    a = App(b, html, tmp, state=load_v10_state())
    for sel in ("#navRes", "#navFc", "#nw", "#nwk", "#ni", "#nd"):
        a.close_modals()
        a.click(sel)
        a.wait_for_timeout(150)
        dup = a.js("()=>{const c={};document.querySelectorAll('[id]').forEach(e=>c[e.id]=(c[e.id]||0)+1);return Object.keys(c).filter(k=>c[k]>1)}")
        check(not dup, f"Doppelte IDs nach {sel}: {dup}")
    # Import-Assistent zeigt die erkannten Effizienzen in seiner eigenen Tabelle
    a.click("#navRes")
    a.click("#managePlanBtn")
    a.click("#openOcrBtn")
    a.click('.impStepBtn[data-step="3"]')
    a.fill("#effText", fixture("plan_efficiencies.txt"))
    a.dispatch_event("#effText", "input")
    a.wait_for_timeout(200)
    check("%" in a.text("#ocrModal #effRows"), "Effizienzen erscheinen nicht im Import-Assistenten")
    a.done()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("html", nargs="?")
    ap.add_argument("-k", default="")
    a = ap.parse_args()
    if a.html:
        html = pathlib.Path(a.html).resolve()
    else:
        out = subprocess.run([sys.executable, str(ROOT / "tools" / "build.py")], capture_output=True, text=True)
        if out.returncode:
            sys.exit(out.stdout + out.stderr)
        html = pathlib.Path(out.stdout.split("gebaut: ")[1].split("  (")[0]).resolve()
    print(f"Teste {html.name}\n")
    chosen = [t for t in TESTS if a.k in t.__name__]
    failed = 0
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for t in chosen:
            with tempfile.TemporaryDirectory() as d:
                try:
                    t(b, html, pathlib.Path(d))
                    print(f"  ok      {t.__name__}")
                except Fail as e:
                    failed += 1
                    print(f"  FEHLER  {t.__name__}: {e}")
                except Exception:
                    failed += 1
                    print(f"  FEHLER  {t.__name__}:\n" + traceback.format_exc(limit=3))
        b.close()
    print(f"\n{len(chosen) - failed} von {len(chosen)} Tests bestanden.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
