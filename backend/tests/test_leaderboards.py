from datetime import date, datetime, timedelta, timezone

import pytest

from app.models import Habit, HabitLog, User


def epoch_ms(value: str) -> int:
    return int(datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp() * 1000)


async def _seed_pair(db_session, habit_id: str = "my-habit") -> str:
    """The authenticated user plus an opponent, each owning one neutral habit.

    The auth_header fixture already created "user"; merge gives it the display
    name without colliding on the primary key. Habit/HabitLog have no
    relationship() to User, only a raw foreign key, so the inserts are flushed
    in dependency order rather than left to the unit of work.
    """
    await db_session.merge(User(id="user", email="me@example.com", username="Me", password_hash="x"))
    db_session.add(User(id="opponent", email="them@example.com", username="Them", password_hash="x"))
    await db_session.flush()
    db_session.add_all([
        Habit(id=habit_id, user_id="user", name="Mine", impact=3, friction=3, keystone=3, time_cost=3),
        Habit(id="their-habit", user_id="opponent", name="Theirs", impact=3, friction=3, keystone=3, time_cost=3),
    ])
    await db_session.flush()
    return habit_id


def _run(habit_id: str, user_id: str, last_day: date, length: int, prefix: str = "log") -> list[HabitLog]:
    """`length` consecutive daily logs ending on `last_day`."""
    return [
        HabitLog(
            id=f"{prefix}-{offset}",
            user_id=user_id,
            habit_id=habit_id,
            completed_date=last_day - timedelta(days=offset),
        )
        for offset in range(length)
    ]


async def _head_to_head(client, auth_header, start: str, end: str, as_of: str | None = None):
    params = {"opponent_id": "opponent", "start": epoch_ms(start), "end": epoch_ms(end)}
    if as_of is not None:
        params["as_of"] = as_of
    return await client.get("/v1/leaderboards/head-to-head", params=params, headers=auth_header)


def _streak_for(body: dict, user_id: str = "user") -> int:
    ranking = next(row for row in body["rankings"] if row["user_id"] == user_id)
    return ranking["tie_breakers"]["streak_days"]


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
            # The streak is measured from as_of, clamped to the window end. With
            # as_of omitted the effective date is min(today, 2026-08-31), so this
            # assertion would change outcome on its own once the clock passes the
            # window end. Pin it to the last completed day instead.
            "as_of": "2026-08-31",
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


@pytest.mark.asyncio
async def test_streak_counts_a_run_when_the_window_has_not_finished(client, db_session, auth_header):
    """#148: the window ends after the last completed day, which used to read 0."""
    habit_id = await _seed_pair(db_session)
    db_session.add_all(_run(habit_id, "user", date(2099, 8, 27), 5))
    await db_session.commit()

    response = await _head_to_head(
        client, auth_header,
        start="2099-08-01T00:00:00", end="2099-08-31T23:59:59.999", as_of="2099-08-27",
    )

    assert response.status_code == 200
    assert _streak_for(response.json()) == 5


@pytest.mark.asyncio
async def test_streak_counts_history_from_before_the_window(client, db_session, auth_header):
    """The candidate set is unwindowed, so a 30-day run reports 30 on a weekly tab."""
    habit_id = await _seed_pair(db_session)
    db_session.add_all(_run(habit_id, "user", date(2099, 8, 27), 30))
    await db_session.commit()

    response = await _head_to_head(
        client, auth_header,
        start="2099-08-24T00:00:00", end="2099-08-30T23:59:59.999", as_of="2099-08-27",
    )

    assert response.status_code == 200
    assert _streak_for(response.json()) == 30


@pytest.mark.asyncio
async def test_streak_matches_the_metrics_endpoint_for_a_single_habit_user(client, db_session, auth_header):
    """Acceptance criterion 2, in its single-habit reading.

    The leaderboard streak is user-level and the metrics streak is per-habit, so
    the two agree only when the user owns exactly one habit.
    """
    db_session.add(User(id="opponent", email="them@example.com", username="Them", password_hash="x"))
    await db_session.commit()

    created = await client.post(
        "/habits/",
        json={"name": "Water", "impact": 3, "friction": 3, "keystone": 3, "time_cost": 3},
        headers=auth_header,
    )
    assert created.status_code == 201
    habit_id = created.json()["id"]

    synced = await client.post(
        "/logs/sync",
        json={"logs": [{"habit_id": habit_id, "completed_date": f"2099-08-{day}"} for day in (25, 26, 27)]},
        headers=auth_header,
    )
    assert synced.status_code == 200

    leaderboard = await _head_to_head(
        client, auth_header,
        start="2099-08-01T00:00:00", end="2099-08-31T23:59:59.999", as_of="2099-08-27",
    )
    # start and end are required on the metrics endpoint even though only as_of
    # drives the streak.
    metrics = await client.get(
        f"/habits/{habit_id}/metrics?start=2099-08-01&end=2099-08-31&as_of=2099-08-27",
        headers=auth_header,
    )

    assert leaderboard.status_code == 200
    assert metrics.status_code == 200
    assert _streak_for(leaderboard.json()) == metrics.json()["current_streak"] == 3


@pytest.mark.asyncio
async def test_streak_clamps_to_the_end_of_a_finished_window(client, db_session, auth_header):
    """A finished window reports the streak as it stood at the window end."""
    habit_id = await _seed_pair(db_session)
    # A 30-day run ending 2099-08-27 starts on 2099-07-29, so a window that
    # closed on 2099-08-10 was 13 days into it.
    db_session.add_all(_run(habit_id, "user", date(2099, 8, 27), 30))
    await db_session.commit()

    response = await _head_to_head(
        client, auth_header,
        start="2099-08-01T00:00:00", end="2099-08-10T23:59:59.999", as_of="2099-08-27",
    )

    assert response.status_code == 200
    assert _streak_for(response.json()) == 13


@pytest.mark.asyncio
async def test_streak_defaults_to_today_when_as_of_is_omitted(client, db_session, auth_header):
    """Backward compatibility: prod calls this endpoint without as_of."""
    today = datetime.now(timezone.utc).date()
    habit_id = await _seed_pair(db_session)
    db_session.add_all(_run(habit_id, "user", today, 4))
    await db_session.commit()

    # Both the logs and the window are relative to today, so the default as_of
    # decides the result rather than the clamp to the window end.
    response = await _head_to_head(
        client, auth_header,
        start=f"{today - timedelta(days=7)}T00:00:00",
        end=f"{today + timedelta(days=7)}T23:59:59.999",
    )

    assert response.status_code == 200
    assert _streak_for(response.json()) == 4


@pytest.mark.asyncio
async def test_streak_breaks_on_a_gap_and_ignores_a_deleted_log_outside_the_window(
    client, db_session, auth_header
):
    """A deleted log outside the window must not bridge a gap in the unwindowed set."""
    habit_id = await _seed_pair(db_session)
    db_session.add_all([
        *_run(habit_id, "user", date(2099, 8, 27), 3, prefix="recent"),
        # 2099-08-24 is tombstoned, so the run stops at the 25th instead of
        # reaching the live log on the 23rd.
        HabitLog(
            id="tombstoned", user_id="user", habit_id=habit_id,
            completed_date=date(2099, 8, 24),
            deleted_at=datetime(2099, 8, 25, tzinfo=timezone.utc),
        ),
        HabitLog(id="older", user_id="user", habit_id=habit_id, completed_date=date(2099, 8, 23)),
    ])
    await db_session.commit()

    response = await _head_to_head(
        client, auth_header,
        start="2099-08-26T00:00:00", end="2099-08-30T23:59:59.999", as_of="2099-08-27",
    )

    assert response.status_code == 200
    assert _streak_for(response.json()) == 3
