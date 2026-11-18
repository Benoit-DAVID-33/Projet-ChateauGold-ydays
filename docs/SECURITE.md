# Sécurité

Mesures de sécurité de GOLD FX, menaces couvertes et points de vigilance pour l'exploitation.
Les failles de la version 1 corrigées par la refonte sont listées dans
[MIGRATION.md](MIGRATION.md#bugs-de-la-v1-corrigés-extraits).

## Modèle de menace

| Acteur | Ce qu'il peut tenter | Protection principale |
|---|---|---|
| Visiteur anonyme | accéder aux médias, appeler Kling, saturer la connexion | toutes les routes exigent une session, sauf santé, jeton CSRF, inscription, connexion, déconnexion et liens signés ; limitation des tentatives |
| Utilisateur connecté | lire ou supprimer les médias, générations ou workflows d'un autre | contrôle de propriété dans chaque service ; un objet d'autrui répond `404` |
| Site tiers | faire agir le navigateur d'un utilisateur connecté (CSRF) | cookie `SameSite=Lax` et jeton CSRF double-submit |
| Fichier piégé | exécuter du script via un média (SVG, HTML déguisé) | détection du type par signature binaire, SVG refusé, `Content-Security-Policy: sandbox` sur le contenu servi |
| Fournisseur externe compromis | renvoyer un résultat malveillant ou énorme | résultats Kling en HTTPS uniquement, taille bornée, type re-détecté |

## Authentification et sessions

- Session opaque : jeton aléatoire de 256 bits remis dans le cookie `goldfx_session`
  (`HttpOnly`, `Secure`, `SameSite=Lax`). Seule son empreinte SHA-256 est stockée : une fuite de
  la base ne donne pas de session utilisable. Voir [ADR 0002](adr/0002-sessions-opaques.md).
- Expiration après `GOLDFX_SESSION_TTL_HOURS` (7 jours par défaut) ; la déconnexion supprime la
  session côté serveur.
- Mots de passe hachés en Argon2id. Les empreintes werkzeug de la version 1 (`scrypt:`,
  `pbkdf2:`) sont vérifiées puis remplacées par une empreinte Argon2id à la connexion suivante.
- Limitation des tentatives de connexion par adresse IP et identifiant
  (`GOLDFX_LOGIN_MAX_ATTEMPTS` par `GOLDFX_LOGIN_WINDOW_SECONDS`). Le message d'échec est
  identique que le compte existe ou non.
- L'adresse IP est lue dans `X-Forwarded-For` de droite à gauche : la première adresse qui n'est
  pas un proxy de confiance (`GOLDFX_FORWARDED_ALLOW_IPS`, par défaut localhost et réseaux
  privés) est retenue. Une valeur ajoutée par le client en tête de l'en-tête est donc ignorée.
  Ne jamais régler cette variable sur `*` : l'adresse deviendrait celle choisie par le client.
- Après connexion, seules les redirections vers une page interne de l'application sont suivies.

## Protection CSRF

Toute requête `POST`, `PUT` ou `DELETE` sur `/api` doit porter l'en-tête `X-CSRF-Token` égal au
cookie `goldfx_csrf` (comparaison à temps constant). Une page tierce ne peut ni lire ce cookie ni
poser un en-tête personnalisé. Seuls les liens publics signés (`/api/public/`), en lecture,
échappent à ce contrôle.

## Autorisations

Chaque média, génération et workflow porte l'identifiant de son propriétaire. Les services
vérifient la propriété avant toute lecture, modification ou suppression, et répondent « introuvable »
plutôt que « interdit » pour ne pas révéler l'existence d'un objet.

## Fichiers et médias

- Le type est déterminé par la signature binaire du contenu ; l'extension et le `Content-Type`
  envoyés par le navigateur sont ignorés. Formats acceptés : JPEG, PNG, GIF, WebP, BMP, MP4, MOV,
  WebM, MKV, AVI. SVG est refusé (il peut contenir du script).
- Tailles maximales : `GOLDFX_MAX_IMAGE_MB` et `GOLDFX_MAX_VIDEO_MB`, contrôlées pendant la
  lecture du flux : un upload n'est jamais entièrement chargé en mémoire. Les résultats de Kling
  et du service de traitement, eux, sont lus en mémoire, dans la même limite de taille.
- Les fichiers sont écrits de façon atomique sous un nom généré ; le nom d'origine n'est qu'une
  métadonnée.
- Le contenu est servi avec une `Content-Security-Policy` restrictive incluant `sandbox`, `X-Content-Type-Options: nosniff`
  et un `Content-Disposition` adapté.

## Liens signés pour les fournisseurs IA

Kling Omni-Video doit télécharger la vidéo source. L'API lui transmet un lien
`/api/public/media/<jeton>` signé par HMAC-SHA256 avec une clé dérivée de `GOLDFX_SECRET_KEY`,
valable `GOLDFX_SIGNED_URL_TTL_SECONDS` (une heure par défaut) et limité à un média. Les médias
ne sont jamais publics par ailleurs. Voir [ADR 0004](adr/0004-liens-signes-kling.md).

## Appels sortants

- Kling : jeton JWT HS256 de courte durée signé avec la clé secrète ; résultats téléchargés en
  HTTPS uniquement, taille bornée, type re-détecté avant enregistrement.
- ffmpeg : exécuté sans shell, avec une liste d'arguments fixe, une durée maximale et un nombre
  de conversions simultanées borné.
- SMTP : le nom saisi est normalisé (espaces et retours à la ligne fusionnés) avant d'entrer
  dans le sujet, l'adresse est validée comme email, et les en-têtes sont construits par la
  bibliothèque standard (pas d'injection d'en-têtes). L'adresse saisie dans le formulaire de
  contact n'est utilisée qu'en `Reply-To`.

## En-têtes HTTP

| En-tête | Valeur | Posé par |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; ...` | nginx (SPA) |
| `Content-Security-Policy` | `default-src 'none'; img-src 'self'; media-src 'self'; sandbox` | API (contenu des médias) |
| `X-Content-Type-Options` | `nosniff` | nginx et API |
| `X-Frame-Options` | `DENY` | nginx et API |
| `Referrer-Policy` | `same-origin` | nginx et API |
| `Permissions-Policy` | `camera=(), geolocation=(), microphone=(self)` | nginx (le micro sert à la dictée) |
| `Cache-Control` | `no-store` sur l'API, sauf le contenu des médias (`private, max-age=3600`) | API |

La politique complète est dans `frontend/nginx.conf`. `style-src` autorise `'unsafe-inline'`
pour les positions calculées de l'éditeur et du graphe de workflow ; aucun script en ligne n'est
autorisé.

## Configuration et secrets

- Secrets uniquement par variables d'environnement ; `.env` est exclu du dépôt.
- En production, l'API refuse de démarrer avec une clé secrète faible ou d'exemple, des cookies
  non sécurisés ou sans destinataire de contact (voir [CONFIGURATION.md](CONFIGURATION.md)).
- La documentation interactive `/api/docs` est désactivée en production.

## Conteneurs

- Images exécutées avec un utilisateur non privilégié ; nginx en version « unprivileged ».
- La base de données est sur un réseau Docker interne, sans accès sortant ni port publié.
- `tini` comme processus initial de l'API (signaux et processus ffmpeg correctement terminés).
- Sondes de santé sur chaque service.

## Points de vigilance

- Servir l'application en HTTPS : les cookies `Secure` ne fonctionnent pas en HTTP (hors
  `localhost`).
- Renouveler `GOLDFX_SECRET_KEY` invalide les liens signés en cours (sans effet sur les sessions).
- Les clés Kling donnent accès aux crédits du compte : les conserver dans un gestionnaire de
  secrets et les renouveler en cas de doute.
- Avec plusieurs instances de l'API, déplacer la limitation des tentatives vers un stockage
  partagé (voir [EXPLOITATION.md](EXPLOITATION.md#dimensionnement)).
- Les workflows sont exécutés dans le navigateur : ils n'appellent que l'API de l'application,
  avec les droits de l'utilisateur connecté.

## Signaler une vulnérabilité

Ne pas ouvrir de ticket public. Écrire à l'adresse de contact du projet avec une description, les
étapes de reproduction et l'impact estimé.
