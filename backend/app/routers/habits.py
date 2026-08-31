from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import current_user
from app.models import Habit, HabitLog, User
from app.schemas import (
    HabitCreate,
    HabitRead,
    HabitSyncRequest,
    HabitSyncResponse,
    HabitSyncPullResponse,
    HabitUpdate,
    HabitMetricsRead,
    creation_floor,
    habit_score,
    streak_days,
)

router = APIRouter(prefix="/habits", tags=["habits"])


def _read_habit(habit: Habit) -> HabitRead:
    return HabitRead(
        id=habit.id,
        name=habit.name,
        created_at=habit.created_at,
        is_active=habit.is_active,
        impact=habit.impact,
        friction=habit.friction,
        keystone=habit.keystone,
        time_cost=habit.time_cost,
        score=habit_score(
            habit.impact, habit.friction, habit.keystone, habit.time_cost,
        ),
    )


@router.get("/", response_model=list[HabitRead])
async def list_habits(
    active: bool | None = Query(None),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Habit).where(Habit.user_id == user.id).order_by(Habit.created_at)
    if active is not None:
        stmt = stmt.where(Habit.is_active == active)
    result = await db.execute(stmt)
    return [_read_habit(habit) for habit in result.scalars().all()]


@router.post("/", response_model=HabitRead, status_code=status.HTTP_201_CREATED)
async def create_habit(body: HabitCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    habit = Habit(
        name=body.name, user_id=user.id, impact=body.impact,
        friction=body.friction, keystone=body.keystone, time_cost=body.time_cost,
    )
    db.add(habit)
    await db.commit()
    await db.refresh(habit)
    return _read_habit(habit)


@router.get("/sync", response_model=HabitSyncPullResponse)
async def pull_habits(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    result = await db.scalars(select(Habit).where(Habit.user_id == user.id).order_by(Habit.created_at))
    return HabitSyncPullResponse(habits=[_read_habit(habit) for habit in result])


@router.patch("/{habit_id}", response_model=HabitRead)
async def update_habit(
    habit_id: str, body: HabitUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    habit = await db.scalar(select(Habit).where(Habit.id == habit_id, Habit.user_id == user.id))
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(habit, field, value)
    await db.commit()
    await db.refresh(habit)
    return _read_habit(habit)


@router.post("/sync", response_model=HabitSyncResponse)
async def sync_habits(body: HabitSyncRequest, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Upsert habits using client-supplied IDs. The local-first client owns IDs
    and pushes habit creates/updates here so subsequent log syncs can resolve
    their habit_id references.
    """
    user_id = user.id
    synced_ids: list[str] = []
    for entry in body.habits:
        existing = await db.scalar(select(Habit).where(Habit.id == entry.id, Habit.user_id == user_id))
        if existing is None and await db.get(Habit, entry.id):
            raise HTTPException(status_code=409, detail="Habit belongs to another user")
        created_at = datetime.fromtimestamp(entry.created_at_ms / 1000, tz=timezone.utc)
        if existing:
            existing.name = entry.name
            existing.is_active = entry.is_active
            existing.impact = entry.impact
            existing.friction = entry.friction
            existing.keystone = entry.keystone
            existing.time_cost = entry.time_cost
        else:
            db.add(
                Habit(
                    id=entry.id,
                    name=entry.name,
                    created_at=created_at,
                    is_active=entry.is_active,
                    user_id=user_id,
                    impact=entry.impact,
                    friction=entry.friction,
                    keystone=entry.keystone,
                    time_cost=entry.time_cost,
                )
            )
        synced_ids.append(entry.id)
    await db.commit()
    return HabitSyncResponse(synced_ids=synced_ids)


@router.get("/{habit_id}/metrics", response_model=HabitMetricsRead)
async def get_habit_metrics(
    habit_id: str,
    start: date = Query(...),
    end: date = Query(...),
    as_of: date = Query(...),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    if start > end:
        raise HTTPException(status_code=422, detail="start must not be after end")

    user_id = user.id
    habit = await db.scalar(select(Habit).where(Habit.id == habit_id, Habit.user_id == user_id))
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    # Universal data-validity boundary: a log dated before the habit existed
    # counts toward neither the completion rate nor the streak. See
    # creation_floor for why it carries a one-day grace.
    creation_date = creation_floor(habit.created_at)

    completed_days = await db.scalar(
        select(func.count(func.distinct(HabitLog.completed_date))).where(
            HabitLog.habit_id == habit_id,
            HabitLog.user_id == user_id,
            HabitLog.completed_date >= creation_date,
            HabitLog.completed_date >= start,
            HabitLog.completed_date <= end,
            HabitLog.deleted_at.is_(None),
        )
    )
    eligible_days = (end - start).days + 1
    completed_days = int(completed_days or 0)
    completion_rate = (200 * completed_days + eligible_days) // (2 * eligible_days)

    streak_dates = await db.scalars(select(HabitLog.completed_date).where(
        HabitLog.habit_id == habit_id,
        HabitLog.user_id == user_id,
        HabitLog.completed_date >= creation_date,
        HabitLog.completed_date <= as_of,
        HabitLog.deleted_at.is_(None),
    ))
    current_streak = streak_days(set(streak_dates), as_of)

    return HabitMetricsRead(
        habit_id=habit.id,
        score=habit_score(habit.impact, habit.friction, habit.keystone, habit.time_cost),
        completed_days=completed_days,
        eligible_days=eligible_days,
        completion_rate=completion_rate,
        current_streak=current_streak,
    )
