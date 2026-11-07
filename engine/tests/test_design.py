import numpy as np
import pandas as pd
import pytest

from reonic_engine.design import Engine, reaction_checks


@pytest.fixture(scope="module")
def engine():
    r = np.random.default_rng(0)
    n = 300
    demand = r.uniform(2, 12, n)
    kwp = 5 + 0.8 * demand + r.normal(0, 1, n)
    battery = np.where(r.random(n) < 0.9, r.choice([5.0, 10.0, 15.0], n), 0.0)
    train = pd.DataFrame({
        "project_id": [f"p{i}" for i in range(n)], "installer": "2a8ba8e2", "demand_mwh": demand,
        "price_ct_kwh": 32.0, "heating_existing_type": None, "has_solar": False, "has_storage": False,
        "kwp": kwp, "battery_kwh": battery, "has_pv": True, "has_battery": battery > 0,
        "has_wallbox": r.random(n) < 0.25,
    })
    return Engine().fit(train, train)


HOME = {"installer": "2a8ba8e2", "demand_kwh": 6000}


def test_ev_adds_wallbox_and_never_shrinks_pv(engine):
    base, ev = engine.design(HOME), engine.design({**HOME, "ev": True, "ev_km": 15000})
    assert ev["wallbox"]["included"] and not base["wallbox"]["included"]
    assert ev["pv"]["kwp"] >= base["pv"]["kwp"]
    assert ev["energy"]["ev_mwh"] == 2.7


def test_area_limit_caps_panels_and_ground_needs_more_area(engine):
    roof = engine.design({**HOME, "area_m2": 20})
    ground = engine.design({**HOME, "area_m2": 20, "mount": "ground"})
    assert roof["pv"]["modules"] == 10 and roof["pv"]["capped"]
    assert ground["pv"]["modules"] == 4


def test_surfaces_fill_in_homeowner_order_and_set_the_yield(engine):
    surfaces = [{"kind": "roof", "max_modules": 6, "kwh_per_kwp": 1100},
                {"kind": "carport", "max_modules": 4, "kwh_per_kwp": 900}]
    d = engine.design({**HOME, "surfaces": surfaces})
    assert d["pv"]["modules"] == 10 and d["pv"]["placed"] == [6, 4] and d["pv"]["capped"]
    assert d["energy"]["production_mwh"] == round((6 * 1100 + 4 * 900) * 0.45 / 1000, 1)
    assert engine.design({**HOME, "surfaces": surfaces}, {"modules": 3})["pv"]["placed"] == [3, 0]


def test_planner_locks_are_kept(engine):
    d = engine.design({**HOME, "area_m2": 10}, {"modules": 14, "battery_kwh": 0, "wallbox": True})
    assert d["pv"]["modules"] == 14 and d["battery"]["kwh"] == 0 and d["wallbox"]["included"]


def test_no_new_heat_pump_where_one_exists(engine):
    d = engine.design({**HOME, "heating": "Heatpump", "heat_kwh": 15000})
    assert not d["heatpump"]["included"] and d["heatpump"]["blocked"]


def test_fossil_heating_gets_a_sized_heat_pump_that_raises_demand(engine):
    d = engine.design({**HOME, "heating": "Gas", "heat_kwh": 20000})
    assert d["heatpump"]["kw"] == 7 and d["energy"]["total_mwh"] > 6


def test_other_country_and_non_roof_warn(engine):
    d = engine.design({**HOME, "country": "Austria", "mount": "ground"})
    assert {"not_germany", "non_roof"} <= {w["code"] for w in d["warnings"]}


def test_reaction_checks_hold_on_monotone_engine(engine):
    homes = engine.train.head(50)
    checks = reaction_checks(engine, homes)
    assert checks["ev_never_shrinks_pv"] == 1 and checks["area_limit_respected"] == 1


def test_existing_battery_means_no_new_battery_unless_planner_asks(engine):
    d = engine.design({**HOME, "has_storage": True})
    assert d["battery"]["kwh"] == 0 and "battery_existing" in {r["code"] for r in d["reasons"]}
    assert engine.design({**HOME, "has_storage": True}, {"battery_kwh": 10})["battery"]["kwh"] == 10


def test_unknown_heat_demand_is_flagged_when_a_heat_pump_is_forced(engine):
    d = engine.design(HOME, {"heatpump": True})
    assert "hp_assumed_heat" in {w["code"] for w in d["warnings"]}
