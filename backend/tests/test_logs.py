import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_sync_logs(client: AsyncClient, auth_header: dict):
    # Create a habit first
    resp = await client.post(
        "/habits/", json={"name": "Sleep early"}, headers=auth_header
    )
    habit_id = resp.json()["id"]

    # Sync a log entry
    resp = await client.post(
        "/logs/sync",
        json={
            "logs": [
                {"habit_id": habit_id, "completed_date": "2026-03-07"},
            ]
        },
        headers=auth_header,
    )
    assert resp.status_code == 200
    assert resp.json()["synced"] == 1
