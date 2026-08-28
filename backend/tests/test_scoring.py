from app.schemas import habit_score


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
