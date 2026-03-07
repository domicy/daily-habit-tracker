from datetime import date, datetime

from pydantic import BaseModel, Field


# ── Habits ──────────────────────────────────────────────

class HabitCreate(BaseModel):
    name: str = Field(..., max_length=50)


class HabitUpdate(BaseModel):
    name: str | None = Field(None, max_length=50)
    is_active: bool | None = None


class HabitRead(BaseModel):
    id: str
    name: str
    created_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}


# ── Habit Logs ──────────────────────────────────────────

class HabitLogCreate(BaseModel):
    habit_id: str
    completed_date: date


class HabitLogRead(BaseModel):
    id: str
    habit_id: str
    completed_date: date
    synced_at: datetime

    model_config = {"from_attributes": True}


class SyncRequest(BaseModel):
    logs: list[HabitLogCreate]


class SyncResponse(BaseModel):
    synced: int


# ── Auth ────────────────────────────────────────────────

class TokenRequest(BaseModel):
    device_id: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
