from reonic_engine.battery import curve
from reonic_engine.design import Engine
from test_design import HOME, engine  # noqa: F401  (fixture)


def test_curve_covers_none_and_the_proposal_and_never_falls(engine):
    d = engine.design(HOME)
    rows = curve(HOME, d)
    sizes = [r["kwh"] for r in rows]
    assert sizes[0] == 0 and d["battery"]["kwh"] in sizes and sizes == sorted(sizes)
    shares = [r["own_pct"] for r in rows]
    assert all(b >= a for a, b in zip(shares, shares[1:]))  # a bigger battery never lowers own power
