"""What the planners' offers are made of: every line item sorted into a kind (product, labour, service, package, finance,
promotion) and a group that the price book prices (engine/src/reonic_engine/pricebook.py). Aggregates only, no IDs.

How often each group appears in a solar offer is what the price book calls "share of offers": it decides whether a group
is in every offer (always), most offers (common, shown as a likely extra), or rare. All splits, both installers.

Run from the repo root:  uv run python scripts/profile_products.py
"""
import re

import pandas as pd

from reonic_engine.data import load_raw

# (pattern on the line's name, kind, group). First match wins; the order matters (extensions and promos before products).
RULES = [
    (r"promo free|free wallbox|special deal|subsidy deadline|\(free\)", "promotion", "promotion"),
    (r"solar credit", "finance", "financing"),
    (r"insurance", "finance", "insurance"),
    (r"extended warranty", "finance", "extended_warranty"),
    (r"complete package|pv complete package|complete package price", "package", "package"),
    (r"all-inclusive package", "service", "all_inclusive"),
    (r"travel|logistics|delivery to site|extra trip", "service", "travel"),
    (r"planning|consulting", "service", "planning"),
    (r"grid registration", "service", "grid_registration"),
    (r"scaffolding|site setup", "labour", "scaffolding"),
    (r"meter cabinet|meter consolidation|apz field|house connection", "labour", "meter_cabinet"),
    (r"satellite", "labour", "satellite_dish"),
    (r"ventilation tile|metal tiles|replacement tiles|mortared|cross-lay \(surcharge\)", "labour", "roof_extra"),
    (r"cable|cabling|earthwork", "labour", "cable_extra"),
    (r"pv module", "product", "module"),
    (r"substructure|roof mounting|sl rack|rack system", "product", "mounting"),
    (r"dc install", "labour", "dc_install"),
    (r"optimizer", "product", "optimizer"),
    (r"micro inverter", "product", "micro_inverter"),
    (r"inverter installation|install inverter", "labour", "ac_install"),
    (r"electrical installation per tab", "labour", "ac_install"),
    (r"inverter", "product", "inverter"),
    (r"battery storage installation|install battery|wall mounting battery", "labour", "battery_install"),
    (r"battery|power module", "product", "battery"),
    (r"backup|transfer switch|emergency power|smart guard|relay|home backup", "product", "backup"),
    (r"surge", "product", "surge_protection"),
    (r"selective circuit|sub-distribution|equipotential|fire protection|contactor|sub-meter|intermediate meter|cascading", "product", "electrical_parts"),
    (r"energy manag|smart meter|energy monitor|energy router|system controller|gateway|zigbee|communication|combiner|"
     r"solar controller|monitor tablet|three-phase smart meter|install smart meter|energy meter", "product", "energy_management"),
    (r"install wallbox|wallbox installation|prep|on-site prep", "labour", "wallbox_install"),
    (r"wallbox|ev charger|smart charger|charging cable|charge card|pedestal", "product", "wallbox"),
    (r"heat pump installation|garden work|disassembly|tank disposal|install \+ sealing", "labour", "heatpump_install"),
    (r"radiator", "labour", "radiators"),
    (r"all-in-one|heat pump \d|heat pump$", "product", "heatpump"),
    (r"hydraulic|heating controller", "product", "heatpump_parts"),
    (r"hot water storage", "product", "hot_water_storage"),
    (r"buffer storage", "product", "buffer_storage"),
    (r"electrician hours|install", "labour", "other_labour"),
]


def classify(name):
    n = str(name).lower()
    for pattern, kind, group in RULES:
        if re.search(pattern, n):
            return kind, group
    return "other", "other"


def main():
    _, parts = load_raw()
    parts = parts.copy()
    parts[["kind", "group"]] = parts.component_name.apply(lambda n: pd.Series(classify(n)))
    parts["extension"] = parts.component_name.str.contains("Extension", na=False)
    print("Line items by kind and group (all lines, both installers)")
    print(parts.groupby(["kind", "group"]).size().rename("lines").to_string())
    print("\nUnclassified names:", parts[parts.group == "other"].component_name.value_counts().head(15).to_dict())

    # Share of solar offers (options holding at least one solar line, add-ons left out) that hold each group, per installer.
    opts = parts[~parts.extension].copy()
    opts["key"] = opts.project_id.astype(str) + "/" + opts.option_id.astype(str)
    solar = opts[opts.technology == "solar"].key.unique()
    s = opts[opts.key.isin(solar)]
    has = s.groupby(["installer", "key"]).group.apply(set).reset_index()
    print("\nShare of solar offers holding each group, per installer")
    for inst, g in has.groupby("installer"):
        n = len(g)
        counts = pd.Series([x for sets in g.group for x in sets]).value_counts() / n
        print(f"-- {inst} ({n} solar offers)")
        print(counts.round(2).to_string())

    # Quantities per offer for the groups priced by quantity.
    print("\nMedian quantity per solar offer (scaffolding m², cable m)")
    for group in ("scaffolding", "cable_extra"):
        q = s[s.group == group].groupby(["installer", "key"]).quantity.sum()
        print(group, q.groupby(level=0).median().round(1).to_dict())

    # Heat pump offers: what goes with the unit.
    hp = opts[opts.technology == "heatpump"]
    hk = hp.key.unique()
    print(f"\nHeat pump offers: {len(hk)}")
    print((hp.groupby("key").group.apply(set).explode().value_counts() / len(hk)).round(2).to_string())


if __name__ == "__main__":
    main()
