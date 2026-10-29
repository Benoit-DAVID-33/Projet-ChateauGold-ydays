"""Tests de performance / charge (exclus par defaut : ``pytest -m performance``).

Ils mesurent le debit (requetes/seconde) et les percentiles de latence sur un
scenario d'usage : N requetes concurrentes sur la page de connexion. Les seuils
sont volontairement generreux : l'objectif est de detecter une regression
catastrophique, pas de valider un SLA.
"""

import asyncio
import statistics
import time

import httpx

from server import create_app

CONCURRENCY = 20
REQUESTS = 200


def _run_load():
    """Execute une charge concurrente en memoire (ASGI) et retourne les mesures."""
    app = create_app()

    async def scenario():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            await client.get("/login")  # chauffe

            async def one():
                start = time.perf_counter()
                response = await client.get("/login")
                return (time.perf_counter() - start) * 1000, response.status_code

            started = time.perf_counter()
            results = await asyncio.gather(*[one() for _ in range(REQUESTS)])
            elapsed = time.perf_counter() - started
        return results, elapsed

    return asyncio.run(scenario())


def test_load_login_endpoint():
    """Charge de 200 requetes (20 concurrentes) sur /login.

    Seuils volontairement generreux : la mesure est faite en memoire, dans un
    seul processus (un seul coeur / une seule boucle d'evenements), ce qui
    penalise la concurrence. L'objectif est de detecter une regression
    catastrophique, pas de valider un SLA.
    """
    results, elapsed = _run_load()
    latencies = sorted(latency for latency, _ in results)

    assert all(status == 200 for _, status in results)
    requests_per_second = REQUESTS / elapsed
    p50 = statistics.median(latencies)
    p95 = latencies[int(len(latencies) * 0.95) - 1]
    print(f"\n[charge] {requests_per_second:.0f} req/s | p50 {p50:.2f} ms | p95 {p95:.2f} ms")

    assert requests_per_second > 100
    assert p95 < 500
