"""Cut the Zensus 2022 100 m grid down to the prototype's region: building age and heating energy per cell.

Downloads (Open Data licence Germany, attribution 2.0, © Statistisches Bundesamt (Destatis), 2024):
  https://www.destatis.de/static/DE/zensus/gitterdaten/Gebaeude_nach_Baujahr_in_Mikrozensus_Klassen.zip
  https://www.destatis.de/static/DE/zensus/gitterdaten/Gebaeude_mit_Wohnraum_nach_Energietraeger_der_Heizung.zip
Unzip the two *_100m-Gitter.csv files into data/external/zensus/, then run from the repo root:
  uv run python scripts/build_zensus.py
Writes data/external/zensus/region.json: {"E<x>N<y>": [built counts..., heating counts...]} for cells in the region.
"""
import json
from pathlib import Path

import pandas as pd
from pyproj import Transformer

HERE = Path(__file__).resolve().parents[1] / "data" / "external" / "zensus"
REGION = {"west": 11.2, "south": 47.95, "east": 11.95, "north": 48.4}  # keep in step with web/src/region.ts
BUILT = ["Vor1919", "a1919bis1948", "a1949bis1978", "a1979bis1990", "a1991bis2000", "a2001bis2010", "a2011bis2019", "a2020undspaeter"]
HEAT = ["Gas", "Heizoel", "Holz_Holzpellets", "Biomasse_Biogas", "Solar_Geothermie_Waermepumpen", "Strom", "Kohle", "Fernwaerme", "kein_Energietraeger"]

to_grid = Transformer.from_crs(4326, 3035, always_xy=True)
xs, ys = zip(*[to_grid.transform(lon, lat) for lon in (REGION["west"], REGION["east"]) for lat in (REGION["south"], REGION["north"])])
x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)


def read(name, cols):
    d = pd.read_csv(HERE / name, sep=";", usecols=["x_mp_100m", "y_mp_100m", *cols], dtype=str)
    d = d[(d.x_mp_100m.astype(int).between(x0, x1)) & (d.y_mp_100m.astype(int).between(y0, y1))]
    for c in cols:  # "–" marks a value kept secret for privacy: small, read as none
        d[c] = pd.to_numeric(d[c].str.replace("–", "", regex=False), errors="coerce").fillna(0).astype(int)
    d["cell"] = "E" + (d.x_mp_100m.astype(int) - 50).astype(str) + "N" + (d.y_mp_100m.astype(int) - 50).astype(str)
    return d.set_index("cell")[cols]


built = read("Zensus2022_Gebaeude_nach_Baujahr_in_MZ_Klassen_100m-Gitter.csv", BUILT)
heat = read("Zensus2022_Gebaeude_nach_Energietraeger_der_Heizung_100m-Gitter.csv", HEAT)
both = built.join(heat, how="outer").fillna(0).astype(int)
out = {cell: row.tolist() for cell, row in both.iterrows() if row.sum()}
(HERE / "region.json").write_text(json.dumps({"built": BUILT, "heat": HEAT, "cells": out}, separators=(",", ":")))
print(f"{len(out)} cells in the region; built known in {(built.sum(axis=1) > 0).sum()}, heating in {(heat.sum(axis=1) > 0).sum()}")
