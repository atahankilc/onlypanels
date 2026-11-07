from reonic_engine.energy import EV, HEAT, HOUSE, SOLAR, simulate


def run(production=9000, battery=0):
    return simulate(4500, 0, 0, production, battery, 32)


def test_profiles_sum_to_one_year():
    for profile in (HOUSE, EV, HEAT, SOLAR):
        assert len(profile) == 8760 and abs(profile.sum() - 1) < 1e-9


def test_battery_raises_independence_with_diminishing_returns():
    none, small, big, huge = run(battery=0), run(battery=5), run(battery=10), run(battery=40)
    assert none["self_sufficiency_pct"] < small["self_sufficiency_pct"] <= big["self_sufficiency_pct"]
    assert big["self_sufficiency_pct"] - small["self_sufficiency_pct"] < small["self_sufficiency_pct"] - none["self_sufficiency_pct"]
    assert huge["self_sufficiency_pct"] <= 100


def test_no_panels_means_no_saving():
    assert run(production=0, battery=0) == {"self_sufficiency_pct": 0, "self_use_pct": 0, "saving_eur": 0}


def test_reasonable_german_home():
    r = run(battery=10)
    assert 55 <= r["self_sufficiency_pct"] <= 90
