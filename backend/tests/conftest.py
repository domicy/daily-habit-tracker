import os
from datetime import datetime, timedelta, timezone

# Set required env vars before importing app.config (which has no defaults
# for these). Real deployments must supply them via .env or the process env.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.database import get_db
from app.main import app
from app.models import Base, User

TEST_DB_URL = "sqlite+aiosqlite://"

# The account every authenticated test acts as. It is a real row in ``users``:
# habits.user_id and habit_logs.user_id are foreign keys to it, and the API
# rejects a token whose subject names no account.
TEST_USER_ID = "user"


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    # SQLite ignores foreign keys unless asked, which would let the suite pass
    # while the constraints added in migration 007 went unexercised.
    event.listen(
        engine.sync_engine,
        "connect",
        lambda dbapi_conn, _record: dbapi_conn.execute("PRAGMA foreign_keys=ON"),
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession):
    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def auth_header(db_session: AsyncSession) -> dict[str, str]:
    """A bearer token for a real account.

    merge() rather than add() so a test that wants its own email or display
    name can merge over the same id without colliding on the primary key.
    """
    await db_session.merge(
        User(
            id=TEST_USER_ID,
            email="user@test.invalid",
            username="user",
            password_hash="x",
        )
    )
    await db_session.commit()
    payload = {
        "sub": TEST_USER_ID,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def expired_auth_header() -> dict[str, str]:
    # No users row needed: this token never gets past signature validation.
    payload = {
        "sub": TEST_USER_ID,
        "exp": datetime.now(timezone.utc) - timedelta(hours=1),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}
