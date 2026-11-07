"""Facts about a location from open services: address search, sun, roof tags.

Only the typed address or coordinates leave this machine, never project data.
"""
import json
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

AGENT = "energy-design-desk-demo"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
REVERSE = "https://nominatim.openstreetmap.org/reverse"
PVGIS = "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
SYSTEM_LOSS_PCT = 14  # PVGIS default
COUNTRIES = {"de": "Germany", "at": "Austria", "ch": "Switzerland", "nl": "Netherlands"}
FLAT_SHAPES = {"flat"}


def _get(url, timeout, data=None):
    request = urllib.request.Request(url, data=data, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


@lru_cache(maxsize=256)
def _search(query):
    params = urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 5, "addressdetails": 1})
    return tuple(json.dumps(r) for r in _get(f"{NOMINATIM}?{params}", 10))


def read_place(row):
    address = row.get("address", {})
    return {
        "label": row["display_name"], "lat": float(row["lat"]), "lon": float(row["lon"]),
        "country": COUNTRIES.get(address.get("country_code"), "Other"),
        "bavaria": address.get("state") == "Bayern",
    }


def geocode(query):
    return [read_place(row) for row in map(json.loads, _search(query.strip()))]


@lru_cache(maxsize=256)
def _reverse(lat, lon):
    params = urllib.parse.urlencode({"lat": lat, "lon": lon, "format": "jsonv2", "addressdetails": 1, "zoom": 18})
    return json.dumps(_get(f"{REVERSE}?{params}", 10))


def reverse(lat, lon):
    """The address at a clicked point."""
    return read_place(json.loads(_reverse(round(lat, 5), round(lon, 5))))


def pvgis_aspect(azimuth):
    """Compass bearing (180 = south) to PVGIS aspect (0 = south, -90 = east, 90 = west)."""
    return (azimuth - 180 + 180) % 360 - 180


def read_pvgis(payload):
    totals = payload["outputs"]["totals"]["fixed"]
    return {"kwh_per_kwp": round(totals["E_y"]), "sun_kwh_m2": round(totals["H(i)_y"]),
            "monthly": [round(m["E_m"]) for m in payload["outputs"]["monthly"]["fixed"]]}


@lru_cache(maxsize=512)
def _sun(lat, lon, tilt, azimuth):
    params = urllib.parse.urlencode({
        "lat": lat, "lon": lon, "peakpower": 1, "loss": SYSTEM_LOSS_PCT, "angle": tilt,
        "aspect": pvgis_aspect(azimuth), "outputformat": "json",
    })
    return json.dumps(read_pvgis(_get(f"{PVGIS}?{params}", 20)))


def sun(lat, lon, surfaces):
    """Yearly yield per kWp for each tilt and compass bearing. Terrain horizon is included by PVGIS."""
    keys = [(round(lat, 3), round(lon, 3), round(s["tilt"]), round(s["azimuth"] / 5) * 5 % 360) for s in surfaces]
    with ThreadPoolExecutor(max_workers=6) as pool:
        return [json.loads(r) for r in pool.map(lambda k: _sun(*k), keys)]


def read_overpass(payload):
    tags, trees = {}, 0
    for element in payload.get("elements", []):
        if element.get("type") == "count":
            trees = int(element["tags"].get("nodes", 0))
        elif "roof:shape" in element.get("tags", {}) or "roof:angle" in element.get("tags", {}):
            tags = tags or element["tags"]
    shape = tags.get("roof:shape")
    try:
        angle = float(tags["roof:angle"])
    except (KeyError, ValueError):
        angle = None
    return {"roof": None if shape is None else "flat" if shape in FLAT_SHAPES else "pitched",
            "shape": shape, "tilt": angle, "trees": trees}


def building(lat, lon):
    """Best effort: public Overpass servers are often busy, so an empty answer is normal."""
    query = (f'[out:json][timeout:6];way(around:12,{lat},{lon})["building"];out tags;'
             f'node(around:30,{lat},{lon})["natural"="tree"];out count;')
    data = urllib.parse.urlencode({"data": query}).encode()
    for url in OVERPASS:
        try:
            return read_overpass(_get(url, 8, data))
        except (OSError, ValueError):
            continue
    return {"roof": None, "shape": None, "tilt": None, "trees": None}
