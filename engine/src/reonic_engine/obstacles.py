"""What sits on a roof that the 3D model does not hold: chimneys, skylights, vents, dormers, solar collectors.

The planner asks for one home. We fetch the public Bavarian aerial photo (DOP 20 cm) of its roofs, tell a vision model
where the roofs are in the picture, and get boxes back in pixels, turned here into lon/lat rings. Nothing about the
customer is sent: only a public photo and the public 3D building outlines. The planner confirms each box; a box that
is wrong is switched off, never trusted blindly. Results are kept per home so a reopened request costs nothing.
"""
import base64
import hashlib
import json
import math
import os
import urllib.request
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

MODEL = "claude-opus-5-5"
M_PER_PX = 0.05  # four times finer than the photo's 20 cm: a house fills a few hundred pixels, so the model sees small things
MARGIN_M = 2.0
MAX_PX = 1400
WMS = ("https://geoservices.bayern.de/od/wms/dop/v1/dop20?service=WMS&version=1.3.0&request=GetMap&layers=by_dop20c&styles="
       "&crs=EPSG:3857&bbox={x0},{y0},{x1},{y1}&width={w}&height={h}&format=image/jpeg")
CACHE = Path(__file__).resolve().parents[3] / "data" / "cache" / "obstacles"  # public photo results only, no project data
R = 6378137.0

PROMPT = """You look at an aerial photo of one home's roofs, for a solar planner. The roofs' outlines are given in pixel
coordinates of this image (x to the right, y down). Find everything ON those roofs that solar modules cannot cover:
chimneys, skylights and roof windows, vents and pipes, dormers, antennas or satellite dishes, existing solar thermal
collectors, roof terraces or railings, ladders or walkways. Ignore trees, shadows, the ground, neighbours' roofs and
anything outside the outlines. Give each as a tight axis-aligned box in pixels around the object itself, without its
shadow. Do not report panels that are already solar PV unless asked; report them as kind "solar". If a roof is clear,
return no boxes. Be precise rather than generous: a false box costs the customer modules."""


class Box(BaseModel):
    kind: Literal["chimney", "skylight", "vent", "dormer", "antenna", "solar", "terrace", "other"]
    x0: int = Field(description="left edge, pixels")
    y0: int = Field(description="top edge, pixels")
    x1: int = Field(description="right edge, pixels")
    y1: int = Field(description="bottom edge, pixels")
    sure: Literal["high", "medium", "low"]
    note: str = Field(description="a few words, e.g. 'brick chimney on the north side'")


class Found(BaseModel):
    boxes: list[Box]


def _merc(lon, lat):
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def _lonlat(x, y):
    return math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)


def find(roofs):
    """roofs: rings of [lon, lat] for one home. Returns {"obstacles": [{kind, ring, sure, note}], "source": ...}."""
    if not roofs:
        return {"obstacles": [], "source": "none"}
    key = hashlib.sha1(json.dumps([[[round(c, 6) for c in p] for p in r] for r in roofs]).encode()).hexdigest()[:16]
    hit = CACHE / f"{key}.json"
    if hit.exists():
        return json.loads(hit.read_text())
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return {"obstacles": [], "source": "unavailable", "reason": "No vision model configured."}

    lat0 = sum(p[1] for r in roofs for p in r) / sum(len(r) for r in roofs)
    scale = 1 / math.cos(math.radians(lat0))  # web mercator metres per ground metre
    pts = [_merc(*p[:2]) for r in roofs for p in r]
    pad = MARGIN_M * scale
    x0, x1 = min(p[0] for p in pts) - pad, max(p[0] for p in pts) + pad
    y0, y1 = min(p[1] for p in pts) - pad, max(p[1] for p in pts) + pad
    px = M_PER_PX * scale
    w, h = min(MAX_PX, max(64, round((x1 - x0) / px))), min(MAX_PX, max(64, round((y1 - y0) / px)))
    url = WMS.format(x0=x0, y0=y0, x1=x1, y1=y1, w=w, h=h)
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "energy-design-desk-demo"}), timeout=20) as r:
        image = r.read()

    to_px = lambda p: (round((p[0] - x0) / (x1 - x0) * w), round((y1 - p[1]) / (y1 - y0) * h))
    outlines = [[to_px(_merc(*p[:2])) for p in r] for r in roofs]
    text = f"Image {w}x{h} pixels, about {M_PER_PX * 100:.0f} cm a pixel. Roof outlines (pixels):\n" + "\n".join(
        f"roof {i + 1}: " + " ".join(f"{x},{y}" for x, y in o) for i, o in enumerate(outlines))

    import anthropic

    response = anthropic.Anthropic(timeout=60, max_retries=1).beta.messages.parse(
        model=MODEL, max_tokens=4096, system=PROMPT, output_format=Found, output_config={"effort": "medium"},
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.standard_b64encode(image).decode()}},
            {"type": "text", "text": text}]}],
        betas=["server-side-fallback-2026-07-01"], fallbacks="default",
    )
    if response.stop_reason != "end_turn" or response.parsed_output is None:
        raise ValueError(f"No usable answer: {response.stop_reason}")

    back = lambda x, y: list(_lonlat(x0 + x / w * (x1 - x0), y1 - y / h * (y1 - y0)))
    out = []
    for b in response.parsed_output.boxes:
        a, c = sorted((max(0, b.x0), min(w, b.x1))), sorted((max(0, b.y0), min(h, b.y1)))
        if a[1] - a[0] < 2 or c[1] - c[0] < 2:
            continue
        ring = [back(a[0], c[0]), back(a[1], c[0]), back(a[1], c[1]), back(a[0], c[1])]
        out.append({"kind": b.kind, "ring": ring, "sure": b.sure, "note": b.note})
    found = {"obstacles": out, "source": "claude", "model": MODEL}
    CACHE.mkdir(parents=True, exist_ok=True)
    hit.write_text(json.dumps(found))
    return found
