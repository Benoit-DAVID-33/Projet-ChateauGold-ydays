# syntax=docker/dockerfile:1.7
# --------------------------------------------------------------------------- #
# Image de l'API GOLD FX — build multi-étapes, exécution non-root.
# --------------------------------------------------------------------------- #
ARG PYTHON_VERSION=3.12

# --- Étape 1 : dépendances (uv, environnement virtuel reproductible) ---------
FROM ghcr.io/astral-sh/uv:0.11 AS uv
FROM python:${PYTHON_VERSION}-slim-bookworm AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv
COPY --from=uv /uv /usr/local/bin/uv

WORKDIR /src
# Couche de dépendances mise en cache tant que le lockfile ne change pas.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY README.md alembic.ini ./
COPY src ./src
COPY migrations ./migrations
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-editable

# --- Étape 2 : image d'exécution minimale ------------------------------------
FROM python:${PYTHON_VERSION}-slim-bookworm AS runtime

# ffmpeg : conversion WebM vers MP4 de l'export vidéo annoté.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 goldfx \
    && useradd --system --uid 10001 --gid goldfx --home-dir /app --shell /usr/sbin/nologin goldfx

ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    GOLDFX_ENVIRONMENT=production \
    GOLDFX_STORAGE_DIR=/data/media \
    GOLDFX_LOG_JSON=true

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /src/alembic.ini ./
COPY --from=builder /src/migrations ./migrations
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /data/media && chown -R goldfx:goldfx /data
VOLUME ["/data"]
USER goldfx

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

ENTRYPOINT ["tini", "--", "docker-entrypoint.sh"]
CMD ["serve"]
