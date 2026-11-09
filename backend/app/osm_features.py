import json
import math
import re
import time
import unicodedata
import xml.etree.ElementTree as ET
import urllib.error
import urllib.parse
import urllib.request

from flask import current_app


OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OSM_MAP_URL = "https://api.openstreetmap.org/api/0.6/map"
EARTH_RADIUS_METERS = 6_371_000
MAX_RESPONSE_BYTES = 5 * 1024 * 1024
MAX_FEATURES = 700
MAX_BUILDINGS = 350
MAX_POIS = MAX_FEATURES - MAX_BUILDINGS
CACHE_TTL_SECONDS = 3600
MAX_QUERY_EDGE_METERS = 5000
POI_TAG_VALUES = {
    "amenity": {
        "arts_centre", "bar", "cafe", "cinema", "clinic", "community_centre", "dentist",
        "doctors", "fast_food", "fountain", "hospital", "library", "marketplace",
        "museum", "pharmacy", "place_of_worship", "police", "post_office", "pub",
        "restaurant", "school", "theatre", "university",
    },
    "shop": {
        "bakery", "books", "butcher", "clothes", "convenience", "department_store",
        "gift", "mall", "supermarket",
    },
    "tourism": {"attraction", "gallery", "guest_house", "hostel", "hotel", "museum", "viewpoint", "zoo"},
    "historic": {"archaeological_site", "castle", "fort", "memorial", "monument", "ruins", "wayside_cross"},
    "leisure": {"garden", "park", "playground", "sports_centre", "stadium"},
    "natural": {"cave_entrance", "peak", "spring", "waterfall"},
}


class OSMUnavailableError(Exception):
    def __init__(self, reason):
        self.reason = reason
        super().__init__(reason)


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
    nearby_names = {}
    for element in elements:
        tags = element.get("tags", {})
        kind = "building" if tags.get("building") else "poi"
        name = str(tags.get("name", "")).strip()
        category = _feature_category(tags, kind)
        if not name or (kind == "poi" and not category):
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

        normalized_name = " ".join(unicodedata.normalize("NFKC", name).casefold().split())
        duplicate_key = (kind, normalized_name, category)
        if any(
            math.hypot(x - previous_x, y - previous_y) <= 25
            for previous_x, previous_y in nearby_names.get(duplicate_key, [])
        ):
            continue
        nearby_names.setdefault(duplicate_key, []).append((x, y))

        feature = {
            "id": feature_id,
            "name": name,
            "kind": kind,
            "category": category,
            "x": x,
            "y": y,
            "points": points,
        }
        if kind == "building":
            feature["height_m"] = _height_m(tags)
        features.append(feature)

    sort_key = lambda feature: (feature["name"].casefold(), feature["id"])
    buildings = sorted((feature for feature in features if feature["kind"] == "building"), key=sort_key)
    pois = sorted((feature for feature in features if feature["kind"] == "poi"), key=sort_key)
    selected = buildings[:MAX_BUILDINGS] + pois[:MAX_POIS]
    remaining = MAX_FEATURES - len(selected)
    if remaining:
        selected.extend(buildings[MAX_BUILDINGS:MAX_BUILDINGS + remaining])
        remaining = MAX_FEATURES - len(selected)
    if remaining:
        selected.extend(pois[MAX_POIS:MAX_POIS + remaining])
    return sorted(selected, key=lambda feature: (feature["kind"], feature["name"].casefold(), feature["id"]))


def _feature_category(tags, kind):
    if kind == "building":
        return tags.get("building", "building")
    for key, values in POI_TAG_VALUES.items():
        value = tags.get(key)
        if value in values:
            return value
    return ""


def _overpass_query(center, width_m, height_m):
    west, south, east, north = _bounds(center, width_m, height_m)
    bounds = f"{south},{west},{north},{east}"
    poi_queries = "".join(
        f'nwr["{key}"~"^({"|".join(sorted(values))})$"]["name"]({bounds});'
        for key, values in sorted(POI_TAG_VALUES.items())
    )
    return (
        "[out:json][timeout:8];"
        f'(way["building"]["name"]({bounds});relation["building"]["name"]({bounds});)->.buildings;'
        f"({poi_queries})->.pois;"
        ".pois out center;"
        ".buildings out center geom;"
    )


def _bounds(center, width_m, height_m):
    width_m = min(float(width_m), MAX_QUERY_EDGE_METERS)
    height_m = min(float(height_m), MAX_QUERY_EDGE_METERS)
    half_height = height_m / (2 * 111_320)
    half_width = width_m / (2 * 111_320 * max(math.cos(math.radians(center["lat"])), 0.01))
    return (
        center["lon"] - half_width,
        center["lat"] - half_height,
        center["lon"] + half_width,
        center["lat"] + half_height,
    )


def _fetch_elements(center, width_m, height_m):
    payload = urllib.parse.urlencode({"data": _overpass_query(center, width_m, height_m)}).encode()
    request = urllib.request.Request(
        current_app.config.get("OSM_OVERPASS_URL", OVERPASS_URL),
        data=payload,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Entanglement/0.1 (https://github.com/mutualendemic/entangled)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=6) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as error:
        raise OSMUnavailableError(f"HTTP_{error.code}") from error
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


def _fetch_osm_map_features(center, width_m, height_m):
    west, south, east, north = _bounds(center, width_m, height_m)
    query = urllib.parse.urlencode({"bbox": f"{west},{south},{east},{north}"})
    request = urllib.request.Request(
        f"{OSM_MAP_URL}?{query}",
        headers={
            "Accept": "application/xml",
            "User-Agent": "Entanglement/0.1 (https://github.com/mutualendemic/entangled)",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=6) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as error:
        raise OSMUnavailableError(f"HTTP_{error.code}") from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise OSMUnavailableError(type(error).__name__) from error
    if len(raw) > MAX_RESPONSE_BYTES:
        raise OSMUnavailableError("ResponseTooLarge")
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as error:
        raise OSMUnavailableError("InvalidResponse") from error

    nodes = {
        node.attrib["id"]: {"lat": float(node.attrib["lat"]), "lon": float(node.attrib["lon"])}
        for node in root.findall("node")
        if "id" in node.attrib and "lat" in node.attrib and "lon" in node.attrib
    }
    poi_keys = {"amenity", "shop", "tourism", "historic", "leisure", "natural", "place", "public_transport"}
    elements = []
    for node in root.findall("node"):
        tags = {tag.attrib.get("k", ""): tag.attrib.get("v", "") for tag in node.findall("tag")}
        if tags.get("name") and poi_keys.intersection(tags):
            elements.append({
                "type": "node",
                "id": node.attrib.get("id", ""),
                "lat": float(node.attrib["lat"]),
                "lon": float(node.attrib["lon"]),
                "tags": tags,
            })

    for way in root.findall("way"):
        tags = {tag.attrib.get("k", ""): tag.attrib.get("v", "") for tag in way.findall("tag")}
        named_building = bool(tags.get("building") and tags.get("name"))
        named_poi = bool(tags.get("name") and poi_keys.intersection(tags))
        if not (named_building or named_poi):
            continue
        geometry = [nodes[ref.attrib["ref"]] for ref in way.findall("nd") if ref.attrib.get("ref") in nodes]
        if not geometry:
            continue
        elements.append({
            "type": "way",
            "id": way.attrib.get("id", ""),
            "tags": tags,
            "center": {
                "lat": sum(point["lat"] for point in geometry) / len(geometry),
                "lon": sum(point["lon"] for point in geometry) / len(geometry),
            },
            "geometry": geometry,
        })
    return parse_osm_elements(elements, center, width_m, height_m)


def get_osm_features(event_id, center, width_m, height_m):
    cache = current_app.extensions.setdefault("osm_feature_cache", {})
    key = (event_id, round(center["lat"], 5), round(center["lon"], 5), width_m, height_m)
    now = time.monotonic()
    cached = cache.get(key)
    if cached and cached[0] > now:
        return cached[1]
    try:
        features = parse_osm_elements(_fetch_elements(center, width_m, height_m), center, width_m, height_m)
    except OSMUnavailableError as overpass_error:
        try:
            features = _fetch_osm_map_features(center, width_m, height_m)
        except OSMUnavailableError as fallback_error:
            raise OSMUnavailableError(
                f"Overpass_{overpass_error.reason};OSM_MAP_{fallback_error.reason}"
            ) from fallback_error
    cache[key] = (now + CACHE_TTL_SECONDS, features)
    if len(cache) > 24:
        for expired_key in [cache_key for cache_key, value in cache.items() if value[0] <= now]:
            cache.pop(expired_key, None)
        while len(cache) > 24:
            cache.pop(next(iter(cache)))
    return features