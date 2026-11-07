"""Compare the hourly energy estimate with HTW Berlin calculator values for one reference home.

Reference: 6,000 kWh a year, 10 kWp, usable battery 0, 6, 9, 12 kWh gives 35, 62, 70, 74% of the need from own power,
as quoted from the HTW calculator by https://reduco.ai/blog/solar/autarkiegrad-photovoltaik-speicher-berechnen (checked 2026-11-07).
Run from the repo root:  uv run python scripts/check_energy.py
"""
from reonic_engine.energy import BATTERY_USABLE, simulate

REFERENCE = {0: 35, 6: 62, 9: 70, 12: 74}
for usable, expected in REFERENCE.items():
    ours = simulate(6000, 0, 0, 9500, usable / BATTERY_USABLE, 32)["self_sufficiency_pct"]
    print(f"usable {usable:>2} kWh: ours {ours}%, reference {expected}%, gap {ours - expected:+d}")
