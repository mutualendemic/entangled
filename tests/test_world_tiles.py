import pytest

from backend.app.world_tiles import project_to_tile, tile_center, valid_tile_index


@pytest.mark.parametrize(
    ("east", "north", "tile_x", "tile_y", "x", "y"),
    [
        (0, 0, 0, 0, 2500, 2500),
        (2500, 0, 1, 0, 0, 2500),
        (-2500, 0, 0, 0, 0, 2500),
        (0, 2500, 0, 1, 2500, 5000),
        (0, -2500, 0, 0, 2500, 5000),
        (-2501, -2501, -1, -1, 4999, 1),
    ],
)
def test_project_to_tile_assigns_stable_cells(east, north, tile_x, tile_y, x, y):
    center = {"lat": 0, "lon": 0}
    latitude = north / 6_371_000 * 180 / 3.141592653589793
    longitude = east / 6_371_000 * 180 / 3.141592653589793

    position = project_to_tile(latitude, longitude, center)

    assert position["tile_x"] == tile_x
    assert position["tile_y"] == tile_y
    assert position["x"] == pytest.approx(x, abs=0.01)
    assert position["y"] == pytest.approx(y, abs=0.01)


def test_tile_center_moves_east_and_north_from_event_origin():
    center = tile_center({"lat": 0, "lon": 0}, 1, 1)

    assert center["lat"] == pytest.approx(5000 / 6_371_000 * 180 / 3.141592653589793)
    assert center["lon"] == pytest.approx(5000 / 6_371_000 * 180 / 3.141592653589793)


@pytest.mark.parametrize("value", [True, 1.5, "1", 1001, -1001])
def test_tile_index_rejects_invalid_values(value):
    assert not valid_tile_index(value)


@pytest.mark.parametrize("value", [-1000, -1, 0, 1, 1000])
def test_tile_index_accepts_bounded_integers(value):
    assert valid_tile_index(value)
