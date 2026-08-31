from datetime import datetime, timezone

import pytest
from httpx import AsyncClient


async def create_habit(client: AsyncClient, headers: dict) -> str:
    response = await client.post(
        "/habits/",
        json={"name": "Metrics", "impact": 4, "friction": 2, "keystone": 3, "time_cost": 4},
        headers=headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["score"] == 56
    return data["id"]


@pytest.mark.asyncio
async def test_metrics_counts_inclusive_days_and_yesterday_streak(
    client: AsyncClient, auth_header: dict
):
    habit_id = await create_habit(client, auth_header)
    response = await client.post(
        "/logs/sync",
        json={"logs": [
            {"habit_id": habit_id, "completed_date": "2099-08-25"},
            {"habit_id": habit_id, "completed_date": "2099-08-26"},
        ]},
        headers=auth_header,
    )
    assert response.status_code == 200

    response = await client.get(
        f"/habits/{habit_id}/metrics?start=2099-08-25&end=2099-08-27&as_of=2099-08-27",
        headers=auth_header,
    )
    assert response.status_code == 200
    assert response.json() == {
        "habit_id": habit_id,
        "score": 56,
        "completed_days": 2,
        "eligible_days": 3,
        "completion_rate": 67,
        "current_streak": 2,
    }


@pytest.mark.asyncio
async def test_metrics_rejects_reversed_range_and_invalid_rating_types(
    client: AsyncClient, auth_header: dict
):
    response = await client.post(
        "/habits/",
        json={"name": "Bad", "impact": "3"},
        headers=auth_header,
    )
    assert response.status_code == 422

    habit_id = await create_habit(client, auth_header)
    response = await client.get(
        f"/habits/{habit_id}/metrics?start=2099-08-28&end=2099-08-27&as_of=2099-08-27",
        headers=auth_header,
    )
    assert response.status_code == 422


async def sync_habit_created_at(
    client: AsyncClient, headers: dict, habit_id: str, created_at_ms: int
) -> None:
    """Create a habit with an explicit creation instant.

    POST /habits/ stamps created_at server-side, so the sync path is the only
    way to control it — the same technique test_habits.py already uses.
    """
    response = await client.post(
        "/habits/sync",
        json={"habits": [{
            "id": habit_id,
            "name": "Backdated",
            "created_at_ms": created_at_ms,
            "is_active": True,
            "impact": 3, "friction": 3, "keystone": 3, "time_cost": 3,
        }]},
        headers=headers,
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_metrics_ignore_logs_predating_the_habit(
    client: AsyncClient, auth_header: dict
):
    """A log dated before the habit existed counts toward nothing (contract §4)."""
    # Created 2099-08-20T12:00Z, so the floor is 2099-08-19.
    created_ms = int(
        datetime(2099, 8, 20, 12, 0, tzinfo=timezone.utc).timestamp() * 1000
    )
    await sync_habit_created_at(client, auth_header, "backdated", created_ms)

    response = await client.post(
        "/logs/sync",
        json={"logs": [
            # Well before creation: must not count, and must not bridge the gap
            # into a longer streak.
            {"habit_id": "backdated", "completed_date": "2099-08-16"},
            {"habit_id": "backdated", "completed_date": "2099-08-17"},
            # From the floor onward: these count.
            {"habit_id": "backdated", "completed_date": "2099-08-20"},
            {"habit_id": "backdated", "completed_date": "2099-08-21"},
        ]},
        headers=auth_header,
    )
    assert response.status_code == 200

    response = await client.get(
        "/habits/backdated/metrics?start=2099-08-16&end=2099-08-21&as_of=2099-08-21",
        headers=auth_header,
    )
    assert response.status_code == 200
    body = response.json()
    # The streak walks 21st, 20th, then stops: the 19th is empty and the 17th is
    # below the floor regardless.
    assert body["current_streak"] == 2
    # Completion rate sees the same two days over the six-day window.
    assert body["completed_days"] == 2
    assert body["eligible_days"] == 6


@pytest.mark.asyncio
async def test_metrics_keep_the_day_before_creation_for_western_timezones(
    client: AsyncClient, auth_header: dict
):
    """The floor carries a one-day grace, and it is load-bearing.

    created_at is an absolute UTC instant; completed_date is a device-local
    calendar date. A user west of UTC creating a habit in their evening records
    a first log dated the day *before* the UTC creation date. Without the grace
    that first log — and the streak it starts — would be discarded.
    """
    # 2099-08-20T01:00Z is 2099-08-19 20:00 in UTC-5.
    created_ms = int(
        datetime(2099, 8, 20, 1, 0, tzinfo=timezone.utc).timestamp() * 1000
    )
    await sync_habit_created_at(client, auth_header, "westerly", created_ms)

    response = await client.post(
        "/logs/sync",
        json={"logs": [
            {"habit_id": "westerly", "completed_date": "2099-08-19"},
            {"habit_id": "westerly", "completed_date": "2099-08-20"},
        ]},
        headers=auth_header,
    )
    assert response.status_code == 200

    response = await client.get(
        "/habits/westerly/metrics?start=2099-08-19&end=2099-08-20&as_of=2099-08-20",
        headers=auth_header,
    )
    assert response.status_code == 200
    assert response.json()["current_streak"] == 2
    assert response.json()["completed_days"] == 2
