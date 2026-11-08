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
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from reonic_engine import battery as batteries, lod2, sun
from reonic_engine.data import load_dataset
from reonic_engine.design import Engine, use_from_payment
from reonic_engine.advise import advise
from reonic_engine.agent import agent_events, run_agent
from reonic_engine import casework, obstacles
from reonic_engine import costs, pricebook
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
    # Where the modules go and the usable area there. With measured surfaces those decide; without (the home was not shared,
    # or the planner said "only 18 fit" or "use the garden"), the area limits the size.
    mount: str = "roof"
    area_m2: float | None = Field(None, ge=0, le=10_000)
    # A roof known only by its main side's direction (compass degrees, 180 south) and slope, when the home was not shared.
    roof_azimuth: float | None = None
    roof_tilt: float | None = None
    demand_kwh: float | None = Field(None, ge=0, le=100_000)
    price_ct_kwh: float = Field(32, ge=5, le=80)
    heating: str | None = None
    heat_kwh: float | None = None
    hp_kwh: float | None = None  # what a heat pump already there uses a year, usually on its own meter
    has_solar: bool | None = False
    has_storage: bool | None = False
    ev: bool | None = False
    ev_km: float = Field(15000, ge=0, le=200_000)
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
    ev_when: str | None = None  # a car that is planned: soon (within a year) or later
    # How the home is heated and who decides: these move the heat pump's efficiency, the battery and the conditions (derive.py).
    heat_dist: str | None = None  # floor, radiators, both
    boiler_age: str | None = None  # under10, 10to20, over20
    gas_eur: float | None = None  # gas a year in euros, already turned into heat_kwh by the page
    solar_thermal: bool | None = None  # hot water collectors on the roof
    backup: bool | None = None  # power in an outage wanted
    owner: str | None = None  # sole, shared, tenant
    electric_heat_meter: str | None = None  # electric heating on its own meter or the house's: own, house
    wants_hp: bool | None = None  # the customer's own answer; the choice itself arrives as overrides.heatpump
    demand_assumed: bool | None = None  # set here when nobody gave the yearly use
    area_unknown: bool | None = None  # set here for a roof told by direction only
    roof_told: bool | None = None  # set here when the one surface comes from the customer's words or rounded numbers, not a measurement
    oil_l: float | None = None  # oil a year in litres, already turned into heat_kwh by the page; kept for the planner
    use_range: list[float | None] | None = None  # the homeowner's own from–to, when the use was given as a range
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


def prepared(req: DesignRequest):
    """The request's facts as the engine takes them: stand-ins for what is missing, a described roof as one surface."""
    i = req.inputs.model_dump()
    assumed = [] if i["demand_kwh"] else ["demand_kwh"]
    if not i["demand_kwh"] and i.get("monthly_eur"):
        i["demand_kwh"], i["demand_source"] = use_from_payment(i["monthly_eur"], i["price_ct_kwh"]), "payment"
    i["demand_assumed"] = not i["demand_kwh"]
    i["demand_kwh"] = i["demand_kwh"] or TYPICAL_USE_KWH
    if not i.get("surfaces") and i.get("roof_tilt") is not None and i.get("roof_azimuth") is not None:
        # Only the roof's direction and slope: one surface of that area with the region's PVGIS yield, so the yield and
        # the hours of the day follow the direction. No shade is known.
        found = sun.typical_yield(i["roof_tilt"], i["roof_azimuth"])
        if found:
            i["surfaces"] = [{"kind": "roof", "max_modules": int(i["area_m2"] // 2) if i.get("area_m2") else 1000, "kwh_per_kwp": round(found),
                              "tilt": i["roof_tilt"], "azimuth": i["roof_azimuth"]}]
            i["roof_told"] = True
            i["area_unknown"] = not i.get("area_m2")  # direction and slope told, size not: the yield counts, nothing limits
    return i, assumed


@app.post("/api/design")
def design(req: DesignRequest):
    """The planner's design. Homeowner answers may be missing; what stood in for them is listed in the answer."""
    i, assumed = prepared(req)
    o = req.overrides.model_dump()
    d = engine().design(i, o)
    return {**d, "alternatives": engine().alternatives(i, o, d), "battery_curve": batteries.curve(i, d), "assumed": assumed}


@app.post("/api/review")
def review_request(req: DesignRequest):
    """The planner's review, by fixed rules over the engine: what follows from the answers, which unsure answers move the
    design, and one change that fits the customer. No language model; the same request always gives the same review."""
    as_request = lambda inputs, overrides: DesignRequest(inputs=Inputs(**inputs), overrides=Overrides(**overrides))
    full = lambda inputs, overrides: design(as_request(inputs, overrides))
    quick = lambda inputs, overrides: engine().design(prepared(as_request(inputs, overrides))[0], overrides)
    return casework.review(full, prepared(req)[0], req.overrides.model_dump(), quick)  # with a payment already turned into kWh


class ObstaclesRequest(BaseModel):
    roofs: list[list[list[float]]]  # one home's roof rings, [lon, lat] points


@app.post("/api/obstacles")
async def roof_obstacles(req: ObstaclesRequest):
    """What sits on the roofs that the 3D model lacks, found on the public aerial photo. For the planner to confirm."""
    try:
        return await asyncio.to_thread(obstacles.find, req.roofs)
    except Exception as e:  # the demo must survive a failed look
        return {"obstacles": [], "source": "failed", "reason": str(e)[:200]}


@app.post("/api/advise")
def advise_design(req: DesignRequest):
    """The advisor on the planner's current design: a pick among the engine's options, why, and what to ask first."""
    d = design(req)
    return advise({**req.inputs.model_dump(), "demand_kwh": req.inputs.demand_kwh or d["energy"]["base_mwh"] * 1000}, d)


class AgentRequest(DesignRequest):
    message: str | None = None  # the planner's question or instruction; none for the first review
    history: list[dict] = []  # earlier exchanges as {role: "planner" | "agent", text}


@app.post("/api/agent")
def agent(req: AgentRequest):
    """The planner's agent: runs the engine on the variants that matter, then proposes a change, with every number from the engine."""
    run = lambda inputs, overrides: design(DesignRequest(inputs=Inputs(**inputs), overrides=Overrides(**overrides)))
    return run_agent(run, req.inputs.model_dump(), req.overrides.model_dump(), req.message, req.history[-12:])


@app.post("/api/agent/stream")
def agent_stream(req: AgentRequest):
    """The same run as server-sent events: one "step" per engine run as it happens, then "done" with the answer."""
    run = lambda inputs, overrides: design(DesignRequest(inputs=Inputs(**inputs), overrides=Overrides(**overrides)))
    events = agent_events(run, req.inputs.model_dump(), req.overrides.model_dump(), req.message, req.history[-12:])
    body = (f"event: {kind}\ndata: {json.dumps(value, ensure_ascii=False)}\n\n" for kind, value in events)
    return StreamingResponse(body, media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


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


TREES = FilePath(__file__).resolve().parents[1] / "data" / "external" / "trees" / "squares"


@app.get("/api/site/trees/{name}")
def site_trees(name: str = Path(pattern=SQUARE)):
    """Bavaria's single trees in one whole 2 km square (scripts/build_trees.py): east, north, height in decimetres from its corner.
    The planner's shade check uses it once a request has arrived. A square with no file has no trees we know of."""
    found = TREES / f"{name}.json"
    return FileResponse(found, media_type="application/json") if found.exists() else []


# Money: the price book the planner keeps, and what a design costs and pays back (pricebook.py, costs.py).
class Money(BaseModel):
    extras: dict[str, bool] = {}  # optional extras the planner ticked or unticked for this home
    qty: dict[str, float] = {}  # quantities the planner set for this home (metres of cable, radiators)
    income: str | None = None  # taxable household income band for the KfW income bonus: le30, le40, le50, le60, above
    kids: bool = False  # a child under 18 in the household (moves the income bonus)


class CostRequest(DesignRequest):
    money: Money = Money()


class PriceItem(BaseModel):
    name: str | None = None
    tech: str | None = None
    kind: str | None = None
    unit: str | None = None
    when: str | None = None
    fixed: float | None = Field(None, ge=-100_000, le=100_000)  # negative for a discount or a local grant
    per_unit: float | None = Field(None, ge=-100_000, le=100_000)
    qty: float | None = Field(None, ge=0, le=1000)
    vat: float | None = Field(None, ge=0, le=25)


@app.get("/api/prices")
def prices(installer: str | None = None):
    return pricebook.book(installer)


@app.put("/api/prices/rates")
def prices_rates(values: dict[str, float]):
    pricebook.set_rates(values)
    return pricebook.book()


@app.delete("/api/prices/rates")
def prices_rates_reset():
    pricebook.reset_rates()
    return pricebook.book()


@app.post("/api/prices")
def prices_add(item: PriceItem):
    try:
        pricebook.add_item(item.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e))
    return pricebook.book()


@app.put("/api/prices/{item_id}")
def prices_set(item_id: str, item: PriceItem):
    try:
        pricebook.set_item(item_id, item.model_dump())
    except KeyError:
        raise HTTPException(404, "No such item")
    return pricebook.book()


@app.delete("/api/prices/{item_id}")
def prices_reset(item_id: str):
    pricebook.reset_item(item_id)
    return pricebook.book()


@app.post("/api/costs")
def cost_view(req: CostRequest):
    """What the design costs the homeowner, the KfW grant, the yearly money before and after, and when it pays back.
    With it, what each battery size and the heat pump add on their own, and the engine's variants in money. Prices from
    the planner's price book; kWh from the same hourly estimate as the design. No language model."""
    i, _ = prepared(req)
    o = req.overrides.model_dump()
    m = req.money
    b = pricebook.book(i.get("installer"))
    d = engine().design(i, o)
    money = costs.evaluate(i, d, b, m.extras, m.qty, m.income, m.kids)
    options = costs.battery_options(i, d, batteries.curve(i, d), b) if d["pv"]["modules"] and not i.get("has_storage") else []
    heat = None
    if d["heatpump"]["included"]:
        heat = costs.heat_pump_money(i, d, engine().design(i, {**o, "heatpump": False}), b, m.extras, m.qty, m.income, m.kids)
    variants = [{"id": a["id"], "title": a["title"], "overrides": a["overrides"],
                 **costs.summary(costs.evaluate(i, engine().design(i, {**o, **a["overrides"]}), b, m.extras, m.qty, m.income, m.kids))}
                for a in engine().alternatives(i, o, d)]
    return {**money, "battery_options": options, "heatpump_money": heat, "variants": variants,
            "notes": costs.notes(i, d, money, options, heat), "design": {"kwp": d["pv"]["kwp"], "modules": d["pv"]["modules"], "battery_kwh": d["battery"]["kwh"]}}
