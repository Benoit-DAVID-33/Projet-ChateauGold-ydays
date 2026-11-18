# Contribuer à GOLD FX

## Mise en place

```bash
make install                  # dépendances backend (uv) et frontend (npm)
pipx install pre-commit && pre-commit install
make dev-api                  # terminal 1 : API sur :8000
make dev-web                  # terminal 2 : frontend sur :5173
```

Le guide complet (structure, conventions, recettes) est dans
[docs/GUIDE_DEVELOPPEUR.md](docs/GUIDE_DEVELOPPEUR.md).

## Branches et commits

- `main` est la branche stable, protégée : on n'y pousse jamais directement.
- Une branche par sujet, nommée `type/sujet-court` : `feat/connecteur-hugging-face`,
  `fix/export-mp4-audio`, `docs/guide-exploitation`.
- Messages de commit au format Conventional Commits, en français :

```
feat(workflow): ajoute le nœud Hugging Face

Explication du pourquoi, si elle n'est pas évidente.
```

  Types : `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.
  Portées usuelles : `api`, `auth`, `media`, `generation`, `workflow`, `atelier`, `editor`,
  `assistant`, `infra`, `docs`.

## Pull requests

Avant d'ouvrir une pull request :

```bash
make check                    # lint, typage, tests (backend et frontend)
make openapi                  # si l'API a changé ; committer openapi.json et schema.d.ts
make e2e                      # si l'interface a changé
```

La description indique :

- le problème résolu ou la fonctionnalité ajoutée ;
- les choix faits et les alternatives écartées (un ADR dans `docs/adr/` pour une décision
  structurante) ;
- comment vérifier (étapes manuelles, tests ajoutés) ;
- l'impact sur la configuration, les migrations ou l'exploitation.

Une pull request est fusionnée quand la CI est verte et qu'au moins une personne l'a relue.

## Règles

- Aucune dépendance du domaine (`backend/src/goldfx/domain`) vers un framework ou une
  bibliothèque d'infrastructure.
- Les routers ne contiennent pas de logique métier : ils traduisent HTTP vers un service.
- Toute nouvelle route : un test d'intégration (cas nominal, validation, accès d'un autre
  utilisateur).
- Toute modification du schéma de base : une migration Alembic.
- Secrets uniquement par variables d'environnement, jamais dans le code ni dans les tests.
- Textes de l'interface en français. Ni emoji ni symbole décoratif dans le code, l'interface,
  les prompts générés ou la documentation.
- Documentation mise à jour dans la même pull request (API, configuration, guides).

## Signaler un problème

Pour un bug : version ou commit, étapes de reproduction, résultat attendu, résultat obtenu,
journaux de l'API (identifiant de requête `X-Request-ID` si disponible).

Pour une vulnérabilité : ne pas ouvrir de ticket public, voir
[docs/SECURITE.md](docs/SECURITE.md#signaler-une-vulnérabilité).
