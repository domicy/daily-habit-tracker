from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import require_token
from app.models import Habit
from app.schemas import HabitCreate, HabitRead, HabitUpdate

router = APIRouter(
    prefix="/habits",
    tags=["habits"],
    dependencies=[Depends(require_token)],
)


@router.get("/", response_model=list[HabitRead])
async def list_habits(
    active: bool | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Habit).order_by(Habit.created_at)
    if active is not None:
        stmt = stmt.where(Habit.is_active == active)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=HabitRead, status_code=status.HTTP_201_CREATED)
async def create_habit(body: HabitCreate, db: AsyncSession = Depends(get_db)):
    habit = Habit(name=body.name)
    db.add(habit)
    await db.commit()
    await db.refresh(habit)
    return habit


@router.patch("/{habit_id}", response_model=HabitRead)
async def update_habit(
    habit_id: str, body: HabitUpdate, db: AsyncSession = Depends(get_db)
):
    habit = await db.get(Habit, habit_id)
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(habit, field, value)
    await db.commit()
    await db.refresh(habit)
    return habit
