import uuid

import pytest
from httpx import AsyncClient


# ── Happy paths ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_habit(client: AsyncClient, auth_header: dict):
    resp = await client.post(
        "/habits/", json={"name": "Drink water"}, headers=auth_header
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Drink water"
    assert data["is_active"] is True
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_list_habits(client: AsyncClient, auth_header: dict):
    await client.post("/habits/", json={"name": "Habit A"}, headers=auth_header)
    await client.post("/habits/", json={"name": "Habit B"}, headers=auth_header)

    resp = await client.get("/habits/", headers=auth_header)
    assert resp.status_code == 200
    habits = resp.json()
    assert len(habits) >= 2


@pytest.mark.asyncio
async def test_list_habits_filter_active(client: AsyncClient, auth_header: dict):
    # Create two habits, deactivate one
    r1 = await client.post("/habits/", json={"name": "Active"}, headers=auth_header)
    r2 = await client.post("/habits/", json={"name": "Inactive"}, headers=auth_header)
    inactive_id = r2.json()["id"]
    await client.patch(
        f"/habits/{inactive_id}", json={"is_active": False}, headers=auth_header
    )

    # Filter active only
    resp = await client.get("/habits/?active=true", headers=auth_header)
    assert resp.status_code == 200
    habits = resp.json()
    assert all(h["is_active"] for h in habits)
    assert any(h["name"] == "Active" for h in habits)

    # Filter inactive only
    resp = await client.get("/habits/?active=false", headers=auth_header)
    assert resp.status_code == 200
    habits = resp.json()
    assert all(not h["is_active"] for h in habits)
    assert any(h["name"] == "Inactive" for h in habits)


@pytest.mark.asyncio
async def test_update_habit_name(client: AsyncClient, auth_header: dict):
    resp = await client.post("/habits/", json={"name": "Old name"}, headers=auth_header)
    habit_id = resp.json()["id"]

    resp = await client.patch(
        f"/habits/{habit_id}", json={"name": "New name"}, headers=auth_header
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New name"


@pytest.mark.asyncio
async def test_update_habit_is_active(client: AsyncClient, auth_header: dict):
    resp = await client.post("/habits/", json={"name": "Exercise"}, headers=auth_header)
    habit_id = resp.json()["id"]

    resp = await client.patch(
        f"/habits/{habit_id}", json={"is_active": False}, headers=auth_header
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_create_habit_strips_whitespace(client: AsyncClient, auth_header: dict):
    resp = await client.post(
        "/habits/", json={"name": "  Read books  "}, headers=auth_header
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "Read books"


# ── Auth errors ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_habit_no_token(client: AsyncClient):
    resp = await client.post("/habits/", json={"name": "Test"})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_habits_no_token(client: AsyncClient):
    resp = await client.get("/habits/")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_update_habit_no_token(client: AsyncClient):
    resp = await client.patch(f"/habits/{uuid.uuid4()}", json={"name": "X"})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_create_habit_expired_token(client: AsyncClient, expired_auth_header: dict):
    resp = await client.post(
        "/habits/", json={"name": "Test"}, headers=expired_auth_header
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_habits_expired_token(client: AsyncClient, expired_auth_header: dict):
    resp = await client.get("/habits/", headers=expired_auth_header)
    assert resp.status_code == 401


# ── 404 errors ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_nonexistent_habit(client: AsyncClient, auth_header: dict):
    fake_id = str(uuid.uuid4())
    resp = await client.patch(
        f"/habits/{fake_id}", json={"name": "X"}, headers=auth_header
    )
    assert resp.status_code == 404


# ── 422 validation errors ──────────────────────────────


@pytest.mark.asyncio
async def test_create_habit_empty_name(client: AsyncClient, auth_header: dict):
    resp = await client.post("/habits/", json={"name": ""}, headers=auth_header)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_habit_whitespace_only_name(client: AsyncClient, auth_header: dict):
    resp = await client.post("/habits/", json={"name": "   "}, headers=auth_header)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_habit_name_too_long(client: AsyncClient, auth_header: dict):
    resp = await client.post(
        "/habits/", json={"name": "x" * 51}, headers=auth_header
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_habit_missing_name(client: AsyncClient, auth_header: dict):
    resp = await client.post("/habits/", json={}, headers=auth_header)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_update_habit_empty_name(client: AsyncClient, auth_header: dict):
    resp = await client.post("/habits/", json={"name": "Valid"}, headers=auth_header)
    habit_id = resp.json()["id"]

    resp = await client.patch(
        f"/habits/{habit_id}", json={"name": ""}, headers=auth_header
    )
    assert resp.status_code == 422


# ── POST /habits/sync ───────────────────────────────────


@pytest.mark.asyncio
async def test_sync_habits_creates_new(client: AsyncClient, auth_header: dict):
    habit_id = str(uuid.uuid4())
    resp = await client.post(
        "/habits/sync",
        json={
            "habits": [
                {
                    "id": habit_id,
                    "name": "Drink water",
                    "created_at_ms": 1_700_000_000_000,
                    "is_active": True,
                }
            ]
        },
        headers=auth_header,
    )
    assert resp.status_code == 200
    assert resp.json() == {"synced_ids": [habit_id]}

    # Subsequent log sync for this habit succeeds
    resp = await client.post(
        "/logs/sync",
        json={"logs": [{"habit_id": habit_id, "completed_date": "2026-03-07"}]},
        headers=auth_header,
    )
    assert resp.status_code == 200
    assert resp.json()["synced"] == 1
    assert resp.json()["errors"] == []


@pytest.mark.asyncio
async def test_sync_habits_is_idempotent(client: AsyncClient, auth_header: dict):
    habit_id = str(uuid.uuid4())
    payload = {
        "habits": [
            {
                "id": habit_id,
                "name": "Meditate",
                "created_at_ms": 1_700_000_000_000,
                "is_active": True,
            }
        ]
    }
    resp1 = await client.post("/habits/sync", json=payload, headers=auth_header)
    resp2 = await client.post("/habits/sync", json=payload, headers=auth_header)
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    # Exactly one row exists
    resp = await client.get("/habits/", headers=auth_header)
    assert sum(1 for h in resp.json() if h["id"] == habit_id) == 1


@pytest.mark.asyncio
async def test_sync_habits_updates_existing(client: AsyncClient, auth_header: dict):
    habit_id = str(uuid.uuid4())
    await client.post(
        "/habits/sync",
        json={
            "habits": [
                {
                    "id": habit_id,
                    "name": "Old name",
                    "created_at_ms": 1_700_000_000_000,
                    "is_active": True,
                }
            ]
        },
        headers=auth_header,
    )
    resp = await client.post(
        "/habits/sync",
        json={
            "habits": [
                {
                    "id": habit_id,
                    "name": "New name",
                    "created_at_ms": 1_700_000_000_000,
                    "is_active": False,
                }
            ]
        },
        headers=auth_header,
    )
    assert resp.status_code == 200

    resp = await client.get("/habits/", headers=auth_header)
    matching = [h for h in resp.json() if h["id"] == habit_id]
    assert len(matching) == 1
    assert matching[0]["name"] == "New name"
    assert matching[0]["is_active"] is False


@pytest.mark.asyncio
async def test_sync_habits_no_token(client: AsyncClient):
    resp = await client.post("/habits/sync", json={"habits": []})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_sync_habits_blank_name(client: AsyncClient, auth_header: dict):
    resp = await client.post(
        "/habits/sync",
        json={
            "habits": [
                {
                    "id": str(uuid.uuid4()),
                    "name": "   ",
                    "created_at_ms": 1_700_000_000_000,
                    "is_active": True,
                }
            ]
        },
        headers=auth_header,
    )
    assert resp.status_code == 422
