"""Tests du parcours d'authentification et du formulaire de contact."""

from server import mailer, security


def test_register_then_login(client):
    register = client.post(
        "/register",
        data={"username": "bob", "email": "bob@example.com", "password": "pw12345"},
        follow_redirects=False,
    )
    assert register.status_code == 303
    login = client.post(
        "/login",
        data={"username": "bob", "password": "pw12345"},
        follow_redirects=False,
    )
    assert login.status_code == 303
    assert client.get("/", follow_redirects=False).status_code == 200


def test_login_wrong_credentials(client):
    response = client.post("/login", data={"username": "inconnu", "password": "nope"})
    assert response.status_code == 200
    assert "Identifiants incorrects" in response.text


def test_register_duplicate_username(client):
    security.create_user("bob", "bob@example.com", "pw12345")
    response = client.post(
        "/register",
        data={"username": "bob", "email": "other@example.com", "password": "pw12345"},
    )
    assert "existe déjà" in response.text


def test_login_redirects_when_authenticated(auth_client):
    response = auth_client.get("/login", follow_redirects=False)
    assert response.status_code == 303


def test_contact_success(auth_client, monkeypatch):
    from server.routers import pages

    async def ok(name, email, message):
        return None

    monkeypatch.setattr(pages, "send_contact_email", ok)
    response = auth_client.post(
        "/contact",
        data={"name": "Alice", "email": "alice@example.com", "message": "Bonjour"},
    )
    assert "envoyé avec succès" in response.text


def test_contact_mail_failure(auth_client, monkeypatch):
    from server.routers import pages

    async def boom(name, email, message):
        raise mailer.MailError("smtp down")

    monkeypatch.setattr(pages, "send_contact_email", boom)
    response = auth_client.post(
        "/contact",
        data={"name": "Alice", "email": "alice@example.com", "message": "Bonjour"},
    )
    assert "Réessayez plus tard" in response.text
