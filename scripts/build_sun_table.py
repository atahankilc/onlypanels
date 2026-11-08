"""Yearly sun for every roof direction across the region, from PVGIS (EU JRC), so the page never has to ask for a home.

Writes web/public/sun-table.json: on a 3 x 3 grid of points over the region, for tilt 0 to 90 in 5 degree steps
and azimuth 0 to 350 in 10 degree steps (0 is north, 180 south), the yearly sunlight on the surface (kWh/m2, H(i)_y)
and the yield of 1 kWp with 14% losses (kWh, E_y). The page interpolates between them. Public data, nothing about a project.

uv run python scripts/build_sun_table.py
"""
import json
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "sun-table.json"
KEPT = ROOT / "data" / "cache" / "sun-table-answers.json"  # PVGIS drops calls under load: a rerun only asks what is missing
REGION = (11.2, 47.95, 11.95, 48.4)  # west, south, east, north. Keep in step with web/src/region.ts
PVGIS = "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc"
LOSS = 14
west, south, east, north = REGION
LATS = [round(south + (north - south) * i / 2, 4) for i in range(3)]
LONS = [round(west + (east - west) * i / 2, 4) for i in range(3)]
TILTS = list(range(0, 91, 5))
AZIMUTHS = list(range(0, 360, 10))


def ask(lat, lon, tilt, azimuth):
    params = urllib.parse.urlencode({"lat": lat, "lon": lon, "peakpower": 1, "loss": LOSS, "angle": tilt,
                                     "aspect": azimuth - 180, "outputformat": "json"})
    for wait in (0, 2, 5, 10, 20, 40):
        time.sleep(wait)
        try:
            req = urllib.request.Request(f"{PVGIS}?{params}", headers={"User-Agent": "energy-design-desk-demo"})
            with urllib.request.urlopen(req, timeout=30) as r:
                t = json.load(r)["outputs"]["totals"]["fixed"]
            return round(t["H(i)_y"], 1), round(t["E_y"], 1)
        except (OSError, KeyError, ValueError):
            continue
    raise OSError(f"PVGIS did not answer for {lat} {lon} {tilt} {azimuth}")


jobs = [(la, lo, t, a) for la in LATS for lo in LONS for t in TILTS for a in (AZIMUTHS if t else [180])]
answers = {tuple(json.loads(k)): tuple(v) for k, v in (json.loads(KEPT.read_text()) if KEPT.exists() else {}).items()}
try:
    with ThreadPoolExecutor(max_workers=3) as pool:
        for job, got in zip(todo := [j for j in jobs if j not in answers], pool.map(lambda j: ask(*j), todo)):
            answers[job] = got
finally:
    KEPT.parent.mkdir(parents=True, exist_ok=True)
    KEPT.write_text(json.dumps({json.dumps(list(k)): v for k, v in answers.items()}))
# Flat surfaces face nowhere: one answer stands for every azimuth.
table = [[[[answers[(la, lo, t, a if t else 180)] for a in AZIMUTHS] for t in TILTS] for lo in LONS] for la in LATS]
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(json.dumps({"source": "PVGIS 5.3, EU Joint Research Centre", "loss_pct": LOSS, "lats": LATS, "lons": LONS,
                           "tilts": TILTS, "azimuths": AZIMUTHS, "values": table}, separators=(",", ":")))
print(f"{len(jobs)} PVGIS answers written to {OUT.relative_to(ROOT)}")
