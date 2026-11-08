"""The planner's advisor: reads the engine's draft and its variants for one home, picks the option that fits the customer,
says why, and lists what to ask before sending.

The engine makes every number. Claude only chooses among the engine's options and writes; any sentence holding a number
that is not in what the engine gave is dropped. Nothing from past projects is sent: the notes that compare with similar
homes and the similar-home ranges stay here. Without ANTHROPIC_API_KEY, or on any failure, the engine's own warnings
become the questions and the draft stays the pick.
"""
import json
import os
import re

from pydantic import BaseModel

MODEL = "claude-opus-5-5"
FROM_PAST = {"battery_guide", "battery_high", "battery_low", "battery_none", "battery_open", "pv_high", "pv_low"}
PROMPT = """You are an experienced solar, battery and heat pump planner at a German installer, reviewing a draft that a
design engine made for one home. You get the home's facts, the draft, up to two engine variants, and what each catalog
battery size does in this home.

Choose the option that best serves this customer, considering their stated priority, how they use power during the day,
their car and heating, and the roof. "draft" is a valid choice: keep it when nothing is clearly better.

Rules:
- Use only numbers that appear in the input, each with its unit (kWh, kWp, MWh, kW, EUR, %, modules). Never compute
  differences, sums or new roundings. Do not invent prices.
- reasons: 2 to 4 short sentences in plain English, each one concrete fact about this home that supports the choice.
- questions: up to 4 things the planner should confirm with the customer before sending, most important first. Only ask
  what would change the design or the offer. Do not ask what the facts already answer.
- risk: one sentence on the main thing that could make the choice wrong, or null.
- battery_kwh: set only to recommend a different catalog battery size from the list, keeping the chosen option's solar;
  otherwise null."""


class Advice(BaseModel):
    pick: str
    headline: str
    reasons: list[str]
    questions: list[str]
    risk: str | None = None
    battery_kwh: float | None = None


def brief(i, d):
    """What the advisor sees: this home and the engine's options for it. No past-project figures."""
    home = {k: i.get(k) for k in ("demand_kwh", "demand_source", "price_ct_kwh", "heating", "heat_kwh", "living_m2", "built",
                                  "ev", "ev_km", "ev_charge_home", "ev_day", "has_wallbox", "home_day", "goal", "big_users",
                                  "has_solar", "has_storage", "trees", "roof_renovation", "area_m2", "roof_tilt", "roof_azimuth", "existing_kwp", "existing_year", "existing_battery_kwh") if i.get(k) not in (None, [], "")}
    if not i.get("ev"):
        home = {k: v for k, v in home.items() if not k.startswith("ev_")}  # the form's default driving is not a car
    if i.get("surfaces"):
        home["roof_faces"] = [{"facing_deg": s.get("azimuth"), "tilt_deg": s.get("tilt"), "kwh_per_kwp": s.get("kwh_per_kwp"),
                               "max_modules": s.get("max_modules")} for s in i["surfaces"]]

    def option(pv, battery_kwh, heatpump_kw, wallbox, energy):
        return {"modules": pv["modules"], "kwp": pv["kwp"], "battery_kwh": battery_kwh, "heatpump_kw": heatpump_kw,
                "wallbox": wallbox, **{k: energy.get(k) for k in ("production_mwh", "total_mwh", "self_sufficiency_pct",
                                                                   "self_use_pct", "saving_eur")}}

    options = {"draft": {"title": "Engine draft", **option(d["pv"], d["battery"]["kwh"], d["heatpump"]["kw"] if d["heatpump"]["included"] else 0,
                                                            d["wallbox"]["included"], d["energy"])}}
    for a in d.get("alternatives") or []:
        options[a["id"]] = {"title": a["title"], "note": a["why"], **option(a["pv"], a["battery_kwh"], a["heatpump_kw"], a["wallbox"], a["energy"])}
    notes = [n["text"] for n in d.get("review") or [] if n.get("code") not in FROM_PAST and n.get("text")]
    batteries = [{k: b.get(k) for k in ("kwh", "own_pct", "saving_eur") if k in b} for b in d.get("battery_curve") or []]
    return {"home": home, "options": options, "battery_sizes": batteries, "engine_notes": notes}


# What each brief field is measured in, by its name. A number the advisor writes with a unit must equal a value of that unit.
UNIT_OF_FIELD = [("kwh_per_kwp", "yield"), ("price_ct_kwh", "ct"), ("_pct", "%"), ("_eur", "eur"), ("_mwh", "mwh"), ("kwh", "kwh"),
                 ("kwp", "kwp"), ("_kw", "kw"), ("modules", "modules"), ("_km", "km"), ("tilt", "deg"), ("facing", "deg"), ("_m2", "m2")]
UNIT_OF_WORD = [(r"kwh\s*(?:per|/)\s*kwp", "yield"), (r"kwh", "kwh"), (r"kwp", "kwp"), (r"mwh", "mwh"), (r"kw\b", "kw"),
                (r"(?:eur|euros?)\b", "eur"), (r"(?:%|percent)", "%"), (r"(?:modules?|panels?)\b", "modules"), (r"km\b", "km"),
                (r"(?:°|degrees?)", "deg"), (r"(?:m²|m2|square met)", "m2"), (r"(?:ct|cents?)\b", "ct")]
NUMBER = r"\d[\d,]*(?:\.\d+)?"


def _values(b):
    """(unit, value) for every number in the brief; unit None where the field name tells none."""
    out = []

    def walk(x, key=""):
        if isinstance(x, dict):
            for k, v in x.items():
                walk(v, k)
        elif isinstance(x, list):
            for v in x:
                walk(v, key)
        elif isinstance(x, bool) or x is None:
            return
        elif isinstance(x, (int, float)):
            unit = next((u for part, u in UNIT_OF_FIELD if part in key or key == part.strip("_")), None)
            out.append((unit, float(x)))
        elif isinstance(x, str):
            out.extend((None, float(n.replace(",", ""))) for n in re.findall(NUMBER, x))  # notes and labels, e.g. "1979to1990"
    walk(b)
    for unit, v in list(out):
        if unit == "kwh":
            out.append(("mwh", v / 1000))
        elif unit == "mwh":
            out.append(("kwh", v * 1000))
    return out


def _said(text):
    """(unit, value, decimals) for each number in a sentence; € before a number counts as its unit."""
    out = []
    for m in re.finditer(r"(€\s*)?(" + NUMBER + r")\s*", text):
        raw = m.group(2).rstrip(",")
        after = text[m.end():].lower()
        unit = "eur" if m.group(1) else next((u for word, u in UNIT_OF_WORD if re.match(word, after)), None)
        out.append((unit, float(raw.replace(",", "")), len(raw.split(".")[1]) if "." in raw else 0))
    return out


def _given(said, values):
    """A number the engine gave, as shown at the precision it is written with. With a unit, only values of that unit count."""
    unit, n, digits = said
    if not unit:
        return any(v == n for _, v in values)  # no unit to tie it to: only an exact value of the engine's
    pool = [v for u, v in values if u == unit]
    return any(abs(round(v, digits) - n) < 1e-9 or (digits == 0 and abs(v - n) < 0.5 and v >= 100) for v in pool)


def checked(advice, b):
    """Drop every sentence with a number the engine did not give."""
    values = _values(b)
    fine = lambda s: all(_given(x, values) for x in _said(s))
    advice.reasons = [s for s in advice.reasons if fine(s)]
    advice.questions = [s for s in advice.questions if fine(s)]
    if advice.risk and not fine(advice.risk):
        advice.risk = None
    if not fine(advice.headline):
        advice.headline = "Advisor's pick"
    sizes = {x["kwh"] for x in b["battery_sizes"]}
    if advice.battery_kwh is not None and advice.battery_kwh not in sizes:
        advice.battery_kwh = None
    if advice.pick not in b["options"]:
        advice.pick = "draft"
    return advice


def claude(b):
    import anthropic

    response = anthropic.Anthropic(timeout=40, max_retries=1).beta.messages.parse(
        model=MODEL, max_tokens=2048, system=PROMPT, output_format=Advice,
        output_config={"effort": "medium"}, messages=[{"role": "user", "content": json.dumps(b, ensure_ascii=False)}],
        betas=["server-side-fallback-2026-07-01"], fallbacks="default",
    )
    if response.stop_reason != "end_turn" or response.parsed_output is None:
        raise ValueError(f"No usable answer: {response.stop_reason}")
    return response.parsed_output


def rules(b, d):
    warn = [n["text"] for n in d.get("review") or [] if n.get("level") == "warn" and n.get("code") not in FROM_PAST]
    return Advice(pick="draft", headline="Engine draft", reasons=[], questions=warn[:4])


def advise(i, d):
    b = brief(i, d)
    source, advice = "rules", None
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            advice, source = checked(claude(b), b), "claude"
        except Exception:  # the demo must survive a failed call
            advice = None
    advice = advice or rules(b, d)
    return {**advice.model_dump(), "source": source}
