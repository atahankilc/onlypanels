"""Price book and money view: VAT by law, the KfW grant's rules, planner prices and parts reaching the offer, payback."""
import pytest

from reonic_engine import costs, pricebook


@pytest.fixture(autouse=True)
def store(tmp_path, monkeypatch):
    monkeypatch.setattr(pricebook, "STORE", tmp_path / "pricebook.json")


def design(modules=20, battery=10.0, wallbox=False, hp_kw=0.0):
    sim = costs.simulate(4500, 0, 0, modules * 0.45 * 950, battery, 32)
    return {"pv": {"modules": modules, "kwp": modules * 0.45, "placed": None}, "battery": {"kwh": battery},
            "wallbox": {"included": wallbox}, "heatpump": {"included": hp_kw > 0, "kw": hp_kw},
            "energy": {"base_mwh": 4.5, "ev_mwh": 0.0, "hp_mwh": 0.0, "own_hp_mwh": 0.0, "production_mwh": modules * 0.45 * 0.95,
                       "existing_mwh": 0.0, "existing_battery_kwh": 0.0, "heat_mwh": 15.0 if hp_kw else None, **sim}}


HOME = {"installer": "2a8ba8e2", "price_ct_kwh": 32.0}


def test_solar_and_battery_carry_no_vat_wallbox_does():
    m = costs.evaluate(HOME, design(wallbox=True))
    assert all(l["vat"] == 0 for l in m["lines"] if l["tech"] in ("solar", "battery"))
    wb = [l for l in m["lines"] if l["tech"] == "wallbox"]
    assert wb and all(l["gross"] > l["net"] for l in wb)


def test_installer_habit_ticks_meter_cabinet_and_planner_can_untick():
    on = costs.evaluate(HOME, design())
    assert any(l["id"] == "meter_cabinet" for l in on["lines"])  # in 81% of this installer's offers
    off = costs.evaluate(HOME, design(), extras={"meter_cabinet": False})
    assert off["gross_eur"] == on["gross_eur"] - 2200
    other = costs.evaluate({**HOME, "installer": "23c108b7"}, design())
    assert not any(l["id"] == "meter_cabinet" for l in other["lines"])


def test_planner_price_and_own_part_reach_the_offer():
    base = costs.evaluate(HOME, design())["gross_eur"]
    pricebook.set_item("module", {"per_unit": 125})
    pricebook.add_item({"name": "Bird protection", "tech": "solar", "kind": "product", "unit": "module", "when": "always", "per_unit": 10})
    m = costs.evaluate(HOME, design())
    assert m["gross_eur"] == base + 20 * 10 + 20 * 10
    pricebook.reset_item("module")
    assert costs.evaluate(HOME, design())["gross_eur"] == base + 200


def test_grant_follows_the_july_2026_rules():
    lines = [{"tech": "heatpump", "gross": 35_000}]
    hp = {"heatpump": {"included": True}}
    g = costs.grant({"heating": "Oil"}, hp, lines)
    assert g["rate_pct"] == 46 and g["eligible_eur"] == 28_000 and g["eur"] == 12_880
    young = costs.grant({"heating": "Gas", "boiler_age": "10to20"}, hp, lines)
    assert young["path"] == "fkg" and young["rate_pct"] == 45 and young["other_eur"] == 8_400  # Munich's 15% beats KfW's 30% alone
    assert costs.grant({"heating": "Oil", "owner": "tenant"}, hp, lines, income="le30")["rate_pct"] == 45  # landlord: no KfW bonuses, so the city path
    assert costs.grant({"heating": "Oil"}, hp, lines, income="le30")["rate_pct"] == 80  # 30 + 16 + 40, low-income cap 80
    assert costs.grant({"heating": "Oil"}, hp, lines, income="le40")["rate_pct"] == 70  # 30 + 16 + 30 = 76, capped at 70


def test_payback_and_bills_add_up():
    m = costs.evaluate(HOME, design())
    assert m["bills"]["before"]["total_eur"] - m["bills"]["after"]["total_eur"] == pytest.approx(m["year1"]["total_eur"], abs=3)
    assert 5 < m["payback_years"] < 20
    dearer = costs.evaluate(HOME, design(), b=_dearer())
    assert dearer["payback_years"] > m["payback_years"]


def _dearer():
    pricebook.set_item("battery", {"per_unit": 900})
    return pricebook.book("2a8ba8e2")


def test_battery_life_limits_its_gain():
    b = pricebook.book("2a8ba8e2")
    m = costs.part_money(4600, 390, b, years=costs.BATTERY_LIFE)
    assert m["payback_years"] and m["gain_eur"] < 390 * 20


def test_feed_in_cap_loses_power_only_above_the_cap():
    free = costs.simulate(3000, 0, 0, 8000, 0, 32)
    capped = costs.simulate(3000, 0, 0, 8000, 0, 32, export_cap_kw=2.0)
    assert free["curtailed_kwh"] == 0 and capped["curtailed_kwh"] > 0
    assert capped["export_kwh"] == pytest.approx(free["export_kwh"] - capped["curtailed_kwh"], abs=2)


def test_rules_follow_size_and_devices():
    small = costs.evaluate(HOME, design(modules=14, battery=0.0))  # 6.3 kWp: no smart meter required, 60% cap
    ids = {r["id"] for r in small["rules"]}
    assert "cap60" in ids and "smart_meter" not in ids and "grid_rebate" not in ids
    big = costs.evaluate(HOME, design(wallbox=True))  # 9 kWp with a wallbox
    ids = {r["id"] for r in big["rules"] if r["applies"]}
    assert {"smart_meter", "grid_rebate", "negative_prices", "eeg_2027"} <= ids
    assert big["year1"]["meter_eur"] == 100 and big["year1"]["rebate_eur"] == 138
    assert big["draft_2027"]["payback_years"] is None or big["draft_2027"]["payback_years"] >= big["payback_years"]


def test_money_choice_never_costs_more_than_the_draft():
    def engine(i, o):
        d = design(modules=o.get("modules") or 20, battery=10.0 if o.get("battery_kwh") is None else o["battery_kwh"])
        d["battery"]["choices"] = [5.0, 7.0, 10.0, 14.0]
        d["pv"]["max_modules"] = 30
        d["similar"] = {"kwp_low": 6.0, "kwp_high": 12.0}
        return d
    o = {"modules": None, "battery_kwh": None}
    pick = costs.best_for_money(engine, {**HOME, "goal": "cost"}, o, pricebook.book("2a8ba8e2"))
    assert pick["tried"] > 10
    assert pick["pays_eur"] <= pick["draft_pays_eur"] and pick["gain_eur"] >= pick["draft_gain_eur"]
    assert costs.best_for_money(engine, HOME, {"modules": 20, "battery_kwh": 10.0}, pricebook.book("2a8ba8e2")) is None  # the planner decided both
