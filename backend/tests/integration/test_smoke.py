"""Tests de fumee : contrat HTTP, authentification, pages."""


def test_login_page_renders(client):
    response = client.get("/login")
    assert response.status_code == 200
    assert "/static/css/style.css" in response.text


def test_root_redirects_to_login(client):
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"].startswith("/login")


def test_static_served(client):
    assert client.get("/static/css/style.css").status_code == 200


def test_openapi_docs(client):
    assert client.get("/api/docs").status_code == 200


def test_kling_requires_auth(client):
    assert client.get("/kling/test").status_code == 401


def test_delete_requires_auth(client):
    assert client.post("/delete/whatever.png").status_code == 401


def test_upload_requires_auth(client):
    response = client.post(
        "/upload",
        files={"file": ("x.png", b"data", "image/png")},
        follow_redirects=False,
    )
    assert response.status_code == 303


def test_authenticated_pages(auth_client):
    for path in ["/", "/video", "/image", "/information", "/contact", "/search?q=test"]:
        assert auth_client.get(path).status_code == 200, path


def test_logout_clears_session(auth_client):
    auth_client.get("/logout", follow_redirects=False)
    assert auth_client.get("/", follow_redirects=False).status_code == 303


def test_contact_validation(auth_client):
    response = auth_client.post("/contact", data={"name": "", "email": "", "message": ""})
    assert response.status_code == 200
    assert "Veuillez remplir tous les champs" in response.text


def test_register_requires_fields(auth_client):
    response = auth_client.post("/register", data={"username": "", "email": "", "password": ""})
    assert response.status_code == 200
    assert "Veuillez remplir tous les champs" in response.text


def test_main_app_importable():
    import main

    assert main.app is not None
