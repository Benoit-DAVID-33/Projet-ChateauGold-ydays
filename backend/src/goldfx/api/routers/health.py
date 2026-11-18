from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from goldfx import __version__
from goldfx.api.deps import ContainerDep
from goldfx.api.schemas import HealthOut

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("", response_model=HealthOut)
def liveness() -> HealthOut:
    """Le processus répond (sonde de vie)."""
    return HealthOut(status="ok", version=__version__)


@router.get("/ready", response_model=HealthOut)
def readiness(container: ContainerDep) -> JSONResponse:
    """Prêt à servir : la base de données est joignable (sonde de disponibilité)."""
    try:
        with container.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse({"status": "unavailable", "version": __version__}, status_code=503)
    return JSONResponse({"status": "ok", "version": __version__})
