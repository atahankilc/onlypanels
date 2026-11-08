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
- Use only numbers that appear in the input. Never compute, estimate or round to new numbers. Do not invent prices.
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
                                  "has_solar", "has_storage", "trees", "roof_renovation") if i.get(k) not in (None, [], "")}
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


def _numbers(text):
    return [float(n.replace(",", "")) for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text)]


def _known(b):
    seen = set()
    for n in _numbers(json.dumps(b)):
        seen |= {n, round(n), round(n, 1)}
        if n >= 1000:
            seen.add(round(n / 1000, 1))  # kWh said as MWh
    return seen


def checked(advice, b):
    """Drop every sentence with a number the engine did not give."""
    known = _known(b)
    fine = lambda s: all(n in known for n in _numbers(s))
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
