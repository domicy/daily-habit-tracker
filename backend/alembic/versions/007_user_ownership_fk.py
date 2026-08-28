"""enforce habit ownership with foreign keys to users

Until now nothing stopped a row in ``habits`` or ``habit_logs`` naming an owner
absent from ``users``. The retired shared-secret ``/auth/token`` path minted
tokens whose subject was the literal string "user", and every write stamped that
straight into ``user_id`` -- data owned by an account that does not exist and
therefore visible to nobody. See issue #125.
"""

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa

revision: str = "007_user_ownership_fk"
down_revision: Union[str, None] = "006_usernames"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("habits", "habit_logs")
CONSTRAINTS = {
    "habits": "fk_habits_user_id_users",
    "habit_logs": "fk_habit_logs_user_id_users",
}


def _count_orphans(bind, table: str) -> int:
    return bind.scalar(
        sa.text(
            f"SELECT COUNT(*) FROM {table} t "
            "LEFT JOIN users u ON t.user_id = u.id WHERE u.id IS NULL"
        )
    )


def _check_for_orphans() -> None:
    """Refuse rather than repair.

    Silently deleting orphans would destroy data and silently reassigning them
    would hand one account another's habits; either is worse than stopping and
    letting an operator decide. The claim tool is the supported repair, and its
    --dry-run reports before it writes.
    """
    if context.is_offline_mode():
        # `alembic upgrade --sql` has no connection to count rows over. The
        # database still enforces the constraint when the emitted DDL is
        # applied, so the check is deferred rather than skipped.
        op.execute(
            "-- 007 preflight skipped in offline mode: run "
            "`python -m app.claim_legacy --email you@example.com "
            "--include-orphans --dry-run` first if this deployment ever "
            "accepted a shared-secret sync."
        )
        return

    bind = op.get_bind()
    orphans = {table: _count_orphans(bind, table) for table in TABLES}
    if any(orphans.values()):
        summary = ", ".join(f"{table}={count}" for table, count in orphans.items())
        raise RuntimeError(
            "Cannot add the ownership foreign keys: rows exist whose user_id "
            f"names no account in users ({summary}). Reassign them first with:\n"
            "    python -m app.claim_legacy --email you@example.com "
            "--include-orphans --dry-run\n"
            "then re-run without --dry-run, and repeat this migration."
        )


def upgrade() -> None:
    _check_for_orphans()

    for table in TABLES:
        # SQLite cannot ALTER TABLE ... ADD CONSTRAINT; batch mode recreates the
        # table instead. On MySQL/MariaDB it degrades to a real ADD CONSTRAINT.
        with op.batch_alter_table(table) as batch:
            batch.create_foreign_key(
                CONSTRAINTS[table], "users", ["user_id"], ["id"]
            )


def downgrade() -> None:
    for table in TABLES:
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(CONSTRAINTS[table], type_="foreignkey")
