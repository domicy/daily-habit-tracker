"""add usernames for leaderboard identity"""

from alembic import op
import sqlalchemy as sa

revision = "006_usernames"
down_revision = "005_habit_ratings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("username", sa.String(50), nullable=True))
    # One set-based UPDATE rather than a row-at-a-time loop over a live cursor:
    # the loop issued writes on the connection it was still reading from, which
    # raises "Commands out of sync" on an unbuffered MySQL cursor, and it broke
    # outright under `alembic upgrade --sql`, where get_bind().execute()
    # returns None. .concat() compiles to concat() on MySQL and || elsewhere.
    users = sa.table("users", sa.column("id", sa.String), sa.column("username", sa.String))
    op.execute(
        users.update()
        .where(users.c.username.is_(None))
        .values(username=sa.literal("user_").concat(sa.func.substr(users.c.id, 1, 8)))
    )
    # existing_type is required for the MySQL/MariaDB MODIFY COLUMN this
    # becomes outside SQLite. The column is added above without a server
    # default, so there is none to strip here.
    with op.batch_alter_table("users") as batch:
        batch.alter_column("username", existing_type=sa.String(50), nullable=False)
        batch.create_unique_constraint("uq_users_username", ["username"])


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("uq_users_username", type_="unique")
    op.drop_column("users", "username")
