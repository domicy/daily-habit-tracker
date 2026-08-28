from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from jose import jwt
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from sqlalchemy import func, select

from app.models import Habit, User


@pytest.mark.asyncio
async def test_token_endpoint_is_retired(client: AsyncClient):
    """The shared-secret path minted sub="user" -- an owner absent from users."""
    resp = await client.post("/auth/token", json={"secret": settings.jwt_secret})
    assert resp.status_code == 410
    assert "/auth/login" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_token_endpoint_is_retired_for_every_body(client: AsyncClient):
    # No secret is privileged any more, and no body shape revives the route.
    for body in ({}, {"secret": "wrong-secret"}, {"email": "a@b.co", "password": "x" * 8}):
        resp = await client.post("/auth/token", json=body)
        assert resp.status_code == 410, body


@pytest.mark.asyncio
async def test_protected_endpoint_no_token(client: AsyncClient):
    resp = await client.get("/habits/")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_protected_endpoint_expired_token(client: AsyncClient, expired_auth_header: dict):
    resp = await client.get("/habits/", headers=expired_auth_header)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_protected_endpoint_invalid_token(client: AsyncClient):
    headers = {"Authorization": "Bearer not-a-real-jwt-token"}
    resp = await client.get("/habits/", headers=headers)
    assert resp.status_code == 401


# ── The token subject must name a real account (issue #125) ─────────────


def _token_for(subject: str) -> dict[str, str]:
    token = jwt.encode(
        {"sub": subject, "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_unknown_subject_cannot_read(client: AsyncClient):
    """A correctly signed token is not enough; the subject must exist."""
    resp = await client.get("/habits/", headers=_token_for("user"))
    assert resp.status_code == 401
    assert "not a known account" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_unknown_subject_cannot_write(client: AsyncClient, db_session: AsyncSession):
    headers = _token_for("user")

    created = await client.post("/habits/", json={"name": "Orphan"}, headers=headers)
    synced = await client.post(
        "/habits/sync",
        json={"habits": [{"id": "h-orphan", "name": "Orphan", "created_at_ms": 0}]},
        headers=headers,
    )

    assert created.status_code == 401
    assert synced.status_code == 401
    # The whole point: nothing was written under an owner that does not exist.
    assert await db_session.scalar(select(func.count()).select_from(Habit)) == 0


@pytest.mark.asyncio
async def test_database_rejects_a_habit_whose_owner_does_not_exist(
    db_session: AsyncSession,
):
    """Belt to the dependency's braces -- migration 007's foreign key."""
    db_session.add(Habit(id="h-orphan", user_id="user", name="Orphan"))
    with pytest.raises(IntegrityError):
        await db_session.commit()


# ── Every minted token names a real account ─────────────────────────────


async def _subject_of(resp) -> str:
    return jwt.decode(
        resp.json()["access_token"],
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )["sub"]


@pytest.mark.asyncio
async def test_register_mints_a_token_for_a_real_account(
    client: AsyncClient, db_session: AsyncSession
):
    resp = await client.post(
        "/auth/register", json={"email": "New@Example.com", "password": "correct horse"}
    )

    assert resp.status_code == 201
    subject = await _subject_of(resp)
    user = await db_session.scalar(select(User).where(User.id == subject))
    assert user is not None
    assert user.email == "new@example.com"
    assert user.username == "new"  # derived from the normalised email

    # And that token actually works end to end.
    created = await client.post(
        "/habits/", json={"name": "Read"}, headers={"Authorization": f"Bearer {resp.json()['access_token']}"}
    )
    assert created.status_code == 201


@pytest.mark.asyncio
async def test_login_mints_a_token_for_the_same_account(
    client: AsyncClient, db_session: AsyncSession
):
    registered = await client.post(
        "/auth/register", json={"email": "me@example.com", "password": "correct horse"}
    )

    logged_in = await client.post(
        "/auth/login", json={"email": "  Me@Example.com ", "password": "correct horse"}
    )

    assert logged_in.status_code == 200
    assert await _subject_of(logged_in) == await _subject_of(registered)


@pytest.mark.asyncio
async def test_login_rejects_a_bad_password(client: AsyncClient):
    await client.post(
        "/auth/register", json={"email": "me@example.com", "password": "correct horse"}
    )

    resp = await client.post(
        "/auth/login", json={"email": "me@example.com", "password": "wrong horse"}
    )

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_requires_both_fields(client: AsyncClient):
    resp = await client.post("/auth/login", json={"email": "me@example.com"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_rejects_a_malformed_email(client: AsyncClient):
    resp = await client.post(
        "/auth/register", json={"email": "not-an-email", "password": "correct horse"}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_rejects_a_duplicate_email_or_username(client: AsyncClient):
    await client.post(
        "/auth/register",
        json={"email": "me@example.com", "password": "correct horse", "username": "Taken"},
    )

    same_email = await client.post(
        "/auth/register", json={"email": "Me@example.com", "password": "correct horse"}
    )
    same_username = await client.post(
        "/auth/register",
        json={"email": "other@example.com", "password": "correct horse", "username": "Taken"},
    )

    assert same_email.status_code == 409
    assert same_username.status_code == 409
