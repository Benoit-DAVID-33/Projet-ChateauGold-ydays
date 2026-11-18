"""Tâches de fond de l'API.

``GenerationSweeper`` suit les générations non terminées sans attendre qu'un
utilisateur les affiche : les résultats arrivent dans la bibliothèque même si la
page a été fermée. Chaque processus uvicorn en lance un ; le bail en base
(voir ``GenerationService``) évite tout double traitement.
"""

from __future__ import annotations

import logging
import threading

from goldfx.container import Container

logger = logging.getLogger(__name__)


class GenerationSweeper:
    def __init__(self, container: Container, interval_seconds: float, batch_size: int = 20) -> None:
        self._container = container
        self._interval = interval_seconds
        self._batch_size = batch_size
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def run_once(self) -> int:
        """Un passage : renvoie le nombre de générations arrivées à un état final."""
        with self._container.unit_of_work() as uow:
            return self._container.generation_service(uow).refresh_pending(self._batch_size)

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._loop, name="generation-sweeper", daemon=True)
        self._thread.start()
        logger.info("generation.sweeper_started interval=%ss", self._interval)

    def stop(self, timeout: float = 10.0) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout)
            self._thread = None

    def _loop(self) -> None:
        while not self._stop.wait(self._interval):
            try:
                finished = self.run_once()
                if finished:
                    logger.info("generation.sweep finished=%s", finished)
            except Exception:
                # Base indisponible, erreur inattendue : on réessaie au passage suivant.
                logger.exception("generation.sweep_error")
