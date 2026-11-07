"""Buildings from Bavaria's open 3D models (LoD2): measured footprints and roof surfaces, one entry per real building.

Files cover 2 km squares, named by their south-west corner in km (UTM 32). They are public data, fetched once per
square into data/cache/. Only the square's name leaves this machine.

A raw file takes seconds to read, so `build` reads it once and leaves three ready-made files, which the API then serves
as they are: `homes` for the map, `edges` for its lines, `solids` for one building at a time.
"""
import json
import math
import os
import struct
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from array import array
from pathlib import Path

from pyproj import Transformer

from .site import REGION

CACHE = Path(__file__).resolve().parents[3] / "data" / "cache" / "lod2"
SOURCE = "https://download1.bayernwolke.de/a/lod2/citygml/{}.gml"
BUILT = CACHE / "built-v1"  # a new format gets a new name, so old files are never read as new ones
TILE_M = 2000
EARTH_RADIUS_M = 6371008.8  # the map's own value: the lines must land exactly on its solids
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


def outline(name):
    """A square's corners in degrees, closed, starting at the south-west."""
    east, north = (int(v) * 1000 for v in name.split("_"))
    xs, ys = [east, east + TILE_M, east + TILE_M, east, east], [north, north, north + TILE_M, north + TILE_M, north]
    lon, lat = TO_LONLAT.transform(xs, ys)
    return [[round(a, 6), round(c, 6)] for a, c in zip(lon, lat)]


def _load(name):
    try:
        return _tile(name)
    except urllib.error.HTTPError as e:
        if e.code == 404:  # no buildings in this square
            return []
        raise OSError(str(e)) from None  # the error itself cannot travel back from another process


def _in_region(lon, lat):
    west, south, east, north = REGION
    return west <= lon <= east and south <= lat <= north


def _homes(buildings):
    """What the map needs of each building in the region: footprint, measured height and where it stands."""
    homes = []
    for b in buildings:
        polys = [[_ring(g["ring"]), *[_ring(h) for h in g["holes"]]] for g in b["ground"]]
        first = polys[0][0]
        if _in_region(*first[0]):
            homes.append({"type": "Feature", "geometry": {"type": "MultiPolygon", "coordinates": polys},
                          "properties": {"id": b["id"], "h": round(max(p[2] for r in b["roofs"] for p in r["ring"]) - b["floor"], 1),
                                         "lon": round(sum(p[0] for p in first) / len(first), 7),
                                         "lat": round(sum(p[1] for p in first) / len(first), 7)}})
    return homes


def _mercator(lon, lat):
    return (180 + lon) / 360, (180 - math.degrees(math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))) / 360


def edges(homes, origin):
    """Roof outlines and corners as line pairs, ready for the GPU: two float64 for the origin, then float32 x, y, z.

    x and y are metres from the origin in the map's own projection, which stretches them a little.
    """
    ox, oy = _mercator(*origin)
    unit = 1 / (2 * math.pi * EARTH_RADIUS_M * math.cos(math.radians(origin[1])))
    points = array("f")
    for home in homes:
        top = home["properties"]["h"] + 0.08
        for rings in home["geometry"]["coordinates"]:
            for ring in rings:
                local = [((x - ox) / unit, (oy - y) / unit) for x, y in (_mercator(*p) for p in ring)]
                for a, b in zip(local, local[1:] + local[:1]):
                    points.extend((a[0], a[1], top, b[0], b[1], top, a[0], a[1], 0, a[0], a[1], top))
    return struct.pack("<2d", *origin) + points.tobytes()


def _write(target, data):
    part = target.with_name(f"{target.name}.{os.getpid()}.part")
    part.write_bytes(data)
    part.replace(target)  # a reader sees the whole file or none


def path(name, kind):
    return BUILT / f"{name}.{kind}"


def built(name):
    return path(name, "edges").exists()


def build(name):
    """Reads a square's raw file once and writes what the API serves. `edges` comes last: it says the square is done."""
    BUILT.mkdir(parents=True, exist_ok=True)
    buildings = _load(name)
    solids = []
    for b in buildings:
        side = lambda polys: [{"ring": _ring(p["ring"], b["floor"]), "holes": [_ring(h, b["floor"]) for h in p["holes"]]} for p in polys]
        surfaces = json.dumps({"roofs": side(b["roofs"]), "walls": side(b["walls"])}, separators=(",", ":"))
        solids.append(f"{b['id']}\t{surfaces}\n")
    homes = _homes(buildings)
    _write(path(name, "solids"), "".join(solids).encode())
    _write(path(name, "homes"), json.dumps({"type": "FeatureCollection", "features": homes}, separators=(",", ":")).encode())
    _write(path(name, "edges"), edges(homes, tuple(outline(name)[0])))


def building(name, building_id):
    """One building of a built square, with its measured surfaces. None if the square has no such building."""
    start = f"{building_id}\t".encode()
    with path(name, "solids").open("rb") as lines:
        for line in lines:
            if line.startswith(start):
                return json.loads(line[len(start):])
    return None
