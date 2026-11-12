import math

CELL_SIZE_METERS = 5000
MAX_TILE_INDEX = 1000
EARTH_RADIUS_METERS = 6_371_000


def valid_tile_index(value) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and abs(value) <= MAX_TILE_INDEX
    )


def tile_center(center: dict, tile_x: int, tile_y: int) -> dict:
    latitude_radians = math.radians(center["lat"])
    cosine = math.cos(latitude_radians)
    if abs(cosine) < 1e-8:
        raise ValueError("Tile longitude is undefined at this latitude")

    return {
        "lat": center["lat"] + math.degrees(tile_y * CELL_SIZE_METERS / EARTH_RADIUS_METERS),
        "lon": center["lon"] + math.degrees(tile_x * CELL_SIZE_METERS / (EARTH_RADIUS_METERS * cosine)),
    }


def project_to_tile(latitude: float, longitude: float, center: dict) -> dict:
    latitude_radians = math.radians(center["lat"])
    east_meters = EARTH_RADIUS_METERS * math.radians(longitude - center["lon"]) * math.cos(latitude_radians)
    north_meters = EARTH_RADIUS_METERS * math.radians(latitude - center["lat"])
    tile_x = math.floor((east_meters + CELL_SIZE_METERS / 2) / CELL_SIZE_METERS)
    tile_y = math.floor((north_meters + CELL_SIZE_METERS / 2) / CELL_SIZE_METERS)

    return {
        "tile_x": tile_x,
        "tile_y": tile_y,
        "x": east_meters - tile_x * CELL_SIZE_METERS + CELL_SIZE_METERS / 2,
        "y": CELL_SIZE_METERS / 2 - (north_meters - tile_y * CELL_SIZE_METERS),
    }
