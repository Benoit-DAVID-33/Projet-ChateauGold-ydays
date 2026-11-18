# ADR 0004 : liens signés temporaires pour les fournisseurs IA

- **Statut** : accepté
- **Contexte** : Kling Omni-Video télécharge la vidéo source à partir d'une URL. La version 1
  rendait tous les dossiers de médias publics et demandait un tunnel ngrok.
- **Décision** : l'API génère un lien `/api/public/media/<jeton>` signé par HMAC (clé dérivée
  par usage), valable une heure. Les médias restent privés par ailleurs. Pour image vers vidéo,
  l'image est envoyée en base64 : aucune URL publique n'est nécessaire.
- **Conséquences** : `GOLDFX_PUBLIC_BASE_URL` doit pointer vers l'URL HTTPS publique de
  l'application. Le même mécanisme servira aux futurs connecteurs (Hugging Face Inference
  Endpoints).
