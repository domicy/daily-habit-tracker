from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import require_token, user_id_from_token
from app.models import Habit, HabitLog, User
from app.schemas import (
    HeadToHeadResponse,
    LeaderboardMeta,
    LeaderboardRanking,
    LeaderboardTieBreakers,
    habit_score,
)

router = APIRouter(prefix="/v1/leaderboards", tags=["leaderboards"])


def _epoch_datetime(value: int) -> datetime:
    # JavaScript clients send epoch milliseconds; accepting seconds as well
    # keeps the endpoint friendly to non-JS clients without changing meaning.
    seconds = value / 1000 if value >= 100_000_000_000 else value
    try:
        return datetime.fromtimestamp(seconds, tz=timezone.utc)
    except (OverflowError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Invalid epoch boundary") from exc


def _streak_days(completed: set[date], as_of: date) -> int:
    current = as_of if as_of in completed else as_of - timedelta(days=1)
    streak = 0
    while current in completed:
        streak += 1
        current -= timedelta(days=1)
    return streak


@router.get("/head-to-head", response_model=HeadToHeadResponse)
async def head_to_head(
    opponent_id: str = Query(..., min_length=1),
    start: int = Query(..., description="UTC epoch boundary in milliseconds"),
    end: int = Query(..., description="UTC epoch boundary in milliseconds"),
    token: dict = Depends(require_token),
    db: AsyncSession = Depends(get_db),
) -> HeadToHeadResponse:
    current_user_id = user_id_from_token(token)
    if opponent_id == current_user_id:
        raise HTTPException(status_code=422, detail="opponent_id must identify another user")

    period_start = _epoch_datetime(start)
    period_end = _epoch_datetime(end)
    if period_start > period_end:
        raise HTTPException(status_code=422, detail="start must not be after end")

    users = list(await db.scalars(select(User).where(User.id.in_([current_user_id, opponent_id]))))
    users_by_id = {user.id: user for user in users}
    if opponent_id not in users_by_id:
        raise HTTPException(status_code=404, detail="Opponent not found")
    if current_user_id not in users_by_id:
        raise HTTPException(status_code=401, detail="Current user not found")

    start_date = period_start.date()
    end_date = period_end.date()
    day_count = (end_date - start_date).days + 1
    user_ids = [current_user_id, opponent_id]
    rows = await db.execute(
        select(HabitLog, Habit)
        .join(Habit, Habit.id == HabitLog.habit_id)
        .where(
            HabitLog.user_id.in_(user_ids),
            Habit.user_id == HabitLog.user_id,
            HabitLog.completed_date >= start_date,
            HabitLog.completed_date <= end_date,
            HabitLog.deleted_at.is_(None),
        )
    )
    habits = list(await db.scalars(select(Habit).where(Habit.user_id.in_(user_ids))))
    habit_counts = {user_id: 0 for user_id in user_ids}
    for habit in habits:
        habit_counts[habit.user_id] += 1

    points = {user_id: 0 for user_id in user_ids}
    completed_pairs: dict[str, set[tuple[str, date]]] = {user_id: set() for user_id in user_ids}
    completed_dates: dict[str, set[date]] = {user_id: set() for user_id in user_ids}
    last_sync: dict[str, datetime | None] = {user_id: None for user_id in user_ids}
    for log, habit in rows:
        points[log.user_id] += habit_score(habit.impact, habit.friction, habit.keystone, habit.time_cost)
        completed_pairs[log.user_id].add((log.habit_id, log.completed_date))
        completed_dates[log.user_id].add(log.completed_date)
        if last_sync[log.user_id] is None or log.synced_at > last_sync[log.user_id]:
            last_sync[log.user_id] = log.synced_at

    updated_at = max((sync for sync in last_sync.values() if sync is not None), default=datetime.now(timezone.utc))
    rankings_data = []
    for user_id in user_ids:
        eligible_days = habit_counts[user_id] * day_count
        completion_rate = (100 * len(completed_pairs[user_id]) / eligible_days) if eligible_days else 0.0
        rankings_data.append({
            "user_id": user_id,
            "display_name": users_by_id[user_id].username,
            "is_current_user": user_id == current_user_id,
            "score": points[user_id],
            "streak_days": _streak_days(completed_dates[user_id], end_date),
            "completion_rate_pct": round(completion_rate, 2),
            "last_authoritative_sync": last_sync[user_id],
        })

    rankings_data.sort(key=lambda item: (
        -item["score"],
        -item["streak_days"],
        -item["completion_rate_pct"],
        item["last_authoritative_sync"] or datetime.max.replace(tzinfo=timezone.utc),
        item["user_id"],
    ))
    rankings = [
        LeaderboardRanking(
            rank=index,
            user_id=item["user_id"],
            display_name=item["display_name"],
            is_current_user=item["is_current_user"],
            score=item["score"],
            tie_breakers=LeaderboardTieBreakers(
                streak_days=item["streak_days"],
                completion_rate_pct=item["completion_rate_pct"],
                last_authoritative_sync=item["last_authoritative_sync"],
            ),
        )
        for index, item in enumerate(rankings_data, start=1)
    ]
    status = "active" if period_start <= datetime.now(timezone.utc) <= period_end else (
        "upcoming" if datetime.now(timezone.utc) < period_start else "completed"
    )
    return HeadToHeadResponse(
        competition_id=f"head-to-head_{start}_{end}",
        meta=LeaderboardMeta(
            status=status,
            timezone="UTC",
            period_start=period_start,
            period_end=period_end,
            updated_at=updated_at,
        ),
        rankings=rankings,
    )
