"""Monument status around a building, from the Bavarian monument office's public map service (BLfD Denkmal-Daten, updated daily).

Only a point's coordinates leave this machine, as with PVGIS. The answer is a hint for the planner, never a ruling: a listed building
or an ensemble needs a permit for solar in Bavaria, and works close to a listed building can need one too, but only the lower
monument authority decides. No entry does not mean no permit is needed."""
import math
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

WMS = "https://geoservices.bayern.de/od/wms/gdi/v1/denkmal"
AGENT = "energy-design-desk-demo"
NEAR_M = 20  # listed buildings this close count as neighbours whose setting may be protected
WINDOW = 0.0002  # degrees each side of the point; with 81 pixels one pixel is about 30 cm, so a hit means the point itself


def _ask(lat, lon, layers):
    """Every feature of the given layers at one point."""
    params = urllib.parse.urlencode({
        "SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetFeatureInfo", "LAYERS": layers, "QUERY_LAYERS": layers, "SRS": "EPSG:4326",
        "BBOX": f"{lon - WINDOW},{lat - WINDOW},{lon + WINDOW},{lat + WINDOW}", "WIDTH": 81, "HEIGHT": 81, "X": 40, "Y": 40,
        "INFO_FORMAT": "application/vnd.ogc.gml", "FEATURE_COUNT": 10})
    request = urllib.request.Request(f"{WMS}?{params}", headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=10) as response:
        root = ET.fromstring(response.read())
    found = []
    for layer in root:
        kind = "ensemble" if layer.tag.startswith("bauensemble") else "listed"
        for feature in layer:
            if not feature.tag.endswith("_feature"):
                continue
            text = {child.tag: (child.text or "").strip() for child in feature}
            found.append({"kind": kind, "id": text.get("aktennummer"), "name": text.get("tradobjbez") or text.get("bezeichnung") or text.get("funktion") or None,
                          "address": text.get("adresse") or None})
    return found


def around(lat, lon):
    """What is listed at the point (a building, an ensemble) and which listed buildings stand within about 20 m.
    An outage gives "unknown" and is not remembered."""
    try:
        return _around(round(lat, 6), round(lon, 6))
    except (OSError, ET.ParseError):
        return {"status": "unknown", "here": [], "near": []}


@lru_cache(maxsize=2048)
def _around(lat, lon):
    dlat = NEAR_M / 111_320
    dlon = NEAR_M / (111_320 * math.cos(math.radians(lat)))
    ring = [(lat + dlat, lon), (lat - dlat, lon), (lat, lon + dlon), (lat, lon - dlon)]
    with ThreadPoolExecutor(5) as pool:
        here = pool.submit(_ask, lat, lon, "einzeldenkmalO,bauensembleO")
        near = [pool.submit(_ask, a, b, "einzeldenkmalO") for a, b in ring]
        here, near = here.result(), [f for job in near for f in job.result()]
    listed = [f for f in here if f["kind"] == "listed"]
    ensemble = [f for f in here if f["kind"] == "ensemble"]
    seen = {f["id"] for f in listed}
    close = list({f["id"]: f for f in near if f["id"] not in seen}.values())
    status = "listed" if listed else "ensemble" if ensemble else "near" if close else "none"
    return {"status": status, "here": listed + ensemble, "near": close}
