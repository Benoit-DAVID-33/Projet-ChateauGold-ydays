"""Orchestration d'un montage : de la demande de l'utilisateur au travail en file.

``preview`` (gratuit, sans appel payant) :

1. sonde la video source (duree, taille, ratio, audio) ;
2. applique les limites de l'offre (duree, nombre de modifications, qualite) ;
3. trie la demande (texte libre ou modifications datees de la timeline) ;
4. construit le plan (``planner``) avec le modele le plus coherent par
   modification (``routing``) ;
5. ecrit le prompt de chaque generation pour le modele retenu (regles, ou LLM
   gratuit si demande) ;
6. estime le cout et liste ce qui bloquerait le lancement.

``submit`` refait la preview, reserve les generations du jour (atomique) puis
met le travail en file.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict, dataclass, field
from functools import partial

from server import config
from server.accounts.plans import Plan
from server.accounts.usage import QuotaExceeded, UsageStore, get_usage_store, utc_day
from server.media import ffmpeg
from server.media.files import safe_path
from server.prompts import enhancer, timecodes, triage
from server.video_editing import pipeline
from server.video_editing.catalog import (
    NOMINAL_RESOLUTION,
    QUALITY_LABELS,
    QUALITY_ORDER,
    get_model,
)
from server.video_editing.jobs import Job, JobQueue, JobStore, new_job_id
from server.video_editing.planner import EditRequest, JobPlan, build_plan
from server.video_editing.routing import NoModelAvailable, choose_model, plan_status

logger = logging.getLogger("goldfx")


class EditingError(Exception):
    """Demande invalide : ``message`` pour l'utilisateur, ``detail`` technique (admins)."""

    def __init__(self, message: str, status: int = 400, detail: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.detail = detail


@dataclass
class EditInput:
    """Une modification venant de la timeline (moment explicite) ou du texte libre."""

    instruction: str
    start: float | None = None
    end: float | None = None


@dataclass
class EditingRequest:
    """Demande de montage telle que recue par l'API."""

    filename: str
    instructions: str = ""
    edits: list[EditInput] = field(default_factory=list)
    quality: str = "standard"
    model: str = "auto"
    use_llm: bool = False


@dataclass
class Preview:
    """Plan de montage presente avant tout lancement."""

    source: dict
    plan: dict
    generations: int
    estimated_cost_usd: float | None
    usage: dict
    quality: str
    blockers: list[str]
    warnings: list[str]
    assumptions: list[str]
    simulated: bool
    notices: list[dict] = field(default_factory=list)

    @property
    def can_run(self) -> bool:
        """Indique si le travail peut etre lance."""
        return not self.blockers

    def as_dict(self) -> dict:
        """Representation JSON complete (supervision, tests)."""
        data = asdict(self)
        data["can_run"] = self.can_run
        return data

    def user_view(self) -> dict:
        """Ce que voit l'utilisateur : ses modifications, la qualite, son quota et des
        messages clairs. Ni modele, ni prompt, ni cout fournisseur."""
        quality = self.quality
        return {
            "can_run": self.can_run,
            "quality": quality,
            "quality_label": f"{QUALITY_LABELS[quality]} · {NOMINAL_RESOLUTION[quality]}",
            "video_seconds": self.plan["video_seconds"],
            "changes": [
                {
                    "index": e["index"],
                    "instruction": e["instruction"],
                    "start": e["start"],
                    "end": e["end"],
                }
                for e in self.plan["edits"]
            ],
            "segments": [
                {
                    "start": s["start"],
                    "end": s["end"],
                    "changes": [i + 1 for i in s["edit_indexes"]],
                }
                for s in self.plan["segments"]
            ],
            "generations": self.generations,
            "remaining_today": self.usage["remaining_today"],
            "plan_label": self.usage["label"],
            "notices": self.notices,
            "simulated": self.simulated,
        }


def _edit_requests(request: EditingRequest) -> list[EditRequest]:
    """Transforme la demande en modifications triees et datees."""
    edits: list[EditRequest] = []
    if request.edits:
        for item in request.edits:
            window, instruction = timecodes.extract(item.instruction)
            explicit = item.start is not None or item.end is not None
            # « a 15 s ajoute un dragon » avec un debut laisse a 0 : le texte l'emporte.
            default_fields = item.start in (None, 0) and item.end is None
            if explicit and not (window.is_set and default_fields):
                window = timecodes.TimeWindow(start=item.start, end=item.end)
            instruction = instruction or item.instruction
            edits.append(EditRequest(instruction, triage.resolve_intent(instruction), window))
        return edits
    for edit in triage.analyze(request.instructions).edits:
        window = timecodes.TimeWindow(
            start=edit.timing.get("start"),
            end=edit.timing.get("end"),
            length=edit.timing.get("length"),
            anchor=edit.timing.get("anchor", ""),
        )
        edits.append(EditRequest(edit.instruction, edit.intent, window))
    return edits


def _cap_quality(requested: str, plan: Plan, warnings: list[str], notices: list[dict]) -> str:
    if requested not in QUALITY_ORDER:
        raise EditingError(f"Qualité inconnue : {requested}")
    if plan.allows_quality(requested):
        return requested
    message = (
        f"Qualité {QUALITY_LABELS[requested]} non incluse dans l'offre {plan.label} : "
        f"{QUALITY_LABELS[plan.max_quality]} à la place."
    )
    warnings.append(message)
    notices.append(
        {
            "kind": "info",
            "text": f"La qualité {QUALITY_LABELS[requested]} est réservée à l'offre Studio : "
            f"votre vidéo sera rendue en {QUALITY_LABELS[plan.max_quality]}.",
        }
    )
    return plan.max_quality


async def _write_prompts(job_plan: JobPlan, use_llm: bool) -> None:
    """Ecrit le prompt de chaque generation pour le modele qui l'executera."""
    prompts: dict[tuple[int, str], enhancer.PromptStep] = {}
    params: dict[tuple[int, str], dict] = {}
    for segment in job_plan.segments:
        for piece in segment.pieces:
            for call in piece.calls:
                key = (call.edit_index, call.model)
                if key not in prompts:
                    model = get_model(call.model)
                    if model is None:
                        raise EditingError(f"Modèle inconnu : {call.model}")
                    instruction = job_plan.edits[call.edit_index]["instruction"]
                    result = await enhancer.enhance(
                        instruction, model.prompt_profile, use_llm, model.video_reference
                    )
                    prompts[key] = result.steps[0]
                    params[key] = enhancer.recommended_params(model.prompt_profile, result.intent)
                step = prompts[key]
                call.prompt = step.prompt
                call.negative_prompt = step.negative_prompt
                call.params = {
                    k: v for k, v in params[key].items() if k in {"refer_type", "strength"}
                }


def _plan_dict(job_plan: JobPlan) -> dict:
    segments = []
    for segment in job_plan.segments:
        segments.append(
            {
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "action": segment.action,
                "edit_indexes": segment.edit_indexes,
                "pieces": [
                    {
                        **asdict(piece),
                        "calls": [
                            {
                                **asdict(call),
                                "instruction": job_plan.edits[call.edit_index]["instruction"],
                            }
                            for call in piece.calls
                        ],
                    }
                    for piece in segment.pieces
                ],
            }
        )
    return {"video_seconds": job_plan.video_seconds, "edits": job_plan.edits, "segments": segments}


def _prices(job_plan: JobPlan) -> dict[tuple[str, str], float | None]:
    prices: dict[tuple[str, str], float | None] = {}
    for edit in job_plan.edits:
        route = edit["route"]
        prices[(route["model"], route["quality"])] = route["price_usd_per_second"]
    return prices


def _budget_checks(
    job_plan: JobPlan,
    cost: float | None,
    snapshot,
    simulated: bool,
    blockers: list[str],
    warnings: list[str],
    notices: list[dict],
) -> None:
    """Cout et quota : bloquants en production, simples avertissements en simulation.

    Chaque message technique a son equivalent utilisateur dans ``notices``.
    """
    plan = snapshot.plan
    budget = warnings if simulated else blockers
    kind = "info" if simulated else "blocker"

    def flag(technical: str, user_text: str, blocking: bool = True) -> None:
        (budget if blocking else warnings).append(technical)
        if blocking or simulated:
            notices.append({"kind": kind if blocking else "info", "text": user_text})

    if cost is None:
        flag(
            "Coût non estimable : au moins un modèle retenu ne publie pas son prix.",
            f"Cette modification n'est pas encore disponible avec l'offre {plan.label}.",
            blocking=plan.key == "free",
        )
    elif cost > plan.max_job_cost_usd:
        flag(
            f"Coût estimé {cost:.2f} $ au-delà du plafond de l'offre {plan.label} "
            f"({plan.max_job_cost_usd:.2f} $ par vidéo).",
            f"Ce montage dépasse ce que permet l'offre {plan.label} : réduisez la durée "
            "modifiée ou passez à l'offre Studio.",
        )
    if job_plan.generations > snapshot.remaining:
        flag(
            f"{job_plan.generations} génération(s) nécessaire(s), {snapshot.remaining} "
            "restante(s) aujourd'hui.",
            f"Ce montage demande {job_plan.generations} génération(s) ; il vous en reste "
            f"{snapshot.remaining} aujourd'hui.",
        )
    if simulated:
        warnings.append("Mode simulation : aucune modification IA, aucun coût.")
        notices.append(
            {"kind": "info", "text": "Mode démonstration : la vidéo est assemblée sans effet IA."}
        )


def free_models_only(plan: Plan) -> bool:
    """L'offre gratuite est-elle limitee aux modeles gratuits (rien de facture) ?"""
    return plan.key == "free" and config.PLAN_FREE_ONLY_FREE_MODELS


def _free_demo_checks(
    job_plan: JobPlan, simulated: bool, blockers: list[str], notices: list[dict]
) -> None:
    """Demonstration gratuite (Space HF) : quota GPU anonyme du jour suffisant ?"""
    from server.video_editing.providers.hf_space import estimate_gpu_seconds, get_budget

    needed = 0.0
    for segment in job_plan.segments:
        for piece in segment.pieces:
            for call in piece.calls:
                model = get_model(call.model)
                if model is not None and model.provider == "hf_space":
                    needed += estimate_gpu_seconds(piece.render_end - piece.render_start)
    if not needed:
        return
    notices.append(
        {
            "kind": "info",
            "text": "Démonstration gratuite : rendu en 720p, par passages de 4 secondes "
            "au maximum. Le délai peut s'allonger aux heures chargées.",
        }
    )
    remaining = get_budget().remaining()
    if needed > remaining and not simulated:
        blockers.append(
            f"Quota gratuit du Space insuffisant : {needed:.0f} s de GPU nécessaires, "
            f"{remaining:.0f} s restantes aujourd'hui."
        )
        notices.append(
            {
                "kind": "blocker",
                "text": "La démonstration gratuite a atteint sa limite pour aujourd'hui : "
                "raccourcissez la zone modifiée, réessayez demain ou passez à l'offre Studio.",
            }
        )


async def _probe_source(filename: str) -> ffmpeg.VideoInfo:
    """Sonde la video source (404 si absente, 422 si illisible)."""
    source = safe_path(config.VIDEO_FOLDER, filename)
    if source is None or not source.is_file():
        raise EditingError("Vidéo source introuvable", status=404)
    try:
        return await asyncio.to_thread(ffmpeg.probe, source)
    except ffmpeg.FfmpegError as exc:
        raise EditingError("Cette vidéo est illisible.", status=422, detail=str(exc)) from exc


class EditingService:
    """Point d'entree metier de l'edition video (utilise par ``server.api.video_edits``)."""

    def __init__(self, usage: UsageStore | None = None, store: JobStore | None = None) -> None:
        self._usage = usage
        self.store = store or JobStore()
        self.queue = JobQueue(self.store, pipeline.run)

    @property
    def usage(self) -> UsageStore:
        """Store des offres et de la consommation."""
        if self._usage is None:
            self._usage = get_usage_store()
        return self._usage

    async def preview(self, username: str, request: EditingRequest) -> Preview:
        """Plan de montage + cout estime, sans aucun appel payant."""
        info = await _probe_source(request.filename)

        snapshot = await asyncio.to_thread(self.usage.snapshot, username)
        plan = snapshot.plan
        blockers: list[str] = []
        warnings: list[str] = []
        notices: list[dict] = []
        if info.duration > plan.max_video_seconds:
            blockers.append(
                f"Vidéo de {info.duration:.0f} s : l'offre {plan.label} accepte "
                f"{plan.max_video_seconds} s maximum."
            )
            notices.append({"kind": "blocker", "text": blockers[-1]})
        quality = _cap_quality(request.quality, plan, warnings, notices)
        edits = _edit_requests(request)
        if not edits or not any(edit.prompt_source.strip() for edit in edits):
            raise EditingError("Décrivez au moins une modification")
        if len(edits) > plan.max_edits_per_job:
            blockers.append(
                f"{len(edits)} modifications demandées : l'offre {plan.label} en autorise "
                f"{plan.max_edits_per_job} par vidéo."
            )
            notices.append({"kind": "blocker", "text": blockers[-1]})
        try:
            job_plan = build_plan(
                edits,
                info.duration,
                quality=quality,
                aspect_ratio=info.aspect_ratio,
                preferred_model=request.model,
                router=partial(choose_model, status=plan_status(free_models_only(plan))),
            )
        except NoModelAvailable as exc:
            details = " ; ".join(f"{key} : {reason}" for key, reason in exc.rejected.items())
            raise EditingError(
                "Le service de génération est momentanément indisponible. Réessayez plus tard.",
                status=503,
                detail=f"{exc.message}. {details}",
            ) from exc
        await _write_prompts(job_plan, request.use_llm)

        cost = job_plan.estimated_cost(_prices(job_plan))
        _budget_checks(
            job_plan, cost, snapshot, config.VIDEO_EDITING_SIMULATE, blockers, warnings, notices
        )
        _free_demo_checks(job_plan, config.VIDEO_EDITING_SIMULATE, blockers, notices)
        notices.extend({"kind": "info", "text": text} for text in job_plan.assumptions)
        return Preview(
            source={"filename": request.filename, **info.as_dict()},
            plan=_plan_dict(job_plan),
            generations=job_plan.generations,
            estimated_cost_usd=cost,
            usage=snapshot.as_dict(),
            quality=quality,
            blockers=blockers,
            warnings=warnings + job_plan.warnings,
            assumptions=job_plan.assumptions,
            simulated=config.VIDEO_EDITING_SIMULATE,
            notices=notices,
        )

    async def submit(self, username: str, request: EditingRequest) -> tuple[Job, Preview]:
        """Valide, reserve le quota et met le travail en file."""
        preview = await self.preview(username, request)
        if not preview.can_run:
            raise EditingError(" ".join(preview.blockers), status=402)
        simulated = preview.simulated
        if not simulated:
            try:
                await asyncio.to_thread(self.usage.reserve, username, preview.generations)
            except QuotaExceeded as exc:
                raise EditingError(str(exc), status=429) from exc
        plan = self.usage.plan_of(username)
        job = Job(
            id=new_job_id(),
            username=username,
            source_filename=request.filename,
            request=asdict(request),
            plan=preview.plan,
            generations=preview.generations,
            estimated_cost_usd=preview.estimated_cost_usd,
            priority=plan.queue_priority,
            usage_day=utc_day(),
            simulated=simulated,
        )
        cost = preview.estimated_cost_usd
        cost_label = f"{cost:.2f} $" if cost is not None else "non estimable"
        job.log(f"Travail créé : {preview.generations} génération(s), coût estimé {cost_label}")
        self.store.save(job)
        await self.queue.submit(job)
        return job, preview

    def cancel(self, username: str, job_id: str) -> Job:
        """Demande l'annulation d'un travail (effective a la prochaine etape)."""
        job = self.store.get(job_id)
        if job is None or job.username != username:
            raise EditingError("Travail introuvable", status=404)
        if job.status in {"done", "failed", "cancelled"}:
            raise EditingError("Ce travail est déjà terminé", status=409)
        job.cancel_requested = True
        job.log("Annulation demandée")
        self.store.save(job)
        return job


_service: EditingService | None = None


def get_service() -> EditingService:
    """Service partage (cree a la premiere requete)."""
    global _service  # pylint: disable=global-statement
    if _service is None:
        _service = EditingService()
    return _service


async def shutdown() -> None:
    """Arrete les travailleurs de la file (fin de l'application)."""
    if _service is not None:
        await _service.queue.aclose()
