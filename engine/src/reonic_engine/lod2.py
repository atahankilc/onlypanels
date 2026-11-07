"""Real buildings from Bavaria's open 3D models (LoD2): measured footprints and roof surfaces.

Files cover 2 km squares, named by their south-west corner in km (UTM 32). They are public data, fetched once per
square into data/cache/. Only the square's name leaves this machine. Elsewhere the map's own shapes are used.
"""
import math
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path

from pyproj import Transformer

CACHE = Path(__file__).resolve().parents[3] / "data" / "cache" / "lod2"
SOURCE = "https://download1.bayernwolke.de/a/lod2/citygml/{}.gml"
TILE_M = 2000
NEAREST_M = 8  # the point may miss a footprint by a little
GML, BLDG = "{http://www.opengis.net/gml}", "{http://www.opengis.net/citygml/building/1.0}"
TO_UTM = Transformer.from_crs(4326, 25832, always_xy=True)
TO_LONLAT = Transformer.from_crs(25832, 4326, always_xy=True)


def tile_name(east, north):
    return f"{int(east // TILE_M) * 2}_{int(north // TILE_M) * 2}"


def _points(text):
    v = [float(x) for x in text.split()]
    return list(zip(v[0::3], v[1::3], v[2::3]))[:-1]  # the first point repeats at the end


def _polygons(surface):
    for polygon in surface.iter(f"{GML}Polygon"):
        rings = [_points(p.text) for p in polygon.iter(f"{GML}posList")]
        yield {"ring": rings[0], "holes": rings[1:]}


def parse(source):
    """Buildings in a CityGML file, in UTM metres."""
    buildings = []
    for _, element in ET.iterparse(source, events=("end",)):
        if element.tag != f"{BLDG}Building":
            continue
        parts = {name: [p for s in element.iter(f"{BLDG}{name}Surface") for p in _polygons(s)] for name in ("Ground", "Roof", "Wall")}
        if parts["Ground"] and parts["Roof"]:
            buildings.append({"ground": parts["Ground"], "roofs": parts["Roof"], "walls": parts["Wall"],
                              "floor": min(p[2] for g in parts["Ground"] for p in g["ring"])})
        element.clear()
    return buildings


@lru_cache(maxsize=4)
def _tile(name):
    path = CACHE / f"{name}.gml"
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        part = path.with_suffix(".part")
        with urllib.request.urlopen(SOURCE.format(name), timeout=60) as response:
            part.write_bytes(response.read())
        part.rename(path)
    return parse(path)


def _inside(x, y, ring):
    hit = False
    for (ax, ay, _), (bx, by, _) in zip(ring, ring[1:] + ring[:1]):
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            hit = not hit
    return hit


def _gap(x, y, b):
    """Metres from a point to a building's footprint: 0 inside."""
    rings = [g["ring"] for g in b["ground"]]
    if any(_inside(x, y, r) for r in rings):
        return 0.0
    return min(math.hypot(p[0] - x, p[1] - y) for r in rings for p in r)


def _lonlat(b):
    def ring(points):
        lon, lat = TO_LONLAT.transform([p[0] for p in points], [p[1] for p in points])
        return [[a, c, round(p[2] - b["floor"], 2)] for a, c, p in zip(lon, lat, points)]
    side = lambda polys: [{"ring": ring(p["ring"]), "holes": [ring(h) for h in p["holes"]]} for p in polys]
    return {"ground": side(b["ground"]), "roofs": side(b["roofs"]), "walls": side(b["walls"])}


def building_at(lat, lon, reach_m=0):
    """The building at a point, and others within reach of it. None where no model exists."""
    x, y = TO_UTM.transform(lon, lat)
    try:
        buildings = _tile(tile_name(x, y))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ET.ParseError):
        return None
    ranked = sorted(((_gap(x, y, b), i) for i, b in enumerate(buildings)))
    if not ranked or ranked[0][0] > NEAREST_M:
        return None
    main = ranked[0][1]
    near = [buildings[i] for gap, i in ranked[1:] if gap <= reach_m]
    return {"main": _lonlat(buildings[main]), "near": [_lonlat(b) for b in near]}
