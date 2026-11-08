"""Local API: whole squares of Bavarian building data for the map, and the design engine behind the planner.

A chosen home, a clicked point or a typed address never reaches this server before the homeowner sends: the page works
them out itself (web/src/places.ts, site.worker.ts)."""
import asyncio
import json
from pathlib import Path as FilePath
from concurrent.futures import ProcessPoolExecutor
from functools import lru_cache
from threading import Thread

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Path
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from reonic_engine import battery as batteries, lod2, sun
from reonic_engine.data import load_dataset
from reonic_engine.design import Engine, use_from_payment
from reonic_engine.advise import advise
from reonic_engine.refine import refine

load_dotenv(FilePath(__file__).resolve().parent.parent / ".env")  # ANTHROPIC_API_KEY for the planner's sentences; without it, rules
SQUARE = r"^\d{3}_\d{4}$"  # it becomes part of a download address
app = FastAPI(title="Home energy design")
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=5)  # a square's measured roofs shrink from ~19 MB to ~2 MB
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
    # What the customer can tell about the car beyond its driving: charged at home a month (wallbox), how much is charged at home,
    # whether it stands at home in the day, and a wallbox already there.
    ev_kwh_month: float | None = None
    # More the homeowner can tell: where the yearly use came from, the monthly payment, big electric users, the house, the roof, the priority.
    demand_source: str | None = None  # bill, range, people, unknown
    monthly_eur: float | None = None
    big_users: list[str] | None = None  # pool, sauna, ac, water
    living_m2: float | None = None
    living_from_model: bool | None = None  # the area is the 3D model's estimate, not the customer's
    cert_kwh_m2: float | None = None  # from the energy certificate, heat a year per m²
    built: str | None = None  # before1979, 1979to1990, 1991to2000, 2001to2010, since2011 (the census classes)
    area_built: str | None = None  # the most common build period around the address, from the 2022 census
    area_built_share: float | None = None
    trees: bool | None = None
    roof_renovation: str | None = None  # yes, no, unsure
    goal: str | None = None  # cost, independence, environment
    ev_charge_home: str | None = None  # most, half, little
    ev_day: bool | None = None
    home_day: str | None = None  # someone home in the day on weekdays: most, some, rarely
    has_wallbox: bool | None = None
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
    if not i["demand_kwh"] and i.get("monthly_eur"):
        i["demand_kwh"], i["demand_source"] = use_from_payment(i["monthly_eur"], i["price_ct_kwh"]), "payment"
    i["demand_kwh"] = i["demand_kwh"] or TYPICAL_USE_KWH
    o = req.overrides.model_dump()
    d = engine().design(i, o)
    return {**d, "alternatives": engine().alternatives(i, o, d), "battery_curve": batteries.curve(i, d), "assumed": assumed}


@app.post("/api/advise")
def advise_design(req: DesignRequest):
    """The advisor on the planner's current design: a pick among the engine's options, why, and what to ask first."""
    d = design(req)
    return advise({**req.inputs.model_dump(), "demand_kwh": req.inputs.demand_kwh or d["energy"]["base_mwh"] * 1000}, d)


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


@app.get("/api/site/homes/{name}")
async def site_homes(name: str = Path(pattern=SQUARE)):
    await built(name)
    return FileResponse(lod2.path(name, "homes"), media_type="application/geo+json")


@app.get("/api/site/edges/{name}")
async def site_edges(name: str = Path(pattern=SQUARE)):
    await built(name)
    return FileResponse(lod2.path(name, "edges"), media_type="application/octet-stream")


@app.get("/api/site/solids/{name}")
async def site_solids(name: str = Path(pattern=SQUARE)):
    """Every building of a square with its measured roofs and walls, one per line: what the map draws once it has the blocks."""
    await built(name)
    return FileResponse(lod2.path(name, "solids"), media_type="text/plain")
