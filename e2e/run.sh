#!/usr/bin/env bash
# Tests de bout en bout : construit le frontend, démarre l'API (SQLite), un faux Kling et
# l'aperçu Vite, puis joue le parcours Playwright. Usage : e2e/run.sh [dossier de sortie]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$(mkdir -p "${1:-$ROOT/e2e/out}" && cd "${1:-$ROOT/e2e/out}" && pwd)"
PYTHON="${PYTHON:-python3}"
API_PORT="${E2E_API_PORT:-8765}"
WEB_PORT="${E2E_WEB_PORT:-4173}"
KLING_PORT="${E2E_KLING_PORT:-8766}"
FILES_PORT="${E2E_FILES_PORT:-8767}"
WORK="$(mktemp -d)"
PIDS=()

cleanup() {
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

wait_for() {
  local url="$1" name="$2"
  for _ in $(seq 1 60); do
    if curl -fsS -k --noproxy "*" -o /dev/null "$url" 2>/dev/null; then return 0; fi
    sleep 1
  done
  echo "Échec du démarrage : $name ($url)" >&2
  return 1
}

for port in "$API_PORT" "$WEB_PORT" "$KLING_PORT" "$FILES_PORT"; do
  if curl -s --noproxy "*" -o /dev/null --max-time 2 "http://127.0.0.1:$port/"; then
    echo "Le port $port est déjà utilisé : arrêtez le processus qui l'occupe." >&2
    exit 1
  fi
done

echo "== Médias de test"
mkdir -p "$WORK/fixtures" "$WORK/kling"
ffmpeg -loglevel error -f lavfi -i "testsrc=size=320x240:rate=1" -frames:v 1 "$WORK/fixtures/img.png"
ffmpeg -loglevel error -f lavfi -i "testsrc=size=320x240:rate=25" -f lavfi -i "sine=frequency=440" \
  -t 2 -c:v libvpx -b:v 300k -c:a libvorbis "$WORK/fixtures/clip.webm"
ffmpeg -loglevel error -f lavfi -i "smptebars=size=640x360:rate=1" -frames:v 1 "$WORK/kling/result.png"
ffmpeg -loglevel error -f lavfi -i "smptebars=size=640x360:rate=25" -t 2 -c:v libx264 \
  -pix_fmt yuv420p "$WORK/kling/result.mp4"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
  -keyout "$WORK/kling/key.pem" -out "$WORK/kling/cert.pem" 2>/dev/null

echo "== Build du frontend"
(cd "$ROOT/frontend" && npm run build >/dev/null)

echo "== Faux Kling"
"$PYTHON" "$ROOT/e2e/fake_kling.py" --api-port "$KLING_PORT" --files-port "$FILES_PORT" \
  --files-dir "$WORK/kling" --cert "$WORK/kling/cert.pem" --key "$WORK/kling/key.pem" \
  >"$OUT/kling.log" 2>&1 &
PIDS+=($!)

echo "== API"
export GOLDFX_ENVIRONMENT=development
export GOLDFX_DATABASE_URL="sqlite:///$WORK/e2e.db"
export GOLDFX_STORAGE_DIR="$WORK/media"
export GOLDFX_COOKIE_SECURE=false
export GOLDFX_SECRET_KEY="e2e-secret-key-0123456789-abcdefghijklmnop"
export GOLDFX_PUBLIC_BASE_URL="http://localhost:$WEB_PORT"
export GOLDFX_CONTACT_RECIPIENT="contact@e2e.test"
export GOLDFX_KLING_BASE_URL="http://127.0.0.1:$KLING_PORT"
export GOLDFX_KLING_ACCESS_KEY="e2e-access"
export GOLDFX_KLING_SECRET_KEY="e2e-secret"
export GOLDFX_LOGIN_MAX_ATTEMPTS=100
# Le téléchargement des résultats (HTTPS) doit faire confiance au certificat du faux Kling
# et ne pas passer par un éventuel proxy sortant.
export NO_PROXY="localhost,127.0.0.1${NO_PROXY:+,$NO_PROXY}"
export no_proxy="$NO_PROXY"
(
  cd "$ROOT/backend"
  uv run alembic upgrade head >/dev/null
  SSL_CERT_FILE="$WORK/kling/cert.pem" exec uv run uvicorn --factory goldfx.main:create_app \
    --port "$API_PORT" --log-level warning
) >"$OUT/api.log" 2>&1 &
PIDS+=($!)

echo "== Aperçu du frontend"
(cd "$ROOT/frontend" && GOLDFX_API_URL="http://127.0.0.1:$API_PORT" \
  exec ./node_modules/.bin/vite preview --port "$WEB_PORT" --strictPort) >"$OUT/web.log" 2>&1 &
PIDS+=($!)

wait_for "http://127.0.0.1:$KLING_PORT/__requests" "faux Kling"
wait_for "http://127.0.0.1:$API_PORT/api/health/ready" "API"
wait_for "http://localhost:$WEB_PORT/" "frontend"

echo "== Parcours"
E2E_BASE="http://localhost:$WEB_PORT" E2E_FIXTURES="$WORK/fixtures" \
  E2E_KLING="http://127.0.0.1:$KLING_PORT" "$PYTHON" "$ROOT/e2e/parcours.py" "$OUT"
