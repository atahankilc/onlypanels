"""Load the raw export and rebuild designs from line items.

Traps handled here are documented in docs/data/findings.md.
"""
from hashlib import sha256
from pathlib import Path

import numpy as np
import pandas as pd

RAW = Path(__file__).resolve().parents[3] / "data" / "raw"
INSTALLERS = ["2a8ba8e2", "23c108b7"]
ASSUMED_KWP_PER_MODULE = 0.45  # median module_watt_peak where Module rows exist
TEST_SHARE = 0.2
MAX_BATTERY_KWH = 50  # above this the project looks commercial
MAX_KWP = 40


def load_raw(raw=RAW):
    status = pd.concat(
        [pd.read_csv(raw / i / "projects_status_quo.csv").assign(installer=i) for i in INSTALLERS],
        ignore_index=True,
    )
    parts = pd.concat(
        [pd.read_csv(raw / i / "project_options_parts.csv").assign(installer=i) for i in INSTALLERS],
        ignore_index=True,
    )
    return status, parts


def build_options(parts):
    """One row per option, in kW, kWh and kWp."""
    p = parts
    name = p.component_name
    o = p.groupby("option_id").agg(
        project_id=("project_id", "first"),
        installer=("installer", "first"),
        option_number=("option_number", "first"),
    )

    def qty(mask):
        return p[mask].groupby("option_id").quantity.sum()

    counts = pd.DataFrame({
        "module": qty(p.component_type == "Module"),
        "dc": qty(name.str.startswith("DC Install")),
        "sub": qty(name.str.startswith("Substructure") & (p.quantity > 1)),
        "roof": qty(name.str.match(r"Roof Mounting (up to|\d|over)")),
    }).reindex(o.index).fillna(0)
    o["modules"] = counts.max(axis=1)

    mod = p[p.component_type == "Module"]
    exact = (mod.quantity * mod.module_watt_peak / 1000).groupby(mod.option_id).sum()
    pkg = p[name.str.contains("Complete Package")]
    package = pkg.component_name.str.extract(r"([\d.]+)\s?kWp?\b")[0].astype(float).groupby(pkg.option_id).max()
    o["kwp"] = exact.reindex(o.index).fillna(package.reindex(o.index)).fillna(o.modules * ASSUMED_KWP_PER_MODULE)

    # The export swaps these columns: inverter_power_kw holds battery Wh.
    bat = p[(p.component_type == "BatteryStorage") & ~name.str.contains("AC Coupling")]
    o["battery_kwh"] = (bat.inverter_power_kw * bat.quantity / 1000).groupby(bat.option_id).sum()
    o["wallboxes"] = qty(p.component_type == "Wallbox")
    hp = p[p.component_type == "Heatpump"]
    o["hp_kw"] = hp.heatpump_nominal_power_kw.groupby(hp.option_id).sum() / 1000
    o["is_extension"] = qty(name.str.contains("Extension")).reindex(o.index).notna()
    o = o.fillna({"battery_kwh": 0, "wallboxes": 0, "hp_kw": 0})

    o["has_pv"] = o.kwp > 0
    o["has_battery"] = o.battery_kwh > 0
    o["has_wallbox"] = o.wallboxes > 0
    o["has_hp"] = o.hp_kw > 0
    return o.reset_index()


def design_options(options):
    """Options that are real new designs: PV or heat pump, not an add-on, not commercial."""
    keep = (options.has_pv | options.has_hp) & ~options.is_extension
    keep &= (options.battery_kwh <= MAX_BATTERY_KWH) & (options.kwp <= MAX_KWP)
    return options[keep].copy()


def clean_status(status):
    """Unit fixes and invalid values to NaN. Only uses fields available at design time."""
    s = status.copy()
    s["demand_mwh"] = (s.energy_demand_wh / 1e6).where(s.energy_demand_wh >= 1e6)
    price = s.energy_price_per_wh.where(s.energy_price_per_wh < 1e-3, s.energy_price_per_wh / 1000)
    s["price_ct_kwh"] = (price * 1e5).where(price >= 1e-4)
    s["heat_mwh"] = (s.heating_existing_heating_demand_wh / 1e6).where(s.heating_existing_heating_demand_wh > 0)
    return s


def split_of(customer_id):
    """Stable, shared by everyone: hashing needs no stored split file."""
    bucket = int(sha256(customer_id.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return "test" if bucket < TEST_SHARE else "dev"


def load_dataset():
    """Returns (projects, options): one row per design project, and its design options."""
    status, parts = load_raw()
    options = design_options(build_options(parts))
    # The input flag means "already owns one"; has_wallbox below is the sold design.
    projects = clean_status(status).rename(columns={"has_wallbox": "existing_wallbox"})
    projects = projects[projects.project_id.isin(options.project_id)].reset_index(drop=True)
    projects["split"] = projects.customer_contact_id.map(split_of)
    last = options.sort_values("option_number").groupby("project_id").tail(1)
    cols = ["project_id", "kwp", "modules", "battery_kwh", "has_pv", "has_battery", "has_wallbox", "has_hp", "hp_kw"]
    projects = projects.merge(last[cols], on="project_id")
    return projects, options[options.project_id.isin(projects.project_id)].reset_index(drop=True)


def battery_catalog(options, min_count=5):
    """Sizes an installer really sells, from training options only."""
    b = options[options.has_battery]
    counts = b.groupby(["installer", b.battery_kwh.round(1)]).size()
    return {i: np.array(sorted(c[c >= min_count].index.get_level_values(1))) for i, c in counts.groupby(level=0)}
