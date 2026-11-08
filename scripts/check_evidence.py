"""How often the evidence range (10–90% of similar homes' offers, evidence.py) holds the expert's final solar size on
projects it never saw. Dev split only, 5 folds grouped by customer, per installer. Aggregates only.

Run from the repo root:  uv run python scripts/check_evidence.py
"""
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold

from reonic_engine.data import load_dataset
from reonic_engine.evidence import HIGH, LOW, _q, offers_of, similar_offers

projects, options = load_dataset()
dev = projects[(projects.split == "dev") & projects.has_pv & projects.demand_mwh.notna()].reset_index(drop=True)
rows = []
for fit, held in GroupKFold(5).split(dev, groups=dev.customer_contact_id):
    train, test = dev.iloc[fit], dev.iloc[held]
    offers = offers_of(train, options)
    for _, p in test.iterrows():
        near = similar_offers(offers, p.installer, p.demand_mwh, car=bool(p.has_wallbox))
        lo, hi = _q(near.kwp.values, near.weight.values, LOW), _q(near.kwp.values, near.weight.values, HIGH)
        b = near[near.has_battery]
        rows.append({"installer": p.installer, "inside": lo - 1e-6 <= p.kwp <= hi + 1e-6, "width": hi - lo,
                     "battery_inside": (not p.has_battery) or (len(b) and _q(b.battery_kwh.values, b.weight.values, LOW) - 1e-6 <= p.battery_kwh <= _q(b.battery_kwh.values, b.weight.values, HIGH) + 1e-6)})
r = pd.DataFrame(rows)
print("Final solar size inside the 10–90% range of similar homes' offers (dev, 5 grouped folds)")
print(r.groupby("installer").agg(projects=("inside", "size"), kwp_inside=("inside", "mean"), width_kwp=("width", "mean"), battery_inside=("battery_inside", "mean")).round(2))
print("all", round(r.inside.mean(), 2), "width", round(r.width.mean(), 1))
