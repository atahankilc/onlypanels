"""Addresses in the prototype's region. Only the typed text or a clicked point leaves this machine."""
import json
import urllib.parse
import urllib.request
from functools import lru_cache

AGENT = "energy-design-desk-demo"
PHOTON = "https://photon.komoot.io/api/"  # made for search-as-you-type; Nominatim's rules forbid that
NOMINATIM = "https://nominatim.openstreetmap.org/search"
REVERSE = "https://nominatim.openstreetmap.org/reverse"
REGION = (11.2, 47.95, 11.95, 48.4)  # west, south, east, north. Keep in step with web/src/region.ts


def _get(url, timeout):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": AGENT}), timeout=timeout) as response:
        return json.load(response)


def in_region(lat, lon):
    west, south, east, north = REGION
    return west <= lon <= east and south <= lat <= north


def read_place(row):
    return {"label": row["display_name"], "lat": float(row["lat"]), "lon": float(row["lon"])}


def read_address(row):
    """Street and number, not the shop that happens to be there."""
    a = row.get("address", {})
    street = " ".join(x for x in (a.get("road"), a.get("house_number")) if x)
    town = " ".join(x for x in (a.get("postcode"), a.get("city") or a.get("town") or a.get("village")) if x)
    label = ", ".join(x for x in (street, town) if x)
    return {**read_place(row), "label": label or row["display_name"]}


def read_photon(feature):
    p = feature["properties"]
    street = " ".join(x for x in (p.get("street"), p.get("housenumber")) if x)
    town = " ".join(x for x in (p.get("postcode"), p.get("city") or p.get("county")) if x)
    parts = [p.get("name"), street if street != p.get("name") else None, town]
    lon, lat = feature["geometry"]["coordinates"]
    return {"label": ", ".join(x for x in parts if x), "lat": lat, "lon": lon}


@lru_cache(maxsize=512)
def _suggest(query):
    params = urllib.parse.urlencode({"q": query, "limit": 6, "bbox": ",".join(map(str, REGION))})
    return json.dumps(_get(f"{PHOTON}?{params}", 6)["features"])


@lru_cache(maxsize=256)
def _search(query):
    west, south, east, north = REGION
    params = urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 5, "viewbox": f"{west},{north},{east},{south}", "bounded": 1})
    return json.dumps(_get(f"{NOMINATIM}?{params}", 10))


def suggest(query):
    """Places for a partly typed address, inside the region. Falls back to Nominatim if Photon is down."""
    try:
        places = [read_photon(f) for f in json.loads(_suggest(query.strip()))]
    except (OSError, KeyError, ValueError):
        places = [read_place(r) for r in json.loads(_search(query.strip()))]
    return list({p["label"]: p for p in places if in_region(p["lat"], p["lon"])}.values())


@lru_cache(maxsize=256)
def _reverse(lat, lon):
    params = urllib.parse.urlencode({"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 18, "addressdetails": 1})
    return json.dumps(_get(f"{REVERSE}?{params}", 10))


def reverse(lat, lon):
    """The address at a clicked point."""
    return read_address(json.loads(_reverse(round(lat, 5), round(lon, 5))))
