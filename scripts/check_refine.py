"""How well the planner's sentences become changes: the simple rules against Claude, on English sentences we wrote.

Each sentence has the change a careful reader would take from it. A sentence counts as right only when every field
matches and nothing else is set. No project data is used or sent: the sentences are made up.

    uv run python scripts/check_refine.py            # rules only
    uv run python scripts/check_refine.py --claude   # rules and Claude (needs ANTHROPIC_API_KEY in .env)
"""
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv

from reonic_engine.refine import Change, claude, rules

CASES = [
    # car
    ("The customer is buying an electric car next year.", {"ev": True}),
    ("They drive an EV about 15,000 km a year.", {"ev": True, "ev_km": 15000}),
    ("Customer drives a Tesla, roughly 20000 km per year.", {"ev": True, "ev_km": 20000}),
    ("No electric car planned.", {"ev": False}),
    ("They sold their car and won't get another one.", {"ev": False}),
    # heat pump
    ("Add a heat pump.", {"heatpump": True}),
    ("They want to replace the gas boiler with a heat pump.", {"heatpump": True}),
    ("Drop the heat pump, they just renewed the boiler.", {"heatpump": False}),
    ("Customer is not interested in a heat pump.", {"heatpump": False}),
    # wallbox
    ("Include a wallbox in the garage.", {"wallbox": True}),
    ("They already have a charger, no wallbox needed.", {"wallbox": False}),
    # battery
    ("Make it a 10 kWh battery.", {"battery_kwh": 10}),
    ("Customer wants 7.5 kWh of storage.", {"battery_kwh": 7.5}),
    ("Remove the battery.", {"no_battery": True}),
    ("No storage, budget is tight.", {"no_battery": True}),
    ("They already have a battery in the basement.", {"has_storage": True}),
    # demand
    ("Their annual consumption is 5200 kWh.", {"demand_kwh": 5200}),
    ("They use about 6,500 kWh a year according to the last bill.", {"demand_kwh": 6500}),
    # panels and space
    ("Only 18 panels fit on the roof.", {"max_panels": 18, "mount": "roof"}),
    ("Put 24 modules on it.", {"modules": 24}),
    ("Go with 20 panels.", {"modules": 20}),
    ("At most 14 panels because of the dormer.", {"max_panels": 14}),
    ("Use the garden instead, about 60 m2 free.", {"mount": "ground", "area_m2": 60}),
    ("Mount them on the carport.", {"mount": "carport"}),
    ("The south facade has 25 m² usable.", {"mount": "facade", "area_m2": 25}),
    # combined
    ("Add a heat pump but no car.", {"heatpump": True, "ev": False}),
    ("They're getting an EV and want a wallbox, 10 kWh battery.", {"ev": True, "wallbox": True, "battery_kwh": 10}),
    ("No battery, but add a wallbox for the new electric car.", {"no_battery": True, "wallbox": True, "ev": True}),
    ("Customer drives 12k km in an EV, consumption is 4800 kWh.", {"ev": True, "ev_km": 12000, "demand_kwh": 4800}),
    ("Skip the heat pump and the wallbox.", {"heatpump": False, "wallbox": False}),
    ("They have an existing battery and want 22 panels.", {"has_storage": True, "modules": 22}),
    # nothing to change: must not invent
    ("Make the battery a bit bigger.", {}),
    ("The customer seemed happy with the proposal.", {}),
    ("Call them back on Tuesday.", {}),
    ("What do you think about the roof?", {}),
]


def same(got: Change, want: dict) -> bool:
    """Every field the sentence states, and nothing else: an unasked False still changes the design."""
    have = {k: v for k, v in got.model_dump().items() if v is not None}
    if have.keys() != want.keys():
        return False
    return all(have[k] == v if isinstance(v, (bool, str)) else abs(float(have[k]) - v) < 0.01 for k, v in want.items())


def shown(c: Change | None) -> str:
    return "error" if c is None else str({k: v for k, v in c.model_dump().items() if v is not None})


def safe(f, text):
    try:
        return f(text)
    except Exception as error:  # count a failed call as wrong, as the planner would see the rules instead
        print(f"  ! {text}: {error}", file=sys.stderr)
        return None


def main():
    use_claude = "--claude" in sys.argv
    if use_claude:
        load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    texts = [t for t, _ in CASES]
    ways = {"rules": [rules(t) for t in texts]}
    if use_claude:
        with ThreadPoolExecutor(8) as pool:
            ways["claude"] = list(pool.map(lambda t: safe(claude, t), texts))
    print(f"{len(CASES)} English sentences\n")
    for name, out in ways.items():
        right = [c is not None and same(c, want) for c, (_, want) in zip(out, CASES)]
        print(f"{name}: {sum(right)}/{len(CASES)} right")
        for ok, c, (text, want) in zip(right, out, CASES):
            if not ok:
                print(f"  ✗ {text}\n      want {want}\n      got  {shown(c)}")
        print()


if __name__ == "__main__":
    main()
