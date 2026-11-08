"""The homeowner's pages say what a skipped answer becomes, from values mirrored in web/src/questions.ts.
These must match what the engine really uses, or the pages would promise one number and the design use another."""
import json
import re
from pathlib import Path

from reonic_engine import design

ROOT = Path(__file__).resolve().parents[2]
TS = (ROOT / "web" / "src" / "questions.ts").read_text()


def ts_value(name: str):
    m = re.search(rf"export const {name}(?:: [^=]+)? = (.+?);", TS)
    assert m, name
    text = re.sub(r"(\w+|\"[^\"]+\"):", lambda g: f'"{g.group(1).strip(chr(34))}":', m.group(1))  # keys to JSON
    return json.loads(text)


def test_stand_ins_match_the_engine():
    assert ts_value("BASE_FEE_EUR_YEAR") == design.BASE_FEE_EUR_YEAR
    assert ts_value("BIG_USERS_KWH") == design.BIG_USERS_KWH
    assert ts_value("HEAT_KWH_PER_M2") == design.HEAT_KWH_PER_M2
    assert ts_value("EV_KWH_PER_KM") == design.EV_KWH_PER_KM
    assert ts_value("HOME_SHARE") == design.HOME_SHARE
    assert ts_value("KWP_PER_M2") == design.KWP_PER_M2
    assert ts_value("FEED_IN_YEARS") == design.FEED_IN_YEARS
    assert "heat_mwh or 15.0" in Path(design.__file__).read_text() and ts_value("TYPICAL_HEAT_KWH") == 15000
    api = (ROOT / "api" / "main.py").read_text()
    assert re.search(r"TYPICAL_USE_KWH = (\d+)", api).group(1) == str(ts_value("TYPICAL_USE_KWH"))
