"""create habits and habit_logs tables

Revision ID: 001
Revises:
Create Date: 2026-03-07

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "habits",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime,
            server_default=sa.func.now(),
        ),
        sa.Column("is_active", sa.Boolean, default=True),
    )

    op.create_table(
        "habit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "habit_id",
            sa.String(36),
            sa.ForeignKey("habits.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("completed_date", sa.Date, nullable=False),
        sa.Column(
            "synced_at",
            sa.DateTime,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("habit_id", "completed_date", name="uq_habit_date"),
    )


def downgrade() -> None:
    op.drop_table("habit_logs")
    op.drop_table("habits")
