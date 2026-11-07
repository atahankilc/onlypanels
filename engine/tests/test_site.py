from reonic_engine.site import in_region, read_photon, read_place


def test_region_holds_munich_and_garching_but_not_berlin():
    assert in_region(48.137, 11.575) and in_region(48.268, 11.672) and not in_region(52.52, 13.40)


def test_read_place():
    assert read_place({"display_name": "A street", "lat": "48.1", "lon": "11.6"}) == {"label": "A street", "lat": 48.1, "lon": 11.6}


def test_read_photon():
    feature = {"geometry": {"coordinates": [11.6, 48.1]},
               "properties": {"street": "Hauptstr.", "housenumber": "8", "postcode": "85748", "city": "Garching"}}
    assert read_photon(feature) == {"label": "Hauptstr. 8, 85748 Garching", "lat": 48.1, "lon": 11.6}
