"""Local API over the engine. Trains on the dev split at startup; test projects stay unseen."""
import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from reonic_engine.data import load_dataset
from reonic_engine.design import Engine
from reonic_engine.refine import refine

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
SCORES = Path(__file__).resolve().parents[1] / "data" / "processed" / "scores.json"
LABELS = {"2a8ba8e2": "A", "23c108b7": "B"}

projects, options = load_dataset()
dev = projects[projects.split == "dev"].reset_index(drop=True)
unseen = projects[projects.split == "test"].reset_index(drop=True)
engine = Engine().fit(dev, options[options.project_id.isin(dev.project_id)])
app = FastAPI(title="Home energy design")


class Inputs(BaseModel):
    installer: str = "2a8ba8e2"
    country: str = "Germany"
    demand_kwh: float
    price_ct_kwh: float = 32
    heating: str | None = None
    heat_kwh: float | None = None
    has_solar: bool = False
    has_storage: bool = False
    ev: bool = False
    ev_km: float = 15000
    mount: str = "roof"
    area_m2: float | None = None


class Overrides(BaseModel):
    modules: int | None = None
    battery_kwh: float | None = None
    wallbox: bool | None = None
    heatpump: bool | None = None


class DesignRequest(BaseModel):
    inputs: Inputs
    overrides: Overrides = Overrides()


def project_inputs(p):
    nan = lambda v: None if v != v else v
    heat = nan(p.heat_mwh)
    return Inputs(
        installer=p.installer, country=p.country if p.country == "Germany" else "Other",
        demand_kwh=nan(p.demand_mwh) * 1000 if nan(p.demand_mwh) else 4500,
        price_ct_kwh=round(nan(p.price_ct_kwh) or 32, 1), heating=nan(p.heating_existing_type),
        heat_kwh=heat * 1000 if heat else None, has_solar=bool(p.has_solar), has_storage=bool(p.has_storage),
    )


def expert_options(pid):
    rows = options[options.project_id == pid].sort_values("option_number")
    return [{"modules": int(r.modules), "kwp": round(float(r.kwp), 1), "battery_kwh": float(r.battery_kwh),
             "wallbox": bool(r.has_wallbox), "hp_kw": float(r.hp_kw)} for r in rows.itertuples()]


@app.post("/api/design")
def design(req: DesignRequest):
    return engine.design(req.inputs.model_dump(), req.overrides.model_dump())


class RefineRequest(BaseModel):
    text: str
    mount: str = "roof"


@app.post("/api/refine")
def refine_text(req: RefineRequest):
    return refine(req.text, req.mount)


@app.get("/api/projects")
def list_projects():
    rows = unseen.sort_values("demand_mwh")
    return [{"id": r.project_id, "installer": LABELS[r.installer], "demand_mwh": None if r.demand_mwh != r.demand_mwh else round(r.demand_mwh, 1),
             "heating": None if r.heating_existing_type != r.heating_existing_type else r.heating_existing_type,
             "options": int((options.project_id == r.project_id).sum())} for r in rows.itertuples()]


@app.get("/api/projects/{pid}")
def get_project(pid: str):
    match = unseen[unseen.project_id == pid]
    if match.empty:
        raise HTTPException(404, "Only held-out projects can be compared")
    p = match.iloc[0]
    inputs = project_inputs(p)
    return {"inputs": inputs, "design": engine.design(inputs.model_dump()), "expert": expert_options(pid)}


@app.get("/api/scores")
def scores():
    if not SCORES.exists():
        raise HTTPException(404, "Run scripts/evaluate.py first")
    return json.loads(SCORES.read_text())
