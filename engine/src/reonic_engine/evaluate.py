"""Score predictions against expert designs, per docs/evaluation.md."""
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold

from .data import battery_catalog


def closest_option(pred, options):
    """For each project, the expert option nearest to our design."""
    m = options.merge(pred, on="project_id", suffixes=("", "_pred"))
    m["gap"] = (m.kwp - m.kwp_pred).abs() / 3 + (m.battery_kwh - m.battery_kwh_pred).abs() / 5
    return m.sort_values("gap").groupby("project_id").head(1)


def score(pred, projects, options):
    """Scores one set of predictions, against both the last and the closest option."""
    last = projects.merge(pred, on="project_id", suffixes=("", "_pred"))
    best = closest_option(pred, options)
    pv, both = last[last.has_pv], best[best.has_pv & best.has_battery & best.has_battery_pred]
    bl = last[last.has_battery & last.has_battery_pred]
    no_batt = last[~last.has_battery]
    hp = last[last.has_hp]
    out = {
        "n": len(last),
        "kwp_mae_last": (pv.kwp - pv.kwp_pred).abs().mean(),
        "kwp_mae_closest": (best[best.has_pv].kwp - best[best.has_pv].kwp_pred).abs().mean(),
        "kwp_within20": ((pv.kwp - pv.kwp_pred).abs() / pv.kwp < 0.2).mean(),
        "batt_mae_last": (bl.battery_kwh - bl.battery_kwh_pred).abs().mean(),
        "batt_mae_closest": (both.battery_kwh - both.battery_kwh_pred).abs().mean(),
        "batt_exact_closest": ((both.battery_kwh - both.battery_kwh_pred).abs() < 0.51).mean(),
        "set_exact": ((last.has_battery == last.has_battery_pred) & (last.has_wallbox == last.has_wallbox_pred)
                      & (last.has_hp == last.has_hp_pred)).mean(),
        "no_batt_recall": (~no_batt.has_battery_pred).mean(),
        "wallbox_acc": (last.has_wallbox == last.has_wallbox_pred).mean(),
        "hp_recall": hp.has_hp_pred.mean() if len(hp) else np.nan,
        "hp_precision": last[last.has_hp_pred].has_hp.mean() if last.has_hp_pred.any() else np.nan,
    }
    if pred.kwp_lo.notna().any():
        out["kwp_cover80"] = ((pv.kwp >= pv.kwp_lo) & (pv.kwp <= pv.kwp_hi)).mean()
        out["kwp_width"] = (pv.kwp_hi - pv.kwp_lo).mean()
    return out


def cross_validate(predictor, dev, options, folds=5):
    """Out-of-fold predictions over the dev split. The test split is never touched here."""
    preds = []
    for tr, te in GroupKFold(folds).split(dev, groups=dev.customer_contact_id):
        train, test = dev.iloc[tr].reset_index(drop=True), dev.iloc[te].reset_index(drop=True)
        catalog = battery_catalog(options[options.project_id.isin(train.project_id)])
        preds.append(predictor(train, test, catalog))
    return pd.concat(preds, ignore_index=True)
