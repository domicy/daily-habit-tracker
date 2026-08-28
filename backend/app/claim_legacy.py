"""Reassign pre-multi-user habit data from the legacy sentinel owner.

Migration 004 adds ``user_id`` to ``habits`` and ``habit_logs`` and stamps every
pre-existing row with :data:`LEGACY_USER_ID`. It also inserts a matching ``users``
row whose password is PBKDF2 of a constant with a salt the migration discards, so
nothing can ever authenticate as it. Every read is scoped by the token's ``sub``,
which means those rows are intact in the database and reachable by nobody.

This module is the claim step that makes them reachable again. Run it once, after
migrating and after registering the account that should own the data:

    python -m app.claim_legacy --email you@example.com

It is idempotent: a second run matches zero rows. Use ``--dry-run`` to see the
counts without writing anything.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Habit, HabitLog, User

# Kept in sync with alembic/versions/004_multi_user.py, which writes this id.
LEGACY_USER_ID = "00000000-0000-0000-0000-000000000000"


class ClaimError(Exception):
    """Raised when the claim cannot proceed, e.g. the target account is absent."""


@dataclass(frozen=True)
class ClaimResult:
    email: str
    target_user_id: str
    habits: int
    habit_logs: int
    legacy_user_removed: bool
    dry_run: bool


async def _count_legacy(session: AsyncSession, model: type) -> int:
    stmt = select(func.count()).select_from(model).where(model.user_id == LEGACY_USER_ID)
    return await session.scalar(stmt) or 0


async def claim_legacy_data(
    session: AsyncSession, email: str, *, dry_run: bool = False
) -> ClaimResult:
    """Move every legacy-owned habit and log to the account registered as ``email``.

    The target account must already exist -- this never creates one, so a typo
    fails loudly instead of stranding the data under a new empty user.
    """
    email = email.strip().lower()
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        raise ClaimError(
            f"No account registered as {email!r}. Register it through /auth/register "
            "first, then re-run this command."
        )
    if user.id == LEGACY_USER_ID:
        raise ClaimError(
            "Refusing to claim the legacy rows for the legacy user itself; "
            "pass the email of a real account."
        )

    habits = await _count_legacy(session, Habit)
    habit_logs = await _count_legacy(session, HabitLog)
    legacy_user = await session.scalar(select(User).where(User.id == LEGACY_USER_ID))

    if dry_run:
        return ClaimResult(
            email=email,
            target_user_id=user.id,
            habits=habits,
            habit_logs=habit_logs,
            legacy_user_removed=False,
            dry_run=True,
        )

    # One transaction: either ownership moves wholesale or nothing does.
    await session.execute(
        update(Habit).where(Habit.user_id == LEGACY_USER_ID).values(user_id=user.id)
    )
    await session.execute(
        update(HabitLog).where(HabitLog.user_id == LEGACY_USER_ID).values(user_id=user.id)
    )
    if legacy_user is not None:
        # Nothing can log in as it and it now owns no rows, so leaving it would
        # only leave a login-shaped row that no one can use.
        await session.execute(delete(User).where(User.id == LEGACY_USER_ID))
    await session.commit()

    return ClaimResult(
        email=email,
        target_user_id=user.id,
        habits=habits,
        habit_logs=habit_logs,
        legacy_user_removed=legacy_user is not None,
        dry_run=False,
    )


def format_result(result: ClaimResult) -> str:
    lines = [
        f"legacy user : {LEGACY_USER_ID}",
        f"target      : {result.email} ({result.target_user_id})",
        "",
        f"  habits     : {result.habits:>4} rows -> {result.email}",
        f"  habit_logs : {result.habit_logs:>4} rows -> {result.email}",
    ]
    if result.dry_run:
        lines += ["", "dry run: nothing was written."]
    else:
        lines += [
            "  users      : legacy row removed"
            if result.legacy_user_removed
            else "  users      : no legacy row present",
            "",
            "committed.",
        ]
    return "\n".join(lines)


async def _run(email: str, *, dry_run: bool) -> ClaimResult:
    # Imported here rather than at module scope: app.database builds an engine
    # from settings on import, which tests supply for themselves.
    from app.database import async_session

    async with async_session() as session:
        return await claim_legacy_data(session, email, dry_run=dry_run)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.claim_legacy",
        description=(
            "Reassign habits and logs owned by the legacy sentinel user "
            "(created by migration 004) to a real registered account."
        ),
    )
    parser.add_argument("--email", required=True, help="email of the account that should own the data")
    parser.add_argument(
        "--dry-run", action="store_true", help="report the counts without writing"
    )
    args = parser.parse_args(argv)

    try:
        result = asyncio.run(_run(args.email, dry_run=args.dry_run))
    except ClaimError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(format_result(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
