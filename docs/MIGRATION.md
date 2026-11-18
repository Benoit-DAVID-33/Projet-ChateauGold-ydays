# Migration depuis la v1 (Flask)

La v2 est une réécriture complète. Ce document montre que **chaque fonctionnalité de la v1 est
conservée**, liste les bugs corrigés et explique la reprise des données.

## Parité fonctionnelle

| Fonctionnalité v1 | v1 (Flask) | v2 | Remarques |
|---|---|---|---|
| Inscription / connexion / déconnexion | `/register`, `/login`, `/logout` | `/register`, `/login` (SPA) + `/api/auth/*` | connexion par nom **ou** email ; comptes v1 importables |
| Profil (nom, email) dans le header | dropdown Bootstrap | menu « Profil » | identique |
| Upload vidéo / image | formulaire `/upload` | glisser-déposer **+** sélection, barre de progression | le glisser-déposer était annoncé mais absent en v1 |
| Formats | mp4, avi, mov, mkv, webm / jpg, png, gif, bmp, webp, **svg** | identiques **sauf SVG** | SVG retiré : vecteur d'attaque XSS (script embarqué) |
| Lecture vidéo / affichage image | `/videos/<f>`, `/images/<f>` (publics) | `/api/media/{id}/content` (privé, Range) | avance rapide vidéo supportée |
| Suppression d'un média | `/delete/<f>` (sans authentification) | bouton + confirmation, `DELETE /api/media/{id}` | réservé au propriétaire |
| Éditeur : 7 formes, 3 lignes, texte, feutre, gomme, objets 3D, sélection, déplacement, redimensionnement, menu contextuel, Motion Tracking | `media-editor.js` + copie inline divergente dans `image.html` | `features/editor` (une seule implémentation), colonne Outils de l'Atelier (tiroir sur petit écran), calques et chronologie | texte et crayon désormais accessibles ; fenêtre temporelle réglable à la souris |
| Zoom (plus, moins, réinitialiser, Ctrl+molette, double-clic) | `zoom.js` | contrôles de zoom de l'éditeur | média **et** annotations zoomés ensemble |
| Export de l'image modifiée (PNG) | téléchargement | téléchargement **ou** enregistrement dans la bibliothèque | rendu unique à la résolution native, sans poignées de sélection |
| Enregistrement de la vidéo annotée + conversion MP4 | code présent mais inaccessible | « Télécharger la vidéo annotée » / « Enregistrer dans la bibliothèque » | annotations réellement incrustées, bande-son conservée ; repli en WebM si la conversion échoue (comme en v1) |
| Assistant IA (résumé, intention, aperçu, copie, JSON, envoi) | `prompt-generator.js` | bloc « Composition » de l'Atelier (`features/assistant`) et nœud « Assistant IA » du Workflow | téléchargement JSON réparé, positions exactes, couleurs réelles, fenêtres temporelles |
| Envoi à Kling Omni-Video depuis l'assistant | polling 10 s sans fin | mode Omni-Video de l'Atelier et nœud du Workflow ; génération suivie (5 s, séquentiel, 30 min max) | lien signé au lieu de ngrok + dossiers publics |
| Kling texte vers image, texte vers vidéo, image vers vidéo | routes présentes, peu ou pas d'interface | modes de l'Atelier et nœuds du Workflow (pages Vidéo et Image, avec ou sans média ouvert) | historique conservé dans la Bibliothèque |
| Test de connexion Kling | `/kling/test` (API seule) | bouton « Tester la connexion Kling » du panneau + `GET /api/generations/provider/health` | sans consommer de crédits |
| Barre « Comment puis-je vous aider ? » + ENVOYER | `script.js` | `SearchBar` sur les pages Vidéo/Image (avant et après chargement d'un média) | Entrée ouvre la page Recherche ; ENVOYER transmet le média et le texte à l'API (image annotée exportée si elle contient des annotations) ; sans média, ENVOYER ouvre la page Recherche |
| Reconnaissance vocale (fr-FR) | Web Speech API, deux implémentations | hook `useSpeechRecognition` unique | navigateur non compatible : message explicite au clic sur le micro ; silences ignorés comme en v1 |
| Page Recherche (`/search?q=`) | écho de l'API de démo, atteinte par Entrée dans la barre | identique (`POST /api/search`), atteinte par Entrée dans la barre | plus de XSS par l'URL |
| API de traitement externe | `external_api.py` (port 5001) | adapter `echo` intégré **ou** `http` (même contrat) | aucun service supplémentaire requis par défaut |
| Résultat traité (« Vidéo traitée disponible ») | paramètre d'URL `processed=` | aperçu + « Résultats liés à ce média » | les dérivés sont rattachés à l'original ; pour zoomer, ouvrir le résultat dans l'éditeur |
| Contact (email) | Gmail codé en dur | SMTP configurable (`GOLDFX_CONTACT_RECIPIENT`) | anti-injection d'en-têtes |
| Pages Accueil, Information, Contact | templates Jinja | pages React | textes repris, affirmations erronées corrigées |
| (nouveau) | | **Atelier** en trois colonnes | outils, prompt et paramètres ; canevas ; sorties et historique, sur le modèle de Stable Diffusion WebUI |
| (nouveau) | | **Workflow** | graphe de nœuds sur le modèle de ComfyUI, enregistré par utilisateur |
| (nouveau) | | **Bibliothèque** | tous les médias, dérivés et l'historique des générations |

## Changements de comportement assumés

Ces écarts sont volontaires (correction, cohérence ou sécurité) ; aucun ne retire une capacité.

- **Couleurs** : la couleur choisie dans la palette s'applique à tous les nouveaux éléments
  (formes, lignes, objets 3D, texte), et non plus au seul dessin (les formes étaient toujours dorées).
- **Épaisseur du feutre et de la gomme** : la valeur du curseur est le diamètre du trait (rayon
  en v1, traits donc deux fois moins épais à valeur égale) ; le feutre trace une ligne continue.
  Les tracés de gomme sont conservés (ils effacent durablement les annotations situées dessous).
- **Redimensionnement** : le texte se redimensionne proportionnellement à sa boîte ; la molette
  redimensionne tout élément sélectionné (formes seules en v1).
- **Prompts** : positions, zones (grille 33/66) et tailles mesurées au **centre** de chaque élément
  (coin haut-gauche en v1), en pourcentage des dimensions natives. L'aperçu affiche le prompt
  complet (envoyé ou anglais) au lieu d'un résumé tronqué à 300 caractères ; « Copier le prompt »
  copie la vue affichée (par défaut le prompt envoyé, en français).
- **Assistant IA et génération** : le panneau « Assistant IA » et le panneau de génération sont
  remplacés par l'Atelier. L'envoi à Kling se fait depuis le mode correspondant (Omni-Video pour
  une vidéo, comme le bouton « Envoyer » de la v1) ; « Envoyer à l'API » (mode Annoter) transmet
  l'image annotée et le prompt au service de traitement (route inexistante en v1 pour l'image).
- **Comptes** : mot de passe d'au moins 8 caractères (6 en v1) ; nom d'utilisateur de 3 à
  32 caractères parmi lettres, chiffres, `_`, `-`, `.` ; connexion insensible à la casse.
- **Limites** : 25 Mo par image et 500 Mo par vidéo (configurables) ; SVG refusé.
- **Divers** : outils dans la colonne gauche de l'Atelier (tiroir sur petit écran) ; plus de lecture
  automatique de la vidéo ; « Triangle isocèle » libellé « Triangle » ; Motion Tracking proposé
  sur les vidéos uniquement ; objet de l'email de contact « GOLD FX » ; horodatage des noms de
  fichiers en heure locale ; double-clic = réinitialisation du zoom (le bouton de réinitialisation
  remet aussi la lecture vidéo au début) ; icône « son » supprimée (elle n'affichait qu'« en cours de développement »).

## Bugs de la v1 corrigés (extraits)

- `media-editor.js` ne s'exécutait pas sur `/image` (variables globales redéclarées, d'où une `SyntaxError`) ;
  les formes n'apparaissaient pas à l'écran (récursion infinie de `drawShape`).
- Annotations en pixels d'affichage : dérive au redimensionnement, pourcentages faux dans les prompts.
- Dessins au feutre perdus à chaque rafraîchissement ; export dessinant les annotations deux fois
  avec les poignées de sélection.
- Fenêtre temporelle des annotations vidéo ignorée ; éléments « supprimés » encore envoyés à l'IA.
- Contrôles natifs de la vidéo inaccessibles dès qu'une annotation existait.
- « Télécharger JSON » cassé ; « Envoyer à l'API » de la page Image vers une route inexistante.
- Panneau Assistant IA impossible à ouvrir sur mobile ; menus laissant un voile bloquant.
- Polling Kling : requêtes concurrentes, intervalle impossible à arrêter, aucune limite.
- Sécurité : routes sans authentification (suppression, Kling, conversion), XSS (réfléchie,
  `onclick`, SVG, `innerHTML`), open redirect, absence de CSRF, `SECRET_KEY` par défaut, `debug=True`,
  médias publics.

## Reprise des données

### Comptes

```bash
make import-users FILE=chemin/vers/ancienne-app/backend/data/users.json
# ou, hors Docker : cd backend && uv run goldfx import-users chemin/users.json
```

Les hashes werkzeug (`scrypt:` / `pbkdf2:`) sont conservés tels quels : les utilisateurs se
connectent avec leur mot de passe actuel, qui est re-haché en Argon2id à la première connexion.
L'import est idempotent (les comptes déjà présents sont ignorés).

### Médias

La v1 ne rattachait les fichiers à aucun utilisateur. Ils ne sont donc pas importés
automatiquement : chaque utilisateur recharge les médias qu'il souhaite conserver.

### Variables d'environnement

| v1 | v2 |
|---|---|
| `SECRET_KEY` | `GOLDFX_SECRET_KEY` (obligatoire en production, 32 caractères minimum) |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | `GOLDFX_SMTP_USERNAME` / `GOLDFX_SMTP_PASSWORD` (+ `GOLDFX_MAIL_BACKEND=smtp`) |
| destinataire codé en dur | `GOLDFX_CONTACT_RECIPIENT` |
| `KLING_ACCESS_KEY` / `KLING_SECRET_KEY` | `GOLDFX_KLING_ACCESS_KEY` / `GOLDFX_KLING_SECRET_KEY` |
| `KLING_API_BASE_URL` | `GOLDFX_KLING_BASE_URL` |
| `PUBLIC_BASE_URL` (ngrok) | `GOLDFX_PUBLIC_BASE_URL` (URL HTTPS publique de l'app) |
| `API_BASE_URL` | `GOLDFX_PROCESSOR_BACKEND=http` + `GOLDFX_PROCESSOR_URL` |
| `DATA_DIR` | `GOLDFX_STORAGE_DIR` + `GOLDFX_DATABASE_URL` |
