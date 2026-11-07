"""Local API for the current step: finding a home in Munich."""
from fastapi import FastAPI, HTTPException

from reonic_engine import lod2, site

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


@app.get("/api/site/real")
def site_real(lat: float, lon: float, reach: float = 0):
    return lod2.building_at(lat, lon, reach)
