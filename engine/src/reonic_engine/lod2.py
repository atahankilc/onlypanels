"""Buildings from Bavaria's open 3D models (LoD2): measured footprints and roof surfaces, one entry per real building.

Files cover 2 km squares, named by their south-west corner in km (UTM 32). They are public data, fetched once per
square into data/cache/. Only the square's name leaves this machine.
"""
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path

from pyproj import Transformer

CACHE = Path(__file__).resolve().parents[3] / "data" / "cache" / "lod2"
SOURCE = "https://download1.bayernwolke.de/a/lod2/citygml/{}.gml"
TILE_M = 2000
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
            buildings.append({"id": element.get(f"{GML}id"), "ground": parts["Ground"], "roofs": parts["Roof"], "walls": parts["Wall"],
                              "floor": min(p[2] for g in parts["Ground"] for p in g["ring"])})
        element.clear()
    return buildings


@lru_cache(maxsize=12)
def _tile(name):
    path = CACHE / f"{name}.gml"
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        part = path.with_suffix(".part")
        with urllib.request.urlopen(SOURCE.format(name), timeout=60) as response:
            part.write_bytes(response.read())
        part.rename(path)
    return parse(path)


def _ring(points, floor=None):
    lon, lat = TO_LONLAT.transform([p[0] for p in points], [p[1] for p in points])
    if floor is None:
        return [[round(a, 7), round(c, 7)] for a, c in zip(lon, lat)]
    return [[round(a, 7), round(c, 7), round(p[2] - floor, 2)] for a, c, p in zip(lon, lat, points)]


def squares(west, south, east, north):
    """Names of the squares that cover a box in degrees."""
    xs, ys = TO_UTM.transform([west, east, west, east], [south, south, north, north])
    return [f"{e}_{n}" for e in range(int(min(xs) // TILE_M) * 2, int(max(xs) // TILE_M) * 2 + 1, 2)
            for n in range(int(min(ys) // TILE_M) * 2, int(max(ys) // TILE_M) * 2 + 1, 2)]


def _load(name):
    try:
        return _tile(name)
    except urllib.error.HTTPError as e:
        if e.code == 404:  # no buildings in this square
            return []
        raise


def footprints(name):
    """Every building of a square: its id, footprint and measured height."""
    return [{"id": b["id"], "height": round(max(p[2] for r in b["roofs"] for p in r["ring"]) - b["floor"], 1),
             "polys": [[_ring(g["ring"]), *[_ring(h) for h in g["holes"]]] for g in b["ground"]]} for b in _load(name)]


def building(name, building_id):
    """One building's measured surfaces. None if the square has no such building."""
    for b in _load(name):
        if b["id"] == building_id:
            side = lambda polys: [{"ring": _ring(p["ring"], b["floor"]), "holes": [_ring(h, b["floor"]) for h in p["holes"]]} for p in polys]
            return {"roofs": side(b["roofs"]), "walls": side(b["walls"])}
    return None
