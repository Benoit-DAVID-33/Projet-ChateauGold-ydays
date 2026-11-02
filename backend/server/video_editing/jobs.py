"""Travaux de montage : etat persiste sur disque et file d'attente prioritaire.

- ``Job`` : etat d'un montage (plan, progression, journal, resultat).
- ``JobStore`` : un fichier JSON par travail dans ``VIDEO_JOBS_DIR`` (ecriture
  atomique). Au redemarrage, un travail interrompu est marque en echec et ses
  generations non consommees sont rendues.
- ``JobQueue`` : file ``asyncio`` a priorite (offre Studio avant Decouverte),
  ``VIDEO_MAX_CONCURRENT_JOBS`` travaux en parallele.
"""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path

from server import config

logger = logging.getLogger("goldfx")

TERMINAL_STATES = {"done", "failed", "cancelled"}


@dataclass
class Job:  # pylint: disable=too-many-instance-attributes
    """Etat d'un travail de montage (enregistrement persiste tel quel en JSON)."""

    id: str
    username: str
    source_filename: str
    request: dict
    plan: dict
    generations: int
    estimated_cost_usd: float | None
    priority: int
    usage_day: str
    simulated: bool = False
    status: str = "queued"
    progress: float = 0.0
    steps: list[dict] = field(default_factory=list)
    result_filename: str = ""
    error: str = ""
    paid_calls_done: int = 0
    cancel_requested: bool = False
    file_token: str = field(default_factory=lambda: secrets.token_urlsafe(24))
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def log(self, message: str) -> None:
        """Ajoute une etape au journal (visible par l'utilisateur)."""
        self.steps.append({"at": round(time.time(), 3), "message": message})
        self.updated_at = time.time()

    def public(self) -> dict:
        """Vue utilisateur : etat, progression, resultat. Aucun detail technique
        (modeles, prompts, couts, jeton de fichiers)."""
        return {
            "id": self.id,
            "source_filename": self.source_filename,
            "status": self.status,
            "progress": self.progress,
            "steps": self.steps,
            "result_filename": self.result_filename,
            "error": self.error,
            "generations": self.generations,
            "simulated": self.simulated,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "changes": [
                {"instruction": e["instruction"], "start": e["start"], "end": e["end"]}
                for e in self.plan.get("edits", [])
            ],
        }

    def admin_view(self) -> dict:
        """Vue complete pour la supervision (sans le jeton des fichiers)."""
        data = asdict(self)
        data.pop("file_token", None)
        return data


class JobStore:
    """Persistance des travaux (un JSON par travail)."""

    def __init__(self, folder: Path | None = None) -> None:
        self._folder = Path(folder or config.VIDEO_JOBS_DIR)
        self._jobs: dict[str, Job] = {}
        self._loaded = False

    @property
    def folder(self) -> Path:
        """Dossier racine des travaux."""
        self._folder.mkdir(parents=True, exist_ok=True)
        return self._folder

    def work_dir(self, job: Job) -> Path:
        """Dossier de travail (segments intermediaires) d'un travail."""
        path = self.folder / job.id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        for path in self.folder.glob("*.json"):
            try:
                job = Job(**json.loads(path.read_text(encoding="utf-8")))
            except (OSError, ValueError, TypeError):
                logger.warning("Travail illisible ignoré : %s", path.name)
                continue
            if job.status not in TERMINAL_STATES:
                job.status = "failed"
                job.error = "Interrompu par un redémarrage du serveur"
                job.log(job.error)
                _refund_unused(job)
                self._write(job)
            self._jobs[job.id] = job

    def _write(self, job: Job) -> None:
        target = self.folder / f"{job.id}.json"
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(asdict(job), ensure_ascii=False), encoding="utf-8")
        temporary.replace(target)

    def save(self, job: Job) -> None:
        """Enregistre l'etat courant du travail."""
        self._load()
        job.updated_at = time.time()
        self._jobs[job.id] = job
        self._write(job)

    def get(self, job_id: str) -> Job | None:
        """Retourne un travail par son identifiant."""
        self._load()
        return self._jobs.get(job_id)

    def list_for(self, username: str, limit: int = 50) -> list[Job]:
        """Travaux d'un utilisateur, du plus recent au plus ancien."""
        self._load()
        jobs = [job for job in self._jobs.values() if job.username == username]
        return sorted(jobs, key=lambda job: job.created_at, reverse=True)[:limit]

    def all(self) -> list[Job]:
        """Tous les travaux (console d'administration)."""
        self._load()
        return sorted(self._jobs.values(), key=lambda job: job.created_at, reverse=True)


def new_job_id() -> str:
    """Identifiant court et non devinable."""
    return uuid.uuid4().hex[:16]


def _refund_unused(job: Job) -> None:
    """Rend les generations reservees mais jamais envoyees a un modele payant."""
    unused = job.generations - job.paid_calls_done
    if unused <= 0 or job.simulated:
        return
    try:
        from server.accounts.usage import get_usage_store

        get_usage_store().refund(job.username, unused, job.usage_day)
    except Exception:  # pylint: disable=broad-except
        # Le remboursement ne doit jamais masquer l'erreur d'origine du travail.
        logger.exception("Remboursement de quota impossible pour le travail %s", job.id)


Runner = Callable[[Job, JobStore], Awaitable[None]]


class JobQueue:
    """File prioritaire et pool de travailleurs asyncio (crees au premier envoi)."""

    def __init__(self, store: JobStore, runner: Runner, workers: int | None = None) -> None:
        self._store = store
        self._runner = runner
        self._workers = max(1, workers or config.VIDEO_MAX_CONCURRENT_JOBS)
        self._queue: asyncio.PriorityQueue | None = None
        self._tasks: list[asyncio.Task] = []
        self._counter = 0

    def _ensure_workers(self) -> asyncio.PriorityQueue:
        queue = self._ensure_queue()
        self._tasks = [task for task in self._tasks if not task.done()]
        while len(self._tasks) < self._workers:
            self._tasks.append(asyncio.create_task(self._work(), name="video-edit-worker"))
        return queue

    async def submit(self, job: Job) -> None:
        """Met le travail en file (priorite basse = traite d'abord)."""
        queue = self._ensure_workers()
        self._counter += 1
        await queue.put((job.priority, self._counter, job.id))

    @property
    def pending(self) -> int:
        """Travaux en attente."""
        return self._queue.qsize() if self._queue else 0

    async def _work(self) -> None:
        queue = self._ensure_queue()
        while True:
            _, _, job_id = await queue.get()
            job = self._store.get(job_id)
            try:
                if job is not None and job.status == "queued":
                    await self._run(job)
            finally:
                queue.task_done()

    def _ensure_queue(self) -> asyncio.PriorityQueue:
        if self._queue is None:
            self._queue = asyncio.PriorityQueue()
        return self._queue

    async def _run(self, job: Job) -> None:
        if job.cancel_requested:
            job.status = "cancelled"
            job.log("Annulé avant le démarrage")
            _refund_unused(job)
            self._store.save(job)
            return
        job.status = "running"
        job.log("Traitement démarré")
        self._store.save(job)
        try:
            await self._runner(job, self._store)
        except asyncio.CancelledError:
            job.status = "failed"
            job.error = "Arrêt du serveur pendant le traitement"
            raise
        except Exception as exc:  # pylint: disable=broad-except
            # Frontiere d'execution : toute erreur termine le travail proprement.
            logger.exception("Travail de montage %s en échec", job.id)
            job.status = "cancelled" if job.cancel_requested else "failed"
            job.error = str(getattr(exc, "message", exc))[:500]
            job.log(f"Échec : {job.error}")
        finally:
            if job.status not in TERMINAL_STATES:
                job.status = "failed"
            if job.status != "done":
                _refund_unused(job)
            self._store.save(job)

    async def aclose(self) -> None:
        """Arrete les travailleurs (fin de l'application)."""
        for task in self._tasks:
            task.cancel()
        self._tasks = []
