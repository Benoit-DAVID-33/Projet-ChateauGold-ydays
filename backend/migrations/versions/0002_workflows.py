"""workflows

Revision ID: 66a90ea3b1a8
Revises: 7f5ad3eb03ba
Create Date: 2026-10-30 20:57:24.712886
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "66a90ea3b1a8"
down_revision: str | None = "7f5ad3eb03ba"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workflows",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("graph", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_workflows_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workflows")),
    )
    with op.batch_alter_table("workflows", schema=None) as batch_op:
        batch_op.create_index(
            "ix_workflows_owner_updated", ["owner_id", "updated_at"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("workflows", schema=None) as batch_op:
        batch_op.drop_index("ix_workflows_owner_updated")

    op.drop_table("workflows")
