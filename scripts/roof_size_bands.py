"""Roof area of Munich homes by size, from Bavaria's open building models (LoD2), for the questions-only path.

A homeowner without the map picks small, medium or large; this gives each a typical roof area. Homes are buildings
3 to 12 m high with a footprint of 50 to 400 m2 in the squares already built on disk. Roof area is the sum of the
measured roof surfaces (sloped area, not footprint). Prints the 25th, 50th and 75th percentile.

uv run python scripts/roof_size_bands.py
"""
import json
import math

import numpy as np

from reonic_engine import lod2
from reonic_engine.sun import newell

areas = []
names = sorted(p.stem for p in lod2.BUILT.glob("*.homes"))
for name in names:
    homes = json.loads(lod2.path(name, "homes").read_text())["features"]
    keep = {}
    for f in homes:
        h = f["properties"]["h"]
        ring = f["geometry"]["coordinates"][0][0]
        lat0 = math.radians(ring[0][1])
        xs = [(p[0] - ring[0][0]) * 111320 * math.cos(lat0) for p in ring]
        ys = [(p[1] - ring[0][1]) * 110540 for p in ring]
        n = len(ring)  # the rings are open: the last edge closes back to the first point
        foot = abs(sum(xs[i] * ys[(i + 1) % n] - xs[(i + 1) % n] * ys[i] for i in range(n))) / 2
        if 3 <= h <= 12 and 50 <= foot <= 400:
            keep[f["properties"]["id"]] = foot
    if not keep:
        continue
    for bid, solid in lod2.buildings(name, list(keep)).items():
        roof = 0.0
        for r in solid["roofs"]:
            ring = r["ring"]
            lat0 = math.radians(ring[0][1])
            pts = [((p[0] - ring[0][0]) * 111320 * math.cos(lat0), (p[1] - ring[0][1]) * 110540, p[2]) for p in ring]
            roof += float(np.linalg.norm(newell(pts))) / 2
        areas.append(roof)
q = np.percentile(areas, [25, 50, 75])
print(f"{len(areas)} homes in {len(names)} squares: roof area 25th {q[0]:.0f} m2, median {q[1]:.0f} m2, 75th {q[2]:.0f} m2")
