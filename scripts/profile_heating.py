"""Which heating answers really occur, what is filled with them, and what experts sold for each.

Run from the repo root:  uv run python scripts/profile_heating.py
All projects (dev and test): this profiles inputs, it scores nothing. Prints aggregates only.
"""
import pandas as pd

from reonic_engine.data import clean_status, load_dataset, load_raw

pd.set_option("display.width", 200, "display.max_columns", 20)

status, _ = load_raw()
s = clean_status(status)
s["heating"] = s.heating_existing_type.fillna("(empty)")

print(f"== Heating type, by installer ({len(s)} projects) ==")
print(pd.crosstab(s.heating, s.installer, margins=True).to_string())

print("\n== What comes filled with each heating type (share of projects) ==")
filled = lambda c: (s[c].notna() & (s[c] > 0))
cols = {"heat demand (Wh)": "heating_existing_heating_demand_wh", "heating electricity (kWh)": "heating_existing_electricity_demand_kwh",
        "heating cost / year": "heating_existing_cost_per_year", "house size": "house_size_sqm", "house built year": "house_built_year"}
print(pd.DataFrame({k: filled(c).groupby(s.heating).mean().round(2) for k, c in cols.items()}).assign(n=s.groupby("heating").size()).to_string())

print("\n== Heat demand where given, MWh a year ==")
h = s[filled("heating_existing_heating_demand_wh")]
print(h.groupby("heating").heat_mwh.describe(percentiles=[0.1, 0.5, 0.9])[["count", "10%", "50%", "90%"]].round(1).to_string())

print("\n== Heating electricity where given, kWh a year ==")
e = s[filled("heating_existing_electricity_demand_kwh")]
print(e.groupby("heating").heating_existing_electricity_demand_kwh.describe(percentiles=[0.1, 0.5, 0.9])[["count", "10%", "50%", "90%"]].round(0).to_string())

print("\n== What experts sold, by heating type (last option per project) ==")
p, _ = load_dataset()
p["heating"] = p.heating_existing_type.fillna("(empty)")
print(p.groupby("heating").agg(n=("project_id", "size"), heat_pump=("has_hp", "mean"), battery=("has_battery", "mean"),
                               median_kwp=("kwp", "median")).round(2).to_string())

print("\n== Homes with a heat pump: does its electricity tell the expert's solar size apart, beyond the house's use? ==")
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import GroupKFold

hp = p[(p.heating == "Heatpump") & p.has_pv & p.demand_mwh.notna() & (p.heating_existing_electricity_demand_kwh > 0)].copy()
hp["hp_mwh"] = hp.heating_existing_electricity_demand_kwh / 1000
print(f"{len(hp)} projects; most common values (kWh):", hp.heating_existing_electricity_demand_kwh.value_counts().head(5).to_dict())
print("heat demand = 3.5 × heat pump electricity in", f"{np.isclose(hp.heat_mwh, 3.5 * hp.hp_mwh, atol=0.05).mean():.0%}", "of them")
for name, cols in [("house use only", ["demand_mwh"]), ("house use + heat pump electricity", ["demand_mwh", "hp_mwh"])]:
    err = np.zeros(len(hp))
    for a, b in GroupKFold(5).split(hp, groups=hp.customer_contact_id):
        m = LinearRegression().fit(hp.iloc[a][cols], hp.iloc[a].kwp)
        err[b] = np.abs(m.predict(hp.iloc[b][cols]) - hp.iloc[b].kwp.values)
    print(f"  {name:36s} median kWp error {np.median(err):.2f}")

print("\n== Gas and oil homes: heat demand where a heat pump was sold, and its size ==")
f = p[p.heating.isin(["Gas", "Oil"])]
print(f.groupby("has_hp").agg(n=("project_id", "size"), heat_mwh=("heat_mwh", "median"), hp_kw=("hp_kw", "median")).round(1).to_string())
