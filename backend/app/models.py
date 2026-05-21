import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


# All datetime columns store UTC. timezone=True makes intent explicit and
# preserves the TZ offset on Postgres (TIMESTAMP WITH TIME ZONE). MySQL's
# DATETIME is naive at the storage layer, so values written there are
# implicitly UTC by convention — never use DB-local time (e.g. func.now()).
def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Habit(Base):
    __tablename__ = "habits"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    logs: Mapped[list["HabitLog"]] = relationship(back_populates="habit")


class HabitLog(Base):
    __tablename__ = "habit_logs"
    __table_args__ = (
        UniqueConstraint("habit_id", "completed_date", name="uq_habit_date"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    habit_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("habits.id"), index=True, nullable=False
    )
    completed_date: Mapped[date] = mapped_column(Date, nullable=False)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    # Tombstone timestamp. Null = active log; non-null = deleted by the
    # client. Deletions are pushed via /logs/sync so the server can stay
    # in sync after an offline un-toggle of a previously-synced day.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    habit: Mapped["Habit"] = relationship(back_populates="logs")
