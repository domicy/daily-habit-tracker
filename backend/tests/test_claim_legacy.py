"""The migrate-then-claim path for pre-multi-user data (issue #119).

The rest of the suite builds its schema with ``Base.metadata.create_all``, so
migration 004 is never exercised there. These tests drive Alembic for real
against a file-backed SQLite database, because the whole defect is what 004
does to rows that already exist.

Two constraints shape the harness:

* the database must be **file-backed** -- with ``sqlite+aiosqlite://`` the
  Alembic engine and the assertion engine would each get their own private
  in-memory database;
* the tests must be **sync** -- ``alembic/env.py`` calls ``asyncio.run``, which
  raises inside a running event loop, so an ``async def`` test would have to
  hop threads to drive it.
"""

import asyncio
import pathlib
import sqlite3
from datetime import datetime, timezone

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.claim_legacy import LEGACY_USER_ID, ClaimError, claim_legacy_data, format_result
from app.models import User
from app.routers.auth import _hash_password

BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent

PRE_004_HABITS = [("h1", "Read"), ("h2", "Run"), ("h3", "Stretch")]
PRE_004_LOGS = [
    ("l1", "h1", "2026-08-01"),
    ("l2", "h1", "2026-08-02"),
    ("l3", "h2", "2026-08-01"),
]


def _alembic_config(db_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch) -> Config:
    url = f"sqlite+aiosqlite:///{db_path}"
    # env.py reads DATABASE_URL from the process environment on each run.
    monkeypatch.setenv("DATABASE_URL", url)
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def _seed_pre_004(db_path: pathlib.Path) -> None:
    """Insert habits and logs in the shape they have at revision 003."""
    conn = sqlite3.connect(db_path)
    conn.executemany(
        "INSERT INTO habits (id, name, created_at, is_active) VALUES (?, ?, ?, 1)",
        [(hid, name, "2026-07-01 00:00:00") for hid, name in PRE_004_HABITS],
    )
    conn.executemany(
        "INSERT INTO habit_logs (id, habit_id, completed_date, synced_at) VALUES (?, ?, ?, ?)",
        [(lid, hid, day, "2026-07-01 00:00:00") for lid, hid, day in PRE_004_LOGS],
    )
    conn.commit()
    conn.close()


def _owners(db_path: pathlib.Path, table: str) -> dict[str, int]:
    conn = sqlite3.connect(db_path)
    rows = conn.execute(f"SELECT user_id, COUNT(*) FROM {table} GROUP BY user_id").fetchall()
    conn.close()
    return {owner: count for owner, count in rows}


@pytest.fixture
def migrated_db(tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch) -> pathlib.Path:
    """A database seeded at 003, then migrated to head -- production's exact path."""
    db_path = tmp_path / "habits.db"
    cfg = _alembic_config(db_path, monkeypatch)
    command.upgrade(cfg, "003")
    _seed_pre_004(db_path)
    command.upgrade(cfg, "head")
    return db_path


def _register(db_path: pathlib.Path, email: str) -> str:
    """Create a real account the way /auth/register would, returning its id."""

    async def _create() -> str:
        engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as session:
            user = User(
                email=email,
                username=email.split("@")[0],
                password_hash=_hash_password("correct horse"),
                created_at=datetime.now(timezone.utc),
            )
            session.add(user)
            await session.commit()
            user_id = user.id
        await engine.dispose()
        return user_id

    return asyncio.run(_create())


def _claim(db_path: pathlib.Path, email: str, *, dry_run: bool = False):
    async def _run():
        engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as session:
            result = await claim_legacy_data(session, email, dry_run=dry_run)
        await engine.dispose()
        return result

    return asyncio.run(_run())


def test_migration_004_strands_existing_rows_on_the_legacy_user(migrated_db):
    """The defect itself: after migrating, every row belongs to an unusable account."""
    assert _owners(migrated_db, "habits") == {LEGACY_USER_ID: len(PRE_004_HABITS)}
    assert _owners(migrated_db, "habit_logs") == {LEGACY_USER_ID: len(PRE_004_LOGS)}


def test_claim_moves_every_legacy_row_to_the_registered_account(migrated_db):
    user_id = _register(migrated_db, "owner@example.com")

    result = _claim(migrated_db, "owner@example.com")

    assert result.habits == len(PRE_004_HABITS)
    assert result.habit_logs == len(PRE_004_LOGS)
    # Row counts survive: the claim moves ownership, it never deletes data.
    assert _owners(migrated_db, "habits") == {user_id: len(PRE_004_HABITS)}
    assert _owners(migrated_db, "habit_logs") == {user_id: len(PRE_004_LOGS)}


def test_claim_removes_the_legacy_user_row(migrated_db):
    _register(migrated_db, "owner@example.com")

    result = _claim(migrated_db, "owner@example.com")

    assert result.legacy_user_removed is True
    conn = sqlite3.connect(migrated_db)
    remaining = conn.execute(
        "SELECT COUNT(*) FROM users WHERE id = ?", (LEGACY_USER_ID,)
    ).fetchone()[0]
    conn.close()
    assert remaining == 0


def test_claim_is_idempotent(migrated_db):
    user_id = _register(migrated_db, "owner@example.com")
    _claim(migrated_db, "owner@example.com")

    second = _claim(migrated_db, "owner@example.com")

    assert (second.habits, second.habit_logs) == (0, 0)
    assert second.legacy_user_removed is False
    assert _owners(migrated_db, "habits") == {user_id: len(PRE_004_HABITS)}


def test_dry_run_reports_counts_without_writing(migrated_db):
    _register(migrated_db, "owner@example.com")

    result = _claim(migrated_db, "owner@example.com", dry_run=True)

    assert (result.habits, result.habit_logs) == (len(PRE_004_HABITS), len(PRE_004_LOGS))
    assert result.dry_run is True
    assert "dry run" in format_result(result)
    # Nothing moved.
    assert _owners(migrated_db, "habits") == {LEGACY_USER_ID: len(PRE_004_HABITS)}


def test_claim_refuses_an_unregistered_email(migrated_db):
    with pytest.raises(ClaimError, match="No account registered"):
        _claim(migrated_db, "nobody@example.com")

    # The data is left exactly as it was, not stranded somewhere new.
    assert _owners(migrated_db, "habits") == {LEGACY_USER_ID: len(PRE_004_HABITS)}


def test_claim_refuses_the_legacy_user_itself(migrated_db):
    with pytest.raises(ClaimError, match="Refusing to claim"):
        _claim(migrated_db, "legacy@local.invalid")


def test_claim_normalises_the_email_argument(migrated_db):
    user_id = _register(migrated_db, "owner@example.com")

    result = _claim(migrated_db, "  Owner@Example.COM  ")

    assert result.target_user_id == user_id


def test_format_result_reports_what_moved(migrated_db):
    _register(migrated_db, "owner@example.com")

    rendered = format_result(_claim(migrated_db, "owner@example.com"))

    assert LEGACY_USER_ID in rendered
    assert "owner@example.com" in rendered
    assert "legacy row removed" in rendered
    assert "committed." in rendered


def test_sentinel_id_matches_the_one_migration_004_writes():
    """Guards against the constant and the migration drifting apart."""
    source = (BACKEND_DIR / "alembic" / "versions" / "004_multi_user.py").read_text()
    assert f'"{LEGACY_USER_ID}"' in source


def test_claimed_rows_are_reachable_through_the_api(migrated_db, monkeypatch):
    """The point of the whole exercise: GET /habits returns the rescued rows."""
    from datetime import timedelta

    from fastapi.testclient import TestClient
    from jose import jwt

    from app.config import settings
    from app.database import get_db
    from app.main import app

    user_id = _register(migrated_db, "owner@example.com")
    _claim(migrated_db, "owner@example.com")

    engine = create_async_engine(f"sqlite+aiosqlite:///{migrated_db}")
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    token = jwt.encode(
        {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    try:
        with TestClient(app) as client:
            resp = client.get("/habits", headers={"Authorization": f"Bearer {token}"})
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert sorted(h["name"] for h in resp.json()) == sorted(n for _, n in PRE_004_HABITS)


@pytest.fixture
def cli_db(migrated_db, monkeypatch):
    """Point the CLI's session factory at the test database.

    ``app.database`` builds its engine at import time from the settings conftest
    loads, so setting DATABASE_URL alone would not redirect it.
    """
    engine = create_async_engine(f"sqlite+aiosqlite:///{migrated_db}")
    monkeypatch.setattr(
        "app.database.async_session",
        async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False),
    )
    return migrated_db


def test_cli_main_reports_a_missing_account(cli_db, capsys):
    from app import claim_legacy

    exit_code = claim_legacy.main(["--email", "nobody@example.com"])

    assert exit_code == 1
    assert "No account registered" in capsys.readouterr().err
    # A typo must not disturb the data it failed to claim.
    assert _owners(cli_db, "habits") == {LEGACY_USER_ID: len(PRE_004_HABITS)}


def test_cli_main_claims_and_prints_a_summary(cli_db, capsys):
    from app import claim_legacy

    _register(cli_db, "owner@example.com")

    exit_code = claim_legacy.main(["--email", "owner@example.com"])

    assert exit_code == 0
    out = capsys.readouterr().out
    assert "committed." in out
    assert f"{len(PRE_004_HABITS)} rows" in out
    assert _owners(cli_db, "habits") != {LEGACY_USER_ID: len(PRE_004_HABITS)}


def test_cli_dry_run_writes_nothing(cli_db, capsys):
    from app import claim_legacy

    _register(cli_db, "owner@example.com")

    exit_code = claim_legacy.main(["--email", "owner@example.com", "--dry-run"])

    assert exit_code == 0
    assert "dry run" in capsys.readouterr().out
    assert _owners(cli_db, "habits") == {LEGACY_USER_ID: len(PRE_004_HABITS)}
