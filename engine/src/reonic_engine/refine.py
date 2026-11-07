"""Turn a planner's sentence into typed changes. The engine still produces every number.

Claude handles free text when ANTHROPIC_API_KEY is set. Only the sentence is sent, never
project data. Without a key, or on any failure, simple rules cover the common requests.
"""
import os
import re

from pydantic import BaseModel

from .design import MOUNTS

MODEL = "claude-opus-5-5"
PROMPT = """You turn a solar planner's sentence about a home into structured changes.
The sentence may be Turkish, German or English. Set only fields the sentence clearly states;
leave all others null. Never invent numbers.
- ev: household has or is getting an electric car. ev_km: annual km if stated.
- demand_kwh: new annual electricity use in kWh.
- mount: roof, ground (garden), carport or facade. area_m2: usable area if stated.
- max_panels: how many panels fit, if stated.
- modules: exact panel count the planner wants.
- battery_kwh: exact battery size wanted. no_battery: true if the battery should be removed.
- heatpump: true to add, false to remove.
- wallbox: true to add, false to remove.
- has_storage: home already has a battery."""


class Change(BaseModel):
    ev: bool | None = None
    ev_km: float | None = None
    demand_kwh: float | None = None
    mount: str | None = None
    area_m2: float | None = None
    max_panels: int | None = None
    modules: int | None = None
    battery_kwh: float | None = None
    no_battery: bool | None = None
    heatpump: bool | None = None
    wallbox: bool | None = None
    has_storage: bool | None = None


NEGATIVE = r"(istemiyor|istemez|olmasın|olmadan|olmayacak|çıkar|kaldır|without|no |remove|don'?t want|do not|does not|doesn'?t|ohne|kein|nicht)"
HAS = r"(zaten|mevcut|already|existing|bereits|vorhanden)"


def _fold(text):
    return text.replace("İ", "i").replace("I", "ı").lower()


def _number(raw, thousand=False):
    value = float(raw.replace(".", "").replace(",", "."))
    return value * 1000 if thousand else value


def rules(text):
    t = _fold(text)
    c = Change()

    def near(word, pattern):
        return any(re.search(pattern, part) for part in re.split(r"[.,;]| ama | but | aber ", t) if re.search(word, part))

    car = r"\b(araba|araç|arac|otomobil|car\b|ev\b|elektroauto|e-auto|tesla)"
    if re.search(car, t):
        c.ev = not near(car, NEGATIVE)
        km = re.search(r"([\d.,]+)\s*(bin)?\s*(km|kilomet)", t)
        if km and c.ev:
            c.ev_km = _number(km.group(1), bool(km.group(2)))

    pump = r"(ısı pompa|isi pompa|heat pump|wärmepumpe)"
    if re.search(pump, t):
        c.heatpump = not near(pump, NEGATIVE)

    box = r"(wallbox|şarj istasyon|charger|ladestation)"
    if re.search(box, t):
        c.wallbox = not near(box, NEGATIVE)

    battery = r"(batarya|akü|battery|speicher)"
    if re.search(battery, t):
        size = re.search(r"([\d.,]+)\s*kwh", t)
        if near(battery, HAS):
            c.has_storage = True
        elif near(battery, NEGATIVE):
            c.no_battery = True
        elif size:
            c.battery_kwh = _number(size.group(1))
    elif re.search(r"(tüketim|consumption|use|verbrauch)", t):
        size = re.search(r"([\d.,]+)\s*(bin)?\s*kwh", t)
        if size:
            c.demand_kwh = _number(size.group(1), bool(size.group(2)))

    for pattern, mount in [(r"(bahçe|bahce|garden|garten|zemin)", "ground"), (r"carport", "carport"),
                           (r"(cephe|facade|fassade)", "facade"), (r"(çatı|cati|roof|dach)", "roof")]:
        if re.search(pattern, t):
            c.mount = mount
            break

    area = re.search(r"([\d.,]+)\s*(m2|m²|metrekare|sqm)", t)
    if area:
        c.area_m2 = _number(area.group(1))
    panels = re.search(r"(\d+)\s*(panel|modül|module?|moduls?)", t)
    if panels:
        limit = re.search(r"(sığ|fit|passen|en fazla|maks|max)", t)
        if limit:
            c.max_panels = int(panels.group(1))
        else:
            c.modules = int(panels.group(1))
    return c


def claude(text):
    import anthropic

    response = anthropic.Anthropic(timeout=20, max_retries=1).beta.messages.parse(
        model=MODEL, max_tokens=1024, system=PROMPT, output_format=Change,
        output_config={"effort": "low"}, messages=[{"role": "user", "content": text}],
        betas=["server-side-fallback-2026-07-01"], fallbacks="default",
    )
    if response.stop_reason != "end_turn" or response.parsed_output is None:
        raise ValueError(f"No usable answer: {response.stop_reason}")
    return response.parsed_output


def to_patches(c, current_mount="roof"):
    """Split a change into form inputs and planner decisions, and list what was understood."""
    inputs, overrides, understood = {}, {}, []

    def note(code, **params):
        understood.append({"code": code, **params})

    if c.ev is not None:
        inputs["ev"] = c.ev
        note("c_ev_on" if c.ev else "c_ev_off")
    if c.ev_km:
        inputs["ev_km"] = c.ev_km
        note("c_ev_km", km=round(c.ev_km))
    if c.demand_kwh:
        inputs["demand_kwh"] = c.demand_kwh
        note("c_demand", kwh=round(c.demand_kwh))
    mount = c.mount if c.mount in MOUNTS else None
    if mount:
        inputs["mount"] = mount
        if mount != current_mount:
            note("c_mount", mount=mount)
    if c.area_m2:
        inputs["area_m2"] = c.area_m2
        note("c_area", area=round(c.area_m2))
    if c.max_panels:
        inputs["area_m2"] = c.max_panels * MOUNTS[mount or current_mount]["m2_per_module"]
        note("c_max_panels", panels=c.max_panels)
    if c.has_storage:
        inputs["has_storage"] = True
        note("c_has_storage")
    if c.modules:
        overrides["modules"] = c.modules
        note("c_modules", panels=c.modules)
    if c.no_battery:
        overrides["battery_kwh"] = 0
        note("c_no_battery")
    elif c.battery_kwh:
        overrides["battery_kwh"] = c.battery_kwh
        note("c_battery", kwh=c.battery_kwh)
    if c.heatpump is not None:
        overrides["heatpump"] = c.heatpump
        note("c_hp_on" if c.heatpump else "c_hp_off")
    if c.wallbox is not None:
        overrides["wallbox"] = c.wallbox
        note("c_wb_on" if c.wallbox else "c_wb_off")
    return inputs, overrides, understood


def refine(text, current_mount="roof"):
    source, change = "rules", None
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            change, source = claude(text), "claude"
        except Exception:  # the demo must survive a failed call; rules take over
            change = None
    inputs, overrides, understood = to_patches(change or rules(text), current_mount)
    return {"inputs": inputs, "overrides": overrides, "understood": understood, "source": source}
