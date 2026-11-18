"""Enregistrement des workflows (graphes de nœuds de l'onglet Workflow)."""

from __future__ import annotations

import json
import uuid
from collections.abc import Sequence
from dataclasses import replace
from typing import Any
from uuid import UUID

from goldfx.domain.errors import NotFoundError, PayloadTooLargeError, ValidationError
from goldfx.domain.models import Workflow
from goldfx.domain.ports import Clock, UnitOfWork

MAX_NAME_LENGTH = 120
MAX_GRAPH_BYTES = 512 * 1024
MAX_NODES = 200
MAX_EDGES = 500
SUPPORTED_VERSIONS = {1}


def validate_graph(graph: Any) -> dict[str, object]:
    """Vérifie la structure minimale du graphe ; l'interprétation reste côté client."""
    if not isinstance(graph, dict):
        raise ValidationError("Le graphe doit être un objet JSON")
    if graph.get("version") not in SUPPORTED_VERSIONS:
        raise ValidationError("Version de graphe non supportée")
    nodes, edges = graph.get("nodes"), graph.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise ValidationError("Le graphe doit contenir les listes « nodes » et « edges »")
    if len(nodes) > MAX_NODES or len(edges) > MAX_EDGES:
        raise ValidationError(f"Graphe trop grand (max {MAX_NODES} nœuds, {MAX_EDGES} liens)")
    ids: set[str] = set()
    for node in nodes:
        if not isinstance(node, dict) or not isinstance(node.get("id"), str):
            raise ValidationError("Chaque nœud doit avoir un identifiant")
        if not isinstance(node.get("type"), str):
            raise ValidationError("Chaque nœud doit avoir un type")
        ids.add(node["id"])
    for edge in edges:
        if not isinstance(edge, dict):
            raise ValidationError("Lien invalide")
        if edge.get("source") not in ids or edge.get("target") not in ids:
            raise ValidationError("Un lien référence un nœud inexistant")
    if len(json.dumps(graph, separators=(",", ":"))) > MAX_GRAPH_BYTES:
        raise PayloadTooLargeError("Graphe trop volumineux")
    return graph


def _clean_name(name: str) -> str:
    name = " ".join(name.split())
    if not name:
        raise ValidationError("Le nom du workflow est requis")
    if len(name) > MAX_NAME_LENGTH:
        raise ValidationError(f"Nom trop long (max {MAX_NAME_LENGTH} caractères)")
    return name


class WorkflowService:
    def __init__(self, uow: UnitOfWork, clock: Clock) -> None:
        self._uow = uow
        self._clock = clock

    def create(self, owner_id: UUID, name: str, graph: Any) -> Workflow:
        now = self._clock.now()
        workflow = Workflow(
            id=uuid.uuid4(),
            owner_id=owner_id,
            name=_clean_name(name),
            graph=validate_graph(graph),
            created_at=now,
            updated_at=now,
        )
        self._uow.workflows.add(workflow)
        self._uow.commit()
        return workflow

    def get(self, owner_id: UUID, workflow_id: UUID) -> Workflow:
        workflow = self._uow.workflows.get(workflow_id)
        if workflow is None or workflow.owner_id != owner_id:
            raise NotFoundError("Workflow introuvable")
        return workflow

    def update(self, owner_id: UUID, workflow_id: UUID, name: str, graph: Any) -> Workflow:
        current = self.get(owner_id, workflow_id)
        updated = replace(
            current,
            name=_clean_name(name),
            graph=validate_graph(graph),
            updated_at=self._clock.now(),
        )
        self._uow.workflows.update(updated)
        self._uow.commit()
        return updated

    def delete(self, owner_id: UUID, workflow_id: UUID) -> None:
        workflow = self.get(owner_id, workflow_id)
        self._uow.workflows.delete(workflow.id)
        self._uow.commit()

    def list_owned(self, owner_id: UUID, limit: int = 100, offset: int = 0) -> Sequence[Workflow]:
        if not 1 <= limit <= 200 or offset < 0:
            raise ValidationError("Pagination invalide")
        return self._uow.workflows.list_by_owner(owner_id, limit, offset)
