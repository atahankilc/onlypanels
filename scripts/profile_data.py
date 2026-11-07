"""Reproduce every number in docs/data/findings.md.

Run from the repo root:  uv run python scripts/profile_data.py
Prints aggregates only, so the output is safe to paste into docs.
"""
from pathlib import Path
import warnings

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

warnings.filterwarnings("ignore")
pd.set_option("display.width", 200, "display.max_columns", 40, "display.max_rows", 100)

RAW = Path(__file__).resolve().parents[1] / "data" / "raw"
INSTALLERS = ["2a8ba8e2", "23c108b7"]
ASSUMED_KWP_PER_MODULE = 0.45  # median module_watt_peak where Module rows exist


def load():
    status = pd.concat(
        [pd.read_csv(RAW / i / "projects_status_quo.csv").assign(installer=i) for i in INSTALLERS],
        ignore_index=True,
    )
    parts = pd.concat(
        [pd.read_csv(RAW / i / "project_options_parts.csv").assign(installer=i) for i in INSTALLERS],
        ignore_index=True,
    )
    return status, parts


def build_options(p):
    """One row per option. Note the swapped spec columns and W/Wh units."""
    name = p.component_name
    grouped = p.groupby("option_id")
    o = grouped.agg(
        project_id=("project_id", "first"),
        installer=("installer", "first"),
        option_number=("option_number", "first"),
        n_lines=("quantity", "size"),
    )

    def qty(mask):
        return p[mask].groupby("option_id").quantity.sum()

    counts = pd.DataFrame({
        "module": qty(p.component_type == "Module"),
        "dc": qty(name.str.startswith("DC Install")),
        "sub": qty(name.str.startswith("Substructure") & (p.quantity > 1)),
        "roof": qty(name.str.match(r"Roof Mounting (up to|\d|over)")),
    }).reindex(o.index).fillna(0)
    o["modules"] = counts.max(axis=1)

    mod = p[p.component_type == "Module"]
    o["kwp_exact"] = (mod.quantity * mod.module_watt_peak / 1000).groupby(mod.option_id).sum()
    pkg = p[name.str.contains("Complete Package")]
    o["kwp_package"] = (
        pkg.component_name.str.extract(r"([\d.]+)\s?kWp?\b")[0].astype(float).groupby(pkg.option_id).max()
    )
    o["kwp"] = o.kwp_exact.fillna(o.kwp_package).fillna(o.modules * ASSUMED_KWP_PER_MODULE)
    o["kwp_source"] = np.select(
        [o.kwp_exact > 0, o.kwp_package > 0, o.modules > 0], ["exact", "package", "count_x_wp"], "none"
    )

    # inverter_power_kw actually holds battery Wh on BatteryStorage rows.
    bat = p[(p.component_type == "BatteryStorage") & ~name.str.contains("AC Coupling")]
    o["battery_kwh"] = (bat.inverter_power_kw * bat.quantity / 1000).groupby(bat.option_id).sum()
    o["battery_kwh"] = o.battery_kwh.fillna(0)
    o["extension_battery"] = bat[bat.component_name.str.contains("Extension")].groupby("option_id").size()
    o["extension_fee"] = p[name.str.contains("Extension") & (p.component_type != "BatteryStorage")].groupby("option_id").size()
    o["wallboxes"] = qty(p.component_type == "Wallbox")
    hp = p[p.component_type == "Heatpump"]
    o["hp_kw"] = hp.heatpump_nominal_power_kw.groupby(hp.option_id).sum() / 1000
    o = o.fillna({"extension_battery": 0, "extension_fee": 0, "wallboxes": 0, "hp_kw": 0})

    o["has_pv"], o["has_batt"] = o.kwp > 0, o.battery_kwh > 0
    o["has_wb"], o["has_hp"] = o.wallboxes > 0, o.hp_kw > 0
    o["shape"] = (
        o.has_pv.map({True: "P", False: "-"}) + o.has_batt.map({True: "B", False: "-"})
        + o.has_wb.map({True: "W", False: "-"}) + o.has_hp.map({True: "H", False: "-"})
    )
    return o.reset_index()


def section(title):
    print(f"\n=== {title}")


def features(d):
    x = pd.DataFrame(index=d.index)
    x["mwh"] = (d.energy_demand_wh / 1e6).clip(upper=30)
    x["price"] = d.energy_price_per_wh.clip(upper=1e-3)
    x["ev"] = d.has_ev.astype(int)
    x["ev_km"] = d.ev_annual_drive_distance_km.fillna(0)
    x["solar0"] = d.has_solar.astype(int)
    x["storage0"] = d.has_storage.astype(int)
    x["heat_type"] = d.heating_existing_type.fillna("none").astype("category").cat.codes
    x["heat_mwh"] = d.heating_existing_heating_demand_wh.fillna(0) / 1e6
    x["load_profile"] = d.load_profile.astype("category").cat.codes
    x["installer"] = (d.installer == INSTALLERS[1]).astype(int)
    return x


def cross_val(d, y, classify=False, extra=None):
    x = features(d)
    if extra is not None:
        x = x.assign(extra=extra)
    pred = np.zeros(len(d))
    model = HistGradientBoostingClassifier if classify else HistGradientBoostingRegressor
    for tr, te in GroupKFold(5).split(x, groups=d.customer_contact_id):
        m = model(max_iter=120, learning_rate=0.05, max_leaf_nodes=8, min_samples_leaf=15, random_state=0)
        m.fit(x.iloc[tr], y.iloc[tr])
        pred[te] = m.predict_proba(x.iloc[te])[:, 1] if classify else m.predict(x.iloc[te])
    return pred


def report_regression(label, d, y, extra=None):
    pred, yv = cross_val(d, y, extra=extra), y.values
    print(f"{label:<28} n={len(d):<5} MAE={np.abs(yv - pred).mean():.2f}  "
          f"constant-median MAE={np.abs(yv - np.median(yv)).mean():.2f}  "
          f"within20%={(np.abs(yv - pred) / yv < 0.2).mean():.3f}  median={np.median(yv):.2f}")


def main():
    status, parts = load()
    opts = build_options(parts)

    section("Shape of the data")
    print(status.groupby("installer").project_id.nunique().to_dict(), "projects")
    print(opts.groupby("installer").project_id.nunique().to_dict(), "projects with parts")
    print(opts.groupby("installer").option_id.nunique().to_dict(), "options")
    print("signed date present:", status.first_signed_at.notna().mean())

    section("kWp source per option")
    print(pd.crosstab(opts.installer, opts.kwp_source))

    section("Option shapes (P=PV B=battery W=wallbox H=heat pump)")
    print(pd.crosstab(opts["shape"], opts.installer))
    print(opts.groupby("shape").agg(
        n=("option_id", "size"),
        extension_battery=("extension_battery", lambda s: round((s > 0).mean(), 2)),
        extension_fee=("extension_fee", lambda s: round((s > 0).mean(), 2)),
        median_lines=("n_lines", "median"),
    ))

    section("Project level, any option")
    any_opt = opts.groupby("project_id").agg(
        installer=("installer", "first"), pv=("has_pv", "max"), batt=("has_batt", "max"),
        wb=("has_wb", "max"), hp=("has_hp", "max"), n_options=("option_id", "size"),
    )
    print(any_opt.groupby("installer")[["pv", "batt", "wb", "hp"]].sum())
    print("multi-option projects:", (any_opt.n_options > 1).sum(), "of", len(any_opt))

    section("New-system subset: option has PV, not an add-on")
    new = opts[opts.has_pv & (opts.extension_battery == 0) & (opts.extension_fee == 0)]
    print("options", len(new), "projects", new.project_id.nunique(),
          new.groupby("installer").project_id.nunique().to_dict())

    section("Noise floor: same home, same installer, different options")
    multi = new[new.groupby("project_id").option_id.transform("size") > 1]
    spread = multi.groupby("project_id").agg(
        kwp_range=("kwp", lambda s: s.max() - s.min()),
        batt_range=("battery_kwh", lambda s: s.max() - s.min()),
    )
    print("projects", len(spread), "| differ kWp", round((spread.kwp_range > 0).mean(), 3),
          "| differ battery", round((spread.batt_range > 0).mean(), 3))
    print("mean range when differing: kWp", round(spread.kwp_range[spread.kwp_range > 0].mean(), 2),
          "| battery kWh", round(spread.batt_range[spread.batt_range > 0].mean(), 2))

    section("Input flags vs what was sold (project level, any option)")
    joined = status.merge(any_opt.reset_index(), on="project_id", suffixes=("", "_o"))
    print("wallbox projects with has_ev:", joined[joined.wb].has_ev.sum(), "of", joined.wb.sum())
    print("has_ev projects with wallbox:", joined[joined.has_ev].wb.sum(), "of", joined.has_ev.sum())
    print("heat pump sold by heating type:\n",
          pd.crosstab(joined.heating_existing_type.fillna("none"), joined.hp))
    hp = opts[opts.has_hp].merge(status, on="project_id")
    print("heat kWh per HP kW:", (hp.heating_existing_heating_demand_wh / 1000 / hp.hp_kw).describe().round(0).to_dict())

    section("Baseline, 5-fold grouped by customer, last option per project")
    last = new.sort_values("option_number").groupby("project_id").tail(1)
    d = last.merge(status.drop(columns="installer"), on="project_id")
    d = d[d.energy_demand_wh >= 1e6].reset_index(drop=True)
    report_regression("kWp (all)", d, d.kwp)
    for inst in INSTALLERS:
        s = d[d.installer == inst].reset_index(drop=True)
        report_regression(f"kWp ({inst})", s, s.kwp)
    b = d[d.has_batt].reset_index(drop=True)
    report_regression("battery kWh", b, b.battery_kwh)
    report_regression("battery kWh | true kWp", b, b.battery_kwh, extra=b.kwp)
    rule = (d.energy_demand_wh / 1e6) * (d.kwp.sum() / (d.energy_demand_wh / 1e6).sum())
    print(f"rule of thumb kWp=k*MWh      MAE={np.abs(d.kwp - rule).mean():.2f}")
    for col in ["has_batt", "has_wb"]:
        auc = roc_auc_score(d[col], cross_val(d, d[col].astype(int), classify=True))
        print(f"{col:<28} AUC={auc:.3f} base rate={d[col].mean():.3f}")


if __name__ == "__main__":
    main()
