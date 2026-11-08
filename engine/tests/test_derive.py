"""What the homeowner's answers lead to beyond themselves, and the planner's review built on them."""
import numpy as np
import pandas as pd
import pytest

from reonic_engine import casework
from reonic_engine.derive import COP, COP_DEFAULT, cop, demand_edges, derive
from reonic_engine.design import Engine


@pytest.fixture(scope="module")
def engine():
    r = np.random.default_rng(0)
    n = 300
    demand = r.uniform(2, 12, n)
    battery = np.where(r.random(n) < 0.5, r.choice([5.0, 10.0, 15.0], n), 0.0)
    train = pd.DataFrame({
        "project_id": [f"p{i}" for i in range(n)], "installer": "2a8ba8e2", "demand_mwh": demand,
        "price_ct_kwh": 32.0, "heating_existing_type": None, "has_solar": False, "has_storage": False,
        "kwp": 5 + 0.8 * demand + r.normal(0, 1, n), "battery_kwh": battery, "has_pv": True, "has_battery": battery > 0,
        "has_wallbox": r.random(n) < 0.25,
    })
    return Engine().fit(train, train)


GAS = {"installer": "2a8ba8e2", "demand_kwh": 4500, "heating": "Gas", "heat_kwh": 18000}


def test_how_rooms_are_heated_sets_the_heat_pumps_efficiency():
    assert cop({}) == COP_DEFAULT
    assert cop({"heat_dist": "floor"}) == COP["low"]
    assert cop({"heat_dist": "radiators", "built": "before1979"}) == COP["high"]
    assert cop({"heat_dist": "radiators", "built": "since2011"}) == COP["mid"]


def test_radiators_need_more_electricity_and_more_solar(engine):
    floor = engine.design({**GAS, "heat_dist": "floor"}, {"heatpump": True})
    rads = engine.design({**GAS, "heat_dist": "radiators", "built": "before1979"}, {"heatpump": True})
    assert rads["energy"]["hp_mwh"] > floor["energy"]["hp_mwh"]
    assert rads["pv"]["kwp"] >= floor["pv"]["kwp"]


def test_backup_keeps_a_battery(engine):
    without = [engine.design({**GAS, "demand_kwh": k}) for k in (2000, 3000, 4000, 5000)]
    low = next((d for d in without if not d["battery"]["kwh"]), None)
    if low is None:
        pytest.skip("the toy model adds a battery everywhere")
    d = engine.design({**GAS, "demand_kwh": low["energy"]["base_mwh"] * 1000, "backup": True})
    assert d["battery"]["kwh"] > 0 and not d["battery"]["unsure"]
    assert engine.design({**GAS, "backup": True}, {"battery_kwh": 0})["battery"]["kwh"] == 0  # the planner still decides


def test_a_car_coming_later_sizes_solar_but_gets_no_wallbox_yet(engine):
    now = engine.design({**GAS, "ev": True, "ev_km": 12000})
    later = engine.design({**GAS, "ev": True, "ev_km": 12000, "ev_when": "later"})
    assert now["wallbox"]["included"] and not later["wallbox"]["included"]
    assert later["pv"]["kwp"] == now["pv"]["kwp"]


def test_an_old_boiler_puts_the_heat_pump_first(engine):
    d = engine.design({**GAS, "boiler_age": "over20"})
    assert engine.alternatives({**GAS, "boiler_age": "over20"}, {}, d)[0]["id"] == "heatpump"
    assert any(f["id"] == "boiler" for f in d["derived"])


def test_heat_that_does_not_fit_the_house_is_flagged():
    facts = derive({**GAS, "heat_kwh": 60000, "living_m2": 120, "built": "since2011"}, 60.0, True)
    assert next(f for f in facts if f["id"] == "heat_check")["level"] == "warn"


def test_only_a_guessed_use_has_edges():
    assert demand_edges({"demand_kwh": 4000, "demand_source": "bill"}) is None
    assert demand_edges({"demand_kwh": 4000, "demand_source": "range"}) == (3400, 4600)
    assert demand_edges({"demand_kwh": 4000, "demand_assumed": True}) == (2500, 6000)
    assert demand_edges({"demand_kwh": 4000, "demand_source": "range", "use_range": [3000, 5000]}) == (3000, 5000)


def test_review_is_the_same_every_time_and_every_number_is_from_a_run(engine):
    run = lambda i, o: {**engine.design(i, o), "alternatives": [], "battery_curve": []}
    i = {**GAS, "demand_source": "people", "ev": True, "ev_km": 11300}
    a, b = casework.review(run, i, {}), casework.review(run, i, {})
    assert a == b
    assert len(a["steps"]) >= 5  # the draft, then both edges of the use, the driving and the day at home
    for ask in a["asks"]:
        assert ask["low"] in [s["result"] for s in a["steps"]] and ask["high"] in [s["result"] for s in a["steps"]]


def test_engine_copies_of_shared_values_agree():
    from reonic_engine import design, derive as dv
    assert dv.TYPICAL_KWH_M2 == design.HEAT_KWH_PER_M2
    assert dv.HOT_WATER_KWH == design.BIG_USERS_KWH["water"]


def test_a_monthly_payment_already_holds_the_big_users(engine):
    paid = engine.design({**GAS, "demand_source": "payment", "big_users": ["pool"]})
    guessed = engine.design({**GAS, "demand_source": "range", "big_users": ["pool"]})
    assert paid["energy"]["base_mwh"] < guessed["energy"]["base_mwh"]


def test_heat_from_a_gas_bill_counts_the_boilers_loss(engine):
    gas = engine.design({**GAS, "heat_dist": "floor"}, {"heatpump": True})
    electric = engine.design({**GAS, "heating": "Electric", "heat_dist": "floor"}, {"heatpump": True})
    assert gas["energy"]["hp_mwh"] < electric["energy"]["hp_mwh"]


def test_a_roof_told_by_direction_only_limits_nothing(engine):
    d = engine.design({**GAS, "area_unknown": True, "surfaces": [{"kind": "roof", "max_modules": 1000, "kwh_per_kwp": 900, "tilt": 35, "azimuth": 90}]})
    assert d["pv"]["max_modules"] is None and any(w["code"] == "no_area" for w in d["warnings"])
