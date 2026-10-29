"""Test de charge simple contre un serveur en cours d'execution.

Mesure le debit (requetes/seconde) et les percentiles de latence sous
concurrence. Permet de definir des scenarios (« max N utilisateurs simultanes »)
et de verifier que le systeme tient la charge.

Usage (depuis ``backend/``) :

    # 1) lancer le serveur : uvicorn main:app --port 5000
    # 2) lancer la charge :
    python scripts/load_test.py --url http://localhost:5000/login \
        --requests 500 --concurrency 25
"""

import argparse
import asyncio
import statistics
import time

import httpx


async def _worker(
    client: httpx.AsyncClient, url: str, count: int, latencies: list[float], errors: list[int]
) -> None:
    """Execute ``count`` requetes et enregistre latences et codes d'erreur."""
    for _ in range(count):
        start = time.perf_counter()
        try:
            response = await client.get(url)
        except httpx.HTTPError:
            errors.append(0)
            continue
        latencies.append((time.perf_counter() - start) * 1000)
        if response.status_code >= 400:
            errors.append(response.status_code)


async def _run(url: str, requests: int, concurrency: int) -> tuple[list[float], list[int], float]:
    """Repartit ``requests`` sur ``concurrency`` travailleurs concurrents."""
    latencies: list[float] = []
    errors: list[int] = []
    per_worker = max(1, requests // concurrency)

    async with httpx.AsyncClient(timeout=30.0) as client:
        await client.get(url)  # chauffe
        started = time.perf_counter()
        await asyncio.gather(
            *[_worker(client, url, per_worker, latencies, errors) for _ in range(concurrency)]
        )
        elapsed = time.perf_counter() - started
    return latencies, errors, elapsed


def main() -> int:
    """Point d'entree du test de charge."""
    parser = argparse.ArgumentParser(description="Test de charge HTTP.")
    parser.add_argument("--url", default="http://localhost:5000/login")
    parser.add_argument("--requests", type=int, default=500)
    parser.add_argument("--concurrency", type=int, default=25)
    args = parser.parse_args()

    latencies, errors, elapsed = asyncio.run(_run(args.url, args.requests, args.concurrency))
    total = len(latencies) + len(errors)

    print(f"URL              : {args.url}")
    print(f"Requetes         : {total} (concurrence {args.concurrency})")
    print(f"Duree            : {elapsed:.2f} s")
    print(f"Debit            : {total / elapsed:.0f} req/s")
    print(f"Erreurs          : {len(errors)}")

    if latencies:
        ordered = sorted(latencies)
        p95 = ordered[int(len(ordered) * 0.95) - 1]
        print(
            f"Latence (ms)     : min {min(latencies):.1f} | "
            f"p50 {statistics.median(latencies):.1f} | "
            f"p95 {p95:.1f} | max {max(latencies):.1f}"
        )
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
