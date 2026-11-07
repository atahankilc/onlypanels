"""Score all predictors by cross-validation on the dev split. Prints aggregates only.

Run from the repo root:  uv run python scripts/evaluate.py
"""
import numpy as np
import pandas as pd

from reonic_engine.data import INSTALLERS, load_dataset
from reonic_engine.evaluate import cross_validate, score
from reonic_engine.models import PREDICTORS

pd.set_option("display.width", 220, "display.max_columns", 30)


def fixed_range_width(dev, coverage=0.8):
    """Width of one fixed range for everyone that reaches the same coverage."""
    k = dev[dev.has_pv].kwp
    return k.quantile(0.5 + coverage / 2) - k.quantile(0.5 - coverage / 2)


def main():
    projects, options = load_dataset()
    dev = projects[projects.split == "dev"].reset_index(drop=True)
    print("projects", len(projects), projects.split.value_counts().to_dict(),
          projects.groupby("split").installer.value_counts().to_dict())
    print("share with PV", round(dev.has_pv.mean(), 3), "battery", round(dev.has_battery.mean(), 3),
          "wallbox", round(dev.has_wallbox.mean(), 3), "heat pump", int(dev.has_hp.sum()))

    rows = {}
    for name, predictor in PREDICTORS.items():
        pred = cross_validate(predictor, dev, options)
        rows[name] = score(pred, dev, options)
        if name == "coupled":
            for i in INSTALLERS:
                d = dev[dev.installer == i]
                rows[f"coupled {i}"] = score(pred[pred.project_id.isin(d.project_id)], d, options)
    print(pd.DataFrame(rows).T.round(3).T.to_string())
    coverage = rows["coupled"]["kwp_cover80"]
    print(f"kWp range: ours {rows['coupled']['kwp_width']:.2f} wide at {coverage:.3f} coverage, "
          f"one fixed range at the same coverage {fixed_range_width(dev, coverage):.2f}")


if __name__ == "__main__":
    main()
