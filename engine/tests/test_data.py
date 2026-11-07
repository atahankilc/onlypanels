import pandas as pd

from reonic_engine.data import build_options, clean_status, design_options, split_of


def line(option="o1", ctype="Other", name="x", qty=1.0, **spec):
    row = dict(project_id="p1", option_id=option, option_number=1, installer="i", technology="solar",
               component_type=ctype, component_name=name, quantity=qty, module_watt_peak=None,
               inverter_power_kw=None, battery_capacity_kwh=None, wb_charging_speed_kw=None,
               heatpump_nominal_power_kw=None)
    return {**row, **spec}


def options(*lines):
    return build_options(pd.DataFrame(lines)).set_index("option_id")


def test_battery_comes_from_the_swapped_column_in_kwh():
    o = options(line(ctype="BatteryStorage", name="Battery 5kWh", qty=2.0, inverter_power_kw=5000.0))
    assert o.loc["o1", "battery_kwh"] == 10


def test_ac_coupling_module_is_not_a_battery():
    o = options(line(ctype="BatteryStorage", name="AC Coupling Module (Free)", inverter_power_kw=1980.0))
    assert o.loc["o1", "battery_kwh"] == 0


def test_kwp_prefers_module_rows_then_package_then_count():
    exact = options(line(ctype="Module", name="PV", qty=20.0, module_watt_peak=500.0),
                    line(name="Complete Package 10.8kWp + 9kWh"))
    package = options(line(name="Complete Package 10.8kWp + 9kWh"))
    count = options(line(name="DC Install Flat Roof", qty=20.0))
    assert exact.loc["o1", "kwp"] == 10
    assert package.loc["o1", "kwp"] == 10.8
    assert count.loc["o1", "kwp"] == 9


def test_extension_options_are_not_designs():
    o = options(line(name="DC Install Flat Roof", qty=20.0), line(name="Travel Flat Rate - Extension"))
    assert design_options(o.reset_index()).empty


def test_heat_pump_only_option_is_a_design():
    o = options(line(ctype="Heatpump", name="Heat Pump", heatpump_nominal_power_kw=7000.0))
    assert len(design_options(o.reset_index())) == 1
    assert o.loc["o1", "hp_kw"] == 7


def test_clean_status_fixes_price_scale_and_drops_bad_demand():
    s = pd.DataFrame({"energy_demand_wh": [0.0, 4.5e6], "energy_price_per_wh": [0.32282, 0.00032],
                      "heating_existing_heating_demand_wh": [None, 0.0]})
    c = clean_status(s)
    assert c.demand_mwh.isna()[0] and c.demand_mwh[1] == 4.5
    assert round(c.price_ct_kwh[0], 2) == 32.28 and round(c.price_ct_kwh[1], 2) == 32
    assert c.heat_mwh.isna().all()


def test_split_is_stable_and_per_customer():
    assert split_of("abc") == split_of("abc")
