"""API externe de traitement (demonstration).

Service distinct (port 5001) recevant medias et requetes texte. La logique de
traitement est volontairement simulee : le media est renvoye tel quel et la
requete texte recoit une reponse d'accuse de reception.
"""

import logging
import mimetypes
import os
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from werkzeug.utils import secure_filename

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("goldfx.api")

DATA_DIR = Path(os.environ.get("DATA_DIR", str(Path(__file__).resolve().parent / "data")))
UPLOAD_FOLDER = DATA_DIR / "api_uploads"
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="GOLD FX — API externe (démo)", version="1.0")


class QueryRequest(BaseModel):
    """Corps de /process-query : requete texte a traiter."""

    query: str = Field(default="", max_length=4000)


@app.get("/health")
async def health():
    """Sonde de disponibilite du service."""
    return {"status": "ok"}


@app.post("/process-video")
async def process_video(file: UploadFile = File(...), query: str = Form(default="")):
    """Recoit un media (+ requete optionnelle) et renvoie le media traite (demo : identique)."""
    filename = secure_filename(file.filename or "upload.bin") or "upload.bin"
    path = UPLOAD_FOLDER / filename
    path.write_bytes(await file.read())

    if query:
        logger.info("Requête texte reçue avec le média : %s", query)

    mimetype = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return FileResponse(str(path), media_type=mimetype, filename="processed_" + filename)


@app.post("/process-query")
async def process_query(payload: QueryRequest):
    """Recoit une requete texte et renvoie un accuse de reception (demo)."""
    query = payload.query.strip()
    if not query:
        return JSONResponse({"error": "Aucune requête reçue"}, status_code=400)

    return {
        "status": "success",
        "query": query,
        "response": f"Requête reçue : '{query}'. Traitement en cours...",
        "timestamp": datetime.now().isoformat(),
    }
