"""Learning from the planner's own approved offers.

Each sent offer is kept with the engine's own draft (before anything learned or chosen by money) next to what was sent. For a new home like earlier ones
(same installer, yearly use within a quarter, same car), the drafts move by the planner's usual change: the median of
(sent − draft) over at least MIN_HOMES similar approved offers. An offer sent unchanged counts as a change of zero, so
approving drafts never pushes the engine towards itself; only what planners keep changing moves it. A planner's own
choice always stands, and the trace says what was learned and from how many offers.

Kept in data/cache/approved.jsonl, which is not committed. It holds no address, name or reference: only the facts the
size depends on, the draft and the sent system. Past-project scores do not use it (scripts/evaluate.py trains Engine
directly), so they stay comparable.
"""
import datetime
import hashlib
import json
from pathlib import Path

import numpy as np

STORE = Path(__file__).resolve().parents[3] / "data" / "cache" / "approved.jsonl"
NEAR_SHARE = 0.25
MIN_HOMES = 3  # fewer approved offers than this teach nothing yet
MODULES_MOVE = 2  # a usual change smaller than this many modules is noise
BATTERY_MOVE = 2.0  # kWh


def _rows():
    try:
        return [json.loads(l) for l in STORE.read_text().splitlines() if l.strip()]
    except OSError:
        return []


def remember(i, need_mwh, car, draft, sent, ref=None):
    """Keep one approved offer. A request sent again replaces its earlier record."""
    key = hashlib.sha256(str(ref).encode()).hexdigest()[:12] if ref else None
    row = {"at": datetime.date.today().isoformat(), "key": key, "installer": i["installer"], "need_mwh": round(float(need_mwh), 2), "car": bool(car),
           "has_storage": bool(i.get("has_storage")), "goal": i.get("goal"),
           "draft": {"modules": int(draft["modules"]), "battery_kwh": float(draft["battery_kwh"])},
           "sent": {"modules": int(sent["modules"]), "battery_kwh": float(sent["battery_kwh"])}}
    row["changed"] = row["draft"] != row["sent"]
    rows = [r for r in _rows() if not (key and r.get("key") == key)] + [row]
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text("".join(json.dumps(r) + "\n" for r in rows))
    return row


def forget():
    STORE.unlink(missing_ok=True)


def summary():
    rows = _rows()
    return {"offers": len(rows), "changed": sum(r["changed"] for r in rows),
            "by_installer": {k: sum(r["installer"] == k for r in rows) for k in sorted({r["installer"] for r in rows})}}


def similar(installer, need_mwh, car, cost=False):
    """Approved offers for homes like this: same installer, car, yearly use within a quarter, and the same kind of customer
    (low cost first or not), since a low-cost customer's offer was also chosen by money."""
    return [r for r in _rows() if r["installer"] == installer and r["car"] == bool(car) and (r.get("goal") == "cost") == bool(cost)
            and abs(r["need_mwh"] - need_mwh) <= NEAR_SHARE * max(need_mwh, 0.5)]


def usual_change(installer, need_mwh, car, cost=False):
    """The planner's usual change to the engine's drafts for homes like this; enough is False below MIN_HOMES offers."""
    near = similar(installer, need_mwh, car, cost)
    if len(near) < MIN_HOMES:
        return {"homes": len(near), "changed": sum(r["changed"] for r in near), "modules": 0, "battery_kwh": 0.0, "enough": False}
    dm = float(np.median([r["sent"]["modules"] - r["draft"]["modules"] for r in near]))
    db = float(np.median([r["sent"]["battery_kwh"] - r["draft"]["battery_kwh"] for r in near]))
    removed = sum(r["sent"]["battery_kwh"] == 0 < r["draft"]["battery_kwh"] for r in near)
    return {"homes": len(near), "changed": sum(r["changed"] for r in near), "modules": round(dm) if abs(dm) >= MODULES_MOVE else 0,
            "battery_kwh": db if abs(db) >= BATTERY_MOVE else 0.0, "removed": removed, "enough": True}


def adjusted(d, change, o, i):
    """The overrides that apply the planner's usual change to draft d, leaving alone whatever the planner fixed here."""
    out = {}
    if change.get("modules") and o.get("modules") is None:
        cap = d["pv"]["max_modules"] if d["pv"].get("max_modules") is not None else 10_000
        out["modules"] = int(min(cap, max(1, d["pv"]["modules"] + change["modules"])))
    if change.get("battery_kwh") and o.get("battery_kwh") is None and not i.get("has_storage"):
        target = d["battery"]["kwh"] + change["battery_kwh"]
        sizes = [0.0] + [c for c in d["battery"]["choices"] if c <= 25]
        if i.get("backup"):
            sizes = [s for s in sizes if s > 0]
        out["battery_kwh"] = float(min(sizes, key=lambda s: abs(s - target)))
        if out["battery_kwh"] == d["battery"]["kwh"]:
            out.pop("battery_kwh")
    if out.get("modules") == d["pv"]["modules"]:
        out.pop("modules")
    return out
