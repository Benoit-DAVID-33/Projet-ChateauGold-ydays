"""Profilage du rendu d'une page avec ``cProfile``.

Repond a la question « ou passe le temps ? » en listant les fonctions les plus
couteuses (par temps cumule).

Usage (depuis ``backend/``) :

    python scripts/profile_app.py                        # profil de /login
    python scripts/profile_app.py --url /video --top 30
    python scripts/profile_app.py --snakeviz             # rapport visuel SnakeViz

L'application est appelee en memoire (ASGI) : aucun serveur a lancer.
Pour la vue visuelle : ``pip install snakeviz`` puis ``snakeviz profile.prof``.

Note : le fichier ne s'appelle volontairement pas ``profile.py`` pour ne pas
masquer le module standard ``profile`` dont depend ``cProfile``.
"""

import argparse
import asyncio
import cProfile
import io
import logging
import pstats
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# backend/ est ajoute au sys.path juste avant ces imports : la position est
# volontaire, d'ou la desactivation de la regle ci-dessous.
# pylint: disable=wrong-import-position
import httpx

from server import create_app

# Le rapport de profilage doit rester lisible : on coupe les logs d'httpx.
logging.getLogger("httpx").setLevel(logging.WARNING)


async def _run_requests(url: str, requests: int) -> None:
    """Execute ``requests`` requetes GET sur ``url`` en memoire (ASGI)."""
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        for _ in range(requests):
            await client.get(url)


def run_requests(url: str, requests: int) -> None:
    """Lance le scenario de requetes dans une boucle d'evenements."""
    asyncio.run(_run_requests(url, requests))


def main() -> int:
    """Point d'entree du script de profilage."""
    parser = argparse.ArgumentParser(description="Profilage cProfile de l'application.")
    parser.add_argument("--url", default="/login", help="chemin a profiler")
    parser.add_argument("--requests", type=int, default=200, help="nombre de requetes")
    parser.add_argument("--top", type=int, default=20, help="nombre de fonctions affichees")
    parser.add_argument("--output", default="profile.prof", help="fichier de sortie cProfile")
    parser.add_argument("--snakeviz", action="store_true", help="ecrire le rapport pour SnakeViz")
    args = parser.parse_args()

    profiler = cProfile.Profile()
    profiler.enable()
    run_requests(args.url, args.requests)
    profiler.disable()

    if args.snakeviz:
        profiler.dump_stats(args.output)
        print(f"Rapport ecrit dans {args.output}.")
        print(f"Visualisation : pip install snakeviz && snakeviz {args.output}")
        return 0

    stream = io.StringIO()
    stats = pstats.Stats(profiler, stream=stream).sort_stats("cumulative")
    stats.print_stats(args.top)
    print(stream.getvalue())
    return 0


if __name__ == "__main__":
    sys.exit(main())
