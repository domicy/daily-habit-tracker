from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


# ── Habits ──────────────────────────────────────────────

class HabitCreate(BaseModel):
    name: str = Field(..., max_length=50)

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

    model_config = {"from_attributes": True}


class HabitSyncEntry(BaseModel):
    id: str = Field(..., max_length=36)
    name: str = Field(..., max_length=50)
    # Client-supplied creation time as a unix epoch in milliseconds. The
    # server preserves the client value rather than overwriting with the
    # request time so creation order is consistent across devices.
    created_at_ms: int
    is_active: bool = True

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
    secret: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
