"""Cut Bavaria's single trees (Einzelbäume, CC BY 4.0, © Bayerische Vermessungsverwaltung) into the 2 km squares the building models use.

Download (481.8 MB, the Munich lot, 2024) into data/external/trees/:
  https://geodaten.bayern.de/odd/m/8/baeume3d/data/124028_baeume.gpkg
Then, from the repo root:
  uv run python scripts/build_trees.py
Writes data/external/trees/squares/<x>_<y>.json, one per 2 km square named by its south-west corner in km (UTM 32, as LoD2):
a flat list [east, north, height, ...] in decimetres from that corner, height above the ground. Public data, kept out of git.
"""
import json
import sqlite3
import struct
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "data" / "external" / "trees"
SOURCE = HERE / "124028_baeume.gpkg"
OUT = HERE / "squares"
ENVELOPE = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}  # bytes of envelope after the header, by the flags' envelope code


def point(blob):
    """x, y of a GeoPackage point geometry."""
    flags = blob[3]
    start = 8 + ENVELOPE[(flags >> 1) & 7]
    order = "<" if blob[start] == 1 else ">"
    return struct.unpack_from(order + "dd", blob, start + 5)


def main():
    db = sqlite3.connect(SOURCE)
    squares = defaultdict(list)
    for (table,) in db.execute("select table_name from gpkg_contents"):
        for geom, height in db.execute(f"select geom, baumhoehe from '{table}'"):
            if geom is None or height is None:
                continue
            x, y = point(geom)
            sx, sy = int(x // 2000) * 2, int(y // 2000) * 2
            squares[f"{sx}_{sy}"].extend((round((x - sx * 1000) * 10), round((y - sy * 1000) * 10), round(height * 10)))
    OUT.mkdir(parents=True, exist_ok=True)
    for name, values in squares.items():
        (OUT / f"{name}.json").write_text(json.dumps(values, separators=(",", ":")))
    print(f"{sum(len(v) for v in squares.values()) // 3} trees in {len(squares)} squares")


if __name__ == "__main__":
    main()
