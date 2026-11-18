#!/bin/sh
# Point d'entrée du conteneur API.
#   serve    (défaut) : applique les migrations puis démarre uvicorn
#   migrate           : applique les migrations et s'arrête
#   <autre>           : exécute la commande telle quelle (ex. « goldfx import-users ... »)
set -eu

# Proxys de confiance pour X-Forwarded-For : localhost et réseaux privés (nginx du conteneur
# « web », reverse proxy TLS sur l'hôte). uvicorn lit l'en-tête de droite à gauche et retient
# la première adresse non fiable : une valeur ajoutée par le client à gauche est ignorée.
# Ne jamais mettre « * » : l'adresse utilisée par la limitation des connexions deviendrait
# celle choisie par le client.
TRUSTED_PROXIES_DEFAULT="127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7"

case "${1:-serve}" in
  serve)
    alembic upgrade head
    exec uvicorn --factory goldfx.main:create_app \
      --host 0.0.0.0 --port 8000 \
      --workers "${GOLDFX_WORKERS:-2}" \
      --proxy-headers --forwarded-allow-ips="${GOLDFX_FORWARDED_ALLOW_IPS:-$TRUSTED_PROXIES_DEFAULT}" \
      --timeout-keep-alive 30 \
      --no-access-log
    ;;
  migrate)
    exec alembic upgrade head
    ;;
  *)
    exec "$@"
    ;;
esac
