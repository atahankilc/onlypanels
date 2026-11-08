"""What follows from the homeowner's answers beyond the answers themselves.

Each answer the homeowner gives is worth more than its own field: how the rooms are heated and when the house was built
say how warm the water must run, so how much electricity a heat pump needs; a boiler's age says whether the speed bonus
applies; backup power needs a battery; a car coming later needs no wallbox yet. This module turns the answers into
those facts, each with what it came from and what it changes, so the engine uses them and the planner sees why.

Rules and stated assumptions only, never a language model and never past projects. Sources: docs/assumptions.md.
"""
# Seasonal efficiency of an air-source heat pump by how warm its water must run. Fraunhofer ISE field tests in existing
# homes ("WPsmart im Bestand", 2020 to 2022) found about 3.1 on average, higher with floor heating, lower with radiators
# in older homes. Our assumption from that; unknown keeps the data's own default of 3.5 so nothing moves unasked.
COP_DEFAULT = 3.5
COP = {"low": 3.6, "mid": 3.2, "high": 2.8}
FLOW_C = {"low": 35, "mid": 45, "high": 55}
NEWER = {"1991to2000", "2001to2010", "since2011"}  # insulated well enough that radiators can run at about 45 °C
HOT_WATER_KWH = 2000  # an electric water heater's heat a year (design.BIG_USERS_KWH["water"]), moved to the heat pump when one comes
COP_HOT_WATER = 2.5  # hot water runs at about 55 °C all year
# Heat a year per m² against what the build period leads us to expect: outside half to one and a half times, ask.
HEAT_CHECK = (0.5, 1.5)
TYPICAL_KWH_M2 = {"before1979": 180, "1979to1990": 140, "1991to2000": 120, "2001to2010": 90, "since2011": 60}  # design.HEAT_KWH_PER_M2
BUILT_WORDS = {"before1979": "before 1979", "1979to1990": "1979–1990", "1991to2000": "1991–2000", "2001to2010": "2001–2010", "since2011": "2011 or later"}
# How far the yearly use may be off, by where it came from: the edges the engine tries to see whether the answer matters.
DEMAND_SPREAD = {"bill": 0.0, "range": 0.15, "band": 0.15, "payment": 0.15, "people": 0.3}
DEMAND_UNKNOWN = (2500, 6000)


def flow(i):
    """How warm the heating water must run: low, mid, high or None when the customer did not say how rooms are heated."""
    dist = i.get("heat_dist")
    if dist == "floor":
        return "low", "underfloor heating runs at about 35 °C"
    if dist in ("radiators", "both"):  # with both, the radiators set how warm the water must run
        what = "radiators" if dist == "radiators" else "radiators (with underfloor heating too, the radiators set the temperature)"
        if i.get("built") in NEWER:
            return "mid", f"{what} in a house built {BUILT_WORDS[i['built']]} run at about 45 °C"
        if i.get("built"):
            return "high", f"{what} in a house built {BUILT_WORDS[i['built']]} need about 55 °C"
        return "high", f"{what} in a house of unknown age: assumed to need about 55 °C"
    return None, None


def cop(i):
    level, _ = flow(i)
    return COP.get(level, COP_DEFAULT)


def demand_edges(i):
    """The lowest and highest yearly use the answer allows, or None when it came from the bill."""
    source, kwh = i.get("demand_source"), i.get("demand_kwh")
    if i.get("demand_assumed") or not kwh or source in (None, "unknown"):
        return DEMAND_UNKNOWN
    lo, hi = (list(i.get("use_range") or []) + [None, None])[:2]
    if lo and hi and hi > lo:
        return float(lo), float(hi)  # the homeowner's own from–to
    spread = DEMAND_SPREAD.get(source, 0.15)
    return (round(kwh * (1 - spread), -2), round(kwh * (1 + spread), -2)) if spread else None


def derive(i, heat_mwh=None, hp_wanted=False):
    """Facts that follow from the answers. Each: id, title, text, from (the answer keys), changes (what it moves)."""
    out = []

    def fact(id_, title, text, keys, changes=None, level="note"):
        out.append({"id": id_, "title": title, "text": text, "from": keys, "changes": changes, "level": level})

    heat = i.get("heating")
    level, why = flow(i)
    if level and (hp_wanted or heat in ("Gas", "Oil", "OtherNonRenewable", "Electric")):
        c = COP[level]
        fact("flow", f"Heat pump efficiency {c}", f"{why[0].upper() + why[1:]}, so a heat pump makes about {c} kWh of heat per kWh of electricity a year"
             + (". Its electricity, and so the solar sized for it, follows." if hp_wanted else "."), ["heat_dist", "built"], "heatpump" if hp_wanted else None)
        if level == "high" and hp_wanted:
            fact("radiators", "Radiators may need to grow", "At 55 °C a heat pump works, but larger radiators in the coldest rooms would let it run cooler and use less. Check them on site.",
                 ["heat_dist", "built"], level="warn")

    m2 = i.get("living_m2")
    if heat_mwh and m2 and not i.get("living_from_model") and i.get("heat_kwh"):
        per = heat_mwh * 1000 / m2
        built = i.get("built") or i.get("area_built")
        if built in TYPICAL_KWH_M2:
            typical = TYPICAL_KWH_M2[built]
            share = per / typical
            if share < HEAT_CHECK[0] or share > HEAT_CHECK[1]:
                fact("heat_check", "Heat use does not fit the house", f"{round(heat_mwh * 1000):,} kWh of heat for {round(m2):,} m² is {round(per)} kWh per m², "
                     f"{'far below' if share < 1 else 'far above'} the {typical} we expect for a house built {BUILT_WORDS[built]}. "
                     + ("Perhaps part of the house is heated another way, or the figure is a part year." if share < 1 else "Perhaps the figure holds hot water for more homes, or the house has not been renovated.")
                     + " Confirm before sizing a heat pump.", ["heat_kwh", "living_m2", "built"], "heatpump", "warn")
            else:
                fact("heat_check", "Heat use fits the house", f"{round(per)} kWh per m², against about {typical} for a house built {BUILT_WORDS[built]}.", ["heat_kwh", "living_m2", "built"])

    big = i.get("big_users") or []
    if hp_wanted and "water" in big:
        moved = HOT_WATER_KWH * (1 - 1 / COP_HOT_WATER)
        fact("hot_water", "Hot water moves to the heat pump", f"The electric water heater's {HOT_WATER_KWH:,} kWh a year are made by the heat pump instead, at about {COP_HOT_WATER} kWh of heat per kWh: "
             f"about {round(moved, -1):,.0f} kWh less electricity a year.", ["big_users"], "need")
    if hp_wanted and heat == "Electric" and i.get("heat_kwh"):  # its electricity is its heat: no boiler loss
        hp = i["heat_kwh"] / cop(i)
        meter = i.get("electric_heat_meter")
        fact("electric_heat", "Electric heating replaced", f"The electric heating's {round(i['heat_kwh']):,} kWh a year become about {round(hp, -1):,.0f} kWh for the heat pump. "
             + ("It is on its own meter, so the house's use stays as given." if meter == "own" else
                "It is on the house's meter, so it is taken out of the yearly use from the bill." if meter == "house" else
                "If the heating is on the same meter as the house, the yearly use already holds it: ask, or the need is counted twice."),
             ["heating", "heat_kwh", "demand_kwh", "electric_heat_meter"], "need", "note" if meter else "warn")
    if hp_wanted and i.get("solar_thermal"):
        fact("thermal_hp", "Solar hot water stays", "The customer's hot water collectors make much of the summer's hot water, so the heat pump runs less then. Not counted in its size.", ["solar_thermal"])

    age = i.get("boiler_age")
    if heat in ("Gas", "Oil", "OtherNonRenewable") and age:
        if age == "over20":
            fact("boiler", "Boiler over 20 years old", ("A working gas boiler of 20 years or more, or any oil boiler, qualifies for KfW's speed bonus when a heat pump replaces it, for owners living in the home. "
                 if heat == "Gas" else "An oil boiler qualifies for KfW's speed bonus when a heat pump replaces it, for owners living in the home. ")
                 + "Boilers of 30 years must usually be replaced by law (GEG §72). The heat pump is the first variant to show.", ["boiler_age", "heating", "owner"], "heatpump")
        elif age == "10to20":
            fact("boiler", "Boiler 10 to 20 years old", "Replacement comes within the system's life: worth showing the heat pump variant so the solar is sized for it now.", ["boiler_age", "heating"], "heatpump")
        else:
            fact("boiler", "Boiler under 10 years old", "A new boiler is rarely replaced soon: the heat pump is a later step, not this offer.", ["boiler_age", "heating"])

    if i.get("backup"):
        fact("backup", "Backup power needs a battery", "The customer wants power in an outage. That needs a battery and an inverter that can island the home, so a battery is kept in the design.",
             ["backup"], "battery")

    if i.get("ev") and i.get("ev_when") == "later":
        fact("car_later", "Car comes later", "The solar is sized for the car now, since modules are cheaper added at once; the wallbox is left for when the car comes. Lay the cable now.",
             ["ev_when"], "wallbox")
    elif i.get("ev") and i.get("ev_when") == "soon":
        fact("car_soon", "Car within a year", "Sized and offered with the wallbox, as if the car were here.", ["ev_when"])

    owner = i.get("owner")
    if owner == "tenant":
        fact("owner", "The customer rents", "The landlord decides and pays for the roof. Offer only after the landlord agrees; a balcony system needs no permission.", ["owner"], level="warn")
    elif owner == "shared":
        fact("owner", "Owners' association decides", "Since 2020 an owner may ask the association for solar, and it decides by simple majority (WEG §20). Self-use is only the customer's own flat unless the association shares the power.", ["owner"], level="warn")

    home = i.get("home_day")
    if home == "rarely":
        fact("home_day", "Nobody home in the day", "Use falls in the morning and evening, away from the sun: less solar is used directly, so a battery is worth more here.", ["home_day"], "battery")
    elif home == "most":
        fact("home_day", "Someone home in the day", "Use falls while the sun shines: more is used directly, so a battery adds less.", ["home_day"], "battery")
    if i.get("ev") and i.get("ev_day"):
        fact("ev_day", "Car charges in the day", "The car stands at home while the sun shines, so it takes solar directly.", ["ev_day"])

    if i.get("goal") == "cost" and i.get("backup"):
        fact("goal_backup", "Low cost and backup pull apart", "The customer puts low cost first but wants backup power, which needs a battery. Ask which matters more.", ["goal", "backup"], level="warn")

    edges = demand_edges(i)
    if edges:
        fact("demand_edges", "Yearly use is not from a bill", f"It may lie anywhere from {edges[0]:,.0f} to {edges[1]:,.0f} kWh. The review tries both ends to see whether it matters.", ["demand_kwh"])

    if i.get("trees") is True:
        fact("trees_said", "Customer reports big trees", "Check the roof's measured tree shade against what the customer says.", ["trees"])
    return out

