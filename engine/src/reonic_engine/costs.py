"""What a design costs the homeowner, and when and how it pays back.

The engine's design says what goes on the roof and in the house; the price book (pricebook.py) prices each part; the
hourly estimate (energy.py) says how many kWh the home covers itself and sells. From those, by fixed rules:

- the bill of materials: every line with quantity and price, VAT by law (0% for solar and battery, 19% otherwise)
- the KfW grant for a heat pump (BEG, as reformed on 21 July 2026)
- the yearly money before and after: grid electricity, feed-in, gas or oil, upkeep
- each year for the years looked at, with prices rising and the panels ageing: payback year, gain, return
- what the battery and the heat pump each add on their own

No language model and no past project touches these numbers.
"""
import numpy as np

from .pricebook import book as price_book
from .energy import simulate, sun_shape
from . import incentives

INVERTER_KW = [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]
DC_AC = 0.85  # an inverter of at least 85% of the solar's kWp: common sizing, panels rarely reach their peak
FLAT_DEG = 10
BATTERY_LIFE = 15  # years: LFP warranties run 10 years; 6,000 cycles at one a day are about 16
FOSSIL = ("Gas", "Oil", "OtherNonRenewable")
# BEG heating grant for homes (KfW 458) since 21 July 2026: Ökozentrum NRW summary of the reform, 6 August 2026.
BEG_BASE = 30
BEG_SPEED = 16  # replacing working oil, coal or night storage heating, or a gas boiler of 20 years or more; owners living in the home
BEG_CAP = 70  # 80 for taxable household income up to €30,000 (€40,000 with a child)
BEG_ELIGIBLE_EUR = 28_000  # first home unit
# Income bonus by taxable household income band, without and with a child under 18.
BEG_INCOME = {"le30": (40, 40), "le40": (30, 40), "le50": (10, 30), "le60": (0, 10), "above": (0, 0)}
POST_EEG_CT = 4.0  # after the 20 feed-in years: roughly the market value of solar power, our assumption


def _rate(b, key):
    return float(b["rates"][key]["value"])


def _inverter_kw(kwp):
    return next((s for s in INVERTER_KW if s >= kwp * DC_AC), INVERTER_KW[-1])


def _flat(i, d):
    """The modules lie mostly on a flat roof."""
    surfaces, placed = i.get("surfaces") or [], d["pv"].get("placed") or []
    if surfaces and placed:
        flat = sum(n for n, s in zip(placed, surfaces) if (30 if s.get("tilt") is None else s["tilt"]) < FLAT_DEG)
        return flat * 2 > sum(placed)
    return i.get("roof_tilt") is not None and i["roof_tilt"] < FLAT_DEG


def _replaces(i, d):
    return d["heatpump"]["included"] and i.get("heating") in (*FOSSIL, "Electric")


def bill_of_materials(i, d, b, extras=None, qty=None):
    """Every line for this design: in it by rule, or an extra (ticked by the planner, else by how often this installer adds it)."""
    extras, qty = extras or {}, qty or {}
    modules = d["pv"]["modules"] if d["pv"]["kwp"] else 0
    have = {"solar": modules > 0, "battery": d["battery"]["kwh"] > 0, "wallbox": d["wallbox"]["included"], "heatpump": d["heatpump"]["included"]}
    inv_kw = _inverter_kw(d["pv"]["kwp"]) if modules else 0
    flat = _flat(i, d)
    cond = {"always": True, "pitched": not flat, "flat": flat, "backup": bool(i.get("backup")), "replace": _replaces(i, d),
            "oil": d["heatpump"]["included"] and i.get("heating") == "Oil"}
    count = {"job": 1, "module": modules, "kwp": d["pv"]["kwp"], "kwh": d["battery"]["kwh"], "kw_inverter": inv_kw,
             "kw_heatpump": d["heatpump"]["kw"], "metre": 1, "piece": 1}
    lines, offered = [], []
    for item in b["items"]:
        if not have.get(item["tech"]):
            continue
        n = qty.get(item["id"], item.get("qty") or count[item["unit"]])
        if item["unit"] == "module" and item["id"] not in qty and item["when"] == "extra":
            n = modules  # an optimizer per module unless the planner says how many
        if item["when"] == "extra":
            on = extras.get(item["id"], item.get("on_by_default", False))
            share = (item.get("share") or {}).get(i.get("installer"))
            offered.append({"id": item["id"], "tech": item["tech"], "name": item["name"], "on": bool(on), "share": share,
                            "qty": n, "unit": item["unit"], "net": round(item["fixed"] + item["per_unit"] * n)})
            if not on:
                continue
        elif not cond.get(item["when"], False):
            continue
        net = item["fixed"] + item["per_unit"] * n
        lines.append({"id": item["id"], "tech": item["tech"], "kind": item["kind"], "name": item["name"], "qty": round(float(n), 2), "unit": item["unit"],
                      "fixed": item["fixed"], "per_unit": item["per_unit"], "vat": item["vat"], "net": round(net), "gross": round(net * (1 + item["vat"] / 100)),
                      "custom": item.get("custom", False), "edited": item.get("edited", False), "extra": item["when"] == "extra"})
    return lines, offered, inv_kw


def grant(i, d, lines, income=None, kids=False):
    """KfW's grant for the heat pump: the share of its eligible cost, by the rules since 21 July 2026."""
    hp = sum(l["gross"] for l in lines if l["tech"] == "heatpump")
    if not hp:
        return None
    notes, rate = [], BEG_BASE
    owner_lives = i.get("owner") != "tenant"
    heat, age = i.get("heating"), i.get("boiler_age")
    speed = owner_lives and (heat in ("Oil", "OtherNonRenewable", "Electric") or (heat == "Gas" and age == "over20"))
    if speed:
        rate += BEG_SPEED
        notes.append(f"+{BEG_SPEED}% speed bonus: the {'gas boiler of 20 years or more' if heat == 'Gas' else heat.lower().replace('othernonrenewable', 'fossil') + ' heating'} is replaced"
                     + (" (electric heating counts only if it is night storage heating)" if heat == "Electric" else ""))
    elif heat == "Gas" and owner_lives and age is None:
        notes.append(f"Boiler age not known: a gas boiler of 20 years or more adds {BEG_SPEED}%.")
    elif not owner_lives:
        notes.append("A landlord gets the base rate only; the speed and income bonuses are for owners living in the home.")
    cap = BEG_CAP
    if income in BEG_INCOME and owner_lives:
        bonus = BEG_INCOME[income][1 if kids else 0]
        if bonus:
            rate += bonus
            notes.append(f"+{bonus}% income bonus")
        if income == "le30" or (kids and income == "le40"):
            cap = 80
    elif owner_lives:
        notes.append("Household income not given: up to 40% more for taxable income up to €60,000 with a child, €50,000 without.")
    rate = min(rate, cap)
    eligible = min(hp, BEG_ELIGIBLE_EUR)
    beg = round(eligible * rate / 100)
    # Munich's own 15% comes only on KfW's base rate, without its bonuses, and both together stay within 60%.
    fkg_rate = min(BEG_BASE + incentives.FKG_HP, incentives.FKG_CAP) if incentives.MUNICH and i.get("heating") != "District" else 0
    city = round(eligible * fkg_rate / 100)
    if fkg_rate and city > beg:
        notes.append(f"Better here: KfW's base {BEG_BASE}% with Munich's {incentives.FKG_HP}% (FKG) instead of KfW alone ({rate}%{' with its bonuses' if rate > BEG_BASE else ''}): {fkg_rate}% of €{eligible:,.0f}. "
                     "Only where district heating is neither there nor possible: ask SWM. Apply at the city and at KfW before signing the order.")
        return {"rate_pct": fkg_rate, "eligible_eur": round(eligible), "eur": city, "notes": notes, "path": "fkg",
                "beg_eur": round(eligible * BEG_BASE / 100), "fkg_eur": city - round(eligible * BEG_BASE / 100), "other_eur": beg}
    notes.append(f"{rate}% of €{eligible:,.0f} eligible cost (at most €{BEG_ELIGIBLE_EUR:,} for the first home). Apply at KfW before signing the order."
                 + (f" Munich's FKG path ({fkg_rate}%) would give €{city:,}, less than this." if fkg_rate else ""))
    return {"rate_pct": rate, "eligible_eur": round(eligible), "eur": beg, "notes": notes, "path": "beg", "beg_eur": beg, "fkg_eur": 0, "other_eur": city}


def _fuel(i, d, b):
    """Gas or oil bought a year now, that a new heat pump makes unnecessary: kWh and euros. None without one."""
    if not d["heatpump"]["included"] or i.get("heating") not in FOSSIL:
        return None
    kwh = i.get("heat_kwh") or (d["energy"].get("heat_mwh") or 15.0) * 1000 / 0.85  # a bill counts fuel; a heat estimate is heat
    ct = _rate(b, "oil_ct") if i.get("heating") == "Oil" else _rate(b, "gas_ct")
    return {"kwh": round(kwh), "ct": ct, "eur": round(kwh * ct / 100), "kind": "oil" if i.get("heating") == "Oil" else "gas"}


def _feed_ct(b, kwp):
    """EEG pays the first 10 kWp at one rate and the rest at a lower one: the mix for this size."""
    lo, hi = _rate(b, "feed_in_ct"), _rate(b, "feed_in_above_ct")
    return lo if kwp <= 10 else (10 * lo + (kwp - 10) * hi) / kwp


def _before(i, d):
    """The home without the new system: what it uses on the grid meter, with what it already has (an old system, old battery)."""
    e = d["energy"]
    moved = 0.0
    if d["heatpump"]["included"] and i.get("heating") == "Electric" and i.get("heat_kwh"):
        moved += i["heat_kwh"]  # electric heating today, on whichever meter: it was paid as electricity
    if d["heatpump"]["included"] and "water" in (i.get("big_users") or []):
        moved += 2000  # an electric water heater moves to the heat pump (derive.HOT_WATER_KWH)
    sun = sun_shape(i.get("surfaces") or None, d["pv"].get("placed"))
    return simulate(e["base_mwh"] * 1000 + moved, e["ev_mwh"] * 1000, (e.get("own_hp_mwh") or 0) * 1000, (e.get("existing_mwh") or 0) * 1000,
                    float(e.get("existing_battery_kwh") or 0), i.get("price_ct_kwh", 32.0), sun=sun, ev_day=bool(i.get("ev_day")), home_day=i.get("home_day"))


def _home(i, d, battery_kwh, cap=None):
    """The home with the new system, as the design has it, with another battery or a feed-in limit (kW)."""
    e = d["energy"]
    sun = sun_shape(i.get("surfaces") or None, d["pv"].get("placed"))
    return simulate(e["base_mwh"] * 1000, e["ev_mwh"] * 1000, (e["hp_mwh"] + (e.get("own_hp_mwh") or 0)) * 1000, (e["production_mwh"] + (e.get("existing_mwh") or 0)) * 1000,
                    battery_kwh + float(e.get("existing_battery_kwh") or 0), i.get("price_ct_kwh", 32.0), sun=sun, ev_day=bool(i.get("ev_day")), home_day=i.get("home_day"), export_cap_kw=cap)


def _battery_eur(i, d, price, feed_ct):
    """What the new battery adds a year: the same home and roof without it. Zero without a battery."""
    if not d["battery"]["kwh"]:
        return 0.0
    e = d["energy"]
    sun = sun_shape(i.get("surfaces") or None, d["pv"].get("placed"))
    z = simulate(e["base_mwh"] * 1000, e["ev_mwh"] * 1000, (e["hp_mwh"] + (e.get("own_hp_mwh") or 0)) * 1000, (e["production_mwh"] + (e.get("existing_mwh") or 0)) * 1000,
                 float(e.get("existing_battery_kwh") or 0), price, sun=sun, ev_day=bool(i.get("ev_day")), home_day=i.get("home_day"))
    return max(0.0, (e["own_kwh"] - z["own_kwh"]) * price / 100 + (e["export_kwh"] - z["export_kwh"]) * feed_ct / 100)


def cash_flow(invest, year1, b, inverter_eur=0.0, years=None, feed_ct_by_year=None):
    """Each year's money for the years looked at: electricity and fuel prices rise, the panels age, the feed-in stays fixed
    for 20 years, the inverter is replaced once, and the battery's part ends with its life (nothing is assumed after it).
    year1: own_eur, feed_eur, fuel_eur, extra_power_eur, upkeep_eur and battery_eur (what the battery adds, inside the others)."""
    years = years or int(_rate(b, "years"))
    rise_e, rise_f = _rate(b, "electricity_rise_pct") / 100, _rate(b, "fuel_rise_pct") / 100
    age = _rate(b, "degradation_pct") / 100
    swap = int(_rate(b, "inverter_life")) + 1
    rows, total = [], -invest
    for t in range(1, years + 1):
        e, f, a = (1 + rise_e) ** (t - 1), (1 + rise_f) ** (t - 1), (1 - age) ** (t - 1)
        first = max(year1.get("feed_ct", 7.7), 0.1)
        ct = feed_ct_by_year[t - 1] if feed_ct_by_year and t <= len(feed_ct_by_year) else (first if t <= 20 else POST_EEG_CT)
        feed = year1["feed_eur"] * a * ct / first
        money = year1["own_eur"] * a * e + feed + year1["fuel_eur"] * f - year1["extra_power_eur"] * e + year1["upkeep_eur"]
        if t == swap and inverter_eur:
            money -= inverter_eur
        if t > BATTERY_LIFE:
            money -= year1.get("battery_eur", 0.0) * a * e
        total += money
        rows.append({"year": t, "eur": round(money), "total": round(total)})
    payback = None
    for k, r in enumerate(rows):
        if r["total"] >= 0:
            prev = rows[k - 1]["total"] if k else -invest
            payback = round(k + (-prev) / max(r["total"] - prev, 1e-9), 1)
            break
    flows = [-invest] + [r["eur"] for r in rows]
    return {"rows": rows, "payback_years": payback, "gain_eur": round(total), "irr_pct": _irr(flows)}


def _irr(flows):
    if flows[0] >= 0 or sum(flows) <= 0:
        return None
    lo, hi = -0.5, 1.0
    npv = lambda r: sum(f / (1 + r) ** k for k, f in enumerate(flows))
    for _ in range(80):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if npv(mid) > 0 else (lo, mid)
    return round(mid * 100, 1)


def evaluate(i, d, b=None, extras=None, qty=None, income=None, kids=False, light=False, before=None):
    """The full money view of one design. light: only what a comparison needs (no 2027 scenario, no rules list);
    before: the home without the new system, when the caller already has it (it does not depend on the design's size)."""
    b = b or price_book(i.get("installer"))
    lines, offered, inv_kw = bill_of_materials(i, d, b, extras, qty)
    net = sum(l["net"] for l in lines)
    gross = sum(l["gross"] for l in lines)
    g = grant(i, d, lines, income, kids)
    pays = gross - (g["eur"] if g else 0)
    price = i.get("price_ct_kwh", 32.0)
    e = dict(d["energy"])
    before = before or _before(i, d)
    kwp = d["pv"]["kwp"] if d["pv"]["modules"] else 0
    # Up to 7 kWp no smart meter is required, and without one the grid takes at most 60% of the peak power (Solarspitzengesetz).
    curtailed = 0
    if kwp and kwp <= incentives.SMART_METER_KWP:
        capped = _home(i, d, d["battery"]["kwh"], cap=incentives.CAP_NO_METER * kwp)
        curtailed = capped["curtailed_kwh"]
        e.update({k: capped[k] for k in ("own_kwh", "export_kwh")})
    unpaid = _rate(b, "neg_price_share_pct") / 100 if kwp else 0.0  # fed in while the exchange price is negative: not paid
    feed_full = _feed_ct(b, kwp)
    feed_ct = feed_full * (1 - unpaid)
    fuel = _fuel(i, d, b)
    own_eur = (e["own_kwh"] - before["own_kwh"]) * price / 100
    feed_eur = (e["export_kwh"] - before["export_kwh"]) * feed_ct / 100
    extra_power_eur = (e["load_kwh"] - before["load_kwh"]) * price / 100
    meter = _rate(b, "smart_meter_eur") if kwp > incentives.SMART_METER_KWP else 0.0
    rebate = _rate(b, "grid_rebate_eur") if d["heatpump"]["included"] or d["wallbox"]["included"] else 0.0
    upkeep_after = (_rate(b, "pv_upkeep_eur") if kwp else 0) + (_rate(b, "hp_upkeep_eur") if d["heatpump"]["included"] else 0)
    upkeep_before = _rate(b, "boiler_upkeep_eur") if fuel else 0
    year1 = {"own_eur": own_eur, "feed_eur": feed_eur, "fuel_eur": fuel["eur"] if fuel else 0.0, "extra_power_eur": extra_power_eur,
             "upkeep_eur": upkeep_before - upkeep_after - meter + rebate, "feed_ct": feed_ct, "battery_eur": _battery_eur(i, d, price, feed_ct)}
    inverter_eur = next((l["net"] for l in lines if l["id"] == "inverter"), 0)
    flow = cash_flow(pays, year1, b, inverter_eur)
    # The EEG 2027 draft, for a system switched on from January 2027: a short transitional payment, then market value, 50% cap.
    draft = None
    if kwp and not light:
        d27 = _home(i, d, d["battery"]["kwh"], cap=incentives.DRAFT_CAP * kwp)
        ct27 = _rate(b, "draft_feed_ct") * (1 - unpaid)
        feed27 = (d27["export_kwh"] - before["export_kwh"]) * ct27 / 100
        y27 = {**year1, "own_eur": (d27["own_kwh"] - before["own_kwh"]) * price / 100, "feed_eur": feed27, "feed_ct": ct27,
               "upkeep_eur": year1["upkeep_eur"] - (0 if meter else _rate(b, "smart_meter_eur"))}  # the draft makes the smart meter mandatory from 2 kW
        months = incentives.DRAFT_MONTHS / 12
        schedule = [ct27 if t <= months else incentives.MARKET_CT * (1 - unpaid) for t in range(1, int(_rate(b, "years")) + 1)]
        f27 = cash_flow(pays, y27, b, inverter_eur, feed_ct_by_year=schedule)
        draft = {"payback_years": f27["payback_years"], "gain_eur": f27["gain_eur"], "feed_eur": round(feed27), "curtailed_kwh": d27["curtailed_kwh"]}
    grid_before = before["load_kwh"] - before["own_kwh"]
    grid_after = e["load_kwh"] - e["own_kwh"]
    bills = {
        "before": {"grid_kwh": round(grid_before), "grid_eur": round(grid_before * price / 100), "feed_eur": round(before["export_kwh"] * feed_ct / 100),
                   "fuel_eur": fuel["eur"] if fuel else 0, "upkeep_eur": round(upkeep_before), "meter_eur": 0, "rebate_eur": 0},
        "after": {"grid_kwh": round(grid_after), "grid_eur": round(grid_after * price / 100), "feed_eur": round(e["export_kwh"] * feed_ct / 100),
                  "fuel_eur": 0, "upkeep_eur": round(upkeep_after), "meter_eur": round(meter), "rebate_eur": round(rebate)},
    }
    for side in bills.values():
        side["total_eur"] = side["grid_eur"] - side["feed_eur"] + side["fuel_eur"] + side["upkeep_eur"] + side["meter_eur"] - side["rebate_eur"]
    yearly = bills["before"]["total_eur"] - bills["after"]["total_eur"]
    by_tech = {}
    for l in lines:
        by_tech[l["tech"]] = by_tech.get(l["tech"], 0) + l["gross"]
    production = e["production_mwh"] * 1000
    pv_cost = by_tech.get("solar", 0) + by_tech.get("battery", 0)
    years = int(_rate(b, "years"))
    made = sum(production * (1 - _rate(b, "degradation_pct") / 100) ** t for t in range(years))
    lcoe = round((pv_cost + _rate(b, "pv_upkeep_eur") * years + inverter_eur) / made * 100, 1) if made and pv_cost else None
    out = {
        "lines": lines, "extras": offered, "inverter_kw": inv_kw,
        "net_eur": round(net), "vat_eur": round(gross - net), "gross_eur": round(gross), "by_tech": by_tech,
        "grant": g, "pays_eur": round(pays),
        "battery_eur": round(year1["battery_eur"]),
        "year1": {"own_eur": round(own_eur), "feed_eur": round(feed_eur), "fuel_eur": round(year1["fuel_eur"]), "extra_power_eur": round(extra_power_eur),
                  "upkeep_eur": round(upkeep_before - upkeep_after), "meter_eur": round(meter), "rebate_eur": round(rebate),
                  "total_eur": round(yearly), "feed_ct": round(feed_ct, 2), "feed_full_ct": round(feed_full, 2), "unpaid_pct": round(unpaid * 100)},
        "neg_loss_eur": round((e["export_kwh"] - before["export_kwh"]) * (feed_full - feed_ct) / 100), "curtailed_kwh": curtailed, "draft_2027": draft,
        "fuel": fuel, "bills": bills, "solar_ct_kwh": lcoe, "price_ct_kwh": price,
        **flow,
        "assumptions": {k: _rate(b, k) for k in ("electricity_rise_pct", "fuel_rise_pct", "degradation_pct", "inverter_life", "years")},
    }
    out["rules"] = [] if light else incentives.rules(i, d, out)
    return out


def part_money(cost_eur, year1_eur, b, years=None):
    """A part's own payback: what it costs against what it adds a year, with the electricity price rising, over its life."""
    if cost_eur <= 0:
        return None
    if year1_eur <= 0:
        return {"cost_eur": round(cost_eur), "year1_eur": round(year1_eur), "payback_years": None, "gain_eur": round(-cost_eur)}
    zero = {"own_eur": year1_eur, "feed_eur": 0.0, "fuel_eur": 0.0, "extra_power_eur": 0.0, "upkeep_eur": 0.0}
    f = cash_flow(cost_eur, zero, b, years=years)
    return {"cost_eur": round(cost_eur), "year1_eur": round(year1_eur), "payback_years": f["payback_years"], "gain_eur": f["gain_eur"]}


def battery_options(i, d, curve, b):
    """Each battery size from the catalog: its price and what it adds over no battery, so cost joins the size decision."""
    per_kwh = next(x for x in b["items"] if x["id"] == "battery")
    install = next(x for x in b["items"] if x["id"] == "battery_install")
    zero = next((r for r in curve if r["kwh"] == 0), None)
    if not zero:
        return []
    out = []
    for r in curve:
        if not r["kwh"]:
            continue
        cost = (per_kwh["fixed"] + per_kwh["per_unit"] * r["kwh"] + install["fixed"]) * (1 + per_kwh["vat"] / 100)
        m = part_money(cost, r["saving_eur"] - zero["saving_eur"], b, years=BATTERY_LIFE)
        out.append({"kwh": r["kwh"], **m})
    return out


def notes(i, d, money, batteries, heat=None):
    """What the money says to the planner, in the review's own form: a level, the part it is about, and a sentence."""
    out = []
    pb = money["payback_years"]
    years = int(money["assumptions"]["years"])
    if pb is None:
        out.append({"code": "money_no_payback", "level": "warn", "on": "pv", "text": f"At these prices the system does not pay back within {years} years. Check the prices, or a smaller system."})
    elif pb > 15:
        out.append({"code": "money_slow", "level": "warn", "on": "pv", "text": f"Pays back in about {pb:g} years, late in the system's life. A smaller system or no battery may suit a customer who looks at the money."})
    now = next((x for x in batteries if x["kwh"] == d["battery"]["kwh"]), None)
    if now and (now["payback_years"] is None or now["payback_years"] > BATTERY_LIFE):
        out.append({"code": "money_battery", "level": "warn" if i.get("goal") == "cost" else "note", "on": "battery",
                    "text": f"The {now['kwh']:g} kWh battery costs about €{now['cost_eur']:,} and adds about €{now['year1_eur']:,} a year: "
                            + (f"about {now['payback_years']:g} years to pay back, beyond its {BATTERY_LIFE}-year life. " if now["payback_years"] else "it does not pay back. ")
                            + ("Its value is independence and backup, not money." if i.get("goal") != "cost" else "The customer puts cost first: offer it without."),
                    "change": {"battery_kwh": 0}})
    best = max((x for x in batteries if x["payback_years"]), key=lambda x: x["gain_eur"], default=None)
    if best and d["battery"]["kwh"] and best["kwh"] != d["battery"]["kwh"] and now and best["gain_eur"] - now["gain_eur"] > 500:
        out.append({"code": "money_battery_best", "level": "note", "on": "battery",
                    "text": f"By money alone, {best['kwh']:g} kWh does best here: about €{best['gain_eur']:,} over its {BATTERY_LIFE}-year life against €{now['gain_eur']:,} for {now['kwh']:g} kWh.",
                    "change": {"battery_kwh": best["kwh"]}})
    if heat and heat.get("payback_years"):
        out.append({"code": "money_heatpump", "level": "note", "on": "heatpump",
                    "text": f"The heat pump costs about €{heat['cost_eur']:,} after the grant and saves about €{heat['year1_eur']:,} a year against the {heat['fuel']}: about {heat['payback_years']:g} years to pay back."})
    elif heat:
        out.append({"code": "money_heatpump", "level": "note", "on": "heatpump",
                    "text": f"The heat pump costs about €{heat['cost_eur']:,} after the grant and saves about €{heat['year1_eur']:,} a year: it does not pay back on money alone within {years} years. It replaces a boiler that would need replacing too."})
    return out


def heat_pump_money(i, d, without, b, extras=None, qty=None, income=None, kids=False):
    """The heat pump on its own: this design against the same home without it (the solar re-sizes too)."""
    a = evaluate(i, d, b, extras, qty, income, kids)
    z = evaluate(i, without, b, extras, qty, income, kids)
    cost = a["pays_eur"] - z["pays_eur"]
    year1 = a["year1"]["total_eur"] - z["year1"]["total_eur"]
    f = cash_flow(cost, {"own_eur": 0.0, "feed_eur": 0.0, "fuel_eur": float(year1), "extra_power_eur": 0.0, "upkeep_eur": 0.0}, b) if cost > 0 else None
    return {"cost_eur": round(cost), "year1_eur": round(year1), "payback_years": f["payback_years"] if f and year1 > 0 else None,
            "gain_eur": f["gain_eur"] if f else None, "fuel": (a["fuel"] or {}).get("kind", "old heating")}


def summary(money):
    """The few numbers a variant card shows."""
    return {k: money[k] for k in ("gross_eur", "pays_eur", "payback_years", "gain_eur", "irr_pct")} | {"year1_eur": money["year1"]["total_eur"]}


def _with_battery(i, d, kb):
    """The same design with another battery: the hourly estimate run again, the rest as it is."""
    h = _home(i, d, kb)
    e = {**d["energy"], **{k: h[k] for k in ("own_kwh", "export_kwh", "load_kwh", "self_sufficiency_pct", "self_use_pct")}}
    return {**d, "battery": {**d["battery"], "kwh": kb}, "energy": e}


MONEY_WORTH_EUR = 300  # a change for money must gain at least this over the years looked at, or the draft stays


def best_for_money(design_fn, i, o, b, extras=None, qty=None, income=None, kids=False, base=None):
    """For a customer who puts low cost first: among battery sizes and module counts that experts use for similar homes,
    and that cost no more than the draft, the one that leaves the customer most ahead over the years looked at.
    design_fn(inputs, overrides) is the engine. Returns None when the draft is already the best or nothing is free to move."""
    base = base or design_fn(i, o)
    if not base["pv"]["modules"]:
        return None
    free_battery = o.get("battery_kwh") is None and not i.get("has_storage")
    free_modules = o.get("modules") is None
    if not (free_battery or free_modules):
        return None
    designs = {}

    def run(m, kb):
        # One engine run per module count; another battery on the same roof only needs the hourly estimate again.
        if m not in designs:
            designs[m] = base if m == base["pv"]["modules"] else design_fn(i, {**o, "modules": m})
        d = designs[m]
        return d if kb == d["battery"]["kwh"] else _with_battery(i, d, kb)
    home = _before(i, base)
    judge = lambda d: evaluate(i, d, b, extras, qty, income, kids, light=True, before=home)
    first = judge(base)
    budget = first["pays_eur"]
    tried, best = 1, (first["gain_eur"], -first["pays_eur"], base["pv"]["modules"], base["battery"]["kwh"], first)

    def consider(m, kb):
        nonlocal tried, best
        money = judge(run(m, kb))
        tried += 1
        if money["pays_eur"] <= budget and (money["gain_eur"], -money["pays_eur"]) > best[:2]:
            best = (money["gain_eur"], -money["pays_eur"], m, kb, money)

    m0, kb0 = base["pv"]["modules"], base["battery"]["kwh"]
    sizes = [kb0]
    if free_battery:
        sizes = [0.0] + [c for c in base["battery"]["choices"] if 0 < c <= 15]
        if i.get("backup"):
            sizes = [s for s in sizes if s > 0]  # power in an outage needs a battery
    counts = [m0]
    if free_modules:
        s, cap = base["similar"], base["pv"]["max_modules"]
        low, high = max(1, round(s["kwp_low"] / 0.45)), round(s["kwp_high"] / 0.45)
        if cap:
            high = min(high, cap)
        counts = sorted({m for m in (m0 - 4, m0 - 2, m0, m0 + 2, m0 + 4) if low <= m <= high} | {m0})
    for m in counts:  # every pair: a cheaper battery can leave room in the budget for more modules
        for kb in sorted(set(sizes) | {kb0}):
            if (m, kb) != (m0, kb0):
                consider(m, kb)
    gain, _, m, kb, money = best
    if (m, kb) == (m0, kb0) or gain - first["gain_eur"] < MONEY_WORTH_EUR:
        return {"overrides": {}, "tried": tried, "gain_eur": first["gain_eur"], "pays_eur": first["pays_eur"], "draft_gain_eur": first["gain_eur"], "draft_pays_eur": first["pays_eur"], "kept": True}
    change = {k: v for k, v in (("modules", m), ("battery_kwh", kb)) if (k == "modules" and m != m0) or (k == "battery_kwh" and kb != kb0)}
    return {"overrides": change, "tried": tried, "gain_eur": gain, "pays_eur": money["pays_eur"], "payback_years": money["payback_years"],
            "draft_gain_eur": first["gain_eur"], "draft_pays_eur": first["pays_eur"], "draft_payback_years": first["payback_years"],
            "draft": {"modules": m0, "battery_kwh": kb0}, "kept": False}
