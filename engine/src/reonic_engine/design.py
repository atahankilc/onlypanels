"""One engine behind every screen: design(inputs, overrides) -> complete system.

Learned from experts: PV size, battery size and whether to include one.
Stated assumptions, not learned: the constants below.
"""
import datetime

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

from .data import ASSUMED_KWP_PER_MODULE, battery_catalog
from .energy import BATTERY_USABLE, FEED_IN_CT_KWH, simulate, sun_shape
from .models import HP_KWH_PER_KW, HP_SIZES, TREE, _frame, snap

EV_KWH_PER_KM = 0.18
HEAT_PUMP_COP = 3.5  # the factor used in the data's own defaults
# What the customer can tell beyond the past projects. Each stands in only for an answer that is missing, and says so in the trace.
BASE_FEE_EUR_YEAR = 150  # the fixed part of a German electricity bill, taken off a monthly payment before it becomes kWh
BIG_USERS_KWH = {"pool": 1500, "sauna": 1000, "ac": 600, "water": 2000}  # a year each, added only when the use is not from the bill
# Heat a year per m² by build period, in the 2022 census classes, so the census can stand in for an unknown period.
HEAT_KWH_PER_M2 = {"before1979": 180, "1979to1990": 140, "1991to2000": 120, "2001to2010": 90, "since2011": 60}
BUILT_LABEL = {"before1979": "before 1979", "1979to1990": "1979–1990", "1991to2000": "1991–2000", "2001to2010": "2001–2010", "since2011": "2011 or later"}
MODEL_M2_MAX = 250  # above this the 3D model's area likely spans more than one home, so it does not size a heat pump
GOAL_LABEL = {"cost": "low cost", "independence": "independence", "environment": "the environment"}
GOAL_BATTERY = {"cost": 0.7, "independence": 0.3}  # how sure the engine must be to add a battery, by the customer's priority
GOAL_PV = {"environment": 1.2}  # more solar, within the roof, when the environment comes first


def use_from_payment(monthly_eur, price_ct):
    """Yearly kWh from the monthly payment on the bill: twelve payments, less the fixed fee, at the price per kWh."""
    return max(0.0, monthly_eur * 12 - BASE_FEE_EUR_YEAR) / (price_ct / 100)


# How much of a car's driving is charged at home, when the customer says. Not said: all of it, as before. Stated assumptions.
HOME_SHARE = {"most": 0.9, "half": 0.5, "little": 0.2}
EV_SIZING = 0.75  # share of a car's use that sizes solar: experts give homes with a wallbox about 1 kWp more (scripts/profile_hp_ev.py)
KWH_PER_KWP = {"Germany": 950, "Austria": 1050, "Switzerland": 1050, "Netherlands": 900, "Other": 1000}
# m² of usable area per panel, and yield relative to a typical roof.
MOUNTS = {
    "roof": {"m2_per_module": 2.0, "yield": 1.0},
    "ground": {"m2_per_module": 5.0, "yield": 1.0},  # rows need spacing against shading
    "carport": {"m2_per_module": 2.0, "yield": 0.9},
    "facade": {"m2_per_module": 2.0, "yield": 0.7},
}
FOSSIL = ["Gas", "Oil", "OtherNonRenewable"]
# Heating a heat pump can replace: fossil, and direct or storage electric heating (its yearly electricity is its heat).
# District heating is not among them: where it runs, a heat pump rarely pays.
REPLACEABLE = FOSSIL + ["Electric"]
COLS = ["demand_mwh", "existing_hp", "fossil_heat", "has_solar", "has_storage", "installer_b"]
MIN_SIMILAR = 30
UNSURE_BATTERY = 0.8  # below this, tell the planner the battery decision is open
HABIT_KWH = 2.0  # a learned battery this close to the installer's most sold size becomes that size
GUIDE_KWH_PER_UNIT = 1.5  # HTW Berlin 2022: usable kWh per kWp and per MWh of use, at most
# A system already on the roof. The past projects hold no sizes for these (18 had one, none with a size), so this is
# physics and stated assumptions, not learned. An assumption only stands in for what the customer did not give.
KWP_PER_M2 = 0.2  # module power per m² of covered roof, when the size is not known
AGEING = 0.005  # output lost per year of age, when the year is known
FEED_IN_YEARS = 20  # after this the fixed feed-in tariff ends, so own use of its power matters more


def existing_pv(i, typical):
    """What a system already on the building makes: size given or from its marked area, its sun, its age."""
    if not i.get("has_solar"):
        return None
    kwp, source = i.get("existing_kwp"), "customer"
    if not kwp and i.get("existing_m2"):
        kwp, source = i["existing_m2"] * KWP_PER_M2, "area"
    if not kwp:
        return {"kwp": None, "source": None, "mwh": 0.0, "age": None, "ended": False}
    year = i.get("existing_year")
    age = max(0, datetime.date.today().year - int(year)) if year else None
    sun = i.get("existing_kwh_per_kwp") or typical
    mwh = kwp * sun * (1 - AGEING) ** (age or 0) / 1000
    return {"kwp": float(kwp), "source": source, "mwh": float(mwh), "age": age, "sun": float(sun),
            "ended": age is not None and age >= FEED_IN_YEARS, "battery_kwh": float(i.get("existing_battery_kwh") or 0)}


# A roof's sun moves the size the experts' habits give for a typical roof (KWH_PER_KWP): a weaker roof needs more modules for
# the same power, a stronger one fewer, within a fifth either way. Below POOR_ROOF of a typical yield a module earns too
# little to add more: the system shrinks instead, to half at a roof with half the sun. The two meet at POOR_ROOF.
# Within SUN_CALM of a typical roof nothing moves, so rounding alone never adds or drops a module.
SUN_SCALE = (0.8, 1.2)
POOR_ROOF = 0.75
POOR_FLOOR = 0.5
SUN_CALM = 0.05


def sun_factor(share):
    """Modules on this roof per module on a typical one, by the roof's yield as a share of the typical yield."""
    low, high = SUN_SCALE
    if share >= POOR_ROOF:
        f = min(max(1 / share, low), high)
        return float(1 + (1 if f > 1 else -1) * max(0.0, abs(f - 1) - SUN_CALM))
    return POOR_FLOOR + max(0.0, share - POOR_FLOOR) / (POOR_ROOF - POOR_FLOOR) * (high - SUN_CALM - POOR_FLOOR)


def site_yield(modules, surfaces, fallback):
    """kWh per kWp over the surfaces these modules would fill, best first as placed."""
    placed = place(modules, surfaces)
    total = sum(placed)
    return sum(n * (s.get("kwh_per_kwp") or fallback) for n, s in zip(placed, surfaces)) / total if total else fallback


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
        self.habit = self._habit(train)
        return self

    def _habit(self, train):
        """The battery size each installer sells most often, among its catalog sizes."""
        b = train[train.has_battery]
        tiers = snap(b.battery_kwh.values, b.installer.values, self.catalog)
        return {i: float(pd.Series(t).mode().iloc[0]) for i, t in pd.Series(tiers).groupby(b.installer.values)}

    def predict(self, d, added_mwh=0.0, max_modules=None, kwp_lock=None, extra_kwp=0.0):
        """Vectorised core. Returns kWp, battery kWh and battery probability. extra_kwp: solar already there, which the battery also stores."""
        demand = d.demand_mwh + added_mwh
        kwp = self.kwp.predict(_x(d, demand))
        if max_modules is not None:
            kwp = np.minimum(kwp, max_modules * ASSUMED_KWP_PER_MODULE)
        if kwp_lock is not None:
            kwp = np.full(len(d), float(kwp_lock))
        xb = _x(d, demand).assign(kwp=kwp + extra_kwp)
        battery = snap(self.battery.predict(xb), d.installer.values, self.catalog)
        if kwp_lock is None:
            # Experts mostly sell their usual size: dev cross-validation, exact size 20% to 38% at both installers,
            # and a smaller gap. Not when the planner fixed solar: then the size learned from solar is closer.
            habit = np.array([self.habit.get(i, np.nan) for i in d.installer.values])
            battery = np.where((battery > 0) & (np.abs(battery - habit) <= HABIT_KWH), habit, battery)
        return kwp, battery, self.has_battery.predict_proba(xb)[:, 1]

    def near(self, installer, demand_mwh, car=False):
        """Past expert designs at this installer for homes with about this yearly use. With a car, homes that bought a wallbox,
        because the recorded use does not hold the car and the car flag is rarely set."""
        t = self.train[self.train.installer == installer]
        if car and t.has_wallbox.sum() >= MIN_SIMILAR:
            t = t[t.has_wallbox]
        gap = (t.demand_mwh - demand_mwh).abs()
        near = t[gap <= 0.25 * demand_mwh]
        if len(near) < MIN_SIMILAR:
            near = t.loc[gap.nsmallest(MIN_SIMILAR).index]
        return near

    def similar(self, installer, demand_mwh, car=False):
        near = self.near(installer, demand_mwh, car)
        sold = near[near.has_battery].battery_kwh.round(1)
        with_battery = near[near.has_battery].battery_kwh
        return {
            "n": len(near),
            "kwp_low": round(float(near.kwp.quantile(0.1)), 1),
            "kwp_high": round(float(near.kwp.quantile(0.9)), 1),
            "battery_rate": round(float(near.has_battery.mean()) * 100),
            "battery_common": [float(v) for v in sold.value_counts().head(3).index],
            "wallbox_rate": round(float(near.has_wallbox.mean()) * 100),
            "battery_low": round(float(with_battery.quantile(0.1)), 1) if len(with_battery) else None,
            "battery_high": round(float(with_battery.quantile(0.9)), 1) if len(with_battery) else None,
            "learned_from": int((self.train.installer == installer).sum()),
        }

    def alternatives(self, i, overrides, d):
        """At most two variants of design d, each computed by this same engine with one more decision fixed.
        Order follows how experts vary their own options for one home: battery first, then solar (scripts/profile_alternatives.py)."""
        o = overrides or {}
        kwh, sizes = d["battery"]["kwh"], sorted(d["battery"]["choices"])
        locks = {"modules": d["pv"]["modules"]}  # a battery variant keeps the solar as it is
        picks = []
        if not i.get("has_storage"):
            guide = any(n["code"] == "battery_guide" for n in d["review"])
            if kwh and d["battery"]["unsure"]:
                picks.append(("no_battery", "Without battery", "The battery decision is open: the same system without one.", {**locks, "battery_kwh": 0}))
            elif kwh and [s for s in sizes if s > kwh + HABIT_KWH - 1e-6] and not guide:
                bigger = min(s for s in sizes if s > kwh + HABIT_KWH - 1e-6)
                picks.append(("battery_up", "Larger battery", f"{_num(bigger)} kWh: more of the evening from own power.", {**locks, "battery_kwh": bigger}))
            elif kwh and guide and [s for s in sizes if s < kwh - HABIT_KWH + 1e-6]:
                smaller = max(s for s in sizes if s < kwh - HABIT_KWH + 1e-6)  # a real step, not a near-identical size
                picks.append(("battery_down", "Smaller battery", f"{_num(smaller)} kWh, within the independent guideline more often.", {**locks, "battery_kwh": smaller}))
            elif not kwh and self.habit.get(i["installer"]):
                usual = self.habit[i["installer"]]
                picks.append(("battery_add", "With battery", f"{_num(usual)} kWh, the size this installer sells most.", {**locks, "battery_kwh": usual}))
        if i.get("heating") in REPLACEABLE and not d["heatpump"]["included"] and o.get("heatpump") is not False:
            picks.append(("heatpump", "With heat pump", "Replaces the " + i["heating"].lower().replace("othernonrenewable", "fossil") + " heating. Solar and battery re-size around it. Saving counts electricity only, not the fuel no longer bought.", {"heatpump": True}))
        # Larger solar, as large as experts go for similar homes (9 in 10 chose less), within what the roof holds.
        largest = int(d["similar"]["kwp_high"] // ASSUMED_KWP_PER_MODULE)
        if d["pv"]["max_modules"]:
            largest = min(largest, d["pv"]["max_modules"])
        if len(picks) < 2 and largest - d["pv"]["modules"] >= 3 and o.get("modules") is None:
            picks.append(("pv_large", "Larger solar", f"{largest} modules, about as large as experts go for similar homes: more to sell, a lower share used at home.", {"modules": largest}))
        out = []
        for key, title, why, extra in picks[:2]:
            a = self.design(i, {**o, **extra})
            out.append({"id": key, "title": title, "why": why, "overrides": extra,
                        "pv": {"modules": a["pv"]["modules"], "kwp": a["pv"]["kwp"]}, "battery_kwh": a["battery"]["kwh"],
                        "heatpump_kw": a["heatpump"]["kw"] if a["heatpump"]["included"] else 0, "wallbox": a["wallbox"]["included"],
                        "energy": {k: a["energy"][k] for k in ("production_mwh", "total_mwh", "self_sufficiency_pct", "self_use_pct", "saving_eur")}})
        return out

    def design(self, i, overrides=None):
        i_in = i  # as given, before any stand-in is set aside
        o = overrides or {}
        reasons, warnings = [], []
        mount = MOUNTS[i.get("mount", "roof")]
        heat_type = i.get("heating")
        heat_mwh = i.get("heat_kwh") and i["heat_kwh"] / 1000
        # No gas or oil figure: the energy certificate's value per m², else the build period's, times the living area.
        heat_from_house = None
        # The 3D model's area is only a hint. Far above a single-family home it likely covers several homes: then it sizes nothing.
        model_too_big = bool(i.get("living_from_model") and (i.get("living_m2") or 0) > MODEL_M2_MAX)
        if model_too_big:
            i = {**i, "living_m2": None}
        if not heat_mwh and i.get("living_m2") and i.get("cert_kwh_m2"):
            heat_mwh, heat_from_house = i["living_m2"] * i["cert_kwh_m2"] / 1000, f"its energy certificate, {_num(i['cert_kwh_m2'], 0)} kWh per m²"
        elif not heat_mwh and i.get("living_m2") and i.get("built") in HEAT_KWH_PER_M2:
            heat_mwh, heat_from_house = i["living_m2"] * HEAT_KWH_PER_M2[i["built"]] / 1000, f"built {BUILT_LABEL[i['built']]}, at {HEAT_KWH_PER_M2[i['built']]} kWh per m²"
        elif not heat_mwh and i.get("living_m2") and i.get("area_built") in HEAT_KWH_PER_M2:
            # The customer did not say when the house was built: the most common period around it in the 2022 census stands in.
            b = i["area_built"]
            heat_mwh, heat_from_house = i["living_m2"] * HEAT_KWH_PER_M2[b] / 1000, f"build period unknown, so the area's most common from the 2022 census ({BUILT_LABEL[b]}, {round((i.get('area_built_share') or 0) * 100)}% of homes nearby), at {HEAT_KWH_PER_M2[b]} kWh per m²"

        # Heat pump: rule, too few sold systems to learn from.
        # Heat pump: a rule, too few sold systems to learn from. It enters only when the customer or planner asks (D69).
        hp_kw, hp_wanted = 0.0, False
        if o.get("heatpump") is not None and heat_type != "Heatpump":
            hp_wanted = bool(o["heatpump"])
        if heat_type == "Heatpump":
            reasons.append({"code": "hp_existing"})
        elif hp_wanted:
            reasons.append({"code": "hp_asked", "heat_mwh": round(heat_mwh or 15.0, 1)})
        elif heat_type in REPLACEABLE:
            reasons.append({"code": "hp_offer"})
        if hp_wanted:
            need = (heat_mwh or 15.0) * 1000 / HP_KWH_PER_KW
            hp_kw = float(HP_SIZES[np.abs(need - HP_SIZES).argmin()])

        # Demand that the design must serve.
        # The car's use at home: measured at the wallbox if the customer knows it, else driving × consumption × the share charged at home.
        if not i.get("ev"):
            ev_mwh = 0.0
        elif i.get("ev_kwh_month"):
            ev_mwh = i["ev_kwh_month"] * 12 / 1000
        else:
            ev_mwh = i.get("ev_km", 0) * EV_KWH_PER_KM / 1000 * HOME_SHARE.get(i.get("ev_charge_home"), 1.0)
        hp_mwh = (heat_mwh or 15.0) / HEAT_PUMP_COP if hp_wanted else 0.0
        base = i["demand_kwh"] / 1000
        # A guessed use leaves out what the customer told us runs on electricity; a use from the bill already holds it.
        big = 0.0 if i.get("demand_source") == "bill" else sum(BIG_USERS_KWH.get(u, 0) for u in i.get("big_users") or []) / 1000
        base += big
        # A heat pump already there runs on its own meter, so its use is not in the house's. Given, it joins the need the solar is sized
        # for, and the model then sees a home without one, so it is not counted twice. Not given, the model's own "has a heat pump" stands.
        own_hp = (i.get("hp_kwh") or 0) / 1000 if heat_type == "Heatpump" else 0.0
        total = base + ev_mwh + hp_mwh + own_hp
        country = i.get("country", "Germany")
        typical = KWH_PER_KWP.get(country, KWH_PER_KWP["Other"])

        # A system already there covers part of the need: the new one is sized for what is left. The model then sees a home
        # without solar, so the old system is not counted twice. With no size at all, the model's own "has solar" stands.
        ex = existing_pv(i, typical)
        known = bool(ex and ex["kwp"])
        left = max(0.0, total - ex["mwh"]) if known else total
        row = pd.DataFrame([{
            "demand_mwh": left if known else base, "price_ct_kwh": i.get("price_ct_kwh", 32.0), "installer": i["installer"],
            "heating_existing_type": None if own_hp else heat_type, "has_solar": bool(i.get("has_solar")) and not known,
            "has_storage": bool(i.get("has_storage")),
        }])
        added = 0.0 if known else ev_mwh * EV_SIZING + hp_mwh + own_hp
        old_kwp = ex["kwp"] if known else 0.0
        area = i.get("area_m2")
        surfaces = i.get("surfaces") or None
        max_modules = int(area // mount["m2_per_module"]) if area else None
        if surfaces:
            max_modules = sum(s["max_modules"] for s in surfaces)
        locked_modules = o.get("modules")
        lock = locked_modules * ASSUMED_KWP_PER_MODULE if locked_modules is not None else None

        free_kwp = self.predict(row, added)[0][0]
        kwp, battery, p_battery = self.predict(row, added, max_modules, lock, extra_kwp=old_kwp)
        goal = i.get("goal")
        if lock is None and goal in GOAL_PV:
            kwp = kwp * GOAL_PV[goal]
            if max_modules is not None:
                kwp = np.minimum(kwp, max_modules * ASSUMED_KWP_PER_MODULE)
        sun_share, before_sun = None, None
        if lock is None and surfaces:
            # The roof's sun moves the size before the roof limits it: a strong roof too small for the need stays full.
            free = self.predict(row, added, None, None, extra_kwp=old_kwp)[0] * GOAL_PV.get(goal, 1.0)
            before_sun = max(1, round(min(free[0], max_modules * ASSUMED_KWP_PER_MODULE) / ASSUMED_KWP_PER_MODULE))
            sun_share = site_yield(before_sun, surfaces, typical * mount["yield"]) / typical
            factor = sun_factor(sun_share)
            if factor > 1:
                # More modules land where the last ones went: if that surface is a poor one, adding there earns too little.
                placed = place(before_sun, surfaces)
                last = max((k for k, n in enumerate(placed) if n), default=0)
                if (surfaces[last].get("kwh_per_kwp") or typical) < POOR_ROOF * typical:
                    factor = 1.0
            kwp = np.minimum(free * factor, max_modules * ASSUMED_KWP_PER_MODULE)
        modules = locked_modules if lock is not None else max(1, round(kwp[0] / ASSUMED_KWP_PER_MODULE))
        kwp_final = modules * ASSUMED_KWP_PER_MODULE
        capped = lock is None and max_modules is not None and free_kwp > max_modules * ASSUMED_KWP_PER_MODULE
        like = max(0.0, left - ev_mwh)  # need without the car, as past homes recorded it
        similar = self.similar(i["installer"], like, car=bool(ev_mwh))

        if lock is not None:
            reasons.insert(0, {"code": "pv_locked", "modules": modules})
        elif capped:
            reasons.insert(0, {"code": "pv_capped", "modules": max_modules, "area": area,
                               "wanted": round(free_kwp, 1)})
        else:
            reasons.insert(0, {"code": "pv_demand", "demand": round(total, 1), "n": similar["n"],
                               "low": similar["kwp_low"], "high": similar["kwp_high"]})

        has_storage = bool(i.get("has_storage"))
        battery_yes = bool(p_battery[0] >= GOAL_BATTERY.get(goal, 0.5)) and not has_storage
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

        wallbox = bool(i.get("ev")) and not i.get("has_wallbox")  # one already on the wall is not sold again
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
        if ex and not known:
            warnings.append({"code": "existing_unknown"})
        if hp_wanted and not heat_mwh:
            warnings.append({"code": "hp_assumed_heat"})
        if unsure:
            warnings.append({"code": "battery_unsure", "share": round((1 - float(p_battery[0])) * 100)})

        production = kwp_final * typical * mount["yield"] / 1000
        placed = None
        if surfaces:
            placed = place(modules, surfaces)
            production = sum(
                n * ASSUMED_KWP_PER_MODULE * (s.get("kwh_per_kwp") or typical * MOUNTS[s["kind"]]["yield"])
                for n, s in zip(placed, surfaces)) / 1000
            reasons.append({"code": "site_sun", "kwh": round(production * 1000 / kwp_final)})
        price = i.get("price_ct_kwh", 32.0)
        sun = sun_shape(surfaces, placed)  # real weather years, this roof's directions
        old_mwh, old_battery = (ex["mwh"], ex["battery_kwh"]) if known else (0.0, 0.0)
        # The home as a whole, both systems and both batteries. The saving is only what the new system adds to the old one.
        heat_load = (hp_mwh + own_hp) * 1000
        estimate = simulate(base * 1000, ev_mwh * 1000, heat_load, (production + old_mwh) * 1000, battery_kwh + old_battery, price, sun=sun, ev_day=bool(i.get("ev_day")), home_day=i.get("home_day"))
        if known:
            before = simulate(base * 1000, ev_mwh * 1000, heat_load, old_mwh * 1000, old_battery, price, sun=sun, ev_day=bool(i.get("ev_day")), home_day=i.get("home_day"))
            estimate["saving_eur"] = max(0, estimate["saving_eur"] - before["saving_eur"])
        reasons.append({"code": "balance", "production": round(production, 1), "ratio": round(production / total, 1)})

        near = self.near(i["installer"], like, car=bool(ev_mwh))
        review = _review(near, similar, kwp_final, battery_kwh, total, has_storage, unsure, p_battery[0])
        if sun_share is not None and modules != before_sun:
            site = round(sun_share * typical)
            if sun_share < POOR_ROOF:
                review.append({"code": "roof_sun_poor", "level": "warn", "on": "pv", "text": f"This roof gets little sun: {site} kWh per kWp a year, {round(sun_share * 100)}% of a typical {typical}. Each module earns less, so the system is smaller: {modules} modules instead of {before_sun}. Tell the customer, or look for a better surface."})
            else:
                review.append({"code": "roof_sun", "level": "note", "on": "pv", "text": f"Sized for this roof's sun: {site} kWh per kWp a year against a typical {typical}, so {modules} modules instead of {before_sun}."})
        standing = _standing(near, kwp_final, battery_kwh, heat_mwh, hp_wanted or heat_type == "Heatpump")
        if ex:
            review.extend(_existing_notes(ex))
        if i.get("trees"):
            review.append({"code": "trees", "level": "warn", "on": "pv", "text": "The customer says big trees stand near the roof. The 3D model has no trees: check their shade on the photo before trusting the yield."})
        if i.get("roof_renovation") in ("yes", "unsure"):
            review.append({"code": "roof_renovation", "level": "warn", "on": "pv", "text": "The customer plans to renew the roof soon" + (" or is not sure" if i["roof_renovation"] == "unsure" else "") + ". Renew it before the panels go on."})
        if heat_from_house and hp_wanted:
            review.append({"code": "heat_from_house", "level": "note", "on": "heatpump", "text": f"Heat use estimated from the house: {_num(i['living_m2'], 0)} m²" + (" (from the 3D model)" if i.get("living_from_model") else "") + f", {heat_from_house}. Ask for the gas or oil bill."})
        if heat_type == "District":
            review.append({"code": "district_heat", "level": "note", "on": "heatpump", "text": "The home has district heating, so no heat pump is offered. Check the city's heat plan before suggesting one."})
        if model_too_big and (hp_wanted or heat_type in REPLACEABLE):
            review.append({"code": "model_area_large", "level": "warn", "on": "heatpump", "text": f"The 3D model gives about {_num(i_in.get('living_m2') or 0, 0)} m², more than one home usually has, so it was not used for the heat. Ask the customer for the living area or the gas or oil bill."})
        if big:
            review.append({"code": "big_users", "level": "note", "on": "pv", "text": f"{_num(big)} MWh added for what the customer runs on electricity ({', '.join(i['big_users'])}), since the yearly use is not from the bill."})
        if goal in GOAL_LABEL:
            review.append({"code": "goal", "level": "note", "on": "pv", "text": f"The customer puts {GOAL_LABEL[goal]} first" + (f": a battery only when the engine is at least {round(GOAL_BATTERY[goal] * 100)}% sure." if goal in GOAL_BATTERY else f": solar up to {round((GOAL_PV[goal] - 1) * 100)}% larger, within the roof." if goal in GOAL_PV else ".")})
        trace = _trace(
            i=i, o=o, base=base, ev_mwh=ev_mwh, hp_mwh=hp_mwh, total=total, heat_type=heat_type, heat_mwh=heat_mwh,
            hp_kw=hp_kw, hp_wanted=hp_wanted, surfaces=surfaces, max_modules=max_modules, free_kwp=free_kwp,
            modules=modules, kwp_final=kwp_final, capped=capped, similar=similar, catalog=catalog,
            battery_kwh=battery_kwh, p_battery=float(p_battery[0]), has_storage=has_storage, wallbox=wallbox,
            production=production, estimate=estimate, review=review, typical=typical,
            habit=self.habit.get(i["installer"]), ex=ex, left=left)
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
                       "total_mwh": round(total, 2), "production_mwh": round(production, 1), "own_hp_mwh": round(own_hp, 2),
                       "existing_mwh": round(old_mwh, 1), "existing_kwp": round(old_kwp, 1) if known else None, **estimate},
            "similar": similar, "reasons": reasons, "warnings": warnings, "trace": trace, "review": review, "standing": standing,
        }


def _num(v, digits=1):
    v = v + 1e-9 if v >= 0 else v - 1e-9  # round halves up, as the screen does: 11.25 shows as 11.3 in both
    return f"{v:,.{digits}f}".rstrip("0").rstrip(".") if digits else f"{v:,.0f}"


def _standing(near, kwp, battery_kwh, heat_mwh, heat):
    """Where this design's sizes sit among what experts at this installer sold in similar homes: the share of those homes
    with a smaller system, and the middle 80%. For a planner checking their own design. The heat pump has too few sales
    to rank, so its size is set against the rule the engine sizes by."""
    pv = near.kwp
    sold = near[near.has_battery].battery_kwh
    q = lambda s, x: round(float(s.quantile(x)), 1) if len(s) else None
    out = {
        "pv": {"value": round(kwp, 2), "below": round(float((pv < kwp - 1e-6).mean()) * 100), "n": int(len(pv)), "low": q(pv, 0.1), "mid": q(pv, 0.5), "high": q(pv, 0.9)},
        "battery": {"value": battery_kwh, "rate": round(float(near.has_battery.mean()) * 100), "n": int(len(sold)),
                    "below": round(float((sold < battery_kwh - 1e-6).mean()) * 100) if len(sold) and battery_kwh else None,
                    "low": q(sold, 0.1), "mid": q(sold, 0.5), "high": q(sold, 0.9)},
    }
    if heat:
        out["heatpump"] = {"need_kw": round((heat_mwh or 15.0) * 1000 / HP_KWH_PER_KW, 1), "heat_known": bool(heat_mwh), "kwh_per_kw": HP_KWH_PER_KW}
    return out


def _review(near, similar, kwp, battery_kwh, total_mwh, has_storage, unsure, p_battery):
    """The reviewer: rules and similar homes, never a language model. It notes, it does not forbid."""
    notes = []
    n = len(near)
    share_below = round(float((near.kwp < kwp - 1e-6).mean()) * 100)
    if kwp > similar["kwp_high"]:
        notes.append({"code": "pv_high", "level": "warn", "on": "pv",
                      "text": f"{_num(kwp)} kWp is larger than {share_below}% of {n} similar homes at this installer "
                              f"(most chose {_num(similar['kwp_low'])}–{_num(similar['kwp_high'])} kWp)."})
    elif kwp < similar["kwp_low"]:
        notes.append({"code": "pv_low", "level": "warn", "on": "pv",
                      "text": f"{_num(kwp)} kWp is smaller than {100 - share_below}% of {n} similar homes at this installer "
                              f"(most chose {_num(similar['kwp_low'])}–{_num(similar['kwp_high'])} kWp)."})
    sold = near[near.has_battery].battery_kwh
    if battery_kwh and len(sold):
        if similar["battery_high"] is not None and battery_kwh > similar["battery_high"]:
            notes.append({"code": "battery_high", "level": "warn", "on": "battery",
                          "text": f"{_num(battery_kwh)} kWh is larger than {round(float((sold < battery_kwh).mean()) * 100)}% "
                                  f"of batteries sold in similar homes (most {_num(similar['battery_low'])}–{_num(similar['battery_high'])} kWh)."})
        elif similar["battery_low"] is not None and battery_kwh < similar["battery_low"]:
            notes.append({"code": "battery_low", "level": "warn", "on": "battery",
                          "text": f"{_num(battery_kwh)} kWh is smaller than most batteries sold in similar homes "
                                  f"({_num(similar['battery_low'])}–{_num(similar['battery_high'])} kWh)."})
        limit = GUIDE_KWH_PER_UNIT * min(kwp, total_mwh)
        if battery_kwh * BATTERY_USABLE > limit + 1e-6:
            notes.append({"code": "battery_guide", "level": "note", "on": "battery",
                          "text": f"Above the independent guideline (HTW Berlin): at most 1.5 kWh usable per kWp and per MWh of use, "
                                  f"here {_num(limit)} kWh. Experts at both installers usually sell about 1 kWh per kWp."})
    if not battery_kwh and not has_storage and similar["battery_rate"] >= 80:
        notes.append({"code": "battery_none", "level": "warn", "on": "battery",
                      "text": f"No battery, but {similar['battery_rate']}% of similar homes bought one."})
    if unsure:
        notes.append({"code": "battery_open", "level": "warn", "on": "battery",
                      "text": f"The battery decision is open: the engine is {round(p_battery * 100)}% sure. Discuss it with the customer."})
    return notes


def _existing_notes(ex):
    notes = []
    if not ex["kwp"]:
        notes.append({"code": "existing_unknown", "level": "warn", "on": "pv",
                      "text": "There is solar on the building, but neither its size nor its area is known, so the new system ignores it. Ask the customer."})
        return notes
    if ex["source"] == "area":
        notes.append({"code": "existing_estimated", "level": "warn", "on": "pv",
                      "text": f"The existing system's size is estimated from its marked area: {_num(ex['kwp'])} kWp at {KWP_PER_M2} kWp per m². Ask the customer for the real size."})
    if ex["ended"]:
        notes.append({"code": "existing_feed_in_ended", "level": "note", "on": "battery",
                      "text": f"The existing system is {ex['age']} years old: its fixed feed-in tariff ({FEED_IN_YEARS} years) has ended, so storing its power for the home pays more. Worth discussing a battery."})
    elif ex["age"] is None:
        notes.append({"code": "existing_age_unknown", "level": "note", "on": "pv",
                      "text": "The existing system's age is not known, so no output loss from ageing is counted."})
    return notes


def _trace(*, i, o, base, ev_mwh, hp_mwh, total, heat_type, heat_mwh, hp_kw, hp_wanted, surfaces, max_modules, free_kwp,
           modules, kwp_final, capped, similar, catalog, battery_kwh, p_battery, has_storage, wallbox, production,
           estimate, review, typical, habit=None, ex=None, left=None):
    """The engine's own steps, in order, each with what went in, how it was decided and what came out.
    Every number here is the engine's. Input keys match the request's facts, so the screen can show their source."""
    def fact(key, label, value):
        return {"key": key, "label": label, "value": value}

    steps = []
    need_in = [fact("demand_kwh", "House", f"{_num(base * 1000, 0)} kWh")]
    how = ["The house's yearly use"]
    if ev_mwh:
        if i.get("ev_kwh_month"):
            need_in.append(fact("ev_kwh_month", "Car at home", f"{_num(i['ev_kwh_month'], 0)} kWh a month"))
            how.append("car as charged at home, from the customer's wallbox")
        else:
            need_in.append(fact("ev_km", "Car", f"{_num(i.get('ev_km', 0), 0)} km"))
            share = HOME_SHARE.get(i.get("ev_charge_home"))
            how.append(f"car at {EV_KWH_PER_KM} kWh per km" + (f", {round(share * 100)}% of it charged at home" if share else ""))
    if hp_mwh:
        need_in.append(fact("heat_kwh", "Heat", f"{_num((heat_mwh or 15.0) * 1000, 0)} kWh"))
        how.append(f"heat pump: heat ÷ {HEAT_PUMP_COP}")
    if heat_type == "Heatpump" and i.get("hp_kwh"):
        need_in.append(fact("hp_kwh", "Heat pump now", f"{_num(i['hp_kwh'], 0)} kWh"))
        how.append("the heat pump already there, on its own meter")
    own_hp = (i.get("hp_kwh") or 0) / 1000 if heat_type == "Heatpump" else 0.0
    parts = [f"{_num(base)} house"] + ([f"{_num(ev_mwh)} car"] if ev_mwh else []) + ([f"{_num(hp_mwh)} heat pump"] if hp_mwh else []) + ([f"{_num(own_hp)} heat pump now"] if own_hp else [])
    steps.append({"id": "need", "title": "Yearly need", "kind": "rule", "inputs": need_in, "how": ", ".join(how) + ".",
                  "result": f"{_num(total)} MWh a year" + (f" ({' + '.join(parts)})" if len(parts) > 1 else "")})

    if ex:
        if ex["kwp"]:
            ex_in = [fact("existing_kwp", "Size", f"{_num(ex['kwp'])} kWp") if ex["source"] == "customer" else fact("existing_m2", "Marked area", f"{_num(ex['kwp'] / KWP_PER_M2, 0)} m²"),
                     fact("existing_year", "Year", str(datetime.date.today().year - ex["age"]) if ex["age"] is not None else "unknown")]
            how = ("Its size as given" if ex["source"] == "customer" else f"Size from the marked area at {KWP_PER_M2} kWp per m²") + \
                  f", {_num(ex['sun'], 0)} kWh per kWp" + (f", {_num(AGEING * 100)}% less output for each of its {ex['age']} years" if ex["age"] else "") + \
                  ". The new system is sized for the need that is left, and the battery for both systems."
            steps.append({"id": "existing", "title": "Solar already there", "kind": "physics", "inputs": ex_in, "how": how,
                          "result": f"{_num(ex['kwp'])} kWp makes about {_num(ex['mwh'])} MWh a year. Need left for the new system: {_num(left)} MWh."})
        else:
            steps.append({"id": "existing", "title": "Solar already there", "kind": "input", "inputs": [fact("has_solar", "Solar", "yes")],
                          "how": "Neither its size nor its area is known.", "result": "Not counted. The model only knows the home has solar."})

    if surfaces:
        best = max((s.get("kwh_per_kwp") or 0) for s in surfaces)
        steps.append({"id": "roof", "title": "Roof", "kind": "measured",
                      "inputs": [fact("surfaces", "Surfaces", f"{len(surfaces)} measured")],
                      "how": "Modules of 1.13 × 1.76 m fitted to each measured surface, 40 cm from the edges. Yield from PVGIS sun and measured shade.",
                      "result": f"{max_modules} modules fit ({_num(max_modules * ASSUMED_KWP_PER_MODULE)} kWp). Best surface {_num(best, 0)} kWh per kWp."})
    else:
        steps.append({"id": "roof", "title": "Roof", "kind": "input", "inputs": [],
                      "how": "No measured roof.", "result": "No area limit. Check the roof before quoting."})

    pv_in = [fact(None, "Need", f"{_num(left if left is not None else total)} MWh"), fact("installer", "Installer", "catalog and style")]
    if o.get("modules") is not None:
        pv_res = f"You fixed {modules} modules ({_num(kwp_final)} kWp). The model alone would choose {_num(free_kwp)} kWp."
        by = "planner"
    elif capped:
        pv_res = f"The model wants {_num(free_kwp)} kWp, the roof allows {max_modules} modules: {_num(kwp_final)} kWp."
        by = "engine"
    else:
        pv_res = f"{modules} modules, {_num(kwp_final)} kWp."
        by = "engine"
    steps.append({"id": "pv", "title": "Solar size", "kind": "learned", "by": by, "inputs": pv_in,
                  "how": f"Learned from {similar['learned_from']} past expert designs at this installer. More need never gives a smaller system." +
                         (f" The car counts at {round(EV_SIZING * 100)}% of its use here: experts give homes with a wallbox about 1 kWp more." if ev_mwh else ""),
                  "result": pv_res,
                  "context": f"In {similar['n']} similar homes{' with a wallbox' if ev_mwh else ''}, 8 in 10 experts chose {_num(similar['kwp_low'])}–{_num(similar['kwp_high'])} kWp."})

    sizes = ", ".join(_num(c) for c in catalog)
    if o.get("battery_kwh") is not None:
        b_res, by = (f"You chose {_num(battery_kwh)} kWh." if battery_kwh else "You chose no battery."), "planner"
    elif has_storage:
        b_res, by = "The home already has a battery, so none is added.", "engine"
    elif battery_kwh:
        b_res, by = f"{_num(battery_kwh)} kWh ({_num(battery_kwh / kwp_final)} kWh per kWp). The engine is {round(p_battery * 100)}% sure a battery belongs here.", "engine"
    else:
        b_res, by = f"No battery. The engine is {round((1 - p_battery) * 100)}% sure it does not belong here.", "engine"
    steps.append({"id": "battery", "title": "Battery", "kind": "learned", "by": by,
                  "inputs": [fact(None, "Solar", f"{_num(kwp_final)} kWp" + (f" new + {_num(ex['kwp'])} kWp there" if ex and ex["kwp"] else "")), fact("has_storage", "Existing battery", "yes" if has_storage else "no")],
                  "how": f"Learned from past designs: whether to add one, and how large, rounded to sizes this installer sells ({sizes} kWh)." +
                         (f" Within {_num(HABIT_KWH)} kWh of its most sold size, {_num(habit)} kWh, that size is taken: experts mostly sell it." if habit and o.get("modules") is None else "") +
                         " More solar never gives a smaller battery.",
                  "result": b_res,
                  "context": f"{similar['battery_rate']}% of similar homes bought one" +
                             (f", most {_num(similar['battery_low'])}–{_num(similar['battery_high'])} kWh." if similar["battery_low"] is not None else ".")})

    if heat_type == "Heatpump":
        hp_res = "The home already has one."
    elif hp_wanted:
        hp_res = f"{_num(hp_kw)} kW, from {_num((heat_mwh or 15.0) * 1000, 0)} kWh of heat at {HP_KWH_PER_KW:,} kWh per kW, as in the heat pumps sold here and the usual rule of thumb." + ("" if heat_mwh else " Heat use is a stand-in.")
    elif heat_type in REPLACEABLE:
        hp_res = "Not in the design: nobody asked for one. Offered as an alternative."
    elif heat_type == "District":
        hp_res = "Not in the design: the home has district heating."
    else:
        hp_res = "Not in the design."
    steps.append({"id": "heatpump", "title": "Heat pump", "kind": "rule", "by": "planner" if o.get("heatpump") is not None else "engine",
                  "inputs": [fact("heating", "Heating", heat_type or "unknown"), fact("heat_kwh", "Heat", f"{_num(heat_mwh * 1000, 0)} kWh" if heat_mwh else "unknown")],
                  "how": "A rule, not learned: only 17 past projects sold one. Added only when the customer or you ask. A room-by-room heat load is needed before ordering.",
                  "result": hp_res})

    steps.append({"id": "wallbox", "title": "Wallbox", "kind": "rule", "by": "planner" if o.get("wallbox") is not None else "engine",
                  "inputs": [fact("ev", "Electric car", "yes" if i.get("ev") else "no"), fact("has_wallbox", "Wallbox now", "yes" if i.get("has_wallbox") else "no")],
                  "how": "Added when there is an electric car, unless one is already on the wall.", "result": "Included." if wallbox else ("Not included: one is already there." if i.get("ev") and i.get("has_wallbox") else "Not included.")})

    steps.append({"id": "energy", "title": "Energy check", "kind": "physics",
                  "inputs": [fact(None, "Production", f"{_num(production)} MWh"), fact("price_ct_kwh", "Price", f"{_num(i.get('price_ct_kwh', 32.0))} ct"),
                             fact("home_day", "Home in the day", {"most": "mostly", "some": "sometimes", "rarely": "rarely"}.get(i.get("home_day"), "not said"))],
                  "how": f"One year hour by hour, with assumed household, car and heat profiles and {FEED_IN_CT_KWH} ct feed-in. An estimate, not a measurement." +
                         {"most": " The household shape has someone home in the day on weekdays.", "rarely": " The household shape has everyone out in the day on weekdays."}.get(i.get("home_day"), ""),
                  "result": (f"The new system makes {_num(production)} MWh, with the old one {_num(production + ex['mwh'])} MWh: {_num((production + ex['mwh']) / total)} times the need. "
                             f"About {estimate['self_sufficiency_pct']}% of the need from own power. The new system adds about €{estimate['saving_eur']:,} a year."
                             if ex and ex["kwp"] else
                             f"Makes {_num(production)} MWh, {_num(production / total)} times the need. About {estimate['self_sufficiency_pct']}% of the need from own power, about €{estimate['saving_eur']:,} saved a year.")})

    warn = [r for r in review if r["level"] == "warn"]
    steps.append({"id": "review", "title": "Review", "kind": "rule", "inputs": [],
                  "how": "Each size compared with what experts chose in similar homes, and with independent guidelines.",
                  "result": f"{len(warn)} {'point' if len(warn) == 1 else 'points'} to look at." if warn else "Nothing unusual against similar homes."})
    return steps


def engine_predictor(train, test, catalog):
    """Same interface as models.PREDICTORS, for scoring."""
    e = Engine().fit(train, train)  # project rows carry the same size columns as options
    e.catalog = catalog
    e.habit = e._habit(train)
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
