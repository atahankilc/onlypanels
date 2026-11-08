"""The desk's MCP server over a real in-process MCP client, with a stand-in engine: no network, no data."""
import asyncio
import json

from mcp import Client

from reonic_engine.desk import Desk, build
from reonic_engine.voice import checked


def fake_engine(inputs, overrides):
    modules = overrides.get("modules") or 20
    battery = overrides.get("battery_kwh", 10.0)
    return {
        "pv": {"modules": modules, "kwp": modules * 0.45, "max_modules": 30},
        "battery": {"kwh": battery, "choices": [5.0, 10.0, 15.0]},
        "heatpump": {"included": bool(overrides.get("heatpump")), "kw": 9},
        "wallbox": {"included": bool(overrides.get("wallbox"))},
        "energy": {"total_mwh": 4.5, "production_mwh": round(modules * 0.43, 1), "self_sufficiency_pct": 61, "self_use_pct": 38, "saving_eur": 1234},
        "review": [], "battery_curve": [{"kwh": 0.0, "own_pct": 35, "saving_eur": 800}, {"kwh": 10.0, "own_pct": 61, "saving_eur": 1234}],
    }


CONTEXT = {
    "page": "request",
    "requests": [{"id": "a", "ref": "R-1", "title": "Lindwurmstraße 12", "status": "draft"},
                 {"id": "b", "ref": "R-2", "title": "Leopoldstraße 3", "status": "sent"}],
    "open": {"id": "a", "ref": "R-1", "title": "Lindwurmstraße 12", "tab": "design", "status": "draft",
             "to_confirm": [{"key": "demand_kwh", "label": "Yearly use", "value": "4,000 kWh"}], "checks": [],
             "inputs": {"demand_kwh": 4000}, "overrides": {}},
}


def call(desk, name, args):
    async def go():
        async with Client(build(desk)) as mcp:
            tools = {t.name for t in (await mcp.list_tools()).tools}
            assert {"open_request", "show_tab", "try_design", "set_design", "confirm_facts", "send_offer"} <= tools
            return await mcp.call_tool(name, args)
    return asyncio.run(go())


def text(result):
    return result.content[0].text


def test_set_design_records_a_page_action_with_engine_numbers():
    desk = Desk(fake_engine, CONTEXT)
    out = call(desk, "set_design", {"battery_kwh": 15.0})
    assert not out.is_error
    assert json.loads(text(out))["design_now"]["battery_kwh"] == 15.0
    assert desk.actions == [{"type": "set", "overrides": {"battery_kwh": 15.0}}]


def test_set_design_refuses_a_battery_outside_the_catalog():
    desk = Desk(fake_engine, CONTEXT)
    out = call(desk, "set_design", {"battery_kwh": 12.0})
    assert out.is_error and desk.actions == []


def test_send_waits_for_assumed_facts():
    desk = Desk(fake_engine, CONTEXT)
    assert call(desk, "send_offer", {}).is_error
    assert call(desk, "confirm_facts", {"keys": ["all"]}).is_error is False
    assert desk.actions == [{"type": "confirm", "keys": ["demand_kwh"]}]


def test_try_design_changes_nothing_on_screen():
    desk = Desk(fake_engine, CONTEXT)
    out = call(desk, "try_design", {"modules": 25})
    assert json.loads(text(out))["modules"] == 25 and desk.actions == []


def test_engine_tools_need_an_open_request():
    desk = Desk(fake_engine, {**CONTEXT, "open": None, "page": "requests"})
    assert call(desk, "try_design", {}).is_error
    assert not call(desk, "open_request", {"request_id": "b"}).is_error
    assert desk.actions == [{"type": "open", "id": "b"}]


def test_spoken_answer_keeps_only_numbers_the_engine_gave():
    desk = Desk(fake_engine, CONTEXT)
    said = "The battery is now 10 kWh. That pays back in 7 years. Own power is 61%."
    assert checked(said, desk.seen) == "The battery is now 10 kWh. Own power is 61%."


def test_set_fact_checks_the_value_and_marks_a_page_action():
    desk = Desk(fake_engine, CONTEXT)
    assert call(desk, "set_fact", {"key": "demand_kwh", "value": "300"}).is_error  # below a plausible use
    assert call(desk, "set_fact", {"key": "installer", "value": "x"}).is_error  # not a fact the voice may change
    out = call(desk, "set_fact", {"key": "demand_kwh", "value": "5,200"})
    assert not out.is_error and desk.actions == [{"type": "fact", "inputs": {"demand_kwh": 5200}}]
    assert call(desk, "send_offer", {}).is_error  # never in the same turn as a change


def test_tick_checks_takes_only_known_checks():
    desk = Desk(fake_engine, {**CONTEXT, "open": {**CONTEXT["open"], "checks": [{"id": "roof", "title": "Check the roof", "done": False}]}})
    assert call(desk, "tick_checks", {"ids": ["nope"]}).is_error
    assert not call(desk, "tick_checks", {"ids": ["roof"]}).is_error
    assert desk.actions == [{"type": "check", "ids": ["roof"], "done": True}]


def test_money_reads_the_cost_view_with_the_pages_options():
    got = {}

    def money(inputs, overrides, options):
        got.update(overrides=overrides, options=options)
        return {"gross_eur": 21000, "pays_eur": 19000, "payback_years": 11, "gain_eur": 9000, "irr_pct": 5.1, "solar_ct_kwh": 9.4,
                "battery_eur": 210, "grant": None, "year1": {"total_eur": 1500}, "bills": {"before": {"total_eur": 2600}, "after": {"total_eur": 1100}},
                "assumptions": {"years": 20}}
    desk = Desk(fake_engine, {**CONTEXT, "open": {**CONTEXT["open"], "money": {"kids": True}}}, money)
    out = json.loads(text(call(desk, "money", {"battery_kwh": 0})))
    assert out["payback_years"] == 11 and got == {"overrides": {"battery_kwh": 0}, "options": {"kids": True}} and desk.actions == []


def test_german_and_turkish_numbers_are_read_as_written():
    seen = [{"pays_eur": 21400, "payback_years": 11.3, "own_power_pct": 42}]
    assert checked("Die Anlage kostet 21.400 Euro. Sie hat sich nach 11,3 Jahren bezahlt gemacht.", seen) == \
        "Die Anlage kostet 21.400 Euro. Sie hat sich nach 11,3 Jahren bezahlt gemacht."
    assert checked("Özgüç oranı yüzde 42 olur. Geri ödeme 9 yıl.", seen) == "Özgüç oranı yüzde 42 olur."
    assert checked("It costs 21,400 euros.", seen) == "It costs 21,400 euros."
