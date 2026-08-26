"""add users and ownership to habit data"""

from typing import Sequence, Union
import uuid
import hashlib
from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    legacy_id = "00000000-0000-0000-0000-000000000000"
    salt = uuid.uuid4().hex
    digest = hashlib.pbkdf2_hmac("sha256", b"legacy-disabled", salt.encode(), 240000).hex()
    op.bulk_insert(sa.table("users", sa.column("id", sa.String), sa.column("email", sa.String), sa.column("password_hash", sa.String), sa.column("created_at", sa.DateTime())), [{
        "id": legacy_id, "email": "legacy@local.invalid", "password_hash": f"pbkdf2_sha256$240000${salt}${digest}", "created_at": sa.func.now()
    }])
    for table in ("habits", "habit_logs"):
        op.add_column(table, sa.Column("user_id", sa.String(36), nullable=True))
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])
        op.execute(sa.text(f"UPDATE {table} SET user_id = :legacy_id"), {"legacy_id": legacy_id})
        with op.batch_alter_table(table) as batch:
            batch.alter_column("user_id", nullable=False)
    # Replace the old global uniqueness rule with ownership-aware uniqueness.
    with op.batch_alter_table("habit_logs") as batch:
        batch.drop_constraint("uq_habit_date", type_="unique")
        batch.create_unique_constraint("uq_user_habit_date", ["user_id", "habit_id", "completed_date"])


def downgrade() -> None:
    with op.batch_alter_table("habit_logs") as batch:
        batch.drop_constraint("uq_user_habit_date", type_="unique")
        batch.create_unique_constraint("uq_habit_date", ["habit_id", "completed_date"])
    for table in ("habits", "habit_logs"):
        op.drop_column(table, "user_id")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
