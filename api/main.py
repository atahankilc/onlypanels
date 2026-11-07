"""Local API for the current step: finding a home in Munich."""
import asyncio
from concurrent.futures import ProcessPoolExecutor

from fastapi import FastAPI, HTTPException, Path
from fastapi.responses import FileResponse

from reonic_engine import lod2, site, sun

SQUARE = r"^\d{3}_\d{4}$"  # it becomes part of a download address
app = FastAPI(title="Home energy design")
builders = ProcessPoolExecutor(max_workers=3)  # reading a raw square takes seconds: never in the API's own process
building_now: dict[str, asyncio.Future] = {}


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
