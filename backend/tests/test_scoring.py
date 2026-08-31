from datetime import date

from app.schemas import habit_score, streak_days


def test_score_contract_examples():
    assert habit_score(5, 1, 5, 1) == 100
    assert habit_score(3, 3, 3, 3) == 50
    assert habit_score(1, 5, 1, 5) == 0
    assert habit_score(4, 2, 3, 4) == 56


def test_score_directionality():
    neutral = habit_score(3, 3, 3, 3)
    assert habit_score(4, 3, 3, 3) > neutral
    assert habit_score(3, 3, 4, 3) > neutral
    assert habit_score(3, 4, 3, 3) < neutral
    assert habit_score(3, 3, 3, 4) < neutral


# Contract section 5 worked examples, as of Friday 2026-08-28.
FRIDAY = date(2026, 8, 28)
THURSDAY = date(2026, 8, 27)
WEDNESDAY = date(2026, 8, 26)
TUESDAY = date(2026, 8, 25)


def test_streak_contract_examples():
    assert streak_days({WEDNESDAY, THURSDAY, FRIDAY}, FRIDAY) == 3
    assert streak_days({TUESDAY, WEDNESDAY, THURSDAY}, FRIDAY) == 3
    assert streak_days({TUESDAY, THURSDAY, FRIDAY}, FRIDAY) == 2
    assert streak_days(set(), FRIDAY) == 0


def test_streak_is_zero_when_the_run_ended_before_yesterday():
    assert streak_days({TUESDAY, WEDNESDAY}, FRIDAY) == 0
