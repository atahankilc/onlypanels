import io
import json
import struct

import pytest

from reonic_engine import lod2
from reonic_engine.lod2 import edges, outline, parse, squares, tile_name

GML = """<CityModel xmlns:gml="http://www.opengis.net/gml" xmlns:bldg="http://www.opengis.net/citygml/building/1.0">
<bldg:Building gml:id="a">
<bldg:boundedBy><bldg:GroundSurface><gml:Polygon><gml:exterior><gml:LinearRing>
<gml:posList>0 0 500 10 0 500 10 10 500 0 10 500 0 0 500</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></bldg:GroundSurface></bldg:boundedBy>
<bldg:boundedBy><bldg:RoofSurface><gml:Polygon><gml:exterior><gml:LinearRing>
<gml:posList>0 0 506 10 0 506 10 10 510 0 10 510 0 0 506</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></bldg:RoofSurface></bldg:boundedBy>
</bldg:Building></CityModel>"""


def test_tile_name_is_the_even_south_west_corner_in_km():
    assert tile_name(696789, 5347429) == "696_5346"
    assert tile_name(698275, 5349583) == "698_5348"


def test_parse_reads_surfaces_and_drops_the_repeated_point():
    b = parse(io.BytesIO(GML.encode()))[0]
    assert b["floor"] == 500 and len(b["ground"][0]["ring"]) == 4 and b["roofs"][0]["ring"][2] == (10, 10, 510)


def test_parse_keeps_the_building_id():
    assert parse(io.BytesIO(GML.encode()))[0]["id"] == "a"


def test_squares_cover_a_box():
    assert squares(11.651, 48.2495, 11.652, 48.2500) == ["696_5346"]
    assert len(squares(11.64, 48.24, 11.68, 48.28)) >= 4


def test_outline_is_a_closed_ring_around_the_square():
    ring = outline("690_5334")
    assert len(ring) == 5 and ring[0] == ring[-1]
    assert squares(ring[0][0] + 0.001, ring[0][1] + 0.001, ring[0][0] + 0.002, ring[0][1] + 0.002) == ["690_5334"]


def test_edges_start_with_their_origin_and_hold_four_points_per_corner():
    origin = (11.5, 48.1)
    home = {"properties": {"h": 10.0}, "geometry": {"coordinates": [[[[11.5, 48.1], [11.5001, 48.1], [11.5001, 48.1001]]]]}}
    data = edges([home], origin)
    assert struct.unpack("<2d", data[:16]) == origin
    points = struct.unpack(f"<{(len(data) - 16) // 4}f", data[16:])
    assert len(points) == 3 * 4 * 3
    assert points[:3] == pytest.approx((0, 0, 10.08))
    assert points[3] == pytest.approx(7.43, rel=0.01)  # 0.0001 degrees of longitude at this latitude


def raw_building(id, east):
    ground = [(east + x, 5334000 + y, 500) for x, y in [(0, 0), (10, 0), (10, 10), (0, 10)]]
    return {"id": id, "ground": [{"ring": ground, "holes": []}], "roofs": [{"ring": [(x, y, 508) for x, y, _ in ground], "holes": []}], "walls": [], "floor": 500}


def test_build_serves_a_square_without_its_raw_file(tmp_path, monkeypatch):
    monkeypatch.setattr(lod2, "BUILT", tmp_path)
    monkeypatch.setattr(lod2, "_tile", lambda name: [raw_building("a", 691000)])
    assert not lod2.built("690_5334")
    lod2.build("690_5334")
    assert lod2.built("690_5334")
    home = json.loads(lod2.path("690_5334", "homes").read_text())["features"][0]
    assert home["properties"]["id"] == "a" and home["properties"]["h"] == 8
    assert lod2.building("690_5334", "a")["roofs"][0]["ring"][0][2] == 8
    assert lod2.building("690_5334", "nope") is None


def test_build_leaves_out_buildings_past_the_region_but_keeps_their_surfaces(tmp_path, monkeypatch):
    monkeypatch.setattr(lod2, "BUILT", tmp_path)
    monkeypatch.setattr(lod2, "_tile", lambda name: [raw_building("far", 800000)])
    lod2.build("800_5334")
    assert json.loads(lod2.path("800_5334", "homes").read_text())["features"] == []
    assert lod2.building("800_5334", "far") is not None
