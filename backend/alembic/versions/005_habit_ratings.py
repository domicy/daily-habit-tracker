"""add v1 habit rating fields"""

from alembic import op
import sqlalchemy as sa


revision = "005_habit_ratings"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name in ("impact", "friction", "keystone", "time_cost"):
        op.add_column(
            "habits",
            sa.Column(name, sa.Integer(), nullable=False, server_default="3"),
        )


def downgrade() -> None:
    for name in ("time_cost", "keystone", "friction", "impact"):
        op.drop_column("habits", name)
