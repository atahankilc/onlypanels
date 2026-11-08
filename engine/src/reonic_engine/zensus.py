"""What the 2022 census says about the homes around an address: how old they are and how they heat.

Built by scripts/build_zensus.py from the Zensus 2022 100 m grid (© Statistisches Bundesamt (Destatis), 2024, dl-de/by-2-0).
An area's picture, never this one house: it only stands in where the customer gave no answer, and says so.
"""
import json
from functools import lru_cache
from pathlib import Path

from pyproj import Transformer

FILE = Path(__file__).resolve().parents[3] / "data" / "external" / "zensus" / "region.json"
REACHES = (1, 3)  # cells each way: 3 × 3 cells (300 m) first, so one small cell with hidden values does not decide alone; 7 × 7 if that holds no homes
MIN_BUILDINGS = 5
# Census classes to the build periods the homeowner picks from.
PERIOD = {"Vor1919": "before1979", "a1919bis1948": "before1979", "a1949bis1978": "before1979", "a1979bis1990": "1979to1990",
          "a1991bis2000": "1991to2000", "a2001bis2010": "2001to2010", "a2011bis2019": "since2011", "a2020undspaeter": "since2011"}
# Census heating energy to the homeowner's heating answers, and two the homeowner cannot pick but the planner should know.
HEATING = {"Gas": "Gas", "Heizoel": "Oil", "Holz_Holzpellets": "OtherRenewable", "Biomasse_Biogas": "OtherRenewable",
           "Solar_Geothermie_Waermepumpen": "Heatpump", "Fernwaerme": "District", "Strom": "Electric"}
_grid = Transformer.from_crs(4326, 3035, always_xy=True)


@lru_cache(1)
def _data():
    return json.loads(FILE.read_text()) if FILE.exists() else None


def around(lon, lat):
    """The most common build period and heating among the buildings nearby, with their shares. None without data."""
    if _data() is None:
        return None
    for reach in REACHES:
        found = _within(lon, lat, reach)
        if found["buildings"] >= MIN_BUILDINGS:
            break
    return found


def _within(lon, lat, reach):
    d = _data()
    x, y = _grid.transform(lon, lat)
    cx, cy = int(x // 100) * 100, int(y // 100) * 100
    nb = len(d["built"])
    built, heat = {}, {}
    for dx in range(-reach, reach + 1):
        for dy in range(-reach, reach + 1):
            row = d["cells"].get(f"E{cx + dx * 100}N{cy + dy * 100}")
            if not row:
                continue
            for name, n in zip(d["built"], row[:nb]):
                built[PERIOD[name]] = built.get(PERIOD[name], 0) + n
            for name, n in zip(d["heat"], row[nb:]):
                key = HEATING.get(name, "Other")
                heat[key] = heat.get(key, 0) + n

    def top(counts):
        total = sum(counts.values())
        if not total:
            return None, 0.0, 0
        best = max(counts, key=counts.get)
        return best, round(counts[best] / total, 2), total

    b, b_share, b_n = top(built)
    h, h_share, h_n = top(heat)
    return {"built": b, "built_share": b_share, "buildings": b_n, "heating": h, "heating_share": h_share, "heated": h_n, "metres": (2 * reach + 1) * 100}
