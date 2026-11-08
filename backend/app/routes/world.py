import hmac
from datetime import datetime, timedelta, timezone

import jwt
from flask import Blueprint, current_app, g, jsonify, request

from backend.app.database import get_database
from backend.app.security import require_auth


world_blueprint = Blueprint("world", __name__)
MAX_LOCATIONS = 100


def _valid_coordinate(latitude, longitude) -> bool:
    return (
        isinstance(latitude, (int, float))
        and not isinstance(latitude, bool)
        and isinstance(longitude, (int, float))
        and not isinstance(longitude, bool)
        and -90 <= latitude <= 90
        and -180 <= longitude <= 180
    )


@world_blueprint.get("/world")
@require_auth
def get_world():
    event_id = current_app.config["EVENT_ID"]
    event = get_database().events.find_one({"_id": event_id}, {"_id": 0})
    if not event:
        event = {
            "name": "Evento local",
            "center": None,
            "width_m": 1200,
            "height_m": 800,
            "locations": [],
            "beacons": [],
        }
    else:
        event.setdefault("locations", [])
        event.setdefault("beacons", [])
    return jsonify({"event_id": event_id, "event": event}), 200


@world_blueprint.put("/admin/event")
def update_event():
    configured_token = current_app.config["EVENT_ADMIN_TOKEN"]
    supplied_token = request.headers.get("X-Admin-Token", "")
    if not configured_token or not hmac.compare_digest(configured_token, supplied_token):
        return jsonify({"error": "Nao autorizado"}), 401

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "Corpo JSON invalido"}), 400
    name = body.get("name")
    center = body.get("center")
    width_m = body.get("width_m")
    height_m = body.get("height_m")
    locations = body.get("locations", [])
    beacons = body.get("beacons", [])
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
        return jsonify({"error": "Nome de evento invalido"}), 400
    if not isinstance(center, dict) or not _valid_coordinate(center.get("lat"), center.get("lon")):
        return jsonify({"error": "Centro geografico invalido"}), 400
    if (
        not isinstance(width_m, (int, float))
        or not isinstance(height_m, (int, float))
        or not 50 <= width_m <= 10000
        or not 50 <= height_m <= 10000
    ):
        return jsonify({"error": "Dimensoes do mapa devem estar entre 50 e 10000 metros"}), 400
    if not isinstance(locations, list) or len(locations) > MAX_LOCATIONS:
        return jsonify({"error": f"Informe no maximo {MAX_LOCATIONS} locais"}), 400
    if not isinstance(beacons, list) or len(beacons) > 20:
        return jsonify({"error": "Informe no maximo 20 beacons"}), 400

    safe_locations = []
    for location in locations:
        if not isinstance(location, dict):
            return jsonify({"error": "Local invalido"}), 400
        location_name = location.get("name")
        latitude = location.get("lat")
        longitude = location.get("lon")
        description = location.get("description", "")
        category = location.get("category", "landmark")
        if (
            not isinstance(location_name, str)
            or not 1 <= len(location_name.strip()) <= 80
            or not _valid_coordinate(latitude, longitude)
            or not isinstance(description, str)
            or len(description) > 280
            or not isinstance(category, str)
            or len(category) > 32
        ):
            return jsonify({"error": "Dados de local invalidos"}), 400
        safe_locations.append(
            {
                "name": location_name.strip(),
                "category": category,
                "lat": float(latitude),
                "lon": float(longitude),
                "description": description.strip(),
            }
        )

    safe_beacons = []
    for beacon in beacons:
        if not isinstance(beacon, dict):
            return jsonify({"error": "Beacon invalido"}), 400
        beacon_id = beacon.get("id")
        service_uuid = beacon.get("service_uuid")
        x_m = beacon.get("x_m")
        y_m = beacon.get("y_m")
        tx_power = beacon.get("tx_power", -59)
        path_loss = beacon.get("path_loss", 2.2)
        if (
            not isinstance(beacon_id, str)
            or not 1 <= len(beacon_id) <= 100
            or not isinstance(service_uuid, str)
            or not 1 <= len(service_uuid) <= 64
            or not isinstance(x_m, (int, float))
            or not isinstance(y_m, (int, float))
            or not 0 <= x_m <= width_m
            or not 0 <= y_m <= height_m
            or not isinstance(tx_power, (int, float))
            or not -100 <= tx_power <= -20
            or not isinstance(path_loss, (int, float))
            or not 1 <= path_loss <= 5
        ):
            return jsonify({"error": "Dados de beacon invalidos"}), 400
        safe_beacons.append(
            {
                "id": beacon_id,
                "service_uuid": service_uuid.lower(),
                "x_m": float(x_m),
                "y_m": float(y_m),
                "tx_power": float(tx_power),
                "path_loss": float(path_loss),
            }
        )

    event = {
        "name": name.strip(),
        "center": {"lat": float(center["lat"]), "lon": float(center["lon"])},
        "width_m": float(width_m),
        "height_m": float(height_m),
        "locations": safe_locations,
        "beacons": safe_beacons,
        "updated_at": datetime.now(timezone.utc),
    }
    get_database().events.replace_one(
        {"_id": current_app.config["EVENT_ID"]}, {"_id": current_app.config["EVENT_ID"], **event}, upsert=True
    )
    return jsonify({"event_id": current_app.config["EVENT_ID"], "event": event}), 200


@world_blueprint.post("/realtime/token")
@require_auth
def realtime_token():
    secret = current_app.config["SUPABASE_JWT_SECRET"]
    if not secret:
        return jsonify({"error": "Supabase Realtime nao esta configurado"}), 503
    event = get_database().events.find_one(
        {"_id": current_app.config["EVENT_ID"]},
        {"width_m": 1, "height_m": 1},
    ) or {}
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": g.user["id"],
            "username": g.user["username"],
            "avatar": g.user["avatar"],
            "role": "authenticated",
            "aud": "authenticated",
            "iss": "supabase",
            "event_id": current_app.config["EVENT_ID"],
            "event_width_m": event.get("width_m", 1200),
            "event_height_m": event.get("height_m", 800),
            "iat": now,
            "exp": now + timedelta(minutes=10),
        },
        secret,
        algorithm="HS256",
    )
    return jsonify(
        {
            "token": token,
            "expires_in": 600,
            "channel": f"event:{current_app.config['EVENT_ID']}",
        }
    ), 200