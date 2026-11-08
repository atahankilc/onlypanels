from reonic_engine import monument


def test_status_prefers_the_building_then_the_ensemble_then_neighbours(monkeypatch):
    def fake(answers):
        def ask(lat, lon, layers):
            return answers["here" if "bauensemble" in layers else "near"]
        return ask

    church = {"kind": "listed", "id": "D-1", "name": "Church", "address": "Square 1"}
    quarter = {"kind": "ensemble", "id": "E-1", "name": "Old town", "address": None}
    cases = [({"here": [church, quarter], "near": [church]}, "listed", 0), ({"here": [quarter], "near": []}, "ensemble", 0),
             ({"here": [], "near": [church, church]}, "near", 1), ({"here": [], "near": []}, "none", 0)]
    for n, (answers, status, close) in enumerate(cases):
        monkeypatch.setattr(monument, "_ask", fake(answers))
        r = monument.around(48.1 + n, 11.5)  # a new point each time, past the cache
        assert r["status"] == status and len(r["near"]) == close


def test_an_outage_is_unknown_and_not_remembered(monkeypatch):
    def down(*_):
        raise OSError

    monkeypatch.setattr(monument, "_ask", down)
    assert monument.around(48.3, 11.6)["status"] == "unknown"
    monkeypatch.setattr(monument, "_ask", lambda *_: [])
    assert monument.around(48.3, 11.6)["status"] == "none"
