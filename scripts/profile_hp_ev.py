"""Heat pumps and cars in the experts' designs, to check the engine's rules. Aggregates only, dev split.

Run from the repo root:  uv run python scripts/profile_hp_ev.py
"""
import pandas as pd

from reonic_engine.data import load_dataset

p, o = load_dataset()
dev = p[p.split == "dev"]
hp = dev[dev.has_hp]
known = hp[hp.heat_mwh.notna()]
print("heat pumps sold:", len(hp), "| with heat use recorded:", len(known))
if len(known):
    ratio = known.heat_mwh * 1000 / known.hp_kw
    print("heat use per kW sold (kWh/kW): median", round(ratio.median()), "| range", round(ratio.min()), "to", round(ratio.max()))
    print("sold sizes kW:", sorted(known.hp_kw.round(1).tolist()))

pv = dev[dev.has_pv & dev.demand_mwh.notna()].copy()
pv["band"] = pd.cut(pv.demand_mwh, [0, 3, 4, 5, 6, 8, 30])
g = pv.groupby(["installer", "band"], observed=True)
diff = g.apply(lambda x: x[x.has_wallbox].kwp.median() - x[~x.has_wallbox].kwp.median(), include_groups=False)
n = g.apply(lambda x: int(x.has_wallbox.sum()), include_groups=False)
print("extra kWp experts give homes that bought a wallbox, same use band (median):")
print(pd.DataFrame({"extra_kwp": diff.round(2), "wallbox_homes": n}).to_string())
w = pv[pv.has_wallbox]
print("overall, wallbox homes:", len(w), "| median extra kWp across bands:", round(diff.median(), 2))
