"""store datetime columns as UTC with timezone awareness

Revision ID: 003
Revises: 002
Create Date: 2026-05-16

Stored values are interpreted as UTC. On Postgres this converts the columns
to TIMESTAMP WITH TIME ZONE so the offset survives a round trip. On MySQL
DATETIME has no TZ component, so the type swap is a no-op; the convention
that callers always write UTC is enforced in application code.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_COLUMNS = (
    ("habits", "created_at", False),
    ("habit_logs", "synced_at", False),
    ("habit_logs", "deleted_at", True),
)


def upgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect != "postgresql":
        return
    for table, column, nullable in _COLUMNS:
        op.alter_column(
            table,
            column,
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=nullable,
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )


def downgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect != "postgresql":
        return
    for table, column, nullable in _COLUMNS:
        op.alter_column(
            table,
            column,
            type_=sa.DateTime(),
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=nullable,
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )
