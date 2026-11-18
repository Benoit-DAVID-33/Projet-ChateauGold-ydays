# Tests de bout en bout

Parcours utilisateur complet joué dans Chromium avec Playwright, contre l'API réelle et le build
de production du frontend.

## Lancer

Prérequis : dépendances installées (`make install`), ffmpeg, openssl, Python 3.12 avec Playwright :

```bash
python -m pip install -r e2e/requirements.txt
python -m playwright install chromium
make e2e                      # ou : ./e2e/run.sh [dossier de sortie]
```

Variables facultatives : `PYTHON` (interpréteur qui possède Playwright), `E2E_API_PORT` (8765),
`E2E_WEB_PORT` (4173), `E2E_KLING_PORT` (8766), `E2E_FILES_PORT` (8767).

## Ce que fait `run.sh`

1. Génère les médias de test avec ffmpeg (image PNG 320x240, vidéo WebM de 2 secondes avec son)
   et les résultats du faux Kling, ainsi qu'un certificat auto-signé.
2. Construit le frontend (`npm run build`).
3. Démarre `fake_kling.py` : mêmes chemins et même format de réponse que l'API Kling, tâches
   terminées au bout de 2 secondes, résultats servis en HTTPS. `GET /__requests` liste les
   requêtes reçues pour les vérifications du parcours.
4. Démarre l'API sur une base SQLite temporaire (migrations appliquées), avec le faux Kling comme
   fournisseur et le service de traitement factice intégré.
5. Démarre `vite preview` (build de production, `/api` relayé vers l'API).
6. Joue `parcours.py`, puis arrête tous les processus et supprime les données temporaires.

## Étapes vérifiées

- redirection vers la connexion, inscription, connexion ;
- Atelier sans média : modes disponibles, recherche par la barre globale ;
- texte vers image (deux résultats, paramètres transmis à Kling) ;
- upload d'une image, outils Formes, Texte et Dessin, calques ;
- bloc Prompt : description des annotations dans le prompt ;
- export PNG à la résolution native, envoi à l'API de traitement ;
- image vers vidéo ;
- upload d'une vidéo, objet 3D, timeline, export MP4 (codecs vérifiés avec ffprobe), contrôles
  natifs accessibles ;
- Omni-Video : lien signé transmis à Kling et téléchargeable ;
- Workflow : modèle chargé, exécuté jusqu'au résultat ;
- bibliothèque, contact, recherche sans injection HTML ;
- affichage mobile (colonnes empilées, tiroir Outils, pas de défilement horizontal) ;
- déconnexion ;
- aucune erreur dans la console du navigateur.

## Résultats

Dans le dossier de sortie (`e2e/out/` par défaut, ignoré par Git) : `results.json`, captures
d'écran dans `shots/`, journaux `api.log`, `web.log` et `kling.log`. Le script se termine avec
un code non nul si une étape échoue.
