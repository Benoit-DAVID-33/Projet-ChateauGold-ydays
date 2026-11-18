"""Parcours utilisateur complet de GOLD FX dans Chromium (Playwright).

Lancé par ``e2e/run.sh`` : l'API, le faux Kling et l'aperçu du frontend tournent déjà.
Variables : E2E_BASE (frontend), E2E_FIXTURES (médias de test), E2E_KLING (faux Kling).
Sortie : captures dans <sortie>/shots, résultats dans <sortie>/results.json.
Code de retour non nul si une étape échoue.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from collections.abc import Callable
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

BASE = os.environ.get("E2E_BASE", "http://localhost:4173")
FIXTURES = Path(os.environ["E2E_FIXTURES"])
KLING = os.environ.get("E2E_KLING", "http://127.0.0.1:8766")
OUT = Path(sys.argv[1])
SHOTS = OUT / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
USER = f"e2e{int(time.time()) % 100000}"
PASSWORD = "motdepasse-e2e"
GENERATION_TIMEOUT_MS = 40_000  # faux Kling : 2 s de traitement, interrogation toutes les 5 s

results: list[tuple[str, bool, str]] = []
console_errors: list[str] = []


def check(name: str, step: Callable[[], object]) -> None:
    try:
        detail = step() or ""
        results.append((name, True, str(detail)))
        print(f"[OK]    {name} {detail}", flush=True)
    except Exception as exc:  # noqa: BLE001
        results.append((name, False, repr(exc)[:400]))
        print(f"[ECHEC] {name} {repr(exc)[:400]}", flush=True)


def shot(page: Page, name: str) -> None:
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=False)


def ffprobe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height",
         "-show_entries", "format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def kling_requests() -> list[dict]:
    with urllib.request.urlopen(f"{KLING}/__requests", timeout=5) as response:  # noqa: S310
        return json.loads(response.read())


def ignorable(message: str) -> bool:
    # Erreurs attendues : 401 de /api/auth/me avant connexion, médias interrompus par la navigation.
    # Hors ligne (bac à sable sans Internet), la vidéo d'accueil hébergée à l'extérieur échoue.
    offline = "ERR_TUNNEL_CONNECTION_FAILED" in message or "ERR_NAME_NOT_RESOLVED" in message
    return "401" in message or "net::ERR_ABORTED" in message or offline


def run_workflow(page: Page) -> str:
    """Charge le modèle « Transformer la vidéo de l'Atelier », l'exécute puis l'enregistre."""
    editor = page.get_by_role("region", name="Éditeur de workflow")
    expect(editor).to_be_visible()
    toolbar = page.get_by_role("group", name="Actions du workflow")
    toolbar.get_by_role("button", name="Modèles").click()
    page.get_by_role("button", name="Utiliser le modèle « Transformer la vidéo de l'Atelier »").click()
    confirm = page.get_by_role("button", name=re.compile("^Remplacer"))
    if confirm.count():
        confirm.click()
    expect(editor.get_by_role("group", name="Nœud Omni-Video")).to_be_visible()
    shot(page, "10-workflow-modele")
    before = len([r for r in kling_requests() if r["path"] == "/v1/videos/omni-video"])
    toolbar.get_by_role("button", name="Exécuter", exact=True).click()
    output = editor.get_by_role("group", name="Nœud Sortie")
    expect(output.get_by_text("Terminé", exact=True)).to_be_visible(timeout=GENERATION_TIMEOUT_MS)
    omni = [r for r in kling_requests() if r["path"] == "/v1/videos/omni-video"]
    assert len(omni) == before + 1, len(omni)
    prompt = omni[-1]["body"]["prompt"]
    assert "film noir" in prompt and "Cube" in prompt, prompt[:300]
    shot(page, "10-workflow-execute")
    toolbar.get_by_role("button", name="Enregistrer", exact=True).click()
    page.get_by_label("Nom du workflow").fill("Film noir e2e")
    page.get_by_role("dialog").get_by_role("button", name="Enregistrer").click()
    expect(toolbar.get_by_text("Enregistré", exact=True)).to_be_visible()
    expect(toolbar.get_by_role("heading", name="Film noir e2e")).to_be_visible()
    return "Assistant IA (annotations) puis Omni-Video, workflow enregistré"


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = browser.new_context(viewport={"width": 1600, "height": 960}, accept_downloads=True)
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and console_errors.append(m.text))
    page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))

    def atelier_tab(name: str):
        return page.get_by_role("tablist", name="Mode de l'Atelier").get_by_role("tab", name=name)

    def outputs():
        return page.get_by_role("list", name="Sorties")

    # 1. Garde d'authentification
    def guard():
        page.goto(f"{BASE}/video")
        expect(page).to_have_url(re.compile(r"/login\?next=%2Fvideo"))
        expect(page.get_by_text("Veuillez vous connecter")).to_be_visible()
        shot(page, "01-login")
    check("redirection vers /login avec ?next", guard)

    # 2. Inscription puis connexion
    def register_login():
        page.get_by_role("link", name="Créer un compte").click()
        expect(page.get_by_role("heading", name="Créer un compte")).to_be_visible()
        page.get_by_label("Nom d'utilisateur", exact=True).fill(USER)
        page.get_by_label("Email").fill(f"{USER}@example.com")
        page.get_by_label("Mot de passe").fill(PASSWORD)
        page.get_by_role("button", name="Créer mon compte").click()
        expect(page.get_by_text("Compte créé avec succès")).to_be_visible()
        page.get_by_label("Nom d'utilisateur ou email", exact=True).fill(USER)
        page.get_by_label("Mot de passe").fill(PASSWORD)
        page.get_by_role("button", name="Se connecter").click()
        expect(page.get_by_role("heading", name=re.compile("Gérez, éditez"))).to_be_visible()
        shot(page, "02-home")
    check("inscription, connexion, accueil", register_login)

    # 3. Barre globale sans média : Entrée ouvre la page Recherche
    def bar_without_media():
        page.get_by_role("link", name="Vidéo", exact=True).first.click()
        expect(page.get_by_role("heading", name="Gestion des Vidéos")).to_be_visible()
        expect(atelier_tab("Texte vers vidéo")).to_have_attribute("aria-selected", "true")
        expect(atelier_tab("Annoter")).to_be_disabled()
        page.get_by_role("searchbox", name="Requête").fill("idées de transitions")
        page.keyboard.press("Enter")
        expect(page).to_have_url(re.compile(r"/search\?q="))
        expect(page.get_by_text("Requête reçue")).to_be_visible()
    check("page Vidéo sans média : Atelier texte, Entrée vers Recherche", bar_without_media)

    # 4. Texte vers image depuis l'Atelier sans média (faux Kling)
    def text_to_image():
        page.get_by_role("link", name="Image", exact=True).first.click()
        expect(atelier_tab("Texte vers image")).to_have_attribute("aria-selected", "true")
        generate = page.get_by_role("button", name="Générer")
        expect(generate).to_be_disabled()
        page.get_by_label("Prompt", exact=True).fill("Un phare au coucher du soleil")
        page.get_by_label("Format").select_option("1:1")
        page.get_by_label("Nombre d'images").fill("2")
        shot(page, "03-atelier-texte-image")
        generate.click()
        expect(outputs().get_by_text("Génération terminée")).to_be_visible(
            timeout=GENERATION_TIMEOUT_MS
        )
        expect(outputs().locator("article")).to_have_count(2)
        sent = [r for r in kling_requests() if r["path"] == "/v1/images/generations"][-1]["body"]
        assert sent["prompt"] == "Un phare au coucher du soleil", sent
        assert sent["n"] == 2 and sent["aspect_ratio"] == "1:1", sent
        shot(page, "04-atelier-sorties")
        return "2 images reçues"
    check("Atelier : texte vers image (2 résultats)", text_to_image)

    # 5. Upload d'une image : Atelier en mode Annoter
    image_id: dict[str, str] = {}
    def upload_image():
        page.locator("input[type=file]").set_input_files(str(FIXTURES / "img.png"))
        page.wait_for_url(re.compile(r"/image/[0-9a-f-]{36}"))
        image_id["id"] = page.url.rsplit("/", 1)[1]
        page.locator("canvas").first.wait_for(state="visible")
        expect(atelier_tab("Annoter")).to_have_attribute("aria-selected", "true")
        expect(page.get_by_role("heading", name="Outils d'édition")).to_be_visible()
        return image_id["id"]
    check("upload d'une image : Atelier en mode Annoter", upload_image)

    tools = page.get_by_role("complementary", name="Outils d'édition")

    def add_square():
        tools.get_by_role("button", name=re.compile("^Carré$")).click()
        page.wait_for_timeout(300)
        expect(page.get_by_role("heading", name="Outils d'édition")).to_be_visible()
    check("outil Formes : carré (la colonne reste ouverte)", add_square)

    def add_text():
        tools.locator("summary", has_text="Texte").click()
        tools.get_by_label(re.compile("^Texte")).fill("GOLD")
        tools.get_by_role("button", name="Activer le mode texte").click()
        box = page.locator("canvas").first.bounding_box()
        page.mouse.click(box["x"] + box["width"] * 0.2, box["y"] + box["height"] * 0.8)
        page.wait_for_timeout(300)
    check("outil Texte", add_text)

    def draw_marker():
        tools.get_by_role("button", name=re.compile("Feutre")).click()
        box = page.locator("canvas").first.bounding_box()
        x0, y0 = box["x"] + box["width"] * 0.6, box["y"] + box["height"] * 0.3
        page.mouse.move(x0, y0)
        page.mouse.down()
        for i in range(12):
            page.mouse.move(x0 + i * 8, y0 + (i % 3) * 6)
        page.mouse.up()
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        layers = page.get_by_role("region", name="Calques")
        expect(layers.get_by_role("listitem")).to_have_count(3)
        shot(page, "05-atelier-annoter")
    check("outil Dessin (feutre) et calques", draw_marker)

    def prompt_composer():
        page.get_by_label("Prompt", exact=True).fill("Ajouter des lueurs dorées autour des formes")
        include = page.get_by_label(re.compile(r"Inclure les annotations \(3 éléments\)"))
        expect(include).to_be_checked()
        page.get_by_text("Aperçu du prompt final").click()
        preview = page.get_by_role("textbox", name=re.compile("Aperçu", re.I)).input_value()
        assert "Ajouter des lueurs dorées" in preview, preview[:200]
        assert "Carré" in preview and "GOLD" in preview, preview[:400]
        assert "sur l'image" in preview, preview[:200]
        shot(page, "06-atelier-prompt")
        return "prompt avec intention, Carré et GOLD"
    check("bloc Prompt : annotations décrites dans le prompt", prompt_composer)

    def export_png():
        with page.expect_download() as download:
            page.get_by_role("button", name="Télécharger l'image modifiée").click()
        path = OUT / "export.png"
        download.value.save_as(path)
        info = ffprobe(path)["streams"][0]
        assert (info["width"], info["height"]) == (320, 240), info
        return f"{download.value.suggested_filename} {info['width']}x{info['height']}"
    check("export PNG à la résolution native (320x240)", export_png)

    def send_api():
        page.get_by_role("button", name="Envoyer à l'API").click()
        left = page.get_by_role("complementary", name="Outils, prompt et paramètres")
        expect(left.get_by_text("Image envoyée et traitée avec succès.")).to_be_visible(
            timeout=15_000
        )
        # Les sorties sont propres au média ouvert : seul le résultat du traitement apparaît.
        expect(outputs().locator("article")).to_have_count(1)
        expect(page.get_by_text("Résultats liés à ce média")).to_be_visible()
        shot(page, "07-atelier-traitement")
    check("Annoter : envoi à l'API de traitement", send_api)

    def image_to_video():
        atelier_tab("Image vers vidéo").click()
        page.get_by_label("Qualité").select_option("pro")
        page.get_by_role("button", name="Générer").click()
        expect(outputs().get_by_text("Génération terminée").first).to_be_visible(
            timeout=GENERATION_TIMEOUT_MS
        )
        sent = [r for r in kling_requests() if r["path"] == "/v1/videos/image2video"][-1]["body"]
        assert sent["mode"] == "pro", sent
        assert "lueurs dorées" in sent.get("prompt", ""), sent
        return "vidéo reçue"
    check("Atelier : image vers vidéo", image_to_video)

    # 6. Vidéo : upload, objet 3D, chronologie, export MP4, Omni-Video
    def video_flow():
        page.get_by_role("link", name="Vidéo", exact=True).first.click()
        page.locator("input[type=file]").set_input_files(str(FIXTURES / "clip.webm"))
        page.wait_for_url(re.compile(r"/video/[0-9a-f-]{36}"))
        page.locator("video").first.wait_for(state="visible")
        page.wait_for_function("document.querySelector('video').readyState >= 1")
        tools.locator("summary", has_text="Objets 3D").click()
        tools.get_by_role("button", name=re.compile("Cube")).click()
        page.wait_for_timeout(300)
        timeline = page.get_by_role("region", name="Chronologie")
        expect(timeline.get_by_role("slider").first).to_be_visible()
        shot(page, "08-atelier-video")
        with page.expect_download(timeout=90_000) as download:
            page.get_by_role("button", name="Télécharger la vidéo annotée").click()
        path = OUT / "video_annotee.mp4"
        download.value.save_as(path)
        probe = ffprobe(path)
        codecs = sorted(s["codec_name"] for s in probe["streams"])
        assert "h264" in codecs, codecs
        duration = float(probe["format"]["duration"])
        return f"{download.value.suggested_filename} codecs={codecs} durée={duration:.1f}s"
    check("vidéo : objet 3D, chronologie, export MP4 annoté", video_flow)

    def native_controls():
        video = page.locator("video").first
        box = video.bounding_box()
        target = page.evaluate(
            "([x, y]) => document.elementFromPoint(x, y).tagName",
            [box["x"] + 30, box["y"] + box["height"] - 12],
        )
        assert target == "VIDEO", f"élément sous la barre de contrôle : {target}"
    check("contrôles natifs de la vidéo accessibles", native_controls)

    def omni_video():
        atelier_tab("Omni-Video").click()
        expect(page.get_by_label("Durée")).to_have_count(0)
        page.get_by_label("Prompt", exact=True).fill("Style film noir")
        page.get_by_role("button", name="Générer").click()
        expect(outputs().get_by_text("Génération terminée").first).to_be_visible(
            timeout=GENERATION_TIMEOUT_MS
        )
        sent = [r for r in kling_requests() if r["path"] == "/v1/videos/omni-video"][-1]["body"]
        video_url = sent["video_list"][0]["video_url"]
        assert "/api/public/media/" in video_url, video_url
        assert sent["mode"] == "pro", sent
        status = urllib.request.urlopen(video_url, timeout=5).status  # noqa: S310
        assert status == 200, status
        shot(page, "09-atelier-omni")
        return "lien signé transmis et téléchargeable"
    check("Atelier : Omni-Video avec lien signé", omni_video)

    # 7. Onglet Workflow
    def workflow():
        page.get_by_role("tab", name="Workflow").click()
        return run_workflow(page)
    check("Workflow : modèle exécuté jusqu'au résultat", workflow)

    # 8. Bibliothèque, contact, recherche
    def library():
        page.get_by_role("link", name="Bibliothèque").click()
        expect(page.get_by_role("heading", name="Bibliothèque")).to_be_visible()
        page.wait_for_timeout(1500)
        count = page.locator("article").count()
        assert count >= 8, count
        shot(page, "11-bibliotheque")
        return f"{count} médias"
    check("bibliothèque", library)

    def contact():
        page.get_by_role("link", name="Contact").click()
        page.get_by_label("Message").fill("Test de bout en bout")
        page.get_by_role("button", name="Envoyer", exact=True).click()
        expect(page.get_by_text("Votre message a été envoyé avec succès")).to_be_visible()
    check("formulaire de contact", contact)

    def search():
        page.goto(f"{BASE}/search?q=bonjour%20%3Cscript%3E")
        expect(page.get_by_text("Requête reçue")).to_be_visible()
        assert page.evaluate("document.querySelectorAll('main script').length") == 0
    check("recherche (sans injection HTML)", search)

    # 9. Mobile : colonnes empilées, outils en tiroir
    def mobile():
        m = ctx.new_page()
        m.set_viewport_size({"width": 390, "height": 844})
        m.goto(f"{BASE}/image/{image_id['id']}")
        m.locator("canvas").first.wait_for(state="visible")
        expect(m.get_by_role("heading", name="Outils d'édition")).to_be_hidden()
        m.get_by_role("button", name="Outils", exact=True).click()
        expect(m.get_by_role("heading", name="Outils d'édition")).to_be_in_viewport()
        shot(m, "12-mobile-outils")
        m.keyboard.press("Escape")
        expect(m.get_by_label("Prompt", exact=True)).to_be_visible()
        width = m.evaluate("document.documentElement.scrollWidth")
        assert width <= 390, f"défilement horizontal : {width}px"
        m.get_by_role("button", name="Ouvrir le menu").click()
        shot(m, "13-mobile-menu")
        m.close()
    check("mobile : colonnes empilées, tiroir Outils, pas de défilement horizontal", mobile)

    def logout():
        page.goto(f"{BASE}/")
        page.get_by_role("button", name="Profil").click()
        page.get_by_role("menuitem", name="Déconnexion").click()
        expect(page).to_have_url(re.compile("/login"))
    check("déconnexion", logout)

    browser.close()

errors = [e for e in console_errors if not ignorable(e)]
ok = sum(1 for _, passed, _ in results if passed)
print(f"\n{ok}/{len(results)} étapes réussies")
print("Erreurs console :", errors[:10] if errors else "aucune")
(OUT / "results.json").write_text(
    json.dumps({"results": results, "console": console_errors}, indent=2, ensure_ascii=False)
)
sys.exit(0 if ok == len(results) and not errors else 1)
