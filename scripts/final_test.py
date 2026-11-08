"""Final numbers: every predictor trained on the whole dev split, scored once on the test split. Prints aggregates only.

The test split is held out from all development (split by customer_contact_id, data.split_of). Run this rarely: each run
that changes a decision afterwards makes the test split a little less of a test.

Run from the repo root:  uv run python scripts/final_test.py
"""
import json
from pathlib import Path

import pandas as pd

from reonic_engine.data import INSTALLERS, battery_catalog, load_dataset
from reonic_engine.design import engine_predictor
from reonic_engine.evaluate import score
from reonic_engine.models import PREDICTORS

pd.set_option("display.width", 220, "display.max_columns", 30)


def main():
    projects, options = load_dataset()
    dev = projects[projects.split == "dev"].reset_index(drop=True)
    test = projects[projects.split == "test"].reset_index(drop=True)
    assert not set(dev.customer_contact_id) & set(test.customer_contact_id), "a customer is in both splits"
    print("dev", len(dev), "test", len(test), "test by installer", test.installer.value_counts().to_dict())

    catalog = battery_catalog(options[options.project_id.isin(dev.project_id)])
    test_options = options[options.project_id.isin(test.project_id)]
    rows = {}
    for name, predictor in {**PREDICTORS, "engine": engine_predictor}.items():
        pred = predictor(dev, test, catalog)
        rows[name] = score(pred, test, test_options)
        for i in INSTALLERS:
            t = test[test.installer == i]
            rows[f"{name} {i}"] = score(pred[pred.project_id.isin(t.project_id)], t, test_options[test_options.project_id.isin(t.project_id)])
    table = pd.DataFrame(rows).T
    print(table.round(3).T.to_string())

    out = Path(__file__).resolve().parents[1] / "data" / "processed" / "test_scores.json"
    clean = {name: {k: (None if pd.isna(v) else float(v)) for k, v in r.items()} for name, r in rows.items()}
    out.write_text(json.dumps({"dev_projects": len(dev), "test_projects": len(test), "scores": clean}, indent=2))
    print("written", out.relative_to(out.parents[2]))


if __name__ == "__main__":
    main()
