"""Prepare the planner's Proof page: every dev project predicted by an engine trained without it, next to what the expert sold.

Writes data/processed/proof.json, which is local only and gitignored: it holds per-project values.
No project or customer IDs go into it; projects are numbered.

Run from the repo root:  uv run python scripts/build_proof.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

from reonic_engine.data import ASSUMED_KWP_PER_MODULE, INSTALLERS, load_dataset, split_of
from reonic_engine.design import Engine, engine_predictor, reaction_checks
from reonic_engine.evaluate import closest_option, cross_validate, score
from reonic_engine.models import installer_mode, median_design

NAME = {INSTALLERS[0]: "A", INSTALLERS[1]: "B"}
OUT = Path(__file__).resolve().parents[1] / "data" / "processed" / "proof.json"


def spread(options, projects):
    """How far apart one expert's own options for the same home are: first against last option, all multi-option homes."""
    o = options[options.project_id.isin(projects.project_id)].sort_values("option_number")
    g = o.groupby("project_id").filter(lambda x: len(x) > 1).groupby("project_id")
    first, last = g.head(1).set_index("project_id"), g.tail(1).set_index("project_id")
    both = first.has_battery & last.has_battery
    return {
        "homes": int(len(first)),
        "kwp_gap": float((first.kwp - last.kwp).abs().mean()),
        "battery_same": float(((first.battery_kwh - last.battery_kwh).abs() < 0.51)[both].mean()),
        "battery_gap": float((first.battery_kwh - last.battery_kwh).abs()[both].mean()),
    }


def main():
    projects, options = load_dataset()
    dev = projects[projects.split == "dev"].reset_index(drop=True)
    ours = cross_validate(engine_predictor, dev, options)
    baselines = {"typical": cross_validate(median_design, dev, options), "habit": cross_validate(installer_mode, dev, options)}

    summary = {}
    for i in INSTALLERS:
        d = dev[dev.installer == i]
        part = lambda p: score(p[p.project_id.isin(d.project_id)], d, options)
        e, t, h = part(ours), part(baselines["typical"]), part(baselines["habit"])
        summary[NAME[i]] = {
            "projects": int(len(d)),
            "kwp_gap": {"engine": e["kwp_mae_closest"], "typical": t["kwp_mae_closest"]},
            "kwp_within20": {"engine": e["kwp_within20"], "typical": t["kwp_within20"]},
            "battery_same": {"engine": e["batt_exact_closest"], "typical": t["batt_exact_closest"], "habit": h["batt_exact_closest"]},
            "battery_gap": {"engine": e["batt_mae_closest"], "typical": t["batt_mae_closest"], "habit": h["batt_mae_closest"]},
            "experts": spread(options, d),
        }

    held = dev.customer_contact_id.map(lambda c: split_of(c + "reactions")) == "test"
    train, homes = dev[~held].reset_index(drop=True), dev[held].reset_index(drop=True)
    checks = reaction_checks(Engine().fit(train, options[options.project_id.isin(train.project_id)]), homes)

    near = closest_option(ours, options).set_index("project_id")
    pred = ours.set_index("project_id")
    rows = []
    for n, p in enumerate(dev.sample(frac=1, random_state=0).itertuples(), 1):  # shuffled, so the order says nothing
        e, c = pred.loc[p.project_id], near.loc[p.project_id]
        opts = options[options.project_id == p.project_id].sort_values("option_number")
        rows.append({
            "n": n, "installer": NAME[p.installer],
            "facts": {"demand_mwh": None if pd.isna(p.demand_mwh) else round(float(p.demand_mwh), 1),
                      "heating": None if pd.isna(p.heating_existing_type) else p.heating_existing_type,
                      "heat_mwh": None if pd.isna(p.heat_mwh) else round(float(p.heat_mwh), 1),
                      "ev": bool(p.has_ev), "has_solar": bool(p.has_solar), "has_storage": bool(p.has_storage)},
            "engine": {"kwp": round(float(e.kwp), 1), "modules": int(round(e.kwp / ASSUMED_KWP_PER_MODULE)),
                       "battery_kwh": round(float(e.battery_kwh), 1), "wallbox": bool(e.has_wallbox), "hp": bool(e.has_hp)},
            "experts": [{"kwp": round(float(o.kwp), 1), "modules": int(o.modules), "battery_kwh": round(float(o.battery_kwh), 1),
                         "wallbox": bool(o.has_wallbox), "hp_kw": round(float(o.hp_kw), 1)} for o in opts.itertuples()],
            "kwp_gap": round(abs(float(c.kwp) - float(e.kwp)), 1),
            "battery_same": bool(abs(float(c.battery_kwh) - float(e.battery_kwh)) < 0.51),
        })

    clean = lambda v: None if isinstance(v, float) and np.isnan(v) else v
    out = {"split": "dev", "folds": 5, "projects": len(dev), "summary": summary,
           "checks": {k: clean(float(v)) for k, v in checks.items()}, "check_homes": int(len(homes)), "homes": rows}
    OUT.write_text(json.dumps(out, default=clean))
    for k, s in summary.items():
        print(k, s["projects"], "kWp gap", round(s["kwp_gap"]["engine"], 2), "vs typical", round(s["kwp_gap"]["typical"], 2),
              "| experts' own", round(s["experts"]["kwp_gap"], 2), "over", s["experts"]["homes"],
              "| battery same", round(s["battery_same"]["engine"], 3), "habit", round(s["battery_same"]["habit"], 3),
              "| experts' own", round(s["experts"]["battery_same"], 3),
              "| battery gap", {k: round(v, 2) for k, v in s["battery_gap"].items()}, "experts' own", round(s["experts"]["battery_gap"], 2))
    print("checks", {k: round(v, 3) for k, v in checks.items()})


if __name__ == "__main__":
    main()
