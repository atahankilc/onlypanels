"""What each battery size this installer sells would do for one design: same home, same roof, same weather years.
Every number comes from the hourly estimate in energy.py, not from a language model."""
from .energy import simulate, sun_shape

MAX_SHOWN_KWH = 25  # larger sizes in the catalog belong to commercial jobs


def curve(i, d):
    """One row per size, from none upwards: share of the need from own power, and the yearly saving."""
    e = d["energy"]
    sun = sun_shape(i.get("surfaces") or None, d["pv"].get("placed"))
    production = (e["production_mwh"] + (e.get("existing_mwh") or 0)) * 1000
    sizes = sorted({0.0, *[c for c in d["battery"]["choices"] if c <= MAX_SHOWN_KWH], float(d["battery"]["kwh"])})
    # As the design does: a system already there, of known size, keeps its battery working, and the saving is only what
    # the new system adds to it. Without this the table and the design disagreed for the same home.
    known = e.get("existing_kwp") is not None
    old_battery = float(e.get("existing_battery_kwh") or 0)  # as the design counted it, a stand-in size included
    run = lambda solar_wh, battery: simulate(e["base_mwh"] * 1000, e["ev_mwh"] * 1000, (e["hp_mwh"] + (e.get("own_hp_mwh") or 0)) * 1000, solar_wh, battery, i.get("price_ct_kwh", 32.0),
                                             sun=sun, ev_day=bool(i.get("ev_day")), home_day=i.get("home_day"))
    before = run((e.get("existing_mwh") or 0) * 1000, old_battery)["saving_eur"] if known or old_battery else 0
    rows = []
    for kwh in sizes:
        r = run(production, kwh + old_battery)
        rows.append({"kwh": kwh, "own_pct": r["self_sufficiency_pct"], "saving_eur": max(0, r["saving_eur"] - before)})
    return rows
