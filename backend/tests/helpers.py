"""Doublures de test : fausses reponses et faux clients HTTP asynchrones."""

from typing import Any


class FakeResponse:
    """Reproduit l'interface minimale d'une reponse httpx."""

    def __init__(
        self,
        status_code: int = 200,
        json_data: Any = None,
        content: bytes = b"",
        headers: dict[str, str] | None = None,
    ) -> None:
        self.status_code = status_code
        self._json = json_data
        self.content = content
        self.text = content.decode("utf-8", errors="replace")
        self.headers = headers or {"content-type": "application/json"}

    def json(self) -> Any:
        """Retourne le corps JSON, ou leve ValueError s'il est absent."""
        if self._json is None:
            raise ValueError("Aucun JSON dans cette reponse")
        return self._json


class FakeClient:
    """Faux client httpx.AsyncClient : enregistre les appels et renvoie des reponses.

    Accepte une reponse unique (repetee) ou une liste (consommee dans l'ordre,
    la derniere etant repetee une fois la liste epuisee).
    """

    def __init__(self, response: FakeResponse | list[FakeResponse]) -> None:
        self._responses = list(response) if isinstance(response, list) else [response]
        self.calls: list[tuple[str, str, dict]] = []

    def _next(self) -> FakeResponse:
        if len(self._responses) > 1:
            return self._responses.pop(0)
        return self._responses[0]

    async def request(self, method: str, url: str, **kwargs: Any) -> FakeResponse:
        self.calls.append((method, url, kwargs))
        return self._next()

    async def post(self, url: str, **kwargs: Any) -> FakeResponse:
        self.calls.append(("POST", url, kwargs))
        return self._next()

    async def get(self, url: str, **kwargs: Any) -> FakeResponse:
        self.calls.append(("GET", url, kwargs))
        return self._next()
