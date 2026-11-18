# Documentation GOLD FX

## Utiliser

- [Guide utilisateur](GUIDE_UTILISATEUR.md) : compte, Atelier, Workflow, exports, bibliothèque.

## Développer

- [Guide développeur](GUIDE_DEVELOPPEUR.md) : mise en place, organisation du code, conventions,
  recettes (route d'API, fournisseur IA, migration, mode de l'Atelier, nœud de workflow, outil
  d'annotation).
- [Architecture](ARCHITECTURE.md) : couches, principes SOLID, flux, modèle de données, frontend,
  Atelier et Workflow.
- [Référence de l'API](API.md) : conventions, routes, formats, contrat du service de traitement.
- [Qualité](QUALITE.md) : tests, analyse statique, tests de bout en bout, intégration continue.
- [Contribuer](../CONTRIBUTING.md) : branches, commits, pull requests.

## Déployer et exploiter

- [Exploitation](EXPLOITATION.md) : déploiement Docker Compose, TLS, mises à jour, sauvegardes,
  surveillance, dimensionnement, dépannage.
- [Configuration](CONFIGURATION.md) : toutes les variables `GOLDFX_*`.
- [Sécurité](SECURITE.md) : modèle de menace, mesures, points de vigilance.

## Historique et décisions

- [Migration depuis la version 1](MIGRATION.md) : parité fonctionnelle, changements assumés,
  bugs corrigés, reprise des données.
- [Journal des modifications](../CHANGELOG.md).
- [Feuille de route IA](ROADMAP_IA.md) : Hugging Face, RAG, LoRA.
- Décisions d'architecture :
  - [0001 : FastAPI et React plutôt que Flask et JavaScript en ligne](adr/0001-stack-fastapi-react.md)
  - [0002 : sessions opaques en cookie](adr/0002-sessions-opaques.md)
  - [0003 : annotations en pixels natifs](adr/0003-coordonnees-natives.md)
  - [0004 : liens signés pour les fournisseurs IA](adr/0004-liens-signes-kling.md)
  - [0005 : Atelier en trois colonnes et workflows à nœuds](adr/0005-atelier-et-workflows.md)
