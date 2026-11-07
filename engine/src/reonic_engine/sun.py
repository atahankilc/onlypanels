"""Sun on a building's surfaces: measured geometry, real sun positions, and what the neighbours block.

Yearly sunlight per surface comes from PVGIS. Shadow comes from a height map of the surroundings: footprints and
heights around the building, its own roofs exactly. The split between direct and diffuse light is an assumption.
Only coordinates leave this machine.
"""
import base64
import json
import math
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path

import numpy as np

from . import lod2

PVGIS = "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc"
AGENT = "energy-design-desk-demo"
PVGIS_CACHE = Path(__file__).resolve().parents[3] / "data" / "cache" / "pvgis.json"  # coordinates and yearly sun, nothing about a project
PVGIS_WAITS = (0, 0.6, 1.5)  # seconds before each try
_disk = threading.Lock()
SYSTEM_LOSS_PCT = 14  # PVGIS default
MIN_SURFACE_M2 = 10  # smaller pieces are drawn, not offered
MAX_SAMPLES = 9000  # per building, so a huge block stays quick
LOOK_M = 160  # shadows from further away are ignored
LIFT_M = 0.35  # samples sit just off the surface
PROBE_M = 1.5  # a wall is free where nothing stands this far in front of it
MIN_FREE_M2 = 10  # a wall with less open area than this is left out
CONTEXT_M = 26  # neighbours are shown up to this far from the building, fading out
TOUCH_M = 1.0  # a neighbour this close shares a wall: roof overhangs and survey noise stay under it
CONTEXT_STEP_M = 3  # their outlines get a point this often, so the fade runs along long walls
CLEARANCE_M = 0.5  # what a ray must clear, so a surface does not shade itself by rounding
DIFFUSE_SHARE = 0.5  # of yearly sunlight on a surface: assumed, roughly right for central Europe
MONTH_DAY = [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355]  # the 21st of each month, day of the year


def directions(lat):
    """Where the sun stands each daylight hour on one day a month, in solar time. East, north, up."""
    found = []
    phi = math.radians(lat)
    for month, day in enumerate(MONTH_DAY, 1):
        dec = math.radians(23.44) * math.sin(2 * math.pi * (day - 81) / 365)
        for hour in range(4, 21):
            h = math.radians(15 * (hour - 12))
            sin_el = math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.cos(h)
            if sin_el < math.sin(math.radians(4)):
                continue
            el = math.asin(sin_el)
            az = math.atan2(-math.sin(h) * math.cos(dec), math.cos(phi) * math.sin(dec) - math.sin(phi) * math.cos(dec) * math.cos(h))
            found.append({"month": month, "hour": hour, "az": round(math.degrees(az) % 360, 1), "el": round(math.degrees(el), 1),
                          "vector": [math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)],
                          "strength": 0.7 ** ((1 / sin_el) ** 0.678)})
    return found


def newell(points):
    p, q = np.asarray(points), np.roll(np.asarray(points), -1, axis=0)
    return np.array([((p[:, 1] - q[:, 1]) * (p[:, 2] + q[:, 2])).sum(), ((p[:, 2] - q[:, 2]) * (p[:, 0] + q[:, 0])).sum(), ((p[:, 0] - q[:, 0]) * (p[:, 1] + q[:, 1])).sum()])


def inside(x, y, ring):
    """Which points lie in a ring, all at once."""
    hit = np.zeros(x.shape, bool)
    for (ax, ay), (bx, by) in zip(ring, ring[1:] + ring[:1]):
        cross = (ay > y) != (by > y)
        if ay != by:
            hit ^= cross & (x < (bx - ax) * (y - ay) / (by - ay) + ax)
    return hit


def _metres(ring, origin):
    x, y = lod2.TO_UTM.transform([p[0] for p in ring], [p[1] for p in ring])
    return [(a - origin[0], b - origin[1], p[2]) for a, b, p in zip(x, y, ring)]


class Heights:
    """Height of everything around a building, on a 1 m grid centred on it."""

    def __init__(self, size):
        self.half = size
        self.grid = np.zeros((2 * size, 2 * size), np.float32)

    def add(self, ring, height):
        """A flat block, or with `height` None a measured surface whose ring carries its own heights."""
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        x0, x1 = max(int(min(xs)) - 1, -self.half), min(int(max(xs)) + 2, self.half)
        y0, y1 = max(int(min(ys)) - 1, -self.half), min(int(max(ys)) + 2, self.half)
        if x0 >= x1 or y0 >= y1:
            return
        gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5, indexing="ij")
        mask = inside(gx, gy, [(p[0], p[1]) for p in ring])
        if height is None:
            n = newell(ring)
            if abs(n[2]) < 1e-6:
                return
            p = ring[0]
            z = p[2] - (n[0] * (gx - p[0]) + n[1] * (gy - p[1])) / n[2]
        else:
            z = np.full(gx.shape, height)
        view = self.grid[x0 + self.half:x1 + self.half, y0 + self.half:y1 + self.half]
        view[mask] = np.maximum(view[mask], z[mask])

    def against(self, points, normal):
        """Which points of a wall have another building right in front of them."""
        pos = points + PROBE_M * np.asarray(normal)
        ix, iy = np.floor(pos[:, 0]).astype(int) + self.half, np.floor(pos[:, 1]).astype(int) + self.half
        ok = (ix >= 0) & (iy >= 0) & (ix < 2 * self.half) & (iy < 2 * self.half)
        found = np.zeros(len(points), bool)
        found[ok] = self.grid[ix[ok], iy[ok]] > pos[ok, 2]
        return found

    def shaded(self, points, vector):
        """Which points the sun cannot reach from this direction."""
        top = float(self.grid.max())
        blocked = np.zeros(len(points), bool)
        d = np.asarray(vector)
        steps = int(min(LOOK_M, (top - points[:, 2].min()) / max(d[2], 0.03))) + 2
        for t in np.arange(1.5, steps, 1.5):
            pos = points + t * d
            ix, iy = np.floor(pos[:, 0]).astype(int) + self.half, np.floor(pos[:, 1]).astype(int) + self.half
            ok = (ix >= 0) & (iy >= 0) & (ix < 2 * self.half) & (iy < 2 * self.half) & ~blocked
            blocked[ok] |= self.grid[ix[ok], iy[ok]] > pos[ok, 2] + CLEARANCE_M
        return blocked


def _sample(ring, holes, step):
    """A grid of points on a flat surface: the points, their cells, a way to place other points on that grid, the normal, the area."""
    p = np.asarray(ring, float)
    n = newell(ring)
    area = float(np.linalg.norm(n)) / 2
    n = n / (2 * area)
    u = np.cross([0, 0, 1], n)
    u = np.array([1.0, 0, 0]) if np.linalg.norm(u) < 1e-6 else u / np.linalg.norm(u)
    v = np.cross(n, u)
    flat = lambda r: [(float((np.asarray(q) - p[0]) @ u), float((np.asarray(q) - p[0]) @ v)) for q in r]
    a = flat(ring)
    ga, gb = np.meshgrid(np.arange(min(x for x, _ in a) + step / 2, max(x for x, _ in a), step), np.arange(min(y for _, y in a) + step / 2, max(y for _, y in a), step), indexing="ij")
    mask = inside(ga, gb, a)
    for h in holes:
        mask &= ~inside(ga, gb, flat(h))
    a0, b0 = ga[0, 0] if ga.size else 0, gb[0, 0] if gb.size else 0
    cells = np.stack(np.nonzero(mask), 1)
    place = lambda r: [[round((x - a0) / step, 2), round((y - b0) / step, 2)] for x, y in flat(r)]
    return p[0] + ga[mask, None] * u + gb[mask, None] * v, cells, place, n, area


@lru_cache(maxsize=512)
def _pvgis(lat, lon, tilt, azimuth):
    params = urllib.parse.urlencode({"lat": lat, "lon": lon, "peakpower": 1, "loss": SYSTEM_LOSS_PCT, "angle": tilt,
                                     "aspect": azimuth % 360 - 180, "outputformat": "json"})
    request = urllib.request.Request(f"{PVGIS}?{params}", headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=20) as response:
        totals = json.load(response)["outputs"]["totals"]["fixed"]
    return totals["H(i)_y"], totals["E_y"]


def _remembered():
    try:
        return json.loads(PVGIS_CACHE.read_text())
    except (OSError, ValueError):
        return {}


def _yearly(lat, lon, tilt, azimuth):
    """Yearly sun from PVGIS. Answers stay on disk, so a restart or a bad connection costs nothing for homes already seen."""
    key = (round(lat, 3), round(lon, 3), int(round(tilt / 5) * 5), int(round(azimuth / 10) * 10) % 360)
    name = "/".join(map(str, key))
    with _disk:
        known = _remembered().get(name)
    if known:
        return tuple(known)
    for wait in PVGIS_WAITS:  # it drops calls when several arrive at once
        time.sleep(wait)
        try:
            found = _pvgis(*key)
        except (OSError, KeyError, ValueError):
            continue
        with _disk:
            saved = _remembered()
            saved[name] = found
            PVGIS_CACHE.parent.mkdir(parents=True, exist_ok=True)
            part = PVGIS_CACHE.with_suffix(".part")
            part.write_text(json.dumps(saved))
            part.replace(PVGIS_CACHE)
        return found
    return None


@lru_cache(maxsize=32)
def _surroundings(name, centre_x, centre_y):
    """Footprints and heights near a point, in metres from it."""
    found = []
    names = {lod2.tile_name(centre_x + dx, centre_y + dy) for dx in (-LOOK_M, LOOK_M) for dy in (-LOOK_M, LOOK_M)} | {name}
    for square in names:
        if not lod2.built(square):
            lod2.build(square)
        for f in json.loads(lod2.path(square, "homes").read_bytes())["features"]:
            x, y = lod2.TO_UTM.transform(f["properties"]["lon"], f["properties"]["lat"])
            if abs(x - centre_x) < LOOK_M + 60 and abs(y - centre_y) < LOOK_M + 60:
                found.append((f["properties"]["id"], f["properties"]["h"], f["geometry"]["coordinates"], square))
    return found


def _dense(ring):
    """A closed ring as points at most CONTEXT_STEP_M apart."""
    out = []
    for (ax, ay), (bx, by) in zip(ring, ring[1:] + ring[:1]):
        parts = max(1, math.ceil(math.hypot(bx - ax, by - ay) / CONTEXT_STEP_M))
        out += [(ax + (bx - ax) * i / parts, ay + (by - ay) * i / parts) for i in range(parts)]
    return np.array(out)


def context(neighbours, own):
    """Buildings near `own`, a list of (x, y), as outlines whose fade falls from 1 at the building to 0 at CONTEXT_M."""
    found = []
    for other, h, ring in neighbours:
        pts = _dense(ring)
        gap = np.sqrt(((pts[:, None, :] - own[None, :, :]) ** 2).sum(2)).min(1)
        if gap.min() < CONTEXT_M:
            found.append((other, h, pts, np.clip(1 - gap / CONTEXT_M, 0, 1)))
    return found


def touches(ring, own):
    """Whether a closed ring of (x, y) comes within TOUCH_M of any point in `own`, measured to its edges, not its corners."""
    a, b = ring, np.roll(ring, -1, axis=0)
    d = b - a
    t = np.clip((((own[:, None, :] - a[None]) * d[None]).sum(2)) / np.maximum((d * d).sum(1), 1e-9)[None], 0, 1)
    gap = np.sqrt(((own[:, None, :] - (a[None] + t[..., None] * d[None])) ** 2).sum(2))
    return bool(gap.min() < TOUCH_M or inside(own[:, 0], own[:, 1], [tuple(p) for p in ring]).any())


def surfaces(name, building_id):
    """Every sizeable surface of a building, sampled: sun over the year and hour by hour. None if there is no such building."""
    b = lod2.building(name, building_id)
    if b is None:
        return None
    ring0 = b["roofs"][0]["ring"]
    lon, lat = sum(p[0] for p in ring0) / len(ring0), sum(p[1] for p in ring0) / len(ring0)
    ox, oy = lod2.TO_UTM.transform(lon, lat)
    origin = (ox, oy)
    heights = Heights(LOOK_M + 60)
    nearby, squares = [], {}
    for other, h, polys, square in _surroundings(name, round(ox, -1), round(oy, -1)):
        if other != building_id:
            squares[other] = square
            for rings in polys:
                ring = _metres([[p[0], p[1], 0] for p in rings[0]], origin)
                heights.add(ring, h)
                nearby.append((other, h, [(p[0], p[1]) for p in (ring[:-1] if ring[0] == ring[-1] else ring)]))
    for roof in b["roofs"]:
        heights.add(_metres(roof["ring"], origin), None)

    items = [("roof", i, p) for i, p in enumerate(b["roofs"])] + [("wall", i, p) for i, p in enumerate(b["walls"])]
    shapes = []
    for kind, index, poly in items:
        ring = _metres(poly["ring"], origin)
        if float(np.linalg.norm(newell(ring))) / 2 < MIN_SURFACE_M2:
            continue
        shapes.append((kind, index, ring, [_metres(h, origin) for h in poly["holes"]]))
    total = sum(float(np.linalg.norm(newell(s[2]))) / 2 for s in shapes)
    step = max(1.0, math.sqrt(total / MAX_SAMPLES))

    suns = directions(lat)
    out, jobs = [], []
    for kind, index, ring, holes in shapes:
        original = (ring, holes)
        if kind == "roof" and newell(ring)[2] < 0:
            ring, holes = ring[::-1], [h[::-1] for h in holes]
        points, cells, place, n, area = _sample(ring, holes, step)
        if kind == "wall" and len(points):
            free = ~heights.against(points, n)
            points, cells = points[free], cells[free]
            area = len(points) * step * step
            if area < MIN_FREE_M2:
                continue
        if not len(points):
            continue
        tilt = math.degrees(math.acos(min(1, abs(n[2]))))
        azimuth = math.degrees(math.atan2(n[0], n[1])) % 360
        lifted = points + LIFT_M * n
        cosines = np.array([float(n @ np.asarray(s["vector"])) for s in suns])
        seen = np.zeros((len(points), len(suns)), bool)
        for i, s in enumerate(suns):
            if cosines[i] > 0.02:
                seen[:, i] = ~heights.shaded(lifted, s["vector"])
        weight = np.clip(cosines, 0, None) * np.array([s["strength"] for s in suns])
        share = (seen @ weight) / max(float(weight.sum()), 1e-9)
        lons, lats = lod2.TO_LONLAT.transform(points[:, 0] + ox, points[:, 1] + oy)
        out.append({"kind": kind, "index": index, "m2": round(area, 1), "tilt": round(tilt), "azimuth": round(azimuth), "share": share, "seen": seen,
                    "at": np.stack([lons, lats, points[:, 2]], 1), "cells": cells.ravel().tolist(), "outline": place(original[0]), "holes": [place(h) for h in original[1]], "n": n.round(4).tolist()})
        jobs.append((lat, lon, tilt, azimuth))
    with ThreadPoolExecutor(max_workers=6) as pool:
        yearly = list(pool.map(lambda j: _yearly(*j), jobs))
    for s, y in zip(out, yearly):
        sun = y[0] if y else None
        s["kwh_m2"] = None if sun is None else round(sun)
        s["kwh_per_kwp"] = None if y is None else round(y[1])
        base = sun if sun is not None else 1000
        s["year"] = (base * (DIFFUSE_SHARE + (1 - DIFFUSE_SHARE) * s.pop("share"))).round().astype(int).tolist()
        s["at"] = [round(float(v), 7 if i % 3 < 2 else 2) for i, v in enumerate(s["at"].ravel())]
        s["seen"] = base64.b64encode(np.packbits(s["seen"], axis=1).tobytes()).decode()
    own = np.concatenate([_dense([(p[0], p[1]) for p in _metres(r["ring"], origin)]) for r in b["roofs"]])
    around, solids = [], {}
    for other, h, pts, fade in context(nearby, own):
        lons, lats = lod2.TO_LONLAT.transform(pts[:, 0] + ox, pts[:, 1] + oy)
        item = {"id": other, "h": h, "ring": [[round(a, 7), round(c, 7), round(float(f), 2)] for a, c, f in zip(lons, lats, fade)]}
        if touches(pts, own):  # a building sharing a wall is part of the picture: it gets its measured roof, not a block
            if other not in solids:
                solids[other] = lod2.building(squares[other], other)
            item["solid"] = solids[other]
        around.append(item)
    return {"around": around, "step": round(step, 2), "suns": [{k: s[k] for k in ("month", "hour", "az", "el", "vector", "strength")} for s in suns], "surfaces": out, "sunny": bool(any(yearly)), "missing": sum(y is None for y in yearly)}
