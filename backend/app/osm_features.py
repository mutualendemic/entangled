import json
import math
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from flask import current_app


OVERPASS_URL = "https://overpass-api.de/api/interpreter"
EARTH_RADIUS_METERS = 6_371_000
MAX_RESPONSE_BYTES = 5 * 1024 * 1024
MAX_FEATURES = 700
CACHE_TTL_SECONDS = 3600


class OSMUnavailableError(Exception):
    pass


def project_coordinates(latitude, longitude, center, width_m, height_m):
    latitude_radians = math.radians(center["lat"])
    x = width_m / 2 + EARTH_RADIUS_METERS * math.radians(longitude - center["lon"]) * math.cos(latitude_radians)
    y = height_m / 2 - EARTH_RADIUS_METERS * math.radians(latitude - center["lat"])
    return x, y


def _clip_polygon(points, width_m, height_m):
    def clip(vertices, inside, intersect):
        if not vertices:
            return []
        output = []
        previous = vertices[-1]
        previous_inside = inside(previous)
        for current in vertices:
            current_inside = inside(current)
            if current_inside != previous_inside:
                output.append(intersect(previous, current))
            if current_inside:
                output.append(current)
            previous = current
            previous_inside = current_inside
        return output

    def vertical(boundary):
        def intersect(first, second):
            delta_x = second[0] - first[0]
            factor = 0 if delta_x == 0 else (boundary - first[0]) / delta_x
            return boundary, first[1] + factor * (second[1] - first[1])
        return intersect

    def horizontal(boundary):
        def intersect(first, second):
            delta_y = second[1] - first[1]
            factor = 0 if delta_y == 0 else (boundary - first[1]) / delta_y
            return first[0] + factor * (second[0] - first[0]), boundary
        return intersect

    clipped = list(points)
    clipped = clip(clipped, lambda point: point[0] >= 0, vertical(0))
    clipped = clip(clipped, lambda point: point[0] <= width_m, vertical(width_m))
    clipped = clip(clipped, lambda point: point[1] >= 0, horizontal(0))
    clipped = clip(clipped, lambda point: point[1] <= height_m, horizontal(height_m))
    return clipped


def _height_m(tags):
    for key in ("height", "building:height"):
        match = re.match(r"\s*(\d+(?:\.\d+)?)", str(tags.get(key, "")))
        if match:
            return min(max(float(match.group(1)), 4), 80)
    levels = re.match(r"\s*(\d+(?:\.\d+)?)", str(tags.get("building:levels", "")))
    if levels:
        return min(max(float(levels.group(1)) * 3.2, 4), 80)
    return 12


def parse_osm_elements(elements, center, width_m, height_m):
    features = []
    seen = set()
    for element in elements:
        tags = element.get("tags", {})
        kind = "building" if tags.get("building") else "poi"
        name = str(tags.get("name", "")).strip()
        if not name:
            continue

        feature_id = f"{element.get('type', 'feature')}/{element.get('id', len(features))}"
        if feature_id in seen:
            continue
        seen.add(feature_id)
        points = []
        for node in element.get("geometry") or []:
            try:
                points.append(project_coordinates(
                    float(node["lat"]), float(node["lon"]), center, width_m, height_m
                ))
            except (KeyError, TypeError, ValueError):
                continue

        if kind == "building" and len(points) >= 3:
            points = _clip_polygon(points, width_m, height_m)
            if len(points) < 3:
                continue

        center_point = element.get("center") or element
        try:
            x, y = project_coordinates(
                float(center_point["lat"]), float(center_point["lon"]), center, width_m, height_m
            )
        except (KeyError, TypeError, ValueError):
            if not points:
                continue
            x = sum(point[0] for point in points) / len(points)
            y = sum(point[1] for point in points) / len(points)

        if not 0 <= x <= width_m or not 0 <= y <= height_m:
            if not points:
                continue
            x = sum(point[0] for point in points) / len(points)
            y = sum(point[1] for point in points) / len(points)
            if not 0 <= x <= width_m or not 0 <= y <= height_m:
                continue

        feature = {
            "id": feature_id,
            "name": name,
            "kind": kind,
            "category": tags.get("building") or tags.get("amenity") or tags.get("shop")
            or tags.get("tourism") or tags.get("historic") or tags.get("leisure", ""),
            "x": x,
            "y": y,
            "points": points,
        }
        if kind == "building":
            feature["height_m"] = _height_m(tags)
        features.append(feature)
        if len(features) >= MAX_FEATURES:
            break
    return features


def _overpass_query(center, width_m, height_m):
    latitude_delta = height_m / (2 * 111_320)
    longitude_delta = width_m / (
        2 * 111_320 * max(math.cos(math.radians(center["lat"])), 0.01)
    )
    bounds = (
        f"{center['lat'] - latitude_delta},{center['lon'] - longitude_delta},"
        f"{center['lat'] + latitude_delta},{center['lon'] + longitude_delta}"
    )
    return (
        "[out:json][timeout:18];("
        f'way["building"]["name"]({bounds});'
        f'relation["building"]["name"]({bounds});'
        f'nwr["amenity"]["name"]({bounds});'
        f'nwr["shop"]["name"]({bounds});'
        f'nwr["tourism"]["name"]({bounds});'
        f'nwr["historic"]["name"]({bounds});'
        f'nwr["leisure"]["name"]({bounds});'
        ");out center geom;"
    )


def _fetch_elements(center, width_m, height_m):
    payload = urllib.parse.urlencode({"data": _overpass_query(center, width_m, height_m)}).encode()
    request = urllib.request.Request(
        OVERPASS_URL,
        data=payload,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Entanglement/0.1 (https://github.com/mutualendemic/entangled)",
            },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=22) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise OSMUnavailableError(type(error).__name__) from error
    if len(raw) > MAX_RESPONSE_BYTES:
        raise OSMUnavailableError("ResponseTooLarge")
    try:
        data = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise OSMUnavailableError("InvalidResponse") from error
    if not isinstance(data, dict) or data.get("remark"):
        raise OSMUnavailableError("OverpassError")
    return data.get("elements", [])


def get_osm_features(event_id, center, width_m, height_m):
    cache = current_app.extensions.setdefault("osm_feature_cache", {})
    key = (event_id, round(center["lat"], 5), round(center["lon"], 5), width_m, height_m)
    now = time.monotonic()
    cached = cache.get(key)
    if cached and cached[0] > now:
        return cached[1]
    features = parse_osm_elements(_fetch_elements(center, width_m, height_m), center, width_m, height_m)
    cache[key] = (now + CACHE_TTL_SECONDS, features)
    if len(cache) > 24:
        for expired_key in [cache_key for cache_key, value in cache.items() if value[0] <= now]:
            cache.pop(expired_key, None)
        while len(cache) > 24:
            cache.pop(next(iter(cache)))
    return features