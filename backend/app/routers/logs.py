import uuid
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.dialects import mysql, postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import require_token
from app.models import Habit, HabitLog
from app.schemas import HabitLogRead, SyncError, SyncRequest, SyncResponse

router = APIRouter(
    prefix="/logs",
    tags=["logs"],
    dependencies=[Depends(require_token)],
)


def _upsert_habit_log_stmt(dialect_name: str, values: list[dict[str, Any]]):
    """Build a dialect-native atomic bulk upsert for habit_logs.

    Required because two concurrent /logs/sync requests racing on the same
    (habit_id, completed_date) both pass a SELECT existence check and then
    both INSERT, violating uq_habit_date on the second commit.
    """
    if dialect_name in ("mysql", "mariadb"):
        stmt = mysql.insert(HabitLog).values(values)
        return stmt.on_duplicate_key_update(
            synced_at=stmt.inserted.synced_at,
            deleted_at=stmt.inserted.deleted_at,
        )
    if dialect_name == "postgresql":
        stmt = postgresql.insert(HabitLog).values(values)
        return stmt.on_conflict_do_update(
            constraint="uq_habit_date",
            set_={
                "synced_at": stmt.excluded.synced_at,
                "deleted_at": stmt.excluded.deleted_at,
            },
        )
    if dialect_name == "sqlite":
        stmt = sqlite.insert(HabitLog).values(values)
        return stmt.on_conflict_do_update(
            index_elements=["habit_id", "completed_date"],
            set_={
                "synced_at": stmt.excluded.synced_at,
                "deleted_at": stmt.excluded.deleted_at,
            },
        )
    raise NotImplementedError(f"Unsupported dialect for upsert: {dialect_name}")


@router.post("/sync", response_model=SyncResponse)
async def sync_logs(body: SyncRequest, db: AsyncSession = Depends(get_db)):
    errors: list[SyncError] = []

    if not body.logs:
        return SyncResponse(synced=0, errors=errors)

    habit_ids = {entry.habit_id for entry in body.logs}
    existing_habits = set(
        (
            await db.execute(select(Habit.id).where(Habit.id.in_(habit_ids)))
        ).scalars()
    )

    now = datetime.now(timezone.utc)
    # Postgres rejects multi-row ON CONFLICT DO UPDATE that targets the same
    # constraint twice in one statement, so dedupe within the batch keeping
    # the last entry per (habit_id, completed_date).
    deduped: dict[tuple[str, date], dict[str, Any]] = {}
    for entry in body.logs:
        if entry.habit_id not in existing_habits:
            errors.append(
                SyncError(
                    habit_id=entry.habit_id,
                    completed_date=entry.completed_date,
                    reason="Habit not found",
                )
            )
            continue
        deduped[(entry.habit_id, entry.completed_date)] = {
            "id": str(uuid.uuid4()),
            "habit_id": entry.habit_id,
            "completed_date": entry.completed_date,
            "synced_at": now,
            "deleted_at": now if entry.deleted else None,
        }

    synced = sum(
        1 for entry in body.logs if entry.habit_id in existing_habits
    )
    if deduped:
        await db.execute(
            _upsert_habit_log_stmt(db.bind.dialect.name, list(deduped.values()))
        )

    await db.commit()
    return SyncResponse(synced=synced, errors=errors)


@router.get("/{habit_id}", response_model=list[HabitLogRead])
async def get_logs(
    habit_id: str,
    start: date = Query(...),
    end: date = Query(...),
    db: AsyncSession = Depends(get_db),
):
    # Verify habit exists
    habit = await db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    stmt = (
        select(HabitLog)
        .where(
            HabitLog.habit_id == habit_id,
            HabitLog.completed_date >= start,
            HabitLog.completed_date <= end,
            HabitLog.deleted_at.is_(None),
        )
        .order_by(HabitLog.completed_date)
    )
    result = await db.execute(stmt)
    return result.scalars().all()
