"""add usernames for leaderboard identity"""

from alembic import op
import sqlalchemy as sa

revision = "006_usernames"
down_revision = "005_habit_ratings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("username", sa.String(50), nullable=True))
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id FROM users WHERE username IS NULL")).mappings()
    for row in rows:
        bind.execute(
            sa.text("UPDATE users SET username = :username WHERE id = :id"),
            {"username": f"user_{row['id'][:8]}", "id": row["id"]},
        )
    with op.batch_alter_table("users") as batch:
        batch.alter_column("username", nullable=False, server_default=None)
        batch.create_unique_constraint("uq_users_username", ["username"])


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_username", type_="unique")
    op.drop_column("users", "username")
