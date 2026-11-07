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


def test_heat_pump_only_when_asked_then_sized_and_raises_demand(engine):
    home = {**HOME, "heating": "Gas", "heat_kwh": 20000}
    assert not engine.design(home)["heatpump"]["included"]
    d = engine.design(home, {"heatpump": True})
    assert d["heatpump"]["kw"] == 10 and d["energy"]["total_mwh"] > 6  # 20,000 kWh at 2,250 kWh per kW is 8.9 kW


def test_trace_follows_the_steps_and_quotes_the_design(engine):
    d = engine.design({**HOME, "ev": True, "ev_km": 10000, "surfaces": [{"kind": "roof", "max_modules": 30, "kwh_per_kwp": 1000}]})
    assert [s["id"] for s in d["trace"]] == ["need", "roof", "pv", "battery", "heatpump", "wallbox", "energy", "review"]
    assert f"{d['pv']['modules']} modules" in d["trace"][2]["result"]
    assert {"demand_kwh", "ev_km"} <= {f["key"] for f in d["trace"][0]["inputs"]}


def test_reviewer_notes_an_oversized_battery_without_changing_it(engine):
    d = engine.design(HOME, {"modules": 10, "battery_kwh": 30})
    assert d["battery"]["kwh"] == 30
    assert {"battery_high", "battery_guide"} <= {r["code"] for r in d["review"]}


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


def test_alternatives_vary_one_decision_and_come_from_the_engine(engine):
    home = {**HOME, "heating": "Gas", "heat_kwh": 18000, "surfaces": [{"kind": "roof", "max_modules": 40, "kwh_per_kwp": 1000}]}
    d = engine.design(home)
    alts = engine.alternatives(home, {}, d)
    assert 1 <= len(alts) <= 2 and alts[0]["id"].startswith(("battery", "no_battery"))
    assert alts[0]["pv"]["modules"] == d["pv"]["modules"]  # a battery variant keeps the solar
    assert "heatpump" in {a["id"] for a in alts} and next(a for a in alts if a["id"] == "heatpump")["heatpump_kw"] > 0
    no_gas = {**home, "heating": None}
    large = {a["id"]: a for a in engine.alternatives(no_gas, {}, engine.design(no_gas))}.get("pv_large")
    assert large is None or large["pv"]["kwp"] <= engine.design(no_gas)["similar"]["kwp_high"] + 1e-6  # never past what experts go to


def test_existing_solar_leaves_less_for_the_new_system(engine):
    """A system already there covers part of the need; a bigger or newer one covers more. Size given or from the marked area."""
    none = engine.design({**HOME, "demand_kwh": 9000})
    given = engine.design({**HOME, "demand_kwh": 9000, "has_solar": True, "existing_kwp": 4, "existing_year": 2004})
    newer = engine.design({**HOME, "demand_kwh": 9000, "has_solar": True, "existing_kwp": 4, "existing_year": 2024})
    area = engine.design({**HOME, "demand_kwh": 9000, "has_solar": True, "existing_m2": 20})
    assert given["pv"]["kwp"] <= none["pv"]["kwp"]
    assert newer["energy"]["existing_mwh"] > given["energy"]["existing_mwh"] > 0
    assert area["energy"]["existing_kwp"] == 4.0
    assert "existing_estimated" in {n["code"] for n in area["review"]}
    assert "existing_feed_in_ended" in {n["code"] for n in given["review"]}
    unknown = engine.design({**HOME, "has_solar": True})
    assert "existing_unknown" in {w["code"] for w in unknown["warnings"]}


def test_existing_heat_pump_use_joins_the_need_when_given(engine):
    """Given, a heat pump's own meter adds to the need and the solar never shrinks; not given, nothing changes."""
    hp = {**HOME, "heating": "Heatpump"}
    without, given = engine.design(hp), engine.design({**hp, "hp_kwh": 4500})
    assert given["energy"]["total_mwh"] == round(without["energy"]["total_mwh"] + 4.5, 2)
    assert given["pv"]["kwp"] >= without["pv"]["kwp"]
    assert "hp_kwh" in {f["key"] for s in given["trace"] for f in s["inputs"]}
