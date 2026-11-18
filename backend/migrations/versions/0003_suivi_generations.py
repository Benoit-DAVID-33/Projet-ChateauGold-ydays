"""suivi des generations cote serveur (bail de suivi)

Revision ID: 6b3ac083cc0f
Revises: 66a90ea3b1a8
Create Date: 2026-11-18 10:11:55.910809
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "6b3ac083cc0f"
down_revision: str | None = "66a90ea3b1a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("generations", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("refresh_lease_until", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.create_index(
            "ix_generations_status_updated", ["status", "updated_at"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("generations", schema=None) as batch_op:
        batch_op.drop_index("ix_generations_status_updated")
        batch_op.drop_column("refresh_lease_until")
