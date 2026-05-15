from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
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


@router.post("/sync", response_model=SyncResponse)
async def sync_logs(body: SyncRequest, db: AsyncSession = Depends(get_db)):
    synced = 0
    errors: list[SyncError] = []

    for entry in body.logs:
        # Check if the habit exists
        habit = await db.get(Habit, entry.habit_id)
        if not habit:
            errors.append(
                SyncError(
                    habit_id=entry.habit_id,
                    completed_date=entry.completed_date,
                    reason="Habit not found",
                )
            )
            continue

        # Upsert: check if log already exists
        stmt = select(HabitLog).where(
            HabitLog.habit_id == entry.habit_id,
            HabitLog.completed_date == entry.completed_date,
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        now = datetime.now(timezone.utc)
        if existing:
            existing.synced_at = now
            existing.deleted_at = now if entry.deleted else None
        else:
            log = HabitLog(
                habit_id=entry.habit_id,
                completed_date=entry.completed_date,
                deleted_at=now if entry.deleted else None,
            )
            db.add(log)

        synced += 1

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
