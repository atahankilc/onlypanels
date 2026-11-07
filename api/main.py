"""Local API: finding a home in Munich, and the design engine behind the planner."""
import asyncio
import json
from pathlib import Path as FilePath
from concurrent.futures import ProcessPoolExecutor
from functools import lru_cache
from threading import Thread

from fastapi import FastAPI, HTTPException, Path
from fastapi.responses import FileResponse
from pydantic import BaseModel

from reonic_engine import battery as batteries, lod2, site, sun
from reonic_engine.data import load_dataset
from reonic_engine.design import Engine
from reonic_engine.refine import refine

SQUARE = r"^\d{3}_\d{4}$"  # it becomes part of a download address
app = FastAPI(title="Home energy design")
builders = ProcessPoolExecutor(max_workers=3)  # reading a raw square takes seconds: never in the API's own process
building_now: dict[str, asyncio.Future] = {}
TYPICAL_USE_KWH = 4000  # stands in when nobody knows the yearly use, and the answer says so


@lru_cache(maxsize=1)
def engine():
    """Learns from the dev split only, once. The test split stays unseen. Never at import: the builder processes import this file too."""
    projects, options = load_dataset()
    dev = projects[projects.split == "dev"].reset_index(drop=True)
    return Engine().fit(dev, options[options.project_id.isin(dev.project_id)])


@app.on_event("startup")
def warm_up():
    Thread(target=engine, daemon=True).start()


class Surface(BaseModel):
    kind: str = "roof"
    max_modules: int  # from the layout fitted to the measured surface
    kwh_per_kwp: float | None = None
    tilt: float | None = None  # degrees, for the hourly sun
    azimuth: float | None = None  # compass degrees, 180 is south


class Inputs(BaseModel):
    installer: str = "2a8ba8e2"
    country: str = "Germany"
    demand_kwh: float | None = None
    price_ct_kwh: float = 32
    heating: str | None = None
    heat_kwh: float | None = None
    hp_kwh: float | None = None  # what a heat pump already there uses a year, usually on its own meter
    has_solar: bool | None = False
    has_storage: bool | None = False
    ev: bool | None = False
    ev_km: float = 15000
    surfaces: list[Surface] | None = None
    # Solar already on the building: size and year if the customer knows them, else the area they marked, and its sun.
    existing_kwp: float | None = None
    existing_year: int | None = None
    existing_m2: float | None = None
    existing_kwh_per_kwp: float | None = None
    existing_battery_kwh: float | None = None


class Overrides(BaseModel):
    modules: int | None = None
    battery_kwh: float | None = None
    wallbox: bool | None = None
    heatpump: bool | None = None


class DesignRequest(BaseModel):
    inputs: Inputs
    overrides: Overrides = Overrides()


class RefineRequest(BaseModel):
    text: str
    mount: str = "roof"


@app.post("/api/design")
def design(req: DesignRequest):
    """The planner's design. Homeowner answers may be missing; what stood in for them is listed in the answer."""
    i = req.inputs.model_dump()
    assumed = [] if i["demand_kwh"] else ["demand_kwh"]
    i["demand_kwh"] = i["demand_kwh"] or TYPICAL_USE_KWH
    o = req.overrides.model_dump()
    d = engine().design(i, o)
    return {**d, "alternatives": engine().alternatives(i, o, d), "battery_curve": batteries.curve(i, d), "assumed": assumed}


@app.get("/api/scores")
def scores():
    """Overall results on past projects, from scripts/evaluate.py: totals only."""
    found = FilePath(__file__).resolve().parents[1] / "data" / "processed" / "scores.json"
    if not found.exists():
        raise HTTPException(404, "Run scripts/evaluate.py first")
    return json.loads(found.read_text())


@app.get("/api/proof")
def proof():
    """Past projects, each predicted by an engine trained without it, next to the expert's design. Local data only."""
    found = FilePath(__file__).resolve().parents[1] / "data" / "processed" / "proof.json"
    if not found.exists():
        raise HTTPException(404, "Run scripts/build_proof.py first")
    return FileResponse(found, media_type="application/json")


@app.post("/api/refine")
def refine_text(req: RefineRequest):
    return refine(req.text, req.mount)


async def built(name: str):
    """Waits for a square's files. Requests for one square share one job, which outlives a request that gave up."""
    if lod2.built(name):
        return
    job = building_now.get(name)
    if job is None:
        job = building_now[name] = asyncio.get_running_loop().run_in_executor(builders, lod2.build, name)
        job.add_done_callback(lambda _: building_now.pop(name, None))
    try:
        await asyncio.shield(job)
    except OSError:
        raise HTTPException(502, "Building data is not reachable")


@app.get("/api/site/search")
def site_search(q: str):
    try:
        return site.suggest(q)
    except OSError:
        raise HTTPException(502, "Address search is not reachable")


@app.get("/api/site/reverse")
def site_reverse(lat: float, lon: float):
    try:
        return site.reverse(lat, lon)
    except (OSError, KeyError, ValueError):
        raise HTTPException(502, "Address search is not reachable")


@app.get("/api/site/squares")
def site_squares(west: float, south: float, east: float, north: float):
    return [{"name": n, "ring": lod2.outline(n)} for n in lod2.squares(west, south, east, north)]


@app.get("/api/site/homes/{name}")
async def site_homes(name: str = Path(pattern=SQUARE)):
    await built(name)
    return FileResponse(lod2.path(name, "homes"), media_type="application/geo+json")


@app.get("/api/site/home/{name}/{home}")
async def site_home(home: str, name: str = Path(pattern=SQUARE)):
    """Every building of one home."""
    await built(name)
    return lod2.parts(name, home)


@app.get("/api/site/edges/{name}")
async def site_edges(name: str = Path(pattern=SQUARE)):
    await built(name)
    return FileResponse(lod2.path(name, "edges"), media_type="application/octet-stream")


@app.get("/api/site/sun/{name}/{building}")
async def site_sun(building: str, name: str = Path(pattern=SQUARE)):
    await built(name)
    found = await asyncio.to_thread(sun.surfaces, name, building)
    if found is None:
        raise HTTPException(404, "No such building")
    return found


@app.get("/api/site/square/{name}/{building}")
async def site_building(building: str, name: str = Path(pattern=SQUARE)):
    await built(name)
    found = await asyncio.to_thread(lod2.building, name, building)
    if found is None:
        raise HTTPException(404, "No such building")
    return found
