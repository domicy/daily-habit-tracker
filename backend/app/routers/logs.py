from fastapi import APIRouter, Depends
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import require_token
from app.models import HabitLog
from app.schemas import SyncRequest, SyncResponse

router = APIRouter(
    prefix="/logs",
    tags=["logs"],
    dependencies=[Depends(require_token)],
)


@router.post("/sync", response_model=SyncResponse)
async def sync_logs(body: SyncRequest, db: AsyncSession = Depends(get_db)):
    synced = 0
    for entry in body.logs:
        log = HabitLog(
            habit_id=entry.habit_id,
            completed_date=entry.completed_date,
        )
        db.add(log)
        try:
            await db.flush()
            synced += 1
        except Exception:
            await db.rollback()
    await db.commit()
    return SyncResponse(synced=synced)
