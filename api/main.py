"""Local API: finding a home in Munich, and the design engine behind both screens."""
import asyncio
import json
from pathlib import Path as FilePath
from concurrent.futures import ProcessPoolExecutor
from functools import lru_cache
from threading import Thread

from fastapi import FastAPI, HTTPException, Path
from fastapi.responses import FileResponse
from pydantic import BaseModel

from reonic_engine import lod2, site, sun
from reonic_engine.data import ASSUMED_KWP_PER_MODULE, load_dataset
from reonic_engine.design import Engine, rough
from reonic_engine.refine import refine

SQUARE = r"^\d{3}_\d{4}$"  # it becomes part of a download address
app = FastAPI(title="Home energy design")
builders = ProcessPoolExecutor(max_workers=3)  # reading a raw square takes seconds: never in the API's own process
building_now: dict[str, asyncio.Future] = {}
TYPICAL_KM = 11300  # a yearly distance, used only when a car is named and the distance is skipped
TYPICAL_USE_KWH = 4000  # stands in when nobody knows the yearly use, and the answer says so
M2_PER_KWP = 6  # of whole roof, the middle of consumer guidance's 5 to 7, when no real layout has been fitted yet


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
    max_modules: int | None = None  # from a fitted layout
    m2: float | None = None  # otherwise from the area
    kwh_per_kwp: float | None = None


class Inputs(BaseModel):
    installer: str = "2a8ba8e2"
    country: str = "Germany"
    demand_kwh: float | None = None
    price_ct_kwh: float = 32
    heating: str | None = None
    heat_kwh: float | None = None
    has_solar: bool | None = False
    has_storage: bool | None = False
    ev: bool | None = False
    ev_km: float = 15000
    surfaces: list[Surface] | None = None


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


def fitted(s: Surface):
    modules = s.max_modules if s.max_modules is not None else int((s.m2 or 0) / (M2_PER_KWP * ASSUMED_KWP_PER_MODULE))
    return {"kind": s.kind, "max_modules": modules, "kwh_per_kwp": s.kwh_per_kwp}


@app.post("/api/design")
def design(req: DesignRequest):
    """Answers may be missing: optional means optional. What stood in for them is listed in the answer."""
    i = req.inputs.model_dump()
    assumed = [] if i["demand_kwh"] else ["demand_kwh"]
    i["demand_kwh"] = i["demand_kwh"] or TYPICAL_USE_KWH
    i["surfaces"] = [fitted(s) for s in req.inputs.surfaces] if req.inputs.surfaces else None
    return {**engine().design(i, req.overrides.model_dump()), "assumed": assumed}


class Answers(BaseModel):
    """The homeowner's pages. None means skipped."""
    demand_kwh: float | None = None
    price_ct_kwh: float | None = None
    has_solar: bool | None = None
    has_storage: bool | None = None
    heating: str | None = None
    heat_kwh: float | None = None
    wants_hp: bool | None = None
    ev: bool | None = None
    ev_planned: bool | None = None
    ev_km: float | None = None


class DraftRequest(BaseModel):
    answers: Answers
    surfaces: list[Surface] = []


@app.post("/api/draft")
def draft(req: DraftRequest):
    """A rough first look for the homeowner. A heat pump counts only if they want one. `assumed` names what stood in for a skipped answer."""
    a, car = req.answers, bool(req.answers.ev or req.answers.ev_planned)
    fossil_or_unknown = a.heating != "Heatpump"
    assumed = [k for k, missing in {"demand_kwh": not a.demand_kwh, "price_ct_kwh": a.price_ct_kwh is None, "ev_km": car and a.ev_km is None,
                                    "heat_kwh": bool(a.wants_hp) and fossil_or_unknown and not a.heat_kwh}.items() if missing]
    i = {"installer": Inputs().installer, "country": "Germany", "demand_kwh": a.demand_kwh or TYPICAL_USE_KWH, "price_ct_kwh": 32 if a.price_ct_kwh is None else a.price_ct_kwh,
         "heating": a.heating, "heat_kwh": a.heat_kwh, "has_solar": bool(a.has_solar), "has_storage": bool(a.has_storage), "ev": car,
         "ev_km": TYPICAL_KM if a.ev_km is None else a.ev_km, "surfaces": [fitted(s) for s in req.surfaces] or None}
    return {**rough(engine().design(i, {"heatpump": a.wants_hp is True})), "assumed": assumed}


@app.get("/api/scores")
def scores():
    """Overall results on past projects, from scripts/evaluate.py: totals only."""
    found = FilePath(__file__).resolve().parents[1] / "data" / "processed" / "scores.json"
    if not found.exists():
        raise HTTPException(404, "Run scripts/evaluate.py first")
    return json.loads(found.read_text())


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
