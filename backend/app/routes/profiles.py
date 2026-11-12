from flask import Blueprint, g, jsonify, request

from backend.app.avatars import AVATARS
from backend.app.database import get_database
from backend.app.security import create_access_token, require_auth


profiles_blueprint = Blueprint("profiles", __name__)
PUBLIC_FIELDS = {"display_name", "bio", "interests", "avatar"}


def _profile_view(user: dict, profile: dict | None) -> dict:
    profile = profile or {}
    return {
        "username": user["username"],
        "avatar": user["avatar"],
        "display_name": profile.get("display_name", user["username"]),
        "bio": profile.get("bio", ""),
        "interests": profile.get("interests", []),
    }


@profiles_blueprint.get("/profiles/me")
@require_auth
def get_my_profile():
    database = get_database()
    user = database.users.find_one({"_id": g.user["id"]})
    if not user:
        return jsonify({"error": "Conta nao encontrada"}), 404
    profile = database.profiles.find_one({"user_id": g.user["id"]})
    return jsonify({"profile": _profile_view(user, profile)}), 200


@profiles_blueprint.patch("/profiles/me")
@require_auth
def update_my_profile():
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or not body:
        return jsonify({"error": "Informe os campos do perfil"}), 400
    if set(body) - PUBLIC_FIELDS:
        return jsonify({"error": "Campo de perfil nao permitido"}), 400

    updates = {}
    if "display_name" in body:
        value = body["display_name"]
        if not isinstance(value, str) or not 1 <= len(value.strip()) <= 40:
            return jsonify({"error": "Nome publico deve ter de 1 a 40 caracteres"}), 400
        updates["display_name"] = value.strip()
    if "bio" in body:
        value = body["bio"]
        if not isinstance(value, str) or len(value) > 280:
            return jsonify({"error": "Descricao deve ter no maximo 280 caracteres"}), 400
        updates["bio"] = value.strip()
    if "interests" in body:
        value = body["interests"]
        if (
            not isinstance(value, list)
            or len(value) > 10
            or any(not isinstance(item, str) or not 1 <= len(item.strip()) <= 32 for item in value)
        ):
            return jsonify({"error": "Informe ate 10 interesses de no maximo 32 caracteres"}), 400
        updates["interests"] = [item.strip() for item in value]

    avatar = body.get("avatar")
    if "avatar" in body and (not isinstance(avatar, str) or avatar not in AVATARS):
        return jsonify({"error": "Avatar invalido"}), 400

    database = get_database()
    user = database.users.find_one({"_id": g.user["id"]})
    if not user:
        return jsonify({"error": "Conta nao encontrada"}), 404
    avatar_changed = "avatar" in body and avatar != user.get("avatar")
    if avatar_changed:
        database.users.update_one({"_id": g.user["id"]}, {"$set": {"avatar": avatar}})
        user["avatar"] = avatar
    database.profiles.update_one(
        {"user_id": g.user["id"]},
        {
            "$set": {
                "user_id": g.user["id"],
                "username_key": user["username_key"],
                **updates,
            }
        },
        upsert=True,
    )
    profile = database.profiles.find_one({"user_id": g.user["id"]})
    response = {"profile": _profile_view(user, profile)}
    if avatar_changed:
        response["token"] = create_access_token(user)
    return jsonify(response), 200


@profiles_blueprint.get("/profiles/<username>")
@require_auth
def get_public_profile(username: str):
    database = get_database()
    user = database.users.find_one(
        {"username_key": username.casefold()},
        {"_id": 1, "username": 1, "avatar": 1},
    )
    if not user:
        return jsonify({"error": "Perfil nao encontrado"}), 404
    profile = database.profiles.find_one({"user_id": user["_id"]})
    return jsonify({"profile": _profile_view(user, profile)}), 200