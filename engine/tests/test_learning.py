"""Learning from approved offers: too few teach nothing, unchanged drafts pull towards zero, a planner's lock stands."""
import pytest

from reonic_engine import learning

HOME = {"installer": "2a8ba8e2"}
DRAFT = {"modules": 20, "battery_kwh": 10.0}


@pytest.fixture(autouse=True)
def store(tmp_path, monkeypatch):
    monkeypatch.setattr(learning, "STORE", tmp_path / "approved.jsonl")


def design(modules=20, battery=10.0):
    return {"pv": {"modules": modules, "max_modules": 30}, "battery": {"kwh": battery, "choices": [5.0, 7.0, 10.0, 14.0]}}


def test_few_offers_teach_nothing():
    learning.remember(HOME, 4.5, False, DRAFT, {"modules": 24, "battery_kwh": 5.0}, "a")
    learning.remember(HOME, 4.5, False, DRAFT, {"modules": 24, "battery_kwh": 5.0}, "b")
    assert not learning.usual_change("2a8ba8e2", 4.5, False)["enough"]


def test_usual_change_moves_the_draft_and_unchanged_offers_count_as_zero():
    for k in range(3):
        learning.remember(HOME, 4.5, False, DRAFT, {"modules": 24, "battery_kwh": 5.0}, f"c{k}")
    c = learning.usual_change("2a8ba8e2", 4.6, False)
    assert c["modules"] == 4 and c["battery_kwh"] == -5.0
    assert learning.adjusted(design(), c, {"modules": None, "battery_kwh": None}, HOME) == {"modules": 24, "battery_kwh": 5.0}
    assert learning.adjusted(design(), c, {"modules": 18, "battery_kwh": None}, HOME) == {"battery_kwh": 5.0}  # the planner's lock stands
    for k in range(4):
        learning.remember(HOME, 4.5, False, DRAFT, DRAFT, f"u{k}")
    assert learning.usual_change("2a8ba8e2", 4.5, False)["modules"] == 0  # 3 changed, 4 approved as drafted: the median is no change


def test_resent_request_replaces_and_other_homes_do_not_count():
    learning.remember(HOME, 4.5, False, DRAFT, DRAFT, "same")
    learning.remember(HOME, 4.5, False, DRAFT, {"modules": 22, "battery_kwh": 10.0}, "same")
    assert learning.summary()["offers"] == 1
    assert learning.similar("2a8ba8e2", 9.0, False) == [] and learning.similar("2a8ba8e2", 4.5, True) == []
