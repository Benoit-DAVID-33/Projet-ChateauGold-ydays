"""Tests fonctionnels : parcours utilisateur complets, de bout en bout.

On ne regarde que l'entree (requetes) et la sortie (reponses) : le parcours doit
etre conforme aux specifications fonctionnelles.
"""


def _register_and_login(client, username="alice", password="pw12345"):
    client.post(
        "/register",
        data={"username": username, "email": f"{username}@example.com", "password": password},
        follow_redirects=False,
    )
    return client.post(
        "/login",
        data={"username": username, "password": password},
        follow_redirects=False,
    )


def test_journey_register_login_and_browse(client):
    """Un visiteur s'inscrit, se connecte et accede aux pages."""
    login = _register_and_login(client)
    assert login.status_code == 303
    home = client.get("/")
    assert home.status_code == 200
    assert "alice@example.com" in home.text


def test_journey_upload_view_delete_image(client, media_folders):
    """Un utilisateur connecte uploade une image, la consulte, puis la supprime."""
    _, image_folder = media_folders
    _register_and_login(client)

    upload = client.post(
        "/upload",
        files={"file": ("photo.png", b"PNGDATA", "image/png")},
        follow_redirects=False,
    )
    assert upload.status_code == 303
    assert (image_folder / "photo.png").read_bytes() == b"PNGDATA"

    served = client.get("/images/photo.png")
    assert served.status_code == 200
    assert served.content == b"PNGDATA"

    deleted = client.post("/delete/photo.png")
    assert deleted.json() == {"status": "deleted"}
    assert not (image_folder / "photo.png").exists()


def test_journey_contact_form(client, monkeypatch):
    """Un utilisateur connecte envoie le formulaire de contact."""
    from server.routers import pages

    async def fake_send(name, email, message):
        return None

    _register_and_login(client)
    monkeypatch.setattr(pages, "send_contact_email", fake_send)
    response = client.post(
        "/contact",
        data={"name": "Alice", "email": "alice@example.com", "message": "Bonjour"},
    )
    assert response.status_code == 200
    assert "envoyé avec succès" in response.text


def test_journey_logout_blocks_access(client):
    """Apres deconnexion, les pages protegees redirigent vers la connexion."""
    _register_and_login(client)
    client.get("/logout", follow_redirects=False)
    assert client.get("/", follow_redirects=False).status_code == 303
