"""What the past projects support for one home, given what we know about it: a range, not one number.

The engine's draft is one point. The honest answer for a request that carries little more than the past projects
recorded (yearly use, price, heating, car, solar or battery already there) is the spread of what experts offered for
homes like it: every option they put in an offer, not only the one that was signed. This module gives that spread, says
how much of the request is known, what would narrow it, and where the draft sits. How often the range held the
expert's final choice on unseen projects is measured by scripts/check_evidence.py; the figures below come from it.
"""
import numpy as np

from .data import ASSUMED_KWP_PER_MODULE

NEAR_SHARE = 0.25  # homes whose yearly use is within a quarter of this one's
MIN_HOMES = 30
LOW, HIGH = 0.1, 0.9
# scripts/check_evidence.py, dev split, 5 folds grouped by customer: share of projects whose final solar size fell
# inside the 10–90% range of similar homes' offers, and the range's mean width.
COVERAGE = {"2a8ba8e2": {"kwp": 0.82, "width_kwp": 7.7}, "23c108b7": {"kwp": 0.79, "width_kwp": 9.3}}


def offers_of(train, options):
    """Every PV option experts made for the training projects, with the home's facts and a weight that gives each home one vote."""
    o = options.loc[options.has_pv & options.project_id.isin(train.project_id), ["project_id", "installer", "kwp", "battery_kwh", "has_pv", "has_battery"]]
    o = o.merge(train[["project_id", "demand_mwh", "has_wallbox"]].rename(columns={"has_wallbox": "sold_wallbox"}), on="project_id")
    o["weight"] = 1.0 / o.groupby("project_id").project_id.transform("size")
    return o.reset_index(drop=True)


def _q(values, weights, q):
    order = np.argsort(values)
    v, w = np.asarray(values)[order], np.asarray(weights)[order]
    c = np.cumsum(w) / w.sum()
    return float(v[min(np.searchsorted(c, q), len(v) - 1)])


def similar_offers(offers, installer, demand_mwh, car=False):
    t = offers[offers.installer == installer]
    if car and t[t.sold_wallbox].project_id.nunique() >= MIN_HOMES:
        t = t[t.sold_wallbox]
    gap = (t.demand_mwh - demand_mwh).abs()
    near = t[gap <= NEAR_SHARE * demand_mwh]
    if near.project_id.nunique() < MIN_HOMES:
        homes = t.assign(gap=gap).groupby("project_id").gap.first().nsmallest(MIN_HOMES).index
        near = t[t.project_id.isin(homes)]
    return near


def known(i):
    """The facts that decide size, and whether this request has each. Ordered by how much they narrow the range."""
    hp = i.get("heating") in ("Gas", "Oil", "OtherNonRenewable", "Electric")
    facts = [
        ("roof", "Roof measured or its area given", bool(i.get("surfaces") or i.get("area_m2")) and not i.get("area_unknown"),
         "The roof's usable area caps the size; most homes in Munich fit fewer modules than the use asks for."),
        ("demand", "Yearly use from a bill", i.get("demand_source") == "bill",
         "A use from a range or a guess moves the size by a few modules either way."),
        ("car", "Car and its driving", not i.get("ev") or bool(i.get("ev_kwh_month") or i.get("ev_charge_home")),
         "How much of the car is charged at home adds up to 2–3 MWh."),
    ]
    if hp:
        facts.append(("heat", "Heat use from a gas or oil bill", bool(i.get("heat_kwh")), "The heat pump's electricity follows the heat use."))
    return [{"id": k, "label": label, "known": ok, "why": why} for k, label, ok, why in facts]


def evidence(offers, i, d, need_mwh, car=False, approved=None, homes=None):
    """The range experts' offers span for homes like this one, what is known, and where the draft sits.
    homes: the engine's own similar homes (project ids), so the counts match what the design says."""
    near = offers[offers.project_id.isin(homes)] if homes is not None else similar_offers(offers, i["installer"], need_mwh, car)
    w = near.weight.values
    kwp = near.kwp.values
    low, mid, high = _q(kwp, w, LOW), _q(kwp, w, 0.5), _q(kwp, w, HIGH)
    cap = d["pv"]["max_modules"] * ASSUMED_KWP_PER_MODULE if d["pv"].get("max_modules") else None
    capped_high = min(high, cap) if cap else high
    with_b = near[near.has_battery]
    battery_share = float(w[near.has_battery.values].sum() / w.sum()) if len(near) else 0.0
    sizes = with_b.battery_kwh.round(1)
    common = sizes.groupby(sizes).apply(lambda s: with_b.loc[s.index, "weight"].sum()).sort_values(ascending=False).head(3).index.tolist() if len(with_b) else []
    homes = near.project_id.nunique()
    several = int((near.groupby("project_id").size() > 1).sum())
    facts = known(i)
    k = sum(f["known"] for f in facts)
    level = "narrow" if k == len(facts) else ("roof" if facts[0]["known"] else "dataset")
    draft_kwp = d["pv"]["kwp"]
    position = float(w[kwp <= draft_kwp + 1e-6].sum() / w.sum()) if len(near) else None
    cov = COVERAGE.get(i["installer"], {})
    out = {
        "level": level, "known": facts, "homes": homes, "offers": int(len(near)), "several": several,
        "kwp": {"low": round(low, 1), "mid": round(mid, 1), "high": round(high, 1), "roof": round(cap, 1) if cap else None, "high_on_roof": round(capped_high, 1),
                "modules_low": max(1, round(low / ASSUMED_KWP_PER_MODULE)), "modules_high": max(1, round(capped_high / ASSUMED_KWP_PER_MODULE))},
        "battery": {"share_pct": round(battery_share * 100), "low": round(float(_q(with_b.battery_kwh.values, with_b.weight.values, LOW)), 1) if len(with_b) else None,
                    "high": round(float(_q(with_b.battery_kwh.values, with_b.weight.values, HIGH)), 1) if len(with_b) else None, "common": [float(c) for c in common]},
        "draft": {"kwp": draft_kwp, "position_pct": round(position * 100) if position is not None else None, "inside": low - 1e-6 <= draft_kwp <= high + 1e-6},
        "coverage_pct": round(cov["kwp"] * 100) if cov else None,
    }
    if approved:
        out["approved"] = approved
    return out
