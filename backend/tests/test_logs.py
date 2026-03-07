import uuid

import pytest
from httpx import AsyncClient


# ── Helper ──────────────────────────────────────────────


async def _create_habit(client: AsyncClient, auth_header: dict, name: str = "Test") -> str:
    resp = await client.post("/habits/", json={"name": name}, headers=auth_header)
    return resp.json()["id"]


# ── POST /logs/sync happy path ──────────────────────────


@pytest.mark.asyncio
async def test_sync_logs(client: AsyncClient, auth_header: dict):
    habit_id = await _create_habit(client, auth_header, "Sleep early")

    resp = await client.post(
        "/logs/sync",
        json={
            "logs": [
                {"habit_id": habit_id, "completed_date": "2026-03-07"},
                {"habit_id": habit_id, "completed_date": "2026-03-08"},
            ]
        },
        headers=auth_header,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["synced"] == 2
    assert data["errors"] == []


# ── POST /logs/sync idempotency ─────────────────────────


@pytest.mark.asyncio
async def test_sync_logs_idempotent(client: AsyncClient, auth_header: dict):
    habit_id = await _create_habit(client, auth_header)

    payload = {
        "logs": [{"habit_id": habit_id, "completed_date": "2026-03-01"}]
    }

    # First sync
    resp1 = await client.post("/logs/sync", json=payload, headers=auth_header)
    assert resp1.status_code == 200
    assert resp1.json()["synced"] == 1

    # Second sync — same log, should succeed without duplicates
    resp2 = await client.post("/logs/sync", json=payload, headers=auth_header)
    assert resp2.status_code == 200
    assert resp2.json()["synced"] == 1

    # Verify only one log exists
    resp = await client.get(
        f"/logs/{habit_id}?start=2026-03-01&end=2026-03-01", headers=auth_header
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1


# ── POST /logs/sync partial success ─────────────────────


@pytest.mark.asyncio
async def test_sync_logs_partial_success(client: AsyncClient, auth_header: dict):
    habit_id = await _create_habit(client, auth_header)
    fake_id = str(uuid.uuid4())

    resp = await client.post(
        "/logs/sync",
        json={
            "logs": [
                {"habit_id": habit_id, "completed_date": "2026-03-01"},
                {"habit_id": fake_id, "completed_date": "2026-03-01"},
                {"habit_id": habit_id, "completed_date": "2026-03-02"},
            ]
        },
        headers=auth_header,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["synced"] == 2
    assert len(data["errors"]) == 1
    assert data["errors"][0]["habit_id"] == fake_id
    assert data["errors"][0]["reason"] == "Habit not found"


# ── POST /logs/sync all invalid ─────────────────────────


@pytest.mark.asyncio
async def test_sync_logs_all_invalid(client: AsyncClient, auth_header: dict):
    fake_id = str(uuid.uuid4())

    resp = await client.post(
        "/logs/sync",
        json={
            "logs": [
                {"habit_id": fake_id, "completed_date": "2026-03-01"},
            ]
        },
        headers=auth_header,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["synced"] == 0
    assert len(data["errors"]) == 1


# ── POST /logs/sync concurrent ──────────────────────────


@pytest.mark.asyncio
async def test_sync_logs_concurrent_overlapping(client: AsyncClient, auth_header: dict):
    """Simulate two sync requests with overlapping logs — verify no integrity errors."""
    habit_id = await _create_habit(client, auth_header)

    payload1 = {
        "logs": [
            {"habit_id": habit_id, "completed_date": "2026-04-01"},
            {"habit_id": habit_id, "completed_date": "2026-04-02"},
        ]
    }
    payload2 = {
        "logs": [
            {"habit_id": habit_id, "completed_date": "2026-04-02"},
            {"habit_id": habit_id, "completed_date": "2026-04-03"},
        ]
    }

    # Send overlapping sync requests sequentially (shared test session
    # prevents true concurrency, but the upsert logic is what matters)
    resp1 = await client.post("/logs/sync", json=payload1, headers=auth_header)
    resp2 = await client.post("/logs/sync", json=payload2, headers=auth_header)

    # Both should succeed without integrity errors
    assert resp1.status_code == 200
    assert resp1.json()["synced"] == 2

    assert resp2.status_code == 200
    assert resp2.json()["synced"] == 2  # overlapping log is an upsert, still counted

    # Verify no duplicates — should have exactly 3 unique logs
    resp = await client.get(
        f"/logs/{habit_id}?start=2026-04-01&end=2026-04-03", headers=auth_header
    )
    assert resp.status_code == 200
    logs = resp.json()
    dates = [log["completed_date"] for log in logs]
    assert len(dates) == 3
    assert sorted(dates) == ["2026-04-01", "2026-04-02", "2026-04-03"]


# ── GET /logs/{habit_id} ────────────────────────────────


@pytest.mark.asyncio
async def test_get_logs(client: AsyncClient, auth_header: dict):
    habit_id = await _create_habit(client, auth_header)

    # Sync some logs
    await client.post(
        "/logs/sync",
        json={
            "logs": [
                {"habit_id": habit_id, "completed_date": "2026-03-01"},
                {"habit_id": habit_id, "completed_date": "2026-03-05"},
                {"habit_id": habit_id, "completed_date": "2026-03-10"},
            ]
        },
        headers=auth_header,
    )

    # Get logs in a date range
    resp = await client.get(
        f"/logs/{habit_id}?start=2026-03-01&end=2026-03-05", headers=auth_header
    )
    assert resp.status_code == 200
    logs = resp.json()
    assert len(logs) == 2
    dates = [l["completed_date"] for l in logs]
    assert "2026-03-01" in dates
    assert "2026-03-05" in dates


@pytest.mark.asyncio
async def test_get_logs_empty_range(client: AsyncClient, auth_header: dict):
    habit_id = await _create_habit(client, auth_header)

    resp = await client.get(
        f"/logs/{habit_id}?start=2026-01-01&end=2026-01-31", headers=auth_header
    )
    assert resp.status_code == 200
    assert resp.json() == []


# ── Auth errors ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_sync_logs_no_token(client: AsyncClient):
    resp = await client.post("/logs/sync", json={"logs": []})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_get_logs_no_token(client: AsyncClient):
    resp = await client.get(f"/logs/{uuid.uuid4()}?start=2026-01-01&end=2026-01-31")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_sync_logs_expired_token(client: AsyncClient, expired_auth_header: dict):
    resp = await client.post(
        "/logs/sync", json={"logs": []}, headers=expired_auth_header
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_logs_expired_token(client: AsyncClient, expired_auth_header: dict):
    resp = await client.get(
        f"/logs/{uuid.uuid4()}?start=2026-01-01&end=2026-01-31",
        headers=expired_auth_header,
    )
    assert resp.status_code == 401


# ── 404 errors ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_logs_nonexistent_habit(client: AsyncClient, auth_header: dict):
    fake_id = str(uuid.uuid4())
    resp = await client.get(
        f"/logs/{fake_id}?start=2026-01-01&end=2026-01-31", headers=auth_header
    )
    assert resp.status_code == 404


# ── 422 validation errors ──────────────────────────────


@pytest.mark.asyncio
async def test_get_logs_missing_dates(client: AsyncClient, auth_header: dict):
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"/logs/{fake_id}", headers=auth_header)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_logs_bad_date_format(client: AsyncClient, auth_header: dict):
    fake_id = str(uuid.uuid4())
    resp = await client.get(
        f"/logs/{fake_id}?start=not-a-date&end=2026-01-31", headers=auth_header
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_sync_logs_bad_date_format(client: AsyncClient, auth_header: dict):
    resp = await client.post(
        "/logs/sync",
        json={
            "logs": [
                {"habit_id": str(uuid.uuid4()), "completed_date": "not-a-date"},
            ]
        },
        headers=auth_header,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_sync_logs_missing_habit_id(client: AsyncClient, auth_header: dict):
    resp = await client.post(
        "/logs/sync",
        json={
            "logs": [
                {"completed_date": "2026-03-01"},
            ]
        },
        headers=auth_header,
    )
    assert resp.status_code == 422
