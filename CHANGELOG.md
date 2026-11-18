# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; versions selon
[SemVer](https://semver.org/lang/fr/).

## [2.0.0] - non publiée

Refonte complète de l'application Flask d'origine. La correspondance fonctionnalité par
fonctionnalité est dans [docs/MIGRATION.md](docs/MIGRATION.md).

### Ajouté

- Atelier d'édition en trois colonnes, inspiré de Stable Diffusion WebUI : outils, prompt et
  paramètres à gauche ; onglets de mode, canevas, calques et chronologie au centre ; sorties et
  historique à droite. Modes : Annoter, Image vers vidéo, Omni-Video, Texte vers image, Texte
  vers vidéo.
- Onglet Workflow inspiré de ComfyUI : éditeur de graphe de nœuds (sources, texte et Assistant IA,
  génération Kling, traitement, sortie), exécution dans le navigateur, modèles prêts à l'emploi,
  import et export JSON, sauvegarde des workflows par utilisateur (`/api/workflows`).
- Génération Kling texte vers image, texte vers vidéo et image vers vidéo depuis l'interface
  (seul Omni-Video était accessible en version 1), avec suivi borné et historique.
- Bibliothèque : tous les médias de l'utilisateur, leurs dérivés et l'historique des générations,
  par pages (« Charger plus »).
- Suivi des générations côté serveur : une tâche de fond rafraîchit les générations en cours et
  range les résultats dans la bibliothèque même si la page a été fermée ; bail en base contre les
  doubles imports (plusieurs processus ou onglets) ; abandon après 24 h (configurable).
- Filtres d'API `parent_id` (dérivés d'un média) et `source_media_id` (générations d'un média).
- Audit des dépendances Python et npm dans la CI.
- Glisser-déposer et barre de progression à l'upload.
- Export de la vidéo annotée en MP4 (H.264 et AAC) avec repli en WebM.
- Bouton « Tester la connexion Kling » (sans consommer de crédit).
- Import des comptes de la version 1 (`goldfx import-users`), mots de passe conservés.
- Conteneurisation : images non-root, compose de production et de développement, sondes de
  santé, migrations automatiques.
- Intégration continue : lint, typage strict, tests sur SQLite et PostgreSQL, contrat OpenAPI,
  tests de bout en bout, construction des images.
- Documentation : architecture, API, configuration, exploitation, sécurité, qualité, guides
  utilisateur et développeur, décisions d'architecture.

### Modifié

- Backend réécrit en FastAPI, en couches (domaine, application, infrastructure, API) ;
  persistance PostgreSQL (SQLite en développement) avec migrations Alembic.
- Frontend réécrit en React et TypeScript strict ; une seule implémentation de l'éditeur pour
  les images et les vidéos.
- Annotations stockées en pixels natifs du média : exports et prompts exacts quel que soit le
  zoom.
- Prompts générés sans emoji ni symbole décoratif, avec positions mesurées au centre de chaque
  élément.
- Les comportements modifiés volontairement sont listés dans
  [docs/MIGRATION.md](docs/MIGRATION.md#changements-de-comportement-assumés).

### Supprimé

- Upload de fichiers SVG (risque d'exécution de script).
- Dépendance à ngrok et dossiers de médias publics (remplacés par des liens signés temporaires).

### Sécurité

- Authentification obligatoire sur toutes les routes de médias, de génération et de conversion.
- Adresse client derrière les proxys : seuls les proxys de confiance sont crus dans
  `X-Forwarded-For`, ce qui empêche de contourner la limitation des connexions.
- Sessions opaques en cookie `HttpOnly`, protection CSRF, limitation des tentatives de connexion.
- Mots de passe en Argon2id (anciens hashes re-hachés à la connexion).
- Détection du type de fichier par signature binaire, politique de sécurité du contenu stricte.
- Correction des failles XSS, de la redirection ouverte et de la clé secrète par défaut de la
  version 1.

## [1.x] - version Flask d'origine

Voir l'historique Git de la branche `main` avant la refonte.
