import jwt
import time
import requests
import os


def _get_config():
    """Récupère la config à chaque appel (pour être sûr que le .env est chargé)."""
    return {
        "base_url": os.environ.get("KLING_API_BASE_URL", "https://api.klingai.com"),
        "access_key": os.environ.get("KLING_ACCESS_KEY", ""),
        "secret_key": os.environ.get("KLING_SECRET_KEY", ""),
    }


def generate_jwt_token():
    """Génère un JWT token pour l'API Kling AI."""
    cfg = _get_config()
    now = int(time.time())
    payload = {
        "iss": cfg["access_key"],
        "exp": now + 3600,   # Expire dans 1 heure
        "nbf": now - 5,      # Valide 5 secondes avant (tolérance horloge)
        "iat": now - 10,
        "jti": f"idt{int(time.time() * 1000)}",
    }
    token = jwt.encode(payload, cfg["secret_key"], algorithm="HS256")
    return token


def kling_request(method, endpoint, **kwargs):
    """Effectue une requête authentifiée vers l'API Kling."""
    cfg = _get_config()
    token = generate_jwt_token()
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {token}"
    headers.setdefault("Content-Type", "application/json")

    url = f"{cfg['base_url']}{endpoint}"
    response = requests.request(method, url, headers=headers, timeout=300, **kwargs)
    return response


def test_connection():
    """Teste la connexion à l'API Kling sans consommer de crédits.
    Fait un GET sur un faux task_id : si auth OK → erreur 'not found', si auth KO → 401/403.
    """
    try:
        resp = kling_request("GET", "/v1/images/generations/test-connection-check")
        status = resp.status_code
        data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        code = data.get("code", None)

        # Auth réussie : l'API répond (même si la tâche n'existe pas)
        if status == 200 or code in (None, 0, "not_found", "RESOURCE_NOT_FOUND", "NOT_FOUND"):
            return {"ok": True, "message": "Connexion API Kling réussie (authentification OK)", "status": status, "detail": data}
        if status in (401, 403):
            return {"ok": False, "message": "Authentification échouée (clés invalides)", "status": status, "detail": data}
        # Tout autre code != 401/403 = auth OK mais endpoint inconnu
        return {"ok": True, "message": "Connexion API Kling réussie (authentification OK)", "status": status, "detail": data}
    except requests.exceptions.ConnectionError:
        return {"ok": False, "message": "Impossible de joindre le serveur Kling (vérifiez votre connexion internet)"}
    except Exception as e:
        return {"ok": False, "message": f"Erreur: {str(e)}"}


def generate_image(prompt, negative_prompt="", model="kling-v1", n=1, aspect_ratio="16:9"):
    """Génère une image via l'API Kling.
    Doc: POST /v1/images/generations
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "n": n,
        "aspect_ratio": aspect_ratio,
    }
    if negative_prompt:
        payload["negative_prompt"] = negative_prompt

    resp = kling_request("POST", "/v1/images/generations", json=payload)
    return resp.json()


def get_image_task(task_id):
    """Récupère le statut d'une tâche de génération d'image.
    Doc: GET /v1/images/generations/{task_id}
    """
    resp = kling_request("GET", f"/v1/images/generations/{task_id}")
    return resp.json()


def generate_video(prompt, model="kling-v1", duration="5", aspect_ratio="16:9", mode="std"):
    """Génère une vidéo via l'API Kling.
    Doc: POST /v1/videos/text2video
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
        "mode": mode,
    }
    resp = kling_request("POST", "/v1/videos/text2video", json=payload)
    return resp.json()


def get_video_task(task_id):
    """Récupère le statut d'une tâche de génération de vidéo.
    Doc: GET /v1/videos/text2video/{task_id}
    """
    resp = kling_request("GET", f"/v1/videos/text2video/{task_id}")
    return resp.json()


def image_to_video(image_url, prompt="", model="kling-v1", duration="5", mode="std"):
    """Génère une vidéo à partir d'une image via l'API Kling.
    Doc: POST /v1/videos/image2video
    """
    payload = {
        "model": model,
        "image": image_url,
        "duration": duration,
        "mode": mode,
    }
    if prompt:
        payload["prompt"] = prompt

    resp = kling_request("POST", "/v1/videos/image2video", json=payload)
    return resp.json()


def get_image2video_task(task_id):
    """Récupère le statut d'une tâche image-to-video.
    Doc: GET /v1/videos/image2video/{task_id}
    """
    resp = kling_request("GET", f"/v1/videos/image2video/{task_id}")
    return resp.json()


# ============================================
# OMNI-VIDEO (Transformation vidéo, text-to-video, etc.)
# ============================================

def omni_video(prompt, video_url=None, image_list=None, duration="5", mode="pro",
               aspect_ratio=None, model_name="kling-video-o1", refer_type="base"):
    """Endpoint Omni-Video de Kling : transformation vidéo, text-to-video, image-to-video...
    Doc: POST /v1/videos/omni-video

    - Avec video_url + refer_type="base" : modifie la vidéo selon le prompt (transformation)
    - Avec video_url + refer_type="feature" : utilise la vidéo comme référence de style
    - Sans video_url : text-to-video classique
    - Avec image_list : image-to-video ou référence d'image
    """
    payload = {
        "model_name": model_name,
        "prompt": prompt,
        "mode": mode,
        "duration": duration,
    }

    if aspect_ratio:
        payload["aspect_ratio"] = aspect_ratio

    if video_url:
        payload["video_list"] = [{
            "video_url": video_url,
            "refer_type": refer_type,
            "keep_original_sound": "yes"
        }]
        # En mode "base" (transformation), on ne contrôle pas la durée ni l'aspect ratio
        if refer_type == "base":
            payload.pop("duration", None)
            payload.pop("aspect_ratio", None)

    if image_list:
        payload["image_list"] = image_list

    resp = kling_request("POST", "/v1/videos/omni-video", json=payload)
    return resp.json()


def get_omni_video_task(task_id):
    """Récupère le statut d'une tâche Omni-Video.
    Doc: GET /v1/videos/omni-video/{task_id}
    """
    resp = kling_request("GET", f"/v1/videos/omni-video/{task_id}")
    return resp.json()
