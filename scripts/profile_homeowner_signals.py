"""Aggregates behind reports/Ev sahibi bilgisi: yeterli mi.md. Prints counts only, no IDs.

Run from the repo root: uv run python scripts/profile_homeowner_signals.py
"""
import glob

import pandas as pd

P = pd.concat([pd.read_csv(f).assign(installer=f.split("/")[-2][:4]) for f in glob.glob("data/raw/*/projects_status_quo.csv")])
O = pd.concat([pd.read_csv(f) for f in glob.glob("data/raw/*/project_options_parts.csv")])

with_battery = set(O.loc[O.component_type == "BatteryStorage", "project_id"])
P["has_battery"] = P.project_id.isin(with_battery)
P["flexible_tariff"] = P.energy_price_with_flexible_tariff.notna()

print("Load profiles recorded:")
print(P.load_profile.value_counts().to_string())
print("\nBattery share by whether a flexible tariff price is recorded, per installer:")
print(P.groupby(["installer", "flexible_tariff"]).has_battery.agg(["mean", "size"]).round(3).to_string())

names = O.component_name.fillna("").str.lower()
total = O.project_id.nunique()
for label, pattern in [("backup or emergency power", "backup|emergency"), ("meter cabinet", "cabinet"), ("smart meter", "smart meter"), ("energy manager", "energy manag")]:
    n = O.loc[names.str.contains(pattern), "project_id"].nunique()
    print(f"\nProjects with a {label} line: {n} of {total} ({n / total:.0%})")
