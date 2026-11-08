"""The planner's review of one request, as a senior planner does it, without a language model.

Three passes over the engine, each a fixed rule, so the same request always gives the same review in well under a second:
1. What follows from the homeowner's answers (derive.py): the facts the design already uses, and the conditions to clear.
2. Which uncertain answers matter: the engine runs again at the edges of each answer that was guessed, not given
   (a yearly use from a range, a heat use from the house, an unknown way of heating, who is home in the day). An answer
   that moves the design becomes a question for the customer, with what it moves; one that does not is fine as given.
3. Which option fits the customer: the draft, or one change from the customer's priority, backup, day at home and boiler,
   checked against what the engine says each battery size does here.
Every number comes from an engine run in this review.
"""
from .derive import demand_edges

TYPICAL_KM = 11300  # a car's km a year when none is given, as web/src/questions.ts TYPICAL_KM

MODULES_MATTER = 2  # a yearly use that moves solar by fewer modules than this is fine as given
OWN_POWER_MATTERS = 5  # points of own power that make "who is home in the day" worth asking
BATTERY_STEP_WORTH = 4  # points of own power a larger battery must add for an independence-first customer
BATTERY_ADD_WORTH = 8  # points a battery must add before it is proposed to a home that is empty in the day


SHAPED = ("flow", "hot_water", "backup", "car_later", "boiler")  # derived facts that move the design itself


def short(d):
    e = d["energy"]
    return {"modules": d["pv"]["modules"], "kwp": d["pv"]["kwp"], "battery_kwh": d["battery"]["kwh"],
            "heatpump_kw": d["heatpump"]["kw"] if d["heatpump"]["included"] else 0, "wallbox": d["wallbox"]["included"],
            "production_mwh": e["production_mwh"], "need_mwh": e["total_mwh"], "own_power_pct": e["self_sufficiency_pct"],
            "saving_eur_year": e["saving_eur"]}


def moved(a, b):
    """What changes between two designs, in words, and whether it matters."""
    out = []
    if abs(a["modules"] - b["modules"]) >= MODULES_MATTER:
        out.append(f"{a['modules']} → {b['modules']} modules")
    if a["battery_kwh"] != b["battery_kwh"]:
        out.append(f"battery {a['battery_kwh']:g} → {b['battery_kwh']:g} kWh")
    if a["heatpump_kw"] != b["heatpump_kw"]:
        out.append(f"heat pump {a['heatpump_kw']:g} → {b['heatpump_kw']:g} kW")
    return out


def sized(s):
    """A design in a few words, for the review's lines."""
    return f"{s['modules']} modules, " + (f"{s['battery_kwh']:g} kWh battery" if s["battery_kwh"] else "no battery") + (f", {s['heatpump_kw']:g} kW heat pump" if s["heatpump_kw"] else "")


def review(run, i, o, quick=None):
    """run(inputs, overrides) is the API's full design call; quick, the same without variants and battery table, for the edges."""
    quick = quick or run
    o = {k: v for k, v in (o or {}).items() if v is not None}
    steps = []

    def go(what_if=None, fixed=None, why="", full=False):
        d = (run if full else quick)({**i, **(what_if or {})}, {**o, **(fixed or {})})
        s = short(d)
        steps.append({"tool": "try_design", "fixed": fixed or {}, "what_if": what_if or {}, "why": why, "result": s})
        return d, s

    draft_d, draft = go(why="The draft", full=True)
    facts = draft_d.get("derived") or []

    # 2. Uncertain answers, at their edges.
    asks, steady = [], []

    def edge(key, label, question, lo, hi, lo_words, hi_words):
        _, a = go(lo, why=f"{label}: {lo_words}")
        _, b = go(hi, why=f"{label}: {hi_words}")
        change = moved(a, b)
        if change:
            # Stated as what the engine gives at each end, not as a trend: the learned battery size need not grow with use.
            asks.append({"fact": key, "question": question, "why": f"At {lo_words}: {sized(a)}. At {hi_words}: {sized(b)}. The draft: {sized(draft)}.", "low": a, "high": b})
        else:
            steady.append({"fact": key, "text": f"{label}: from {lo_words} to {hi_words} the design stays the same ({a['modules']} to {b['modules']} modules)."})

    edges = demand_edges({**i, "demand_assumed": i.get("demand_assumed") or not i.get("demand_kwh")})
    if edges:
        lo, hi = edges
        edge("demand_kwh", "Yearly use", "What does the electricity bill say for a whole year?",
             {"demand_kwh": lo}, {"demand_kwh": hi}, f"{lo:,.0f} kWh", f"{hi:,.0f} kWh")  # the request's own source: a bill would drop the big users the draft adds

    hp = draft["heatpump_kw"] > 0
    if hp and not i.get("heat_kwh"):
        heat = (draft_d["energy"].get("heat_mwh") or 15.0) * 1000
        lo, hi = round(heat * 0.7, -2), round(heat * 1.3, -2)
        asked = {"Electric": "How much electricity does the electric heating use in a year?", "Oil": "How many litres of oil does the home use in a year?",
                 "Gas": "How much gas does the home use in a year (kWh or euros)?"}.get(i.get("heating"), "How much fuel does the home use for heating in a year?")
        edge("heat_kwh", "Heat a year", asked, {"heat_kwh": lo}, {"heat_kwh": hi}, f"{lo:,.0f} kWh", f"{hi:,.0f} kWh")
    if hp and not i.get("heat_dist"):
        edge("heat_dist", "Heating", "Are the rooms heated by underfloor heating or radiators?", {"heat_dist": "floor"}, {"heat_dist": "radiators"}, "underfloor", "radiators")
    if i.get("ev") and not i.get("ev_kwh_month"):
        km = i.get("ev_km") or TYPICAL_KM
        edge("ev_km", "Driving", "How far does the car go in a year, and how much of it is charged at home?",
             {"ev_km": round(km * 0.6, -2)}, {"ev_km": round(km * 1.4, -2)}, f"{round(km * 0.6, -2):,.0f} km", f"{round(km * 1.4, -2):,.0f} km")
    if not i.get("home_day"):
        _, a = go({"home_day": "most"}, why="Someone home in the day")
        _, b = go({"home_day": "rarely"}, why="Nobody home in the day")
        gap = a["own_power_pct"] - b["own_power_pct"]
        if abs(gap) >= OWN_POWER_MATTERS:
            asks.append({"fact": "home_day", "question": "Is someone at home during the day on weekdays?",
                         "why": f"Own power is {a['own_power_pct']}% with someone home, {b['own_power_pct']}% without: it decides how much a battery is worth.", "low": a, "high": b})
        else:
            steady.append({"fact": "home_day", "text": f"Who is home in the day moves own power only from {b['own_power_pct']}% to {a['own_power_pct']}%."})

    # 3. One change that fits the customer, or the draft.
    curve = draft_d.get("battery_curve") or []
    own = {round(r["kwh"], 1): r["own_pct"] for r in curve}
    now = draft["battery_kwh"]
    goal, backup = i.get("goal"), i.get("backup")
    change, reasons = None, []
    if o.get("battery_kwh") is None and not i.get("has_storage"):
        bigger = sorted(k for k in own if k > now)
        if goal == "independence" and bigger and own[bigger[0]] - own.get(round(now, 1), 0) >= BATTERY_STEP_WORTH:
            change = {"battery_kwh": bigger[0]}
            money = {round(x["kwh"], 1): x for x in draft_d.get("battery_money") or []}
            up, here_m = money.get(round(bigger[0], 1)), money.get(round(now, 1))
            cost = f" It costs about €{up['cost_eur'] - (here_m['cost_eur'] if here_m else 0):,} more and adds about €{up['year1_eur'] - (here_m['year1_eur'] if here_m else 0):,} a year." if up else ""
            reasons.append(f"The customer puts independence first, and {bigger[0]:g} kWh raises own power from {own.get(round(now, 1), 0)}% to {own[bigger[0]]}%.{cost}")
        elif goal == "cost":
            # Low cost first: the engine has already chosen battery and modules by money (costs.best_for_money); say how.
            pick = draft_d.get("money_pick")
            if pick and not pick["kept"]:
                reasons.append(f"The customer puts low cost first, so the engine chose by money among {pick['tried']} options experts use for similar homes, none dearer than its first draft: "
                               f"€{pick['pays_eur']:,} and about €{pick['gain_eur']:,} ahead after 20 years, against €{pick['draft_pays_eur']:,} and €{pick['draft_gain_eur']:,}.")
            elif pick:
                reasons.append(f"The customer puts low cost first: the engine tried {pick['tried']} battery sizes and module counts, and the draft already leaves the customer most ahead (about €{pick['gain_eur']:,} after 20 years).")
        elif i.get("home_day") == "rarely" and not now and goal != "cost":
            sizes = sorted(k for k in own if k > 0)
            if sizes and own[sizes[0]] - own.get(0.0, 0) >= BATTERY_ADD_WORTH:
                change = {"battery_kwh": sizes[0]}
                reasons.append(f"Nobody is home in the day, so a {sizes[0]:g} kWh battery raises own power from {own.get(0.0, 0)}% to {own[sizes[0]]}%.")
    after = None
    if change:
        _, after = go(fixed=change, why="Proposed")

    for f in facts:  # the answers that shaped this draft, beyond the yearly use
        if f["id"] in SHAPED and f.get("changes"):
            reasons.append(f["title"] + ": " + f["text"])
    alt_hp = next((a for a in draft_d.get("alternatives") or [] if a["id"] == "heatpump"), None)
    if alt_hp and i.get("boiler_age") in ("over20", "10to20"):
        reasons.append(f"Show the heat pump variant first: {alt_hp['pv']['modules']} modules, {alt_hp['heatpump_kw']:g} kW heat pump, {alt_hp['energy']['self_sufficiency_pct']}% own power.")

    conditions = [{"id": f["id"], "title": f["title"], "text": f["text"]} for f in facts if f["level"] == "warn"]
    asks.sort(key=lambda a: -abs(a["low"]["modules"] - a["high"]["modules"]) - (5 if a["low"]["battery_kwh"] != a["high"]["battery_kwh"] else 0))
    words = lambda c: ", ".join([f"{c['battery_kwh']:g} kWh battery" if c.get("battery_kwh") else "no battery"] if "battery_kwh" in c else [])
    headline = f"Send with {words(change)}" if change else ("Send the draft, after the questions below" if asks else "Send the draft as it is")
    return {"headline": headline, "change": change, "after": after, "reasons": reasons, "asks": asks, "steady": steady,
            "conditions": conditions, "facts": facts, "draft": draft, "steps": steps, "source": "engine"}
