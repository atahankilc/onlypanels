"""How far the page's sun table (web/public/sun-table.json) is from an exact PVGIS answer for real roofs and walls.

Takes surfaces of a few test homes in Munich, asks PVGIS for each (through engine sun.py, cached on disk), and reads
the table the way web/src/site.worker.ts does: bilinear over the region, linear in tilt, around the compass in azimuth.

uv run python scripts/check_sun_table.py
"""
import json
import random
from pathlib import Path

from reonic_engine import lod2, sun

TABLE = json.loads((Path(__file__).resolve().parents[1] / "web" / "public" / "sun-table.json").read_text())
SQUARES = ["690_5334", "684_5336", "694_5330"]


def bracket(xs, v):
    if v <= xs[0]:
        return 0, 0, 0.0
    if v >= xs[-1]:
        return len(xs) - 1, len(xs) - 1, 0.0
    i = max(k for k in range(len(xs) - 1) if xs[k] < v)
    return i, i + 1, (v - xs[i]) / (xs[i + 1] - xs[i])


def from_table(lat, lon, tilt, azimuth):
    t = TABLE
    la0, la1, fa = bracket(t["lats"], lat)
    lo0, lo1, fo = bracket(t["lons"], lon)
    t0, t1, ft = bracket(t["tilts"], tilt)
    n = len(t["azimuths"]); step = 360 / n; az = azimuth % 360
    a0 = int(az // step) % n; a1 = (a0 + 1) % n; fz = az / step - az // step
    out = 0.0
    for la, wa in ((la0, 1 - fa), (la1, fa)):
        for lo, wo in ((lo0, 1 - fo), (lo1, fo)):
            for ti, wt in ((t0, 1 - ft), (t1, ft)):
                for ai, wz in ((a0, 1 - fz), (a1, fz)):
                    out += wa * wo * wt * wz * t["values"][la][lo][ti][ai][0]
    return out


random.seed(4)
gaps = []
for sq in SQUARES:
    if not lod2.built(sq):
        lod2.build(sq)
    homes = [f for f in json.loads(lod2.path(sq, "homes").read_text())["features"] if 6 < f["properties"]["h"] < 14]
    for f in random.sample(homes, 2):
        b = lod2.building(sq, f["properties"]["id"])
        ring0 = b["roofs"][0]["ring"]
        lon, lat = sum(p[0] for p in ring0) / len(ring0), sum(p[1] for p in ring0) / len(ring0)
        for s in sun.surfaces(sq, f["properties"]["id"])["surfaces"]:
            if s["kwh_m2"]:
                gaps.append(abs(from_table(lat, lon, s["tilt"], s["azimuth"]) - s["kwh_m2"]) / s["kwh_m2"] * 100)
print(f"{len(gaps)} surfaces: table is {sum(gaps) / len(gaps):.1f}% off exact PVGIS on average, {max(gaps):.1f}% at worst")
