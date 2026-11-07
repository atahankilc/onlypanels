from reonic_engine.site import pvgis_aspect, read_overpass, read_photon, read_place, read_pvgis


def test_compass_bearing_becomes_pvgis_aspect():
    assert [pvgis_aspect(a) for a in (180, 90, 270, 0)] == [0, -90, 90, -180]


def test_read_place():
    row = {"display_name": "A street", "lat": "48.1", "lon": "11.6", "address": {"country_code": "de", "state": "Bayern"}}
    assert read_place(row) == {"label": "A street", "lat": 48.1, "lon": 11.6, "country": "Germany", "bavaria": True}


def test_read_photon():
    feature = {"geometry": {"coordinates": [11.6, 48.1]},
               "properties": {"street": "Hauptstr.", "housenumber": "8", "postcode": "85748", "city": "Garching",
                              "countrycode": "DE", "state": "Bayern"}}
    assert read_photon(feature) == {"label": "Hauptstr. 8, 85748 Garching", "lat": 48.1, "lon": 11.6,
                                    "country": "Germany", "bavaria": True}


def test_read_pvgis():
    payload = {"outputs": {"totals": {"fixed": {"E_y": 1133.5, "H(i)_y": 1432.06}},
                           "monthly": {"fixed": [{"E_m": 40.4}, {"E_m": 60.6}]}}}
    assert read_pvgis(payload) == {"kwh_per_kwp": 1134, "sun_kwh_m2": 1432, "monthly": [40, 61]}


def test_read_overpass_handles_tags_and_tree_count():
    payload = {"elements": [{"type": "way", "tags": {"building": "yes"}},
                            {"type": "way", "tags": {"roof:shape": "gabled", "roof:angle": "40"}},
                            {"type": "count", "tags": {"nodes": "3"}}]}
    assert read_overpass(payload) == {"roof": "pitched", "shape": "gabled", "tilt": 40.0, "trees": 3}
    assert read_overpass({"elements": []})["roof"] is None
