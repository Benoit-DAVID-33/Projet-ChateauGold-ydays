"""Tests de non-regression.

Chaque test fige un comportement qui a deja casse (ou failli casser) afin de
garantir qu'il ne regressera pas dans une version future.

Cas couvert : sous un serveur qui supporte l'envoi direct de fichier
(``pathsend``, ex. granian), les fichiers statiques texte renvoyaient ``500``
car le middleware gzip differait l'envoi du message ``start``. TestClient ne
reproduit pas ``pathsend`` : on simule donc le flux ASGI.
"""

import asyncio

from server.caching import SelectiveGZipMiddleware


def test_gzip_middleware_forwards_pathsend():
    """Un envoi direct de fichier (pathsend) ne doit pas etre bloque."""
    messages: list[dict] = []

    async def app(_scope, _receive, send):
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", b"text/css")],
            }
        )
        await send({"type": "http.response.pathsend", "path": "style.css"})

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http",
        "path": "/static/css/style.css",
        "headers": [(b"accept-encoding", b"gzip")],
    }
    asyncio.run(SelectiveGZipMiddleware(app)(scope, None, send))

    assert [message["type"] for message in messages] == [
        "http.response.start",
        "http.response.body",
        "http.response.pathsend",
    ]


def test_static_file_is_served_intact(client):
    """Le fichier statique doit etre servi (jamais une erreur 500) et complet."""
    response = client.get("/static/css/style.css")
    assert response.status_code == 200
    assert len(response.content) > 1000
