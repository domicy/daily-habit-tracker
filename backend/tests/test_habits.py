import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_and_list_habits(client: AsyncClient, auth_header: dict):
    # Create a habit
    resp = await client.post(
        "/habits/", json={"name": "Drink water"}, headers=auth_header
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Drink water"
    assert data["is_active"] is True
    habit_id = data["id"]

    # List habits and verify it appears
    resp = await client.get("/habits/", headers=auth_header)
    assert resp.status_code == 200
    habits = resp.json()
    assert any(h["id"] == habit_id for h in habits)


@pytest.mark.asyncio
async def test_get_habit(client: AsyncClient, auth_header: dict):
    resp = await client.post(
        "/habits/", json={"name": "Read"}, headers=auth_header
    )
    habit_id = resp.json()["id"]

    resp = await client.get(f"/habits/{habit_id}", headers=auth_header)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Read"


@pytest.mark.asyncio
async def test_update_habit(client: AsyncClient, auth_header: dict):
    resp = await client.post(
        "/habits/", json={"name": "Exercise"}, headers=auth_header
    )
    habit_id = resp.json()["id"]

    resp = await client.patch(
        f"/habits/{habit_id}",
        json={"is_active": False},
        headers=auth_header,
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_delete_habit(client: AsyncClient, auth_header: dict):
    resp = await client.post(
        "/habits/", json={"name": "Meditate"}, headers=auth_header
    )
    habit_id = resp.json()["id"]

    resp = await client.delete(f"/habits/{habit_id}", headers=auth_header)
    assert resp.status_code == 204

    resp = await client.get(f"/habits/{habit_id}", headers=auth_header)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_unauthenticated_request(client: AsyncClient):
    resp = await client.get("/habits/")
    assert resp.status_code in (401, 403)
