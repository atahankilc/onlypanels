"""The price book: what each part of an offer costs, so the planner sees what the homeowner pays and when it pays back.

The data holds no prices (docs/data/dictionary.md). What it holds is what experts put in an offer: scripts/profile_products.py
sorts every line into a group and counts how often each group appears. Those groups are the items below. Each default is
a German end-customer price, net, as of autumn 2026, with where it came from. The planner overrides any of them, and adds
parts of their own, on the planner's Prices page; overrides are kept in data/cache/pricebook.json (not committed).

Prices are typical, not quotes. Every one is a stated assumption, listed in docs/assumptions.md.
"""
import json
import uuid
from pathlib import Path

STORE = Path(__file__).resolve().parents[3] / "data" / "cache" / "pricebook.json"

# How an item's quantity is counted for one design.
UNITS = {
    "job": "per job",
    "module": "per module",
    "kwp": "per kWp",
    "kwh": "per kWh of battery",
    "kw_inverter": "per kW of inverter",
    "kw_heatpump": "per kW of heat pump",
    "metre": "per metre",
    "piece": "per piece",
}
TECHS = {"solar": "Solar", "battery": "Battery", "wallbox": "Wallbox", "heatpump": "Heat pump"}
KINDS = {"product": "Product", "labour": "Installation", "service": "Service"}
# When an item goes into the offer: always with its technology, only under a condition, or as an extra the planner ticks.
WHEN = {
    "always": "Always, with its technology",
    "extra": "Optional extra",
    "pitched": "Pitched roof",
    "flat": "Flat roof",
    "backup": "Customer wants backup power",
    "replace": "Heat pump replaces old heating",
    "oil": "Old heating is oil",
}

# VAT: 0% for solar systems up to 30 kWp on or near homes, batteries and their installation included (UStG §12(3), since
# 2023). Wallboxes and heat pumps carry the normal 19%.
VAT_SOLAR, VAT_NORMAL = 0, 19

# Share of solar offers holding each group, per installer (scripts/profile_products.py, both splits, add-ons left out).
# An extra seen in at least half of an installer's offers is ticked by default for that installer.
SHARE = {
    "meter_cabinet": {"2a8ba8e2": 0.81, "23c108b7": 0.02},
    "electrical_parts": {"2a8ba8e2": 0.55, "23c108b7": 0.16},
    "surge_protection": {"2a8ba8e2": 0.38, "23c108b7": 0.01},
    "optimizer": {"2a8ba8e2": 0.24, "23c108b7": 0.07},
    "cable_extra": {"2a8ba8e2": 0.11, "23c108b7": 0.07},
    "roof_extra": {"2a8ba8e2": 0.10, "23c108b7": 0.05},
    "satellite_dish": {"2a8ba8e2": 0.06, "23c108b7": 0.01},
    "energy_management": {"2a8ba8e2": 0.52, "23c108b7": 0.01},
}
DEFAULT_ON = 0.5

# Sources, short. Full list in docs/assumptions.md.
S_PV = "42watt, priwatt, Finanztip ranges 2026: 10 kWp turnkey €9,500–17,000 without battery; Fraunhofer ISE about €1,015/kWp average"
S_BAT = "2026 guides: €315–700 per kWh installed for home LFP batteries; 10 kWp + 10 kWh turnkey €13,000–23,000"
S_HP = "2026: air-water heat pump €27,000–40,000 gross installed (reduco, priwatt); median of 160 offers about €35,000 (Utopia)"
S_WB = "2026 guides: 11 kW wallbox €500–1,200, installation €500–1,500"
S_EL = "German electrician rates 2026, Zählerschrank renewal €1,500–3,500"

ITEMS = [
    # Solar: what is in nearly every expert offer.
    dict(id="module", tech="solar", kind="product", name="Solar module, about 450 Wp (TOPCon glass-glass)", unit="module", per_unit=115, fixed=0, when="always", vat=VAT_SOLAR,
         source="Our estimate: about €0.25/Wp to the customer, wholesale about €0.10–0.12/Wp. " + S_PV),
    dict(id="mounting_pitched", tech="solar", kind="product", name="Mounting on a pitched roof (rails, hooks)", unit="module", per_unit=65, fixed=0, when="pitched", vat=VAT_SOLAR, source=S_PV),
    dict(id="mounting_flat", tech="solar", kind="product", name="Mounting on a flat roof (ballasted frames)", unit="module", per_unit=85, fixed=0, when="flat", vat=VAT_SOLAR, source=S_PV),
    dict(id="dc_install", tech="solar", kind="labour", name="Module installation and DC wiring", unit="module", per_unit=75, fixed=0, when="always", vat=VAT_SOLAR, source=S_PV),
    dict(id="inverter", tech="solar", kind="product", name="Hybrid inverter", unit="kw_inverter", per_unit=110, fixed=900, when="always", vat=VAT_SOLAR,
         source="Our estimate: 5–10 kW hybrid inverters (the brands in the data) at about €1,500–2,000 to the customer"),
    dict(id="ac_install", tech="solar", kind="labour", name="Inverter installation, AC connection, commissioning", unit="job", per_unit=0, fixed=900, when="always", vat=VAT_SOLAR, source=S_EL),
    dict(id="scaffolding", tech="solar", kind="labour", name="Scaffolding, set up and taken down", unit="job", per_unit=0, fixed=1000, when="always", vat=VAT_SOLAR,
         source="Single-family house scaffolding for a roof job, €600–1,500 (2026 guides)"),
    dict(id="planning", tech="solar", kind="service", name="Planning and consulting", unit="job", per_unit=0, fixed=400, when="always", vat=VAT_SOLAR, source="Installer offers"),
    dict(id="grid_registration", tech="solar", kind="service", name="Grid registration (network operator, Marktstammdatenregister)", unit="job", per_unit=0, fixed=250, when="always", vat=VAT_SOLAR, source="Installer offers"),
    dict(id="travel", tech="solar", kind="service", name="Travel, delivery and logistics", unit="job", per_unit=0, fixed=450, when="always", vat=VAT_SOLAR, source="Installer offers"),
    # Solar: extras experts add depending on the site. Their default tick follows how often this installer adds them.
    dict(id="meter_cabinet", tech="solar", kind="labour", name="Meter cabinet renewal to current grid rules (TAB)", unit="job", per_unit=0, fixed=2200, when="extra", vat=VAT_SOLAR, source=S_EL),
    dict(id="energy_management", tech="solar", kind="product", name="Smart meter and energy manager", unit="job", per_unit=0, fixed=300, when="extra", vat=VAT_SOLAR, source="Our estimate: energy managers €200–600"),
    dict(id="electrical_parts", tech="solar", kind="product", name="Breakers, sub-distribution, equipotential bonding", unit="job", per_unit=0, fixed=450, when="extra", vat=VAT_SOLAR, source=S_EL),
    dict(id="surge_protection", tech="solar", kind="product", name="Surge protection (AC)", unit="job", per_unit=0, fixed=350, when="extra", vat=VAT_SOLAR, source=S_EL),
    dict(id="optimizer", tech="solar", kind="product", name="Power optimizer on shaded modules", unit="module", per_unit=55, fixed=0, when="extra", vat=VAT_SOLAR, source="Our estimate: optimizers €40–70 each"),
    dict(id="cable_extra", tech="solar", kind="labour", name="Extra cable route", unit="metre", per_unit=25, fixed=0, qty=10, when="extra", vat=VAT_SOLAR, source=S_EL + "; median 10 m in expert offers"),
    dict(id="roof_extra", tech="solar", kind="labour", name="Roof extras (vent tiles, replacement tiles)", unit="job", per_unit=0, fixed=400, when="extra", vat=VAT_SOLAR, source="Installer offers"),
    dict(id="satellite_dish", tech="solar", kind="labour", name="Move or remove a satellite dish", unit="job", per_unit=0, fixed=250, when="extra", vat=VAT_SOLAR, source="Installer offers"),
    # Battery.
    dict(id="battery", tech="battery", kind="product", name="Home battery, LFP", unit="kwh", per_unit=400, fixed=0, when="always", vat=VAT_SOLAR, source=S_BAT),
    dict(id="battery_install", tech="battery", kind="labour", name="Battery installation", unit="job", per_unit=0, fixed=600, when="always", vat=VAT_SOLAR, source=S_BAT),
    dict(id="backup", tech="battery", kind="product", name="Backup box (power in an outage)", unit="job", per_unit=0, fixed=900, when="backup", vat=VAT_SOLAR,
         source="Our estimate: backup boxes and gateways €500–1,500 with installation"),
    # Wallbox.
    dict(id="wallbox", tech="wallbox", kind="product", name="Wallbox 11 kW", unit="job", per_unit=0, fixed=750, when="always", vat=VAT_NORMAL, source=S_WB),
    dict(id="wallbox_install", tech="wallbox", kind="labour", name="Wallbox installation", unit="job", per_unit=0, fixed=900, when="always", vat=VAT_NORMAL, source=S_WB),
    # Heat pump: what every one of the 31 heat pump offers in the data holds (unit, install, buffer; hydraulics and hot water in 94%).
    dict(id="heatpump", tech="heatpump", kind="product", name="Air-water heat pump", unit="kw_heatpump", per_unit=600, fixed=4500, when="always", vat=VAT_NORMAL,
         source="Our estimate: 5–12 kW units at €7,500–12,000; ADAC: unit alone €8,000–16,000. " + S_HP),
    dict(id="hp_hydraulics", tech="heatpump", kind="product", name="Hydraulic station and controller", unit="job", per_unit=0, fixed=1900, when="always", vat=VAT_NORMAL, source=S_HP),
    dict(id="buffer_storage", tech="heatpump", kind="product", name="Buffer storage", unit="job", per_unit=0, fixed=900, when="always", vat=VAT_NORMAL, source=S_HP),
    dict(id="hot_water_storage", tech="heatpump", kind="product", name="Hot water storage, 300 l", unit="job", per_unit=0, fixed=1900, when="always", vat=VAT_NORMAL, source=S_HP),
    dict(id="hp_install", tech="heatpump", kind="labour", name="Heat pump installation", unit="job", per_unit=0, fixed=6500, when="always", vat=VAT_NORMAL, source=S_HP),
    dict(id="hp_balancing", tech="heatpump", kind="labour", name="Hydraulic balancing (required for the KfW grant)", unit="job", per_unit=0, fixed=800, when="always", vat=VAT_NORMAL, source="2026 guides €500–1,200"),
    dict(id="garden_work", tech="heatpump", kind="labour", name="Foundation and ground work for the outdoor unit", unit="job", per_unit=0, fixed=900, when="always", vat=VAT_NORMAL, source="Installer offers"),
    dict(id="old_heating_removal", tech="heatpump", kind="labour", name="Removal of the old heating", unit="job", per_unit=0, fixed=900, when="replace", vat=VAT_NORMAL, source="Installer offers"),
    dict(id="oil_tank", tech="heatpump", kind="labour", name="Oil tank cleaning and disposal", unit="job", per_unit=0, fixed=1200, when="oil", vat=VAT_NORMAL, source="2026 guides €800–2,000"),
    dict(id="radiators", tech="heatpump", kind="labour", name="Larger radiators", unit="piece", per_unit=700, fixed=0, qty=3, when="extra", vat=VAT_NORMAL, source="Installer offers; 10% of heat pump offers"),
]

# Running prices and how they change. The planner can change these too.
RATES = {
    "feed_in_ct": {"value": 7.7, "label": "Feed-in, first 10 kWp (ct/kWh)", "source": "EEG, systems switched on 1 Aug 2026 to 31 Jan 2027, partial feed-in, paid 20 years"},
    "feed_in_above_ct": {"value": 6.66, "label": "Feed-in, share above 10 kWp (ct/kWh)", "source": "EEG, same period, 10 to 40 kWp"},
    "gas_ct": {"value": 11.8, "label": "Gas, all in (ct/kWh)", "source": "SWM model household 2026, 15,000 kWh for about €1,764"},
    "oil_ct": {"value": 10.5, "label": "Heating oil (ct/kWh)", "source": "Our assumption: about €1.05 per litre, 10 kWh per litre"},
    "electricity_rise_pct": {"value": 3.0, "label": "Electricity price rise a year (%)", "source": "The data's own default, 3% a year"},
    "fuel_rise_pct": {"value": 4.0, "label": "Gas and oil price rise a year (%)", "source": "Our assumption: CO₂ price rises, EU ETS2 from 2028"},
    "degradation_pct": {"value": 0.4, "label": "Solar output loss a year (%)", "source": "TOPCon module warranties, 0.4% a year"},
    "pv_upkeep_eur": {"value": 150, "label": "Solar upkeep and insurance (€/year)", "source": "Our assumption: insurance, monitoring and checks; guides say about 1% of the investment a year"},
    "hp_upkeep_eur": {"value": 200, "label": "Heat pump service (€/year)", "source": "2026 guides €150–250"},
    "boiler_upkeep_eur": {"value": 250, "label": "Gas or oil boiler service and chimney sweep (€/year)", "source": "2026 guides €200–350"},
    "inverter_life": {"value": 15, "label": "Inverter replaced after (years)", "source": "Typical inverter life 12–20 years"},
    "years": {"value": 20, "label": "Years looked at", "source": "The feed-in is paid 20 years"},
}


def _load():
    try:
        return json.loads(STORE.read_text())
    except (OSError, ValueError):
        return {}


def _save(store):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(store, indent=1))


def book(installer=None):
    """Every item with the planner's price where they set one, and every rate. `default` keeps the item's own default."""
    store = _load()
    changed = store.get("items", {})
    items = []
    for base in ITEMS:
        item = {**base, "qty": base.get("qty"), "custom": False, "default": {"fixed": base["fixed"], "per_unit": base["per_unit"]}}
        if base["id"] in changed:
            item.update({k: v for k, v in changed[base["id"]].items() if k in ("fixed", "per_unit", "vat", "name", "qty")})
            item["edited"] = True
        if base["id"] in SHARE:
            item["share"] = SHARE[base["id"]]
        items.append(item)
    items += [{**c, "custom": True} for c in store.get("custom", [])]
    for item in items:
        share = (item.get("share") or {}).get(installer)
        item["on_by_default"] = item["when"] == "extra" and share is not None and share >= DEFAULT_ON
    rates = {k: {**v, "default": v["value"], **({"value": store["rates"][k]} if k in store.get("rates", {}) else {})} for k, v in RATES.items()}
    return {"items": items, "rates": rates, "units": UNITS, "techs": TECHS, "kinds": KINDS, "when": WHEN}


def _clean(fields):
    out = {}
    for k in ("fixed", "per_unit", "qty"):
        if fields.get(k) is not None:
            out[k] = round(float(fields[k]), 2)
    if fields.get("vat") is not None:
        out["vat"] = float(fields["vat"])
    if fields.get("name"):
        out["name"] = str(fields["name"])[:120]
    return out


def set_item(item_id, fields):
    store = _load()
    custom = store.get("custom", [])
    for c in custom:
        if c["id"] == item_id:
            c.update(_clean(fields))
            for k in ("tech", "kind", "unit", "when"):
                if fields.get(k):
                    c[k] = fields[k]
            _save(store)
            return
    if not any(i["id"] == item_id for i in ITEMS):
        raise KeyError(item_id)
    store.setdefault("items", {}).setdefault(item_id, {}).update(_clean(fields))
    _save(store)


def add_item(fields):
    """A part of the planner's own: it joins every offer with its technology, or as an extra to tick, like the defaults."""
    for k, allowed in (("tech", TECHS), ("kind", KINDS), ("unit", UNITS), ("when", WHEN)):
        if fields.get(k) not in allowed:
            raise ValueError(f"{k} must be one of {', '.join(allowed)}")
    if not fields.get("name"):
        raise ValueError("name is needed")
    item = {"id": "c_" + uuid.uuid4().hex[:8], "tech": fields["tech"], "kind": fields["kind"], "unit": fields["unit"], "when": fields["when"],
            "fixed": 0.0, "per_unit": 0.0, "vat": VAT_SOLAR if fields["tech"] in ("solar", "battery") else VAT_NORMAL, "source": "Added by the planner", **_clean(fields)}
    store = _load()
    store.setdefault("custom", []).append(item)
    _save(store)
    return item


def reset_item(item_id):
    """A default goes back to its own price; a part the planner added is removed."""
    store = _load()
    store.get("items", {}).pop(item_id, None)
    store["custom"] = [c for c in store.get("custom", []) if c["id"] != item_id]
    _save(store)


def set_rates(values):
    store = _load()
    rates = store.setdefault("rates", {})
    for k, v in values.items():
        if k in RATES and v is not None:
            rates[k] = float(v)
    _save(store)


def reset_rates():
    store = _load()
    store.pop("rates", None)
    _save(store)
