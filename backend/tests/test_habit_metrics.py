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
