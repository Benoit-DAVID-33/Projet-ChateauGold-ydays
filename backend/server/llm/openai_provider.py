"""Fournisseur generique compatible API OpenAI.

Un seul adaptateur couvre de nombreux services qui exposent ``/chat/completions`` :
Hugging Face Inference (routeur, ex. MiniMax), MiniMax, vLLM, Ollama, etc.
Changer de service = changer l'URL, le modele et la cle dans la configuration.

``httpx`` est importe a la demande pour ne pas penaliser le demarrage a froid.
"""

from __future__ import annotations

from .base import Capability, GenerationRequest, GenerationResult, Provider, ProviderError

_OPTION_KEYS = ("temperature", "max_tokens", "top_p")


def _extract_text(payload: dict) -> str:
    """Extrait le texte d'une reponse chat completions (avec garde-fous)."""
    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not choices:
        return ""
    message = choices[0].get("message", {})
    return str(message.get("content", ""))


class OpenAICompatibleProvider(Provider):
    """Fournisseur de texte via une API compatible OpenAI (HF, MiniMax, local...)."""

    capabilities = frozenset({Capability.TEXT})

    def __init__(
        self,
        name: str,
        base_url: str,
        model: str,
        api_key: str = "",
        timeout: float = 60.0,
    ) -> None:
        self.name = name
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._api_key = api_key
        self._timeout = timeout

    @property
    def configured(self) -> bool:
        """Indique si l'URL et le modele sont renseignes."""
        return bool(self._base_url and self._model)

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    async def submit(self, request: GenerationRequest) -> GenerationResult:
        """Envoie une requete de generation de texte (chat completions)."""
        import httpx  # import differe

        if not self.configured:
            raise ProviderError(
                self.name, f"Fournisseur {self.name} non configuré (URL ou modèle manquant)"
            )

        body: dict = {
            "model": self._model,
            "messages": [{"role": "user", "content": request.prompt}],
        }
        body.update({key: request.options[key] for key in _OPTION_KEYS if key in request.options})

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{self._base_url}/chat/completions", json=body, headers=self._headers()
                )
        except httpx.HTTPError as exc:
            raise ProviderError(
                self.name, f"Impossible de joindre {self.name} : {exc}", retryable=True
            ) from exc

        if response.status_code >= 400:
            raise ProviderError(
                self.name,
                f"Erreur {self.name} (HTTP {response.status_code})",
                retryable=response.status_code >= 500,
            )

        data = response.json()
        return GenerationResult(
            provider=self.name,
            task_id="",
            status="succeeded",
            payload={"text": _extract_text(data), "raw": data},
        )

    async def status(self, task_id: str) -> GenerationResult:
        """Ce fournisseur est synchrone : il n'y a aucune tache a suivre."""
        raise ProviderError(self.name, f"{self.name} est synchrone : aucune tâche à suivre")

    async def health(self) -> bool:
        """Verifie que le service repond (endpoint ``/models``)."""
        import httpx

        if not self.configured:
            return False
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self._base_url}/models", headers=self._headers())
        except httpx.HTTPError:
            return False
        return response.status_code < 500
