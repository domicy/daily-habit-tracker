from datetime import date, datetime, timedelta, timezone
from typing import Annotated

from pydantic import BaseModel, Field, StrictInt, field_validator


# ── Habits ──────────────────────────────────────────────

Rating = Annotated[StrictInt, Field(ge=1, le=5)]


def habit_score(impact: int, friction: int, keystone: int, time_cost: int) -> int:
    """Return the contract score using exact integer half-up rounding."""
    raw_minus_minimum = impact + (6 - friction) + keystone + (6 - time_cost) - 4
    return (100 * raw_minus_minimum * 2 + 16) // (16 * 2)


def creation_floor(created_at: datetime) -> date:
    """Earliest calendar date a log may count toward any metric for this habit.

    The contract treats the habit's creation as a universal data-validity
    boundary: a log dated before the habit existed counts toward nothing.

    The one-day grace is not slack, it is the closest the stored data allows.
    ``created_at`` is an absolute UTC instant while ``completed_date`` is a
    device-local calendar date, so the two are not directly comparable. A user
    west of UTC creating a habit in their evening lands a UTC creation date one
    day *ahead* of their own, and a strict comparison would discard the first
    log they ever record. One day covers the whole UTC-12..+14 range. Carrying
    the local creation date properly is #149.

    SQLite returns a naive value for a timezone-aware column. Stored timestamps
    are UTC by contract, so a naive value is read as UTC rather than letting the
    server's local zone shift the date.
    """
    if created_at.tzinfo is None:
        creation_date = created_at.date()
    else:
        creation_date = created_at.astimezone(timezone.utc).date()
    return creation_date - timedelta(days=1)


def streak_days(completed: set[date], as_of: date) -> int:
    """Consecutive completed days ending at or immediately before ``as_of``.

    Implements section 5 of the scoring contract: start at ``as_of``, or at the
    previous day when ``as_of`` is not completed, so a user who has completed
    yesterday but not yet today still sees the active streak.

    The candidate set is the caller's decision, but both call sites now apply
    the same rule: dates are floored at ``creation_floor`` of the habit they
    belong to, so a log predating its habit extends no streak.
    """
    current = as_of if as_of in completed else as_of - timedelta(days=1)
    streak = 0
    while current in completed:
        streak += 1
        current -= timedelta(days=1)
    return streak


class HabitCreate(BaseModel):
    name: str = Field(..., max_length=50)
    impact: Rating = 3
    friction: Rating = 3
    keystone: Rating = 3
    time_cost: Rating = 3

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be blank")
        return v


class HabitUpdate(BaseModel):
    name: str | None = Field(None, max_length=50)
    is_active: bool | None = None
    impact: Rating | None = None
    friction: Rating | None = None
    keystone: Rating | None = None
    time_cost: Rating | None = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("name must not be blank")
        return v


class HabitRead(BaseModel):
    id: str
    name: str
    created_at: datetime
    is_active: bool
    impact: int
    friction: int
    keystone: int
    time_cost: int
    score: int

    model_config = {"from_attributes": True}


class HabitSyncEntry(BaseModel):
    id: str = Field(..., max_length=36)
    name: str = Field(..., max_length=50)
    # Client-supplied creation time as a unix epoch in milliseconds. The
    # server preserves the client value rather than overwriting with the
    # request time so creation order is consistent across devices.
    created_at_ms: int
    is_active: bool = True
    impact: Rating = 3
    friction: Rating = 3
    keystone: Rating = 3
    time_cost: Rating = 3

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be blank")
        return v


class HabitSyncRequest(BaseModel):
    habits: list[HabitSyncEntry]


class HabitSyncResponse(BaseModel):
    # IDs of habits successfully upserted. The client uses this set to mark
    # the corresponding local rows as synced.
    synced_ids: list[str]


class HabitSyncPullResponse(BaseModel):
    habits: list[HabitRead]


class HabitMetricsRead(BaseModel):
    habit_id: str
    score: int
    completed_days: int
    eligible_days: int
    completion_rate: int
    current_streak: int


# ── Habit Logs ──────────────────────────────────────────

class HabitLogCreate(BaseModel):
    habit_id: str
    completed_date: date
    deleted: bool = False


class HabitLogRead(BaseModel):
    id: str
    habit_id: str
    completed_date: date
    synced_at: datetime

    model_config = {"from_attributes": True}


class SyncRequest(BaseModel):
    # Caps the request to prevent memory exhaustion from oversized batches.
    # The client batches at 100 — 1000 is a generous safety ceiling.
    logs: list[HabitLogCreate] = Field(..., max_length=1000)


class SyncError(BaseModel):
    habit_id: str
    completed_date: date
    reason: str


class SyncResponse(BaseModel):
    synced: int
    errors: list[SyncError] = []


# ── Auth ────────────────────────────────────────────────

class TokenRequest(BaseModel):
    email: str | None = None
    password: str | None = None


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=8)
    username: str | None = Field(None, min_length=1, max_length=50)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LeaderboardTieBreakers(BaseModel):
    streak_days: int
    completion_rate_pct: float
    last_authoritative_sync: datetime | None


class LeaderboardRanking(BaseModel):
    rank: int
    user_id: str
    display_name: str
    is_current_user: bool
    score: int
    tie_breakers: LeaderboardTieBreakers


class LeaderboardMeta(BaseModel):
    status: str
    timezone: str
    period_start: datetime
    period_end: datetime
    updated_at: datetime


class HeadToHeadResponse(BaseModel):
    competition_id: str
    meta: LeaderboardMeta
    rankings: list[LeaderboardRanking]
