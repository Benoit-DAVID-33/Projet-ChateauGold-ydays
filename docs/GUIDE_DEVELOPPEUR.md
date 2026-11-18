# Guide développeur

Mise en place, organisation du code, conventions et recettes pour faire évoluer GOLD FX. Les
choix d'architecture sont expliqués dans [ARCHITECTURE.md](ARCHITECTURE.md) ; les tests et la CI
dans [QUALITE.md](QUALITE.md).

## Mise en place

Prérequis : [uv](https://docs.astral.sh/uv/) (utilise ou installe un Python 3.12 ou plus récent ;
l'image Docker utilise 3.12), Node 22,
ffmpeg. Docker est facultatif en développement.

```bash
make install          # uv sync (backend) et npm ci (frontend)
make dev-api          # API sur http://localhost:8000, SQLite dans backend/data/
make dev-web          # frontend sur http://localhost:5173, /api relayé vers :8000
```

- Documentation interactive de l'API : http://localhost:8000/api/docs.
- Sans clés Kling, les générations échouent proprement (« Kling n'est pas configuré »). Pour
  travailler sur l'Atelier ou le Workflow sans crédit, lancer le faux Kling des tests :

```bash
mkdir -p /tmp/fk && ffmpeg -loglevel error -f lavfi -i smptebars=size=640x360 -frames:v 1 /tmp/fk/result.png
ffmpeg -loglevel error -f lavfi -i smptebars=size=640x360:rate=25 -t 2 -pix_fmt yuv420p /tmp/fk/result.mp4
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=localhost \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" -keyout /tmp/fk/key.pem -out /tmp/fk/cert.pem
python3 e2e/fake_kling.py --api-port 8766 --files-port 8767 --files-dir /tmp/fk \
  --cert /tmp/fk/cert.pem --key /tmp/fk/key.pem
# puis, pour l'API :
export GOLDFX_KLING_BASE_URL=http://127.0.0.1:8766 GOLDFX_KLING_ACCESS_KEY=dev GOLDFX_KLING_SECRET_KEY=dev
export SSL_CERT_FILE=/tmp/fk/cert.pem NO_PROXY=localhost,127.0.0.1
make dev-api
```

- Repartir d'une base vide : supprimer `backend/data/` puis relancer `make dev-api`.
- Tout en conteneurs, avec Mailpit pour lire les emails : `make up-dev`.

## Organisation du code

### Backend (`backend/src/goldfx/`)

| Dossier | Rôle | Peut dépendre de |
|---|---|---|
| `domain/` | entités (`models.py`), erreurs métier (`errors.py`), ports (`ports.py`, des `Protocol`) | rien |
| `application/` | un service par cas d'usage : `auth`, `media`, `processing`, `generation`, `transcoding`, `contact`, `workflows` | `domain` |
| `infrastructure/` | adaptateurs des ports : base (SQLAlchemy), stockage disque, Kling, ffmpeg, SMTP, sécurité | `domain` et bibliothèques |
| `api/` | HTTP : routers, schémas Pydantic, dépendances, middlewares, traduction des erreurs | `application`, `domain` |
| `container.py` | racine de composition : seul endroit qui instancie les adaptateurs | tout |
| `config.py` | configuration typée (`Settings`, variables `GOLDFX_*`) | |
| `main.py` | fabrique ASGI `create_app(settings, container)` | |
| `cli.py` | commandes `goldfx` : `import-users`, `create-user`, `openapi` | |
| `background.py` | tâches de fond lancées avec l'application (suivi des générations) | `container` |

Les services reçoivent une unité de travail (`UnitOfWork`) et les ports dont ils ont besoin ; ils
lèvent des erreurs du domaine (`NotFoundError`, `ValidationError`, `ExternalServiceError`...),
traduites en réponses HTTP par `api/errors.py`. Un router ne contient aucune logique métier.

### Frontend (`frontend/src/`)

| Dossier | Rôle |
|---|---|
| `app/` | routeur, mise en page (en-tête, menu, profil), fournisseurs |
| `pages/` | une page assemble des fonctionnalités, sans logique métier |
| `features/atelier/` | Atelier trois colonnes : modes, paramètres, sorties, historique |
| `features/workflow/` | éditeur de graphe (React Flow), registre des nœuds, moteur d'exécution, modèles |
| `features/editor/` | éditeur d'annotations : modèle, rendu canvas, interactions, exports, store Zustand |
| `features/assistant/` | construction des prompts (fonctions pures) et bloc « Composition » |
| `features/generation/` | suivi des générations Kling (React Query) |
| `features/media/`, `search/`, `auth/`, `workspace/` | médias et upload, barre de requête, session, assemblage de l'espace de travail |
| `shared/` | client API typé, kit d'interface, hooks, styles (`shared/ui/tokens.css`) |

Le client API (`shared/api/`) est typé à partir de `schema.d.ts`, généré depuis
`backend/openapi.json`. Les données serveur passent par TanStack Query ; l'état de l'éditeur par
Zustand ; le reste est de l'état local React.

## Conventions

- **Langue** : code (identifiants) en anglais ; commentaires, messages d'erreur, textes de
  l'interface et documentation en français.
- **Typage** : `mypy --strict` et TypeScript `strict`. Pas de `Any` ni de `as unknown as` sans
  justification en commentaire.
- **Python** : fonctions et services courts, dataclasses figées pour les valeurs, `Protocol` pour
  les ports. Les services ne lisent jamais `Settings` : la configuration leur est passée par
  `container.py` (les routers et `cli.py` passent par `container.settings`).
- **React** : composants fonctionnels, logique non triviale dans des fonctions pures testées
  (`model/`, `prompt/`, `engine/`), styles en CSS Modules avec les variables de `tokens.css`
  (aucune couleur en dur ailleurs).
- **Accessibilité** : rôles et libellés explicites (`tablist`, `tab`, `aria-label`), navigation
  au clavier, icônes décoratives en `aria-hidden`. Les tests ciblent les éléments par rôle et
  libellé.
- **Sobriété** : ni emoji ni symbole décoratif dans le code, l'interface, les prompts générés ou
  la documentation ; les icônes viennent de `lucide-react`.
- **Sécurité** : toute donnée d'un utilisateur est filtrée par propriétaire dans le service ;
  aucun secret dans le code ni dans les tests.

## Recettes

### Ajouter une route d'API

Exemple : renommer un média (`PATCH /api/media/{id}`).

1. **Service** (`application/media.py`) : méthode `rename(owner_id, media_id, name)` qui vérifie
   la propriété, valide le nom (`ValidationError`), met à jour via le dépôt et valide la
   transaction (`uow.commit()`).
2. **Port et adaptateur** si le dépôt n'offre pas l'opération : méthode dans `MediaRepository`
   (`domain/ports.py`) et implémentation dans `infrastructure/db/repositories.py`.
3. **Schéma** (`api/schemas.py`) : `MediaRenameIn(BaseModel)` avec ses contraintes.
4. **Router** (`api/routers/media.py`) :

```python
@router.patch("/media/{media_id}", response_model=MediaOut)
def rename_media(
    media_id: UUID, payload: MediaRenameIn, user: CurrentUser, service: MediaServiceDep
) -> MediaOut:
    return MediaOut.of(service.rename(user.id, media_id, payload.name))
```

5. **CORS** : ajouter `PATCH` aux méthodes autorisées dans `main.py` si l'API est appelée depuis
   une autre origine ; le middleware CSRF couvre déjà toutes les méthodes d'écriture.
6. **Tests** (`tests/integration/test_api_media.py`) : cas nominal, validation (`422`), média d'un
   autre utilisateur (`404`), requête sans jeton CSRF (`403`).
7. **Contrat** : `make openapi`, puis ajouter l'appel dans `shared/api/endpoints.ts` :

```ts
rename: (id: string, name: string) =>
  request<Media>(`/api/media/${id}`, { method: "PATCH", json: { name } }),
```

  (ajouter `"PATCH"` au type des méthodes de `request` dans `client.ts`).
8. **Documentation** : [API.md](API.md).

### Ajouter un fournisseur IA (exemple : Hugging Face)

Le port `GenerationProvider` (`domain/ports.py`) décrit ce qu'attend `GenerationService` :

```python
class GenerationProvider(Protocol):
    def submit(self, request: GenerationRequest) -> str: ...            # identifiant de tâche
    def get_state(self, kind: GenerationKind, task_id: str) -> ProviderTaskState: ...
    def download(self, url: str, max_bytes: int) -> tuple[bytes, str]: ...
    def check(self) -> ProviderHealth: ...
```

1. Créer `infrastructure/huggingface/client.py` avec une classe `HuggingFaceProvider` qui
   implémente ces quatre méthodes (même structure que `infrastructure/kling/client.py` :
   configuration figée, client `httpx` injectable pour les tests, erreurs traduites en
   `ExternalServiceError`, `ConfigurationError` ou `RateLimitedError`).
2. Ajouter les réglages dans `config.py` (`hf_endpoint_url`, `hf_token`, délais) et un choix du
   fournisseur (`generation_provider: Literal["kling", "huggingface"]`).
3. Dans `container.py`, construire l'adaptateur selon ce choix. Aucun service ni router n'est
   modifié.
4. Tests unitaires de l'adaptateur avec `respx`, qui simule les réponses HTTP (voir
   `tests/unit/test_kling_client.py`), puis documenter les variables dans
   [CONFIGURATION.md](CONFIGURATION.md) et `.env.example`.

Pour un traitement court (synchrone), implémenter plutôt le port `MediaProcessor`, comme
`HttpMediaProcessor`. Les points spécifiques à Hugging Face sont dans
[ROADMAP_IA.md](ROADMAP_IA.md).

### Modifier le schéma de la base

1. Modifier les tables dans `infrastructure/db/schema.py` (et les entités du domaine, les
   dépôts, les conversions).
2. Générer la migration, puis la relire (Alembic ne détecte pas tout, par exemple les
   renommages) :

```bash
cd backend
uv run alembic revision --autogenerate -m "ajoute la colonne x"
uv run ruff format migrations && uv run ruff check migrations
uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head
```

3. Jouer les tests sur PostgreSQL (`GOLDFX_TEST_DATABASE_URL`). La CI vérifie avec
   `alembic check` que les migrations correspondent au modèle.

### Mettre à jour le contrat frontend et backend

Après toute modification d'un schéma ou d'une route :

```bash
make openapi          # backend/openapi.json puis frontend/src/shared/api/schema.d.ts
```

Committer les deux fichiers : la CI échoue s'ils ne correspondent pas au code.

### Ajouter un mode à l'Atelier

Les modes sont décrits dans `features/atelier/model/modes.ts` :

1. Si le mode correspond à un nouveau type de génération, l'ajouter côté backend
   (`GenerationKind`, adaptateur, schéma) puis `make openapi`.
2. Ajouter l'entrée dans `MODES` (libellé, description, type de média source requis).
3. Compléter `visibleParams` et `buildGenerationInput` pour ses paramètres, et
   `GenerationParamsFields` pour les champs.
4. Ajouter les cas dans `modes.test.ts` et, si l'interface change, dans `Atelier.test.tsx`.

### Ajouter un type de nœud au Workflow

Les nœuds sont découverts automatiquement : un fichier `features/workflow/nodes/<nom>.node.tsx`
qui exporte `node` suffit, sans modifier de fichier existant.

```tsx
import { Languages } from "lucide-react";

import { textValue } from "../model/values";
import { defineNode } from "./definition";
import { ParamTextArea } from "./fields";
import { textInput } from "./inputs";

interface UppercaseData {
  suffix: string;
}

/** Exemple : met un texte en majuscules et ajoute un suffixe. */
export const node = defineNode<UppercaseData>({
  type: "uppercase-text",
  title: "Majuscules",
  category: "text",
  description: "Met le texte reçu en majuscules.",
  icon: Languages,
  inputs: [{ id: "text", type: "text", label: "Texte" }],
  outputs: [{ id: "text", type: "text", label: "Texte" }],
  defaultData: { suffix: "" },
  Params: ({ data, onChange, disabled }) => (
    <ParamTextArea
      label="Suffixe"
      value={data.suffix}
      rows={1}
      disabled={disabled}
      onChange={(suffix) => onChange({ suffix })}
    />
  ),
  async execute(_ctx, inputs, data) {
    const text = textInput(inputs, "text");
    return { outputs: { text: textValue(`${text.toUpperCase()}${data.suffix}`) } };
  },
});
```

- **Ports** : types `image`, `video`, `text` et `media` (image ou vidéo). Une sortie ne peut
  alimenter qu'une entrée compatible ; l'éditeur refuse les autres liens.
- **Exécution** : `execute(ctx, inputs, data, signal)` reçoit les valeurs des entrées (lues avec
  `textInput` et `mediaInput` de `nodes/inputs.ts`) et les paramètres. `ctx.api` donne accès à l'API (médias, générations), `ctx.host` à l'Atelier,
  `ctx.reportProgress` affiche l'avancement, `ctx.clock.sleep(ms, signal)` attend en respectant
  l'arrêt. Les erreurs levées s'affichent sur le nœud.
- **Validation** : `validate(data, env)` renvoie les erreurs de configuration détectées avant
  l'exécution.
- **Tests** : le moteur et les exécuteurs se testent sans DOM avec `fakeServices()` et
  `makeContext()` (`features/workflow/test/fakes.ts`). Détails dans
  `frontend/src/features/workflow/README.md`.

Le format du graphe enregistré (`version: 1`) est décrit dans [API.md](API.md#workflows). Un
changement incompatible du format impose d'incrémenter la version et de convertir les graphes
existants à la lecture (`model/graph.ts`).

### Ajouter un outil d'annotation

1. Modèle : type d'élément dans `features/editor/model/types.ts` (coordonnées en pixels natifs,
   voir [ADR 0003](adr/0003-coordonnees-natives.md)), création dans `model/factory.ts`, géométrie
   et détection du clic dans `model/geometry.ts` et `model/hitTest.ts`.
2. Rendu : `features/editor/render/`.
3. Interface : sous-panneau dans `components/tools/`, ajouté à `ToolsSidebar` (colonne) et
   `ToolsMenu` (tiroir des petits écrans).
4. Prompt : description de l'élément dans `features/assistant/prompt/describe.ts` et
   `fullPrompt.ts`, pour que l'IA reçoive sa position et sa taille.
5. Tests : modèle, rendu (export) et description.

## Débogage

- Chaque réponse de l'API porte un en-tête `X-Request-ID`, repris dans la ligne de journal de la
  requête.
- `GOLDFX_LOG_LEVEL=DEBUG` rend les journaux plus détaillés, y compris ceux de httpx et httpcore
  pour les appels sortants (Kling, service de traitement).
- `GOLDFX_MAIL_BACKEND=console` écrit les emails dans les journaux ; `make up-dev` les présente
  dans Mailpit.
- La base SQLite de développement se consulte avec `sqlite3 backend/data/goldfx.db`.
- Côté navigateur, les outils de développement de React et de TanStack Query fonctionnent
  normalement (build de développement).
