"""Execution d'un travail de montage : decoupe -> edition IA -> assemblage.

Pour chaque segment du plan :

- ``keep`` : extrait tel quel puis normalise ;
- ``edit`` : chaque morceau est extrait (avec son contexte eventuel), passe
  dans les modeles l'un apres l'autre (une generation par modification), puis
  recoupe a sa duree exacte et normalise.

Les segments sont ensuite assembles sans re-encodage et la piste audio
d'origine est remise sur toute la duree. Le resultat est ecrit dans le dossier
videos (``edit_<id>.mp4``) : il est donc servi par ``GET /videos/<nom>``.

Mode simulation (``VIDEO_EDITING_SIMULATE``) : aucun appel payant, les
morceaux passent sans modification (pour tester toute la chaine).
"""

from __future__ import annotations

import asyncio
import shutil
from dataclasses import dataclass
from pathlib import Path

from server import config
from server.media import ffmpeg
from server.video_editing.catalog import get_model
from server.video_editing.jobs import Job, JobStore
from server.video_editing.providers import EditJobInput, EditProviderError, get_provider

_IMAGE_TOKENS = {"kling": "<<<image_1>>>", "fal": "@Image1"}


class JobCancelled(Exception):
    """Le travail a ete annule par l'utilisateur."""

    message = "Annulé par l'utilisateur"


def public_file_url(job: Job, path: Path) -> str:
    """URL publique (a jeton) d'un fichier de travail, ou "" sans PUBLIC_BASE_URL."""
    if not config.PUBLIC_BASE_URL:
        return ""
    return f"{config.PUBLIC_BASE_URL}/api/video-edits/files/{job.id}/{job.file_token}/{path.name}"


def _total_steps(plan: dict) -> int:
    steps = 1  # assemblage final
    for segment in plan["segments"]:
        steps += (
            1
            if segment["action"] == "keep"
            else sum(1 + len(piece["calls"]) for piece in segment["pieces"])
        )
    return steps


class _Progress:
    """Progression du travail : une etape = une operation visible dans le journal."""

    def __init__(self, job: Job, store: JobStore) -> None:
        self.job, self.store = job, store
        self.total = max(1, _total_steps(job.plan))
        self.done = 0

    def step(self, message: str) -> None:
        """Valide une etape (ou s'arrete si l'annulation a ete demandee)."""
        if self.job.cancel_requested:
            raise JobCancelled()
        self.done += 1
        self.job.progress = round(min(0.99, self.done / self.total), 3)
        self.job.log(message)
        self.store.save(self.job)


@dataclass
class _Context:
    """Ce dont chaque etape du montage a besoin."""

    job: Job
    work: Path
    source: Path
    info: ffmpeg.VideoInfo
    progress: _Progress

    async def normalize(self, clip: Path, name: str, duration: float) -> Path:
        """Remet un extrait au format exact de la source (taille, cadence, duree)."""
        return await asyncio.to_thread(
            ffmpeg.normalize,
            clip,
            self.work / name,
            self.info.width,
            self.info.height,
            self.info.fps,
            duration,
        )


async def _edit_call(
    job: Job, work: Path, source: Path, call: dict, reference: Path | None, label: str
) -> Path:
    """Une generation sur ``source`` ; retourne le fichier produit."""
    model = get_model(call["model"])
    if model is None:
        raise EditProviderError(f"Modèle inconnu : {call['model']}")
    tier = model.tier(call["quality"])
    if tier is None:
        raise EditProviderError(f"Qualité {call['quality']} indisponible pour {model.label}")
    output = work / f"{label}_{model.key}.mp4"
    if job.simulated:
        shutil.copyfile(source, output)
        return output

    prompt = call["prompt"]
    if reference is not None and model.image_references:
        token = _IMAGE_TOKENS.get(model.provider, "the reference image")
        prompt = f"{prompt} Keep the added elements consistent with {token}."
    options = dict(call.get("params", {}))
    if model.time_window:
        info = await asyncio.to_thread(ffmpeg.probe, source)
        options.update({"start_time": 0.0, "duration": round(info.duration, 3)})
    job_input = EditJobInput(
        model=model,
        tier=tier,
        video_path=source,
        prompt=prompt,
        public_url=public_file_url(job, source),
        negative_prompt=call.get("negative_prompt", ""),
        reference_image=reference,
        reference_image_url=public_file_url(job, reference) if reference else "",
        options=options,
    )

    def _submitted() -> None:  # un appel accepte par le fournisseur est facture
        job.paid_calls_done += 1

    return await get_provider(model.provider).run_edit(job_input, output, _submitted)


async def run(job: Job, store: JobStore) -> None:
    """Execute le plan du travail (appele par la file ``JobQueue``)."""
    work = store.work_dir(job)
    source = config.VIDEO_FOLDER / job.source_filename
    info = await asyncio.to_thread(ffmpeg.probe, source)
    context = _Context(job, work, source, info, _Progress(job, store))
    parts: list[Path] = []
    try:
        for s_index, segment in enumerate(job.plan["segments"]):
            parts.extend(await _render_segment(context, s_index, segment))

        assembled = await asyncio.to_thread(ffmpeg.concat, parts, work / "assembled.mp4")
        result_name = f"edit_{job.id}.mp4"
        result = config.VIDEO_FOLDER / result_name
        if info.has_audio:
            await asyncio.to_thread(ffmpeg.mux_audio, assembled, source, result)
        else:
            shutil.move(str(assembled), result)
        job.result_filename = result_name
        job.status = "done"
        job.progress = 1.0
        job.log(
            "Montage terminé" + (" (simulation : aucune modification IA)" if job.simulated else "")
        )
        store.save(job)
    except JobCancelled:
        job.status = "cancelled"
        job.log(JobCancelled.message)
    finally:
        shutil.rmtree(work, ignore_errors=True)


async def _render_segment(context: _Context, s_index: int, segment: dict) -> list[Path]:
    """Produit le(s) fichier(s) normalise(s) d'un segment."""
    start, end = segment["start"], segment["end"]
    if segment["action"] == "keep":
        raw = await asyncio.to_thread(
            ffmpeg.cut, context.source, start, end, context.work / f"s{s_index}_keep.mp4"
        )
        part = await context.normalize(raw, f"s{s_index}_norm.mp4", end - start)
        context.progress.step(f"Segment {start:g} à {end:g} s conservé")
        return [part]

    parts: list[Path] = []
    previous: Path | None = None
    for p_index, piece in enumerate(segment["pieces"]):
        edited, part = await _render_piece(context, f"s{s_index}p{p_index}", piece, previous)
        previous = edited
        parts.append(part)
    return parts


async def _render_piece(
    context: _Context, label: str, piece: dict, previous: Path | None
) -> tuple[Path, Path]:
    """Extrait un morceau, applique ses generations, le recoupe et le normalise.

    Retourne (sortie editee complete, morceau final normalise).
    """
    current = await asyncio.to_thread(
        ffmpeg.cut,
        context.source,
        piece["render_start"],
        piece["render_end"],
        context.work / f"{label}_src.mp4",
    )
    context.progress.step(f"Passage {piece['start']:g} à {piece['end']:g} s préparé")
    reference = None
    if piece.get("continuity_from_previous") and previous is not None:
        at = max(0.0, (await asyncio.to_thread(ffmpeg.probe, previous)).duration - 0.1)
        reference = await asyncio.to_thread(
            ffmpeg.extract_frame, previous, at, context.work / f"{label}_ref.png"
        )
    for c_index, call in enumerate(piece["calls"]):
        current = await _edit_call(
            context.job, context.work, current, call, reference, f"{label}c{c_index}"
        )
        context.progress.step(f"Modification « {call['instruction']} » appliquée")
    trimmed = current
    offset = piece["start"] - piece["render_start"]
    if offset > 0.01 or piece["render_end"] - piece["end"] > 0.01:
        trimmed = await asyncio.to_thread(
            ffmpeg.cut,
            current,
            offset,
            offset + piece["end"] - piece["start"],
            context.work / f"{label}_trim.mp4",
        )
    exact = piece["end"] - piece["start"]
    return current, await context.normalize(trimmed, f"{label}_norm.mp4", exact)
