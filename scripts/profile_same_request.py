"""Same request, different design: how often do different customers send exactly the same inputs, and how often do
the experts still design differently? Uses every request field the export has (not parts-derived values). All
projects, per installer. Aggregates only.

Run from the repo root:  uv run python scripts/profile_same_request.py
"""
import pandas as pd

from reonic_engine.data import load_dataset

INPUTS = ["installer", "energy_demand_wh", "energy_price_per_wh", "load_profile", "has_ev", "ev_annual_drive_distance_km",
          "has_solar", "solar_size_kwp", "has_storage", "storage_size_kwh", "existing_wallbox", "heating_existing_type",
          "heating_existing_heating_demand_wh", "house_size_sqm", "house_built_year", "num_inhabitants"]

projects, _ = load_dataset()
p = projects[projects.has_pv].copy()
key = p[INPUTS].astype(object).fillna("-").astype(str).apply(lambda r: "|".join(r.tolist()), axis=1)
p["request"] = key
p["design"] = p.modules.round().astype("Int64").astype(str) + "|" + p.battery_kwh.round(1).astype(str) + "|" + p.has_wallbox.astype(str)

g = p.groupby("request")
size = g.project_id.transform("size")
shared = p[size >= 2]
groups = shared.groupby("request")
differ = groups.design.nunique() > 1
spread = groups.kwp.agg(lambda s: s.max() - s.min())

print("Solar projects:", len(p))
print("Projects whose request exactly matches at least one other customer's:", len(shared),
      f"({len(shared) / len(p):.0%}) in {groups.ngroups} identical requests, largest {int(groups.size().max())} projects")
print("Identical requests where the experts' designs differ:", int(differ.sum()), f"of {groups.ngroups} ({differ.mean():.0%})")
print(f"Solar size spread inside one identical request, mean {spread.mean():.1f} kWp, max {spread.max():.1f} kWp")
fields = p[INPUTS[1:]].notna().sum(axis=1)
print(f"Request fields filled per project, median {fields.median():.0f} of {len(INPUTS) - 1}")
print()
per = shared.assign(differ=shared.request.map(differ)).groupby("installer").agg(
    projects=("project_id", "size"), requests=("request", "nunique"), designs_differ=("differ", "mean"))
print(per.round(2))
