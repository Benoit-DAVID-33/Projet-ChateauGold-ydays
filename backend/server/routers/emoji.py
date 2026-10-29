"""Routes du studio emoji (recherche, analyse de composition, plan de calques).

Namespace distinct ``/api/emoji/*`` : la logique est identique a celle du studio
client (`emoji-studio.html`), mais cote serveur et reutilisable. Aucun rendu
image n'est fait ici : ``/plan`` renvoie un JSON de positions que le navigateur
dessine sur canvas.
"""

import logging

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from .. import config
from ..deps import require_user
from ..emoji import (
    EmojiDataError,
    LayerOptions,
    get_dataset,
    parse_prompt,
    plan_layers,
    rank_matches,
)
from ..schemas import EmojiPlanRequest

logger = logging.getLogger("goldfx")

router = APIRouter(prefix="/api/emoji", tags=["emoji"], dependencies=[Depends(require_user)])


@router.get("/search")
async def search_emojis(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=72, ge=1, le=200),
):
    """Recherche des emojis par libelle ou tag (francais et anglais)."""
    if not q.strip():
        return {"query": q, "count": 0, "results": []}
    try:
        dataset = await get_dataset()
    except EmojiDataError as exc:
        return JSONResponse({"error": exc.args[0], "message": exc.args[0]}, status_code=503)
    results = rank_matches(dataset, q, min(limit, config.EMOJI_MAX_RESULTS))
    return {"query": q, "count": len(results), "results": results}


@router.post("/plan")
async def emoji_plan(payload: EmojiPlanRequest):
    """Analyse une composition et renvoie le plan de calques (positions incluses)."""
    mentions: list[dict] = []
    items: list[dict] = []

    if payload.emojis:
        items = [{"emoji": emoji, "quantity": payload.quantity} for emoji in payload.emojis]
    elif payload.prompt.strip():
        mentions = parse_prompt(payload.prompt)
        if mentions:
            try:
                dataset = await get_dataset()
            except EmojiDataError as exc:
                return JSONResponse({"error": exc.args[0], "message": exc.args[0]}, status_code=503)
            for mention in mentions:
                hits = rank_matches(dataset, mention["query"], 1)
                if hits:
                    item = dict(hits[0])
                    item["quantity"] = mention["count"]
                    items.append(item)

    if not items:
        return {
            "mentions": mentions,
            "canvas": {"width": payload.width, "height": payload.height},
            "layers": [],
        }

    plan = plan_layers(
        items,
        LayerOptions(
            width=payload.width,
            height=payload.height,
            size=payload.size,
            rotation=payload.rotation,
            opacity=payload.opacity,
            placement=payload.placement,
            seed=payload.seed,
        ),
    )
    return {"mentions": mentions, **plan}


@router.get("/dataset")
async def emoji_dataset(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
):
    """Retourne une page du jeu d'emojis (metadonnees, sans le champ skins)."""
    try:
        dataset = await get_dataset()
    except EmojiDataError as exc:
        return JSONResponse({"error": exc.args[0], "message": exc.args[0]}, status_code=503)
    page = dataset[offset : offset + limit]
    return {"total": len(dataset), "offset": offset, "limit": limit, "results": page}
