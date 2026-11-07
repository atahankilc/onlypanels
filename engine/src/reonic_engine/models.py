"""Baselines and the first coupled model. Every predictor returns one row per test project."""
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.neighbors import KNeighborsRegressor

HP_KWH_PER_KW = 2500
HP_SIZES = np.array([5, 7, 10, 12])
TREE = dict(max_iter=120, learning_rate=0.05, max_leaf_nodes=8, min_samples_leaf=15, random_state=0)


def features(d):
    x = pd.DataFrame(index=d.index)
    x["demand_mwh"] = d.demand_mwh
    x["price_ct_kwh"] = d.price_ct_kwh
    x["flex_tariff"] = d.energy_price_with_flexible_tariff.notna().astype(int)
    x["has_ev"] = d.has_ev.astype(int)
    x["ev_km"] = d.ev_annual_drive_distance_km.fillna(0)
    x["has_solar"] = d.has_solar.astype(int)
    x["has_storage"] = d.has_storage.astype(int)
    x["existing_hp"] = d.heating_existing_type.eq("Heatpump").astype(int)
    x["fossil_heat"] = d.heating_existing_type.isin(["Gas", "Oil", "OtherNonRenewable"]).astype(int)
    x["heat_mwh"] = d.heat_mwh
    x["profile_h0"] = d.load_profile.eq("H0").astype(int)
    x["installer"] = (d.installer == "23c108b7").astype(int)
    return x


def snap(values, installers, catalog):
    out = np.asarray(values, dtype=float).copy()
    for i, sizes in catalog.items():
        m = (np.asarray(installers) == i) & (out > 0)
        out[m] = sizes[np.abs(out[m, None] - sizes).argmin(axis=1)]
    return out


def heat_pump_rule(d):
    """Fossil heating with a known heat demand gets a heat pump, sized from the data's ratio."""
    wanted = d.heating_existing_type.isin(["Gas", "Oil", "OtherNonRenewable"]) & d.heat_mwh.notna()
    kw = (d.heat_mwh.fillna(0) * 1000 / HP_KWH_PER_KW).values
    kw = HP_SIZES[np.abs(kw[:, None] - HP_SIZES).argmin(axis=1)]
    return wanted.values, np.where(wanted, kw, 0.0)


def _frame(test, kwp, battery_yes, battery, wallbox_p, lo=None, hi=None):
    hp, hp_kw = heat_pump_rule(test)
    return pd.DataFrame({
        "project_id": test.project_id.values, "kwp": kwp, "battery_kwh": np.where(battery_yes, battery, 0.0),
        "has_battery": battery_yes, "has_wallbox": wallbox_p >= 0.5, "has_hp": hp, "hp_kw": hp_kw,
        "kwp_lo": lo, "kwp_hi": hi,
    })


def median_design(train, test, catalog):
    n = len(test)
    pv = train[train.has_pv]
    return _frame(test, np.full(n, pv.kwp.median()), np.full(n, train.has_battery.mean() >= 0.5),
                  np.full(n, train[train.has_battery].battery_kwh.median()), np.full(n, train.has_wallbox.mean()))


def rule_of_thumb(train, test, catalog):
    """kWp and battery in proportion to demand, ratios fitted on training data."""
    t = train[train.has_pv & train.demand_mwh.notna()]
    demand = test.demand_mwh.fillna(t.demand_mwh.median()).values
    kwp = demand * t.kwp.sum() / t.demand_mwh.sum()
    b = t[t.has_battery]
    battery = snap(kwp * b.battery_kwh.sum() / b.kwp.sum(), test.installer.values, catalog)
    return _frame(test, kwp, np.ones(len(test), bool), battery, np.full(len(test), train.has_wallbox.mean()))


def nearest_homes(train, test, catalog):
    cols = ["demand_mwh", "price_ct_kwh", "has_ev", "installer"]
    fit = features(train)[cols].fillna(features(train)[cols].median())
    use = features(test)[cols].fillna(fit.median())
    scale = fit.std().replace(0, 1)
    knn = lambda y, m: KNeighborsRegressor(25).fit(fit[m] / scale, y[m]).predict(use / scale)
    pv, bat = train.has_pv.values, train.has_battery.values
    kwp = knn(train.kwp.values, pv)
    battery = snap(knn(train.battery_kwh.values, bat), test.installer.values, catalog)
    yes = knn(bat.astype(float), np.ones(len(train), bool)) >= 0.5
    return _frame(test, kwp, yes, battery, knn(train.has_wallbox.values.astype(float), np.ones(len(train), bool)))


def _boosted(train, test, catalog, coupled):
    x, xt = features(train), features(test)
    pv = train.has_pv.values
    kwp_model = HistGradientBoostingRegressor(**TREE).fit(x[pv], train.kwp[pv])
    kwp = kwp_model.predict(xt)
    lo = HistGradientBoostingRegressor(loss="quantile", quantile=0.1, **TREE).fit(x[pv], train.kwp[pv]).predict(xt)
    hi = HistGradientBoostingRegressor(loss="quantile", quantile=0.9, **TREE).fit(x[pv], train.kwp[pv]).predict(xt)
    if coupled:
        # Train on out-of-fold PV predictions, so the battery model sees the error it will meet.
        oof = cross_val_predict(HistGradientBoostingRegressor(**TREE), x, train.kwp,
                                groups=train.customer_contact_id, cv=GroupKFold(5))
        x, xt = x.assign(pred_kwp=oof), xt.assign(pred_kwp=kwp)
    b = train.has_battery.values
    battery = HistGradientBoostingRegressor(**TREE).fit(x[b], train.battery_kwh[b]).predict(xt)
    yes = HistGradientBoostingClassifier(**TREE).fit(x, b).predict_proba(xt)[:, 1] >= 0.5
    wallbox = HistGradientBoostingClassifier(**TREE).fit(x, train.has_wallbox).predict_proba(xt)[:, 1]
    return _frame(test, kwp, yes, snap(battery, test.installer.values, catalog), wallbox, lo, hi)


def independent(train, test, catalog):
    return _boosted(train, test, catalog, coupled=False)


def coupled(train, test, catalog):
    return _boosted(train, test, catalog, coupled=True)


def _snapped_tiers(train, catalog):
    b = train.has_battery.values
    tiers = snap(train.battery_kwh.values, train.installer.values, catalog)
    return b, tiers


def tier_battery(train, test, catalog):
    """Battery as a choice between real catalog sizes, not a regression."""
    base = independent(train, test, catalog)
    x, xt = features(train), features(test)
    b, tiers = _snapped_tiers(train, catalog)
    model = HistGradientBoostingClassifier(**TREE).fit(x[b], tiers[b].astype(str))
    picked = model.predict(xt).astype(float)
    # The model can pick a size from the other installer's catalog, so snap again.
    base["battery_kwh"] = np.where(base.has_battery, snap(picked, test.installer.values, catalog), 0.0)
    return base


def installer_mode(train, test, catalog):
    """Every home gets the installer's most common battery."""
    base = median_design(train, test, catalog)
    b, tiers = _snapped_tiers(train, catalog)
    mode = pd.Series(tiers[b]).groupby(train.installer.values[b]).agg(lambda s: s.mode().iloc[0])
    base["battery_kwh"] = test.installer.map(mode).values
    return base


def battery_given_planner_pv(train, test, catalog):
    """Refinement case: the planner has fixed PV, so the true kWp is a legitimate input."""
    base = independent(train, test, catalog)
    x, xt = features(train).assign(kwp=train.kwp), features(test).assign(kwp=test.kwp)
    b = train.has_battery.values
    battery = HistGradientBoostingRegressor(**TREE).fit(x[b], train.battery_kwh[b]).predict(xt)
    base["battery_kwh"] = np.where(base.has_battery, snap(battery, test.installer.values, catalog), 0.0)
    return base


PREDICTORS = {"median design": median_design, "rule of thumb": rule_of_thumb, "nearest homes": nearest_homes,
              "independent": independent, "coupled": coupled, "tier battery": tier_battery,
              "installer mode": installer_mode, "planner fixes PV": battery_given_planner_pv}
