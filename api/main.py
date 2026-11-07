"""Local API for the current step: finding a home in Munich."""
from fastapi import FastAPI, HTTPException, Path

from reonic_engine import lod2, site

SQUARE = r"^\d{3}_\d{4}$"  # it becomes part of a download address
app = FastAPI(title="Home energy design")


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
    return lod2.squares(west, south, east, north)


@app.get("/api/site/square/{name}")
def site_square(name: str = Path(pattern=SQUARE)):
    try:
        return lod2.footprints(name)
    except OSError:
        raise HTTPException(502, "Building data is not reachable")


@app.get("/api/site/square/{name}/{building}")
def site_building(building: str, name: str = Path(pattern=SQUARE)):
    try:
        found = lod2.building(name, building)
    except OSError:
        raise HTTPException(502, "Building data is not reachable")
    if found is None:
        raise HTTPException(404, "No such building")
    return found
