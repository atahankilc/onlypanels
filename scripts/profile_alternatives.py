"""How experts vary options for one home, and how they size PV and battery. Aggregates only, dev split.

Run from the repo root:  uv run python scripts/profile_alternatives.py
"""
import numpy as np, pandas as pd
from reonic_engine.data import load_dataset
p, o = load_dataset()
dev = p[p.split=="dev"]
o = o[o.project_id.isin(dev.project_id)]
multi = o.groupby("project_id").filter(lambda g: len(g)>1)
print("dev projects", len(dev), "multi-option projects", multi.project_id.nunique())
rows=[]
for pid,g in multi.groupby("project_id"):
    rows.append(dict(inst=g.installer.iloc[0], n=len(g),
        kwp_diff=g.kwp.max()-g.kwp.min()>0.2, bat_diff=g.battery_kwh.nunique()>1,
        bat_presence_diff=g.has_battery.nunique()>1, wb_diff=g.has_wallbox.nunique()>1, hp_diff=g.has_hp.nunique()>1,
        kwp_range=g.kwp.max()-g.kwp.min(), bat_range=g.battery_kwh.max()-g.battery_kwh.min()))
r=pd.DataFrame(rows)
print(r.groupby("inst")[["n","kwp_diff","bat_diff","bat_presence_diff","wb_diff","hp_diff"]].mean().round(2))
print("what changes: only battery", ((~r.kwp_diff)&r.bat_diff).mean().round(2), "only pv", (r.kwp_diff&~r.bat_diff).mean().round(2), "both", (r.kwp_diff&r.bat_diff).mean().round(2), "neither", ((~r.kwp_diff)&(~r.bat_diff)).mean().round(2))
print("options per multi project", r.n.value_counts().to_dict())
d = dev[dev.has_pv]
d = d.assign(ratio=d.battery_kwh/d.kwp)
print("battery per kWp (with battery) by installer"); print(d[d.has_battery].groupby("installer").ratio.describe(percentiles=[.1,.5,.9]).round(2))
d["band"]=pd.cut(d.demand_mwh,[0,3,4,5,6,8,30])
print("kWp by demand band and installer (p10/p50/p90, n)")
print(d.groupby(["installer","band"]).kwp.agg(n="size",p10=lambda s:s.quantile(.1),p50="median",p90=lambda s:s.quantile(.9)).round(1))
print("battery rate by band"); print(d.groupby(["installer","band"]).has_battery.mean().round(2))
print("top battery sizes per installer"); print(d[d.has_battery].groupby("installer").battery_kwh.apply(lambda s:s.round(1).value_counts(normalize=True).head(5).round(2)))
print("module count top values"); print(d.groupby("installer").modules.apply(lambda s:s.value_counts(normalize=True).head(6).round(3)))
print("wallbox sold | has_ev", dev.groupby(dev.has_ev.fillna(False)).has_wallbox.mean().round(2).to_dict())
print("pv production/demand ratio (950)", (d.kwp*0.95/d.demand_mwh).describe(percentiles=[.1,.5,.9]).round(2).to_dict())
