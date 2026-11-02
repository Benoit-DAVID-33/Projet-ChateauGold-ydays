"""Fournisseur generique compatible API OpenAI.

Un seul adaptateur couvre de nombreux services qui exposent ``/chat/completions`` :
LLM local (Ollama, vLLM), OpenRouter, Groq, Gemini, Hugging Face, MiniMax...
Changer de service = changer l'URL, le modele et la cle dans la configuration.

Facturation : chaque instance declare si elle est **gratuite** (``free``). Le
routeur, en mode ``LLM_FREE_ONLY``, n'utilise que les fournisseurs gratuits.
Seule la cle passee explicitement est envoyee : aucun jeton « ambiant »
(``HF_TOKEN``, cache ``huggingface-cli login``...) n'est jamais lu.

``httpx`` est importe a la demande pour ne pas penaliser le demarrage a froid.
"""

from __future__ import annotations

import asyncio

from server.core.http_clients import LazyClient
from server.proxy.contract import (
    Capability,
    GenerationRequest,
    GenerationResult,
    Provider,
    ProviderError,
)

_OPTION_KEYS = ("temperature", "max_tokens", "top_p", "response_format")


def _extract_text(payload: dict) -> str:
    """Extrait le texte d'une reponse chat completions (avec garde-fous)."""
    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not choices:
        return ""
    message = choices[0].get("message", {})
    return str(message.get("content", "") or "")


def _messages(request: GenerationRequest) -> list[dict[str, str]]:
    """Construit les messages : consigne systeme optionnelle puis demande utilisateur."""
    messages = []
    system = request.options.get("system")
    if system:
        messages.append({"role": "system", "content": str(system)})
    messages.append({"role": "user", "content": request.prompt})
    return messages


class OpenAICompatibleProvider(Provider):
    """Fournisseur de texte via une API compatible OpenAI (local, OpenRouter, Groq...)."""

    capabilities = frozenset({Capability.TEXT})

    def __init__(
        self,
        name: str,
        base_url: str,
        model: str,
        api_key: str = "",
        timeout: float = 60.0,
        *,
        free: bool = False,
        requires_key: bool = False,
        billing_note: str = "",
    ) -> None:
        self.name = name
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._api_key = api_key
        self._timeout = timeout
        # Client partage (pool keep-alive) : pas de poignee de main TLS a chaque requete.
        self._http = LazyClient(base_url="", timeout=timeout, retries=1)
        self._free = free
        self._requires_key = requires_key
        self._billing_note = billing_note

    @property
    def configured(self) -> bool:
        """Indique si l'URL, le modele (et la cle si exigee) sont renseignes."""
        has_key = bool(self._api_key) or not self._requires_key
        return bool(self._base_url and self._model and has_key)

    @property
    def free(self) -> bool:
        """Gratuite declaree par la configuration (voir ``registry``)."""
        return self._free

    @property
    def billing_note(self) -> str:
        """Explication de la facturation, sinon la mention par defaut."""
        return self._billing_note or super().billing_note

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    async def _before_submit(self) -> None:
        """Point d'extension : controle prealable (ex. proprietaire du jeton HF)."""

    async def submit(self, request: GenerationRequest) -> GenerationResult:
        """Envoie une requete de generation de texte (chat completions)."""
        import httpx  # import differe

        if not self.configured:
            raise ProviderError(
                self.name, f"Fournisseur {self.name} non configuré (URL, modèle ou clé manquant)"
            )
        await self._before_submit()

        body: dict = {"model": self._model, "messages": _messages(request)}
        body.update({key: request.options[key] for key in _OPTION_KEYS if key in request.options})

        try:
            response = await self._http.get().post(
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
                retryable=response.status_code == 429 or response.status_code >= 500,
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
        """Verifie que le service repond et accepte la cle (endpoint ``/models``)."""
        import httpx

        if not self.configured:
            return False
        try:
            response = await self._http.get().get(
                f"{self._base_url}/models", headers=self._headers(), timeout=10.0
            )
        except httpx.HTTPError:
            return False
        # 401/403 : joignable mais cle refusee -> inutilisable, donc « hors ligne ».
        return response.status_code < 400


class HuggingFaceProvider(OpenAICompatibleProvider):
    """Hugging Face Inference Providers, avec garde-fou sur le compte debite.

    Toute requete routee par Hugging Face est facturee au **proprietaire du
    jeton** (ou a l'organisation de ``X-HF-Bill-To``) : un compte gratuit n'a
    aucun credit inclus. Ce fournisseur n'est donc jamais « gratuit ».

    Avant le premier appel, le proprietaire du jeton est verifie via
    ``/api/whoami-v2`` : la requete est refusee si ce compte est interdit
    (``HF_FORBIDDEN_ACCOUNTS``, ex. le compte personnel) ou s'il ne correspond
    pas au compte attendu (``HF_EXPECTED_ACCOUNT``). En cas de doute (whoami
    injoignable), le fournisseur refuse : il echoue de facon sure.
    """

    _WHOAMI_URL = "https://huggingface.co/api/whoami-v2"

    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        api_key: str,
        timeout: float = 60.0,
        forbidden_accounts: frozenset[str] = frozenset(),
        expected_account: str = "",
        bill_to: str = "",
    ) -> None:
        super().__init__(
            "huggingface",
            base_url,
            model,
            api_key,
            timeout,
            free=False,
            requires_key=True,
            billing_note="payant : facturé au compte propriétaire du jeton HF_API_TOKEN",
        )
        self._forbidden = frozenset(name.lower() for name in forbidden_accounts)
        self._expected = expected_account.lower()
        self._bill_to = bill_to
        self._verified_owner: str | None = None
        self._lock = asyncio.Lock()

    def _headers(self) -> dict[str, str]:
        headers = super()._headers()
        if self._bill_to:
            headers["X-HF-Bill-To"] = self._bill_to
        return headers

    def check_owner(self, owner: str) -> None:
        """Valide le compte proprietaire du jeton (leve ``ProviderError`` si refuse)."""
        normalized = owner.lower()
        if normalized in self._forbidden:
            raise ProviderError(
                self.name,
                f"Jeton Hugging Face refusé : il appartient au compte interdit « {owner} »",
            )
        if self._expected and normalized != self._expected:
            raise ProviderError(
                self.name,
                f"Jeton Hugging Face refusé : compte « {owner} » au lieu de « {self._expected} »",
            )

    async def _fetch_owner(self) -> str:
        """Interroge ``whoami-v2`` et retourne le nom du proprietaire du jeton."""
        import httpx

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    self._WHOAMI_URL, headers={"Authorization": f"Bearer {self._api_key}"}
                )
        except httpx.HTTPError as exc:
            raise ProviderError(
                self.name, "Vérification du compte Hugging Face impossible (réseau)"
            ) from exc
        if response.status_code != 200:
            raise ProviderError(
                self.name, f"Jeton Hugging Face invalide (whoami HTTP {response.status_code})"
            )
        owner = str(response.json().get("name", ""))
        if not owner:
            raise ProviderError(self.name, "Propriétaire du jeton Hugging Face inconnu")
        return owner

    async def _before_submit(self) -> None:
        if not self._forbidden and not self._expected:
            return
        async with self._lock:
            if self._verified_owner is None:
                owner = await self._fetch_owner()
                self.check_owner(owner)
                self._verified_owner = owner
