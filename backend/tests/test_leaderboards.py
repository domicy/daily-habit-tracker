from datetime import date, datetime, timezone

import pytest

from app.models import Habit, HabitLog, User


def epoch_ms(value: str) -> int:
    return int(datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp() * 1000)


@pytest.mark.asyncio
async def test_head_to_head_aggregates_habit_scores_and_marks_current_user(client, db_session, auth_header):
    # The auth_header fixture already created "user"; merge gives it the display
    # name this test asserts on without colliding on the primary key.
    await db_session.merge(User(id="user", email="me@example.com", username="Me", password_hash="x"))
    db_session.add(User(id="opponent", email="them@example.com", username="Them", password_hash="x"))
    # Habit/HabitLog have no relationship() to User, only a raw foreign key, so
    # the unit of work will not order the inserts for us.
    await db_session.flush()
    db_session.add_all([
        Habit(id="my-high", user_id="user", name="High", impact=5, friction=1, keystone=5, time_cost=1),
        Habit(id="their-neutral", user_id="opponent", name="Neutral", impact=3, friction=3, keystone=3, time_cost=3),
    ])
    db_session.add_all([
        HabitLog(id="my-log-1", user_id="user", habit_id="my-high", completed_date=date(2026, 8, 30)),
        HabitLog(id="my-log-2", user_id="user", habit_id="my-high", completed_date=date(2026, 8, 31)),
        HabitLog(id="their-log", user_id="opponent", habit_id="their-neutral", completed_date=date(2026, 8, 10)),
    ])
    await db_session.commit()

    response = await client.get(
        "/v1/leaderboards/head-to-head",
        params={
            "opponent_id": "opponent",
            "start": epoch_ms("2026-08-01T00:00:00"),
            "end": epoch_ms("2026-08-31T23:59:59.999"),
        },
        headers=auth_header,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["meta"]["timezone"] == "UTC"
    assert body["rankings"][0]["user_id"] == "user"
    assert body["rankings"][0]["display_name"] == "Me"
    assert body["rankings"][0]["is_current_user"] is True
    assert body["rankings"][0]["score"] == 200
    assert body["rankings"][0]["tie_breakers"]["streak_days"] == 2
    assert body["rankings"][1]["score"] == 50


@pytest.mark.asyncio
async def test_head_to_head_requires_distinct_existing_opponent(client, auth_header):
    response = await client.get(
        "/v1/leaderboards/head-to-head",
        params={"opponent_id": "user", "start": 1, "end": 2},
        headers=auth_header,
    )
    assert response.status_code == 422
