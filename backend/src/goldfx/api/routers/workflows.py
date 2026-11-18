from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, status

from goldfx.api.deps import CurrentUser, WorkflowServiceDep
from goldfx.api.schemas import WorkflowIn, WorkflowOut, WorkflowSummaryOut

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.get("", response_model=list[WorkflowSummaryOut])
def list_workflows(user: CurrentUser, service: WorkflowServiceDep) -> list[WorkflowSummaryOut]:
    return [WorkflowSummaryOut.model_validate(w) for w in service.list_owned(user.id)]


@router.post("", response_model=WorkflowOut, status_code=status.HTTP_201_CREATED)
def create_workflow(
    payload: WorkflowIn, user: CurrentUser, service: WorkflowServiceDep
) -> WorkflowOut:
    return WorkflowOut.of(service.create(user.id, payload.name, payload.graph))


@router.get("/{workflow_id}", response_model=WorkflowOut)
def get_workflow(workflow_id: UUID, user: CurrentUser, service: WorkflowServiceDep) -> WorkflowOut:
    return WorkflowOut.of(service.get(user.id, workflow_id))


@router.put("/{workflow_id}", response_model=WorkflowOut)
def update_workflow(
    workflow_id: UUID, payload: WorkflowIn, user: CurrentUser, service: WorkflowServiceDep
) -> WorkflowOut:
    return WorkflowOut.of(service.update(user.id, workflow_id, payload.name, payload.graph))


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow(workflow_id: UUID, user: CurrentUser, service: WorkflowServiceDep) -> None:
    service.delete(user.id, workflow_id)
