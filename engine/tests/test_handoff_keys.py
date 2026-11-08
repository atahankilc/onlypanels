"""Every fact the homeowner's request carries must be a field the API takes: pydantic drops unknown keys silently,
which is how six answers once changed nothing."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "api"))


def test_every_input_from_the_homeowner_reaches_the_engine():
    from main import Inputs

    ts = (ROOT / "web" / "src" / "plan.ts").read_text()
    start = ts.index("inputs: {", ts.index("export function fromHomeowner"))
    block = ts[start:ts.index("\n    sources:", start)]
    keys = set(re.findall(r"(?:[{,]\s*)([a-z_][a-z0-9_]*):", block))
    missing = keys - set(Inputs.model_fields)
    assert keys and not missing, f"sent by plan.ts but dropped by the API: {sorted(missing)}"
