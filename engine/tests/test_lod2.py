import io

from reonic_engine.lod2 import parse, squares, tile_name

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
