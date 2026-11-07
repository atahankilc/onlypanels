import numpy as np

from reonic_engine.sun import CONTEXT_M, Heights, _dense, _sample, context, directions, inside, newell


def test_sun_stands_south_at_noon_and_higher_in_summer():
    suns = directions(48.1)
    june = next(s for s in suns if s["month"] == 6 and s["hour"] == 12)
    december = next(s for s in suns if s["month"] == 12 and s["hour"] == 12)
    assert abs(june["az"] - 180) < 1 and june["el"] > 60 and december["el"] < 20


def test_inside_a_square():
    x, y = np.array([1.0, 5.0]), np.array([1.0, 5.0])
    assert inside(x, y, [(0, 0), (2, 0), (2, 2), (0, 2)]).tolist() == [True, False]


def test_a_tall_block_to_the_south_shades_a_point_but_not_from_the_north():
    h = Heights(50)
    h.add([(-10, -20, 0), (10, -20, 0), (10, -10, 0), (-10, -10, 0)], 30)
    point = np.array([[0.0, 0.0, 1.0]])
    assert h.shaded(point, [0, -0.7, 0.7])[0] and not h.shaded(point, [0, 0.7, 0.7])[0]


def test_a_wall_touching_a_neighbour_is_found_only_where_the_neighbour_stands():
    h = Heights(50)
    h.add([(0, 0, 0), (10, 0, 0), (10, 10, 0), (0, 10, 0)], 6)
    wall = np.array([[-0.2, 5.0, 3.0], [-0.2, 5.0, 9.0]])  # low and above the neighbour's roof
    assert h.against(wall, [1, 0, 0]).tolist() == [True, False]


def test_context_keeps_close_buildings_and_fades_them_with_distance():
    own = _dense([(0, 0), (10, 0), (10, 10), (0, 10)])
    near = [(10, 0), (60, 0), (60, 10), (10, 10)]
    far = [(200, 0), (210, 0), (210, 10)]
    found = context([("near", 8, near), ("far", 8, far)], own)
    assert [f[0] for f in found] == ["near"]
    pts, fade = found[0][2], found[0][3]
    assert fade[0] == 1 and fade[np.argmax(pts[:, 0])] == 0 and CONTEXT_M < 50


def test_samples_fill_a_surface_and_face_outward():
    ring = [(0, 0, 0), (4, 0, 0), (4, 4, 0), (0, 4, 0)]
    points, cells, place, n, area = _sample(ring, [], 1.0)
    assert len(points) == 16 and len(cells) == 16 and area == 16 and n[2] == 1 and newell(ring)[2] > 0
    assert place(ring)[0] == [-0.5, -0.5]  # the outline sits half a cell outside the first sample
