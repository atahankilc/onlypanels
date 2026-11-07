"""One engine behind every screen: design(inputs, overrides) -> complete system.

Learned from experts: PV size, battery size and whether to include one.
Stated assumptions, not learned: the constants below.
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

from .data import ASSUMED_KWP_PER_MODULE, battery_catalog
from .energy import simulate
from .models import HP_KWH_PER_KW, HP_SIZES, TREE, _frame, snap

EV_KWH_PER_KM = 0.18
HEAT_PUMP_COP = 3.5  # the factor used in the data's own defaults
KWH_PER_KWP = {"Germany": 950, "Austria": 1050, "Switzerland": 1050, "Netherlands": 900, "Other": 1000}
# m² of usable area per panel, and yield relative to a typical roof.
MOUNTS = {
    "roof": {"m2_per_module": 2.0, "yield": 1.0},
    "ground": {"m2_per_module": 5.0, "yield": 1.0},  # rows need spacing against shading
    "carport": {"m2_per_module": 2.0, "yield": 0.9},
    "facade": {"m2_per_module": 2.0, "yield": 0.7},
}
FOSSIL = ["Gas", "Oil", "OtherNonRenewable"]
COLS = ["demand_mwh", "price_ct_kwh", "existing_hp", "fossil_heat", "has_solar", "has_storage", "installer_b"]
MIN_SIMILAR = 30
UNSURE_BATTERY = 0.8  # below this, tell the planner the battery decision is open


def place(modules, surfaces):
    """Fill surfaces in the homeowner's order. Anything beyond capacity lands on the last one."""
    placed, left = [], modules
    for s in surfaces:
        n = min(left, s["max_modules"])
        placed.append(n)
        left -= n
    placed[-1] += left
    return placed


def _x(d, demand=None):
    x = pd.DataFrame(index=d.index)
    x["demand_mwh"] = d.demand_mwh if demand is None else demand
    x["price_ct_kwh"] = d.price_ct_kwh
    x["existing_hp"] = d.heating_existing_type.eq("Heatpump").astype(int)
    x["fossil_heat"] = d.heating_existing_type.isin(FOSSIL).astype(int)
    x["has_solar"] = d.has_solar.astype(int)
    x["has_storage"] = d.has_storage.astype(int)
    x["installer_b"] = (d.installer == "23c108b7").astype(int)
    return x[COLS]


class Engine:
    def fit(self, train, options):
        x = _x(train)
        pv, b = train.has_pv.values, train.has_battery.values
        # More demand may never shrink a system: enforced, so refinement stays sensible.
        self.kwp = HistGradientBoostingRegressor(monotonic_cst={"demand_mwh": 1}, **TREE).fit(x[pv], train.kwp[pv])
        xb = x.assign(kwp=train.kwp.values)
        self.battery = HistGradientBoostingRegressor(monotonic_cst={"kwp": 1}, **TREE).fit(xb[b], train.battery_kwh[b])
        self.has_battery = HistGradientBoostingClassifier(**TREE).fit(xb, b)
        self.catalog = battery_catalog(options)
        self.train = train[pv].copy()
        return self

    def predict(self, d, added_mwh=0.0, max_modules=None, kwp_lock=None):
        """Vectorised core. Returns kWp, battery kWh and battery probability."""
        demand = d.demand_mwh + added_mwh
        kwp = self.kwp.predict(_x(d, demand))
        if max_modules is not None:
            kwp = np.minimum(kwp, max_modules * ASSUMED_KWP_PER_MODULE)
        if kwp_lock is not None:
            kwp = np.full(len(d), float(kwp_lock))
        xb = _x(d, demand).assign(kwp=kwp)
        battery = snap(self.battery.predict(xb), d.installer.values, self.catalog)
        return kwp, battery, self.has_battery.predict_proba(xb)[:, 1]

    def similar(self, installer, demand_mwh):
        t = self.train[self.train.installer == installer]
        gap = (t.demand_mwh - demand_mwh).abs()
        near = t[gap <= 0.25 * demand_mwh]
        if len(near) < MIN_SIMILAR:
            near = t.loc[gap.nsmallest(MIN_SIMILAR).index]
        sold = near[near.has_battery].battery_kwh.round(1)
        return {
            "n": len(near),
            "kwp_low": round(float(near.kwp.quantile(0.1)), 1),
            "kwp_high": round(float(near.kwp.quantile(0.9)), 1),
            "battery_rate": round(float(near.has_battery.mean()) * 100),
            "battery_common": [float(v) for v in sold.value_counts().head(3).index],
            "wallbox_rate": round(float(near.has_wallbox.mean()) * 100),
        }

    def design(self, i, overrides=None):
        o = overrides or {}
        reasons, warnings = [], []
        mount = MOUNTS[i.get("mount", "roof")]
        heat_type = i.get("heating")
        heat_mwh = i.get("heat_kwh") and i["heat_kwh"] / 1000

        # Heat pump: rule, too few sold systems to learn from.
        hp_kw, hp_wanted = 0.0, heat_type in FOSSIL and bool(heat_mwh)
        if heat_type == "Heatpump":
            reasons.append({"code": "hp_existing"})
        elif hp_wanted:
            reasons.append({"code": "hp_fossil", "heat_mwh": round(heat_mwh, 1),
                            "kw": float(HP_SIZES[np.abs(heat_mwh * 1000 / HP_KWH_PER_KW - HP_SIZES).argmin()])})
        elif heat_type in FOSSIL:
            reasons.append({"code": "hp_needs_heat"})
        if o.get("heatpump") is not None and heat_type != "Heatpump":
            hp_wanted = o["heatpump"]
        if hp_wanted:
            need = (heat_mwh or 15.0) * 1000 / HP_KWH_PER_KW
            hp_kw = float(HP_SIZES[np.abs(need - HP_SIZES).argmin()])

        # Demand that the design must serve.
        ev_mwh = i.get("ev_km", 0) * EV_KWH_PER_KM / 1000 if i.get("ev") else 0.0
        hp_mwh = (heat_mwh or 15.0) / HEAT_PUMP_COP if hp_wanted else 0.0
        base = i["demand_kwh"] / 1000
        total = base + ev_mwh + hp_mwh

        row = pd.DataFrame([{
            "demand_mwh": base, "price_ct_kwh": i.get("price_ct_kwh", 32.0), "installer": i["installer"],
            "heating_existing_type": heat_type, "has_solar": bool(i.get("has_solar")),
            "has_storage": bool(i.get("has_storage")),
        }])
        area = i.get("area_m2")
        surfaces = i.get("surfaces") or None
        max_modules = int(area // mount["m2_per_module"]) if area else None
        if surfaces:
            max_modules = sum(s["max_modules"] for s in surfaces)
        locked_modules = o.get("modules")
        lock = locked_modules * ASSUMED_KWP_PER_MODULE if locked_modules is not None else None

        free_kwp = self.predict(row, ev_mwh + hp_mwh)[0][0]
        kwp, battery, p_battery = self.predict(row, ev_mwh + hp_mwh, max_modules, lock)
        modules = locked_modules if lock is not None else max(1, round(kwp[0] / ASSUMED_KWP_PER_MODULE))
        kwp_final = modules * ASSUMED_KWP_PER_MODULE
        capped = lock is None and max_modules is not None and free_kwp > max_modules * ASSUMED_KWP_PER_MODULE
        similar = self.similar(i["installer"], total)

        if lock is not None:
            reasons.insert(0, {"code": "pv_locked", "modules": modules})
        elif capped:
            reasons.insert(0, {"code": "pv_capped", "modules": max_modules, "area": area,
                               "wanted": round(free_kwp, 1)})
        else:
            reasons.insert(0, {"code": "pv_demand", "demand": round(total, 1), "n": similar["n"],
                               "low": similar["kwp_low"], "high": similar["kwp_high"]})

        has_storage = bool(i.get("has_storage"))
        battery_yes = bool(p_battery[0] >= 0.5) and not has_storage
        battery_kwh = float(battery[0]) if battery_yes else 0.0
        unsure = not has_storage and o.get("battery_kwh") is None and bool(p_battery[0] < UNSURE_BATTERY)
        catalog = [float(v) for v in self.catalog.get(i["installer"], [])]
        if o.get("battery_kwh") is not None:
            battery_kwh = float(o["battery_kwh"])
            reasons.append({"code": "battery_locked"})
        elif has_storage:
            reasons.append({"code": "battery_existing"})
        elif battery_yes:
            reasons.append({"code": "battery_yes", "rate": similar["battery_rate"], "kwh": battery_kwh,
                            "kwp": round(kwp_final, 1), "per_kwp": round(battery_kwh / kwp_final, 1),
                            "common": ", ".join(f"{v:g}" for v in similar["battery_common"])})
        else:
            reasons.append({"code": "battery_no", "rate": similar["battery_rate"]})

        wallbox = bool(i.get("ev"))
        if o.get("wallbox") is not None:
            wallbox = o["wallbox"]
        elif wallbox:
            reasons.append({"code": "wallbox_ev", "added": round(ev_mwh, 1)})

        if i.get("country", "Germany") != "Germany":
            warnings.append({"code": "not_germany"})
        if i.get("mount", "roof") != "roof":
            warnings.append({"code": "non_roof"})
        if not area and not surfaces:
            warnings.append({"code": "no_area"})
        if hp_wanted and not heat_mwh:
            warnings.append({"code": "hp_assumed_heat"})
        if unsure:
            warnings.append({"code": "battery_unsure", "share": round((1 - float(p_battery[0])) * 100)})

        country = i.get("country", "Germany")
        typical = KWH_PER_KWP.get(country, KWH_PER_KWP["Other"])
        production = kwp_final * typical * mount["yield"] / 1000
        placed = None
        if surfaces:
            placed = place(modules, surfaces)
            production = sum(
                n * ASSUMED_KWP_PER_MODULE * (s.get("kwh_per_kwp") or typical * MOUNTS[s["kind"]]["yield"])
                for n, s in zip(placed, surfaces)) / 1000
            reasons.append({"code": "site_sun", "kwh": round(production * 1000 / kwp_final)})
        estimate = simulate(base * 1000, ev_mwh * 1000, hp_mwh * 1000, production * 1000, battery_kwh,
                            i.get("price_ct_kwh", 32.0))
        reasons.append({"code": "balance", "production": round(production, 1), "ratio": round(production / total, 1)})
        return {
            "pv": {"modules": modules, "kwp": round(kwp_final, 2), "max_modules": max_modules, "placed": placed,
                   "locked": lock is not None, "capped": bool(capped)},
            "battery": {"kwh": battery_kwh, "locked": o.get("battery_kwh") is not None,
                        "probability": round(float(p_battery[0]) * 100),
                        "choices": catalog, "unsure": unsure},
            "wallbox": {"included": wallbox, "locked": o.get("wallbox") is not None},
            "heatpump": {"included": hp_kw > 0, "kw": hp_kw, "locked": o.get("heatpump") is not None,
                         "blocked": heat_type == "Heatpump"},
            "energy": {"base_mwh": round(base, 2), "ev_mwh": round(ev_mwh, 2), "hp_mwh": round(hp_mwh, 2),
                       "total_mwh": round(total, 2), "production_mwh": round(production, 1), **estimate},
            "similar": similar, "reasons": reasons, "warnings": warnings,
        }


def rough(d):
    """The homeowner's draft: what the system is, with sizes as the range experts chose for similar homes, never past the roof."""
    s, top = d["similar"], d["pv"]["max_modules"]
    roof = top * ASSUMED_KWP_PER_MODULE if top else float("inf")
    kwp = d["pv"]["kwp"]
    sizes = [v for v in [*s["battery_common"], d["battery"]["kwh"]] if v]
    has_battery = d["battery"]["kwh"] > 0
    return {
        "pv": {"low": round(min(s["kwp_low"], kwp, roof), 1), "high": round(min(max(s["kwp_high"], kwp), roof), 1)},
        "battery": {"yes": has_battery, "low": min(sizes) if has_battery else None, "high": max(sizes) if has_battery else None},
        "wallbox": d["wallbox"]["included"], "heatpump": d["heatpump"]["included"],
        "reasons": d["reasons"], "warnings": d["warnings"],
    }


def engine_predictor(train, test, catalog):
    """Same interface as models.PREDICTORS, for scoring."""
    e = Engine().fit(train, train)  # project rows carry the same size columns as options
    e.catalog = catalog
    kwp, battery, p = e.predict(test)
    return _frame(test, kwp, p >= 0.5, battery, test.has_ev.astype(float).values)


def reaction_checks(engine, homes):
    """Share of homes where a change moves the design the way an expert would expect."""
    kwp0, bat0, _ = engine.predict(homes)
    kwp_ev, bat_ev, _ = engine.predict(homes, added_mwh=15000 * EV_KWH_PER_KM / 1000)
    kwp_hp, _, _ = engine.predict(homes, added_mwh=15.0 / HEAT_PUMP_COP)
    _, bat_small, _ = engine.predict(homes, kwp_lock=5.0)
    _, bat_big, _ = engine.predict(homes, kwp_lock=15.0)
    capped = engine.predict(homes, max_modules=10)[0]
    return {
        "ev_never_shrinks_pv": float((kwp_ev >= kwp0 - 1e-6).mean()),
        "ev_grows_pv": float((kwp_ev > kwp0 + 1e-6).mean()),
        "ev_never_shrinks_battery": float((bat_ev >= bat0).mean()),
        "heat_pump_never_shrinks_pv": float((kwp_hp >= kwp0 - 1e-6).mean()),
        "more_pv_never_shrinks_battery": float((bat_big >= bat_small).mean()),
        "area_limit_respected": float((capped <= 10 * ASSUMED_KWP_PER_MODULE + 1e-6).mean()),
    }
