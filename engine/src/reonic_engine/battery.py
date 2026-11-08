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
    rows = []
    for kwh in sizes:
        r = simulate(e["base_mwh"] * 1000, e["ev_mwh"] * 1000, e["hp_mwh"] * 1000, production, kwh, i.get("price_ct_kwh", 32.0), sun=sun,
                     ev_day=bool(i.get("ev_day")), home_day=i.get("home_day"))
        rows.append({"kwh": kwh, "own_pct": r["self_sufficiency_pct"], "saving_eur": r["saving_eur"]})
    return rows
