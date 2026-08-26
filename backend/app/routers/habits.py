from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import require_token, user_id_from_token
from app.models import Habit
from app.schemas import (
    HabitCreate,
    HabitRead,
    HabitSyncRequest,
    HabitSyncResponse,
    HabitSyncPullResponse,
    HabitUpdate,
)

router = APIRouter(prefix="/habits", tags=["habits"])


@router.get("/", response_model=list[HabitRead])
async def list_habits(
    active: bool | None = Query(None),
    token: dict = Depends(require_token),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Habit).where(Habit.user_id == user_id_from_token(token)).order_by(Habit.created_at)
    if active is not None:
        stmt = stmt.where(Habit.is_active == active)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=HabitRead, status_code=status.HTTP_201_CREATED)
async def create_habit(body: HabitCreate, token: dict = Depends(require_token), db: AsyncSession = Depends(get_db)):
    habit = Habit(name=body.name, user_id=user_id_from_token(token))
    db.add(habit)
    await db.commit()
    await db.refresh(habit)
    return habit


@router.get("/sync", response_model=HabitSyncPullResponse)
async def pull_habits(token: dict = Depends(require_token), db: AsyncSession = Depends(get_db)):
    result = await db.scalars(select(Habit).where(Habit.user_id == user_id_from_token(token)).order_by(Habit.created_at))
    return HabitSyncPullResponse(habits=list(result))


@router.patch("/{habit_id}", response_model=HabitRead)
async def update_habit(
    habit_id: str, body: HabitUpdate, token: dict = Depends(require_token), db: AsyncSession = Depends(get_db)
):
    habit = await db.scalar(select(Habit).where(Habit.id == habit_id, Habit.user_id == user_id_from_token(token)))
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(habit, field, value)
    await db.commit()
    await db.refresh(habit)
    return habit


@router.post("/sync", response_model=HabitSyncResponse)
async def sync_habits(body: HabitSyncRequest, token: dict = Depends(require_token), db: AsyncSession = Depends(get_db)):
    """
    Upsert habits using client-supplied IDs. The local-first client owns IDs
    and pushes habit creates/updates here so subsequent log syncs can resolve
    their habit_id references.
    """
    user_id = user_id_from_token(token)
    synced_ids: list[str] = []
    for entry in body.habits:
        existing = await db.scalar(select(Habit).where(Habit.id == entry.id, Habit.user_id == user_id))
        if existing is None and await db.get(Habit, entry.id):
            raise HTTPException(status_code=409, detail="Habit belongs to another user")
        created_at = datetime.fromtimestamp(entry.created_at_ms / 1000, tz=timezone.utc)
        if existing:
            existing.name = entry.name
            existing.is_active = entry.is_active
        else:
            db.add(
                Habit(
                    id=entry.id,
                    name=entry.name,
                    created_at=created_at,
                    is_active=entry.is_active,
                    user_id=user_id,
                )
            )
        synced_ids.append(entry.id)
    await db.commit()
    return HabitSyncResponse(synced_ids=synced_ids)
