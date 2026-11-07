"""Does household size (or house size) tell us anything about yearly electricity use, or the design?

Run from the repo root:  uv run python scripts/profile_household.py
Dev split only. Prints aggregates only, so the output is safe to paste into docs.
"""
import warnings

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import GroupKFold

from reonic_engine.data import clean_status, load_dataset, load_raw, split_of

warnings.filterwarnings("ignore")
pd.set_option("display.width", 200)

status, _ = load_raw()
s = clean_status(status)
s = s[s.customer_contact_id.map(split_of) == "dev"]

print("== How often are they filled (dev split) ==")
for col in ["num_inhabitants", "house_size_sqm", "demand_mwh"]:
    filled = s[col].notna() & (s[col] > 0)
    print(col, {i: f"{filled[s.installer == i].mean():.0%} of {int((s.installer == i).sum())}" for i in s.installer.unique()})

both = s[(s.num_inhabitants > 0) & s.demand_mwh.notna()]
print(f"\n== Use by household size: {len(both)} projects with both ==")
g = both.assign(people=both.num_inhabitants.clip(upper=5).astype(int)).groupby("people").demand_mwh
print(pd.DataFrame({"n": g.size(), "p10": g.quantile(0.1), "median": g.median(), "p90": g.quantile(0.9)}).round(1).to_string())
print("rank correlation people vs use:", round(both.num_inhabitants.corr(both.demand_mwh, method="spearman"), 2))
# How much of the spread in use does household size explain? Spread around each size's median vs around the overall median.
overall = (both.demand_mwh - both.demand_mwh.median()).abs().median()
within = (both.demand_mwh - both.groupby(both.num_inhabitants.clip(upper=5)).demand_mwh.transform("median")).abs().median()
print(f"typical miss guessing use: overall median {overall:.2f} MWh, by household size {within:.2f} MWh")

print("\n== Given the use, does household size still move the expert's solar size? ==")
p, _ = load_dataset()
p = p[(p.split == "dev") & p.has_pv & p.demand_mwh.notna()].copy()
p["people"] = p.num_inhabitants.where(p.num_inhabitants > 0)
print(f"{len(p)} dev projects with solar; household size filled in {p.people.notna().mean():.0%}")
folds = GroupKFold(5)
for name, cols in [("use only", ["demand_mwh"]), ("use + household size", ["demand_mwh", "people"]), ("household size only", ["people"])]:
    err = np.zeros(len(p))
    for a, b in folds.split(p, groups=p.customer_contact_id):
        m = HistGradientBoostingRegressor(max_depth=3, max_iter=200, learning_rate=0.05).fit(p.iloc[a][cols], p.iloc[a].kwp)
        err[b] = np.abs(m.predict(p.iloc[b][cols]) - p.iloc[b].kwp.values)
    print(f"{name:22s} kWp error, median: " + ", ".join(f"{i} {np.median(err[p.installer.values == i]):.2f}" for i in p.installer.unique()))
