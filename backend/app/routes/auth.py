import re
import smtplib
import uuid
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, jsonify, request
from pymongo.errors import DuplicateKeyError

from backend.app.database import get_database
from backend.app.email_service import send_action_email
from backend.app.security import (
    create_access_token,
    hash_action_token,
    hash_password,
    new_action_token,
    require_auth,
    verify_password,
)


auth_blueprint = Blueprint("auth", __name__)
AVATARS = {"moss", "ember", "wave", "sun", "comet", "bloom"}
USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]{3,24}$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PASSWORD_MIN_LENGTH = 10
ACTION_TOKEN_TTL = timedelta(minutes=30)


def _json_body():
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


def _public_user(user: dict) -> dict:
    return {
        "id": user["_id"],
        "username": user["username"],
        "avatar": user["avatar"],
        "email_configured": bool(user.get("email_verified")),
    }


def _action_expiry():
    return datetime.now(timezone.utc) + ACTION_TOKEN_TTL


@auth_blueprint.post("/auth/register")
def register():
    body = _json_body()
    username = str(body.get("username", "")).strip()
    password = body.get("password", "")
    avatar = body.get("avatar", "moss")

    if not USERNAME_PATTERN.fullmatch(username):
        return jsonify({"error": "Use de 3 a 24 letras, numeros ou underscores no nome"}), 400
    if not isinstance(password, str) or len(password) < PASSWORD_MIN_LENGTH or len(password) > 256:
        return jsonify({"error": "A senha deve ter pelo menos 10 caracteres"}), 400
    if avatar not in AVATARS:
        return jsonify({"error": "Avatar invalido"}), 400
    if not current_app.config.get("JWT_SECRET"):
        return jsonify({"error": "Autenticacao indisponivel: JWT_SECRET nao configurado"}), 503

    user = {
        "_id": uuid.uuid4().hex,
        "username": username,
        "username_key": username.casefold(),
        "password_hash": hash_password(password),
        "avatar": avatar,
        "email": None,
        "email_verified": False,
        "created_at": datetime.now(timezone.utc),
    }
    access_token = create_access_token(user)
    try:
        get_database().users.insert_one(user)
    except DuplicateKeyError:
        return jsonify({"error": "Este nome de jogador ja esta em uso. Entre na conta ou escolha outro nome."}), 409

    return jsonify({"user": _public_user(user), "token": access_token}), 201


@auth_blueprint.post("/auth/login")
def login():
    body = _json_body()
    username = str(body.get("username", "")).strip()
    password = body.get("password", "")
    if not username or not isinstance(password, str):
        return jsonify({"error": "Nome ou senha incorretos"}), 401
    if not current_app.config.get("JWT_SECRET"):
        return jsonify({"error": "Autenticacao indisponivel: JWT_SECRET nao configurado"}), 503

    user = get_database().users.find_one({"username_key": username.casefold()})
    if not user or not verify_password(user["password_hash"], password):
        return jsonify({"error": "Nome ou senha incorretos"}), 401

    return jsonify({"user": _public_user(user), "token": create_access_token(user)}), 200


@auth_blueprint.get("/auth/me")
@require_auth
def me():
    user = get_database().users.find_one({"_id": g.user["id"]})
    if not user:
        return jsonify({"error": "Conta nao encontrada"}), 404
    return jsonify({"user": _public_user(user)}), 200


@auth_blueprint.post("/account/email")
@require_auth
def request_email_verification():
    body = _json_body()
    email = str(body.get("email", "")).strip().lower()
    if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
        return jsonify({"error": "Email invalido"}), 400

    token, token_hash = new_action_token()
    get_database().users.update_one(
        {"_id": g.user["id"]},
        {
            "$set": {
                "pending_email": email,
                "email_action_hash": token_hash,
                "email_action_expires_at": _action_expiry(),
            }
        },
    )
    action_url = f"{current_app.config['APP_ORIGIN']}/?verify-email={token}"
    try:
        sent = send_action_email(email, "Confirmar email do Entanglement", action_url)
    except (OSError, smtplib.SMTPException):
        current_app.logger.exception("Could not send email verification")
        return jsonify({"error": "Nao foi possivel enviar o email agora"}), 503
    if not sent:
        return jsonify({"error": "Configure o envio SMTP para confirmar o email"}), 503
    return jsonify({"message": "Se o envio estiver configurado, voce recebera um link de confirmacao"}), 202


@auth_blueprint.get("/account/email")
@require_auth
def get_account_email():
    user = get_database().users.find_one({"_id": g.user["id"]})
    if not user:
        return jsonify({"error": "Conta nao encontrada"}), 404
    return jsonify(
        {
            "email": user.get("email") if user.get("email_verified") else None,
            "pending": bool(user.get("pending_email")),
            "verified": bool(user.get("email_verified")),
        }
    ), 200


@auth_blueprint.post("/auth/verify-email")
def verify_email():
    token = _json_body().get("token", "")
    if not isinstance(token, str) or not token:
        return jsonify({"error": "Link invalido ou expirado"}), 400

    database = get_database()
    token_filter = {
        "email_action_hash": hash_action_token(token),
        "email_action_expires_at": {"$gt": datetime.now(timezone.utc)},
    }
    user = database.users.find_one(token_filter)
    if not user:
        return jsonify({"error": "Link invalido ou expirado"}), 400
    try:
        result = database.users.update_one(
            {"_id": user["_id"], **token_filter},
            {
                "$set": {"email": user["pending_email"], "email_verified": True},
                "$unset": {
                    "pending_email": "",
                    "email_action_hash": "",
                    "email_action_expires_at": "",
                },
            },
        )
    except DuplicateKeyError:
        return jsonify({"error": "Nao foi possivel confirmar este email"}), 409
    if result.modified_count != 1:
        return jsonify({"error": "Link invalido ou expirado"}), 400
    return jsonify({"message": "Email confirmado"}), 200


@auth_blueprint.post("/auth/recovery")
def request_password_recovery():
    body = _json_body()
    username = str(body.get("username", "")).strip()
    database = get_database()
    user = database.users.find_one(
        {"username_key": username.casefold(), "email_verified": True, "email": {"$ne": None}}
    ) if username else None
    if user:
        token, token_hash = new_action_token()
        database.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"reset_token_hash": token_hash, "reset_expires_at": _action_expiry()}},
        )
        action_url = f"{current_app.config['APP_ORIGIN']}/?reset-password={token}"
        try:
            send_action_email(user["email"], "Recuperacao de senha do Entanglement", action_url)
        except (OSError, smtplib.SMTPException):
            current_app.logger.exception("Could not send password recovery email")

    return jsonify({"message": "Se a conta tiver um email confirmado, enviaremos um link de recuperacao"}), 202


@auth_blueprint.post("/auth/reset")
def reset_password():
    body = _json_body()
    token = body.get("token", "")
    password = body.get("password", "")
    if not isinstance(token, str) or not token:
        return jsonify({"error": "Link invalido ou expirado"}), 400
    if not isinstance(password, str) or len(password) < PASSWORD_MIN_LENGTH or len(password) > 256:
        return jsonify({"error": "A senha deve ter pelo menos 10 caracteres"}), 400

    database = get_database()
    result = database.users.update_one(
        {
            "reset_token_hash": hash_action_token(token),
            "reset_expires_at": {"$gt": datetime.now(timezone.utc)},
        },
        {
            "$set": {"password_hash": hash_password(password)},
            "$unset": {"reset_token_hash": "", "reset_expires_at": ""},
        },
    )
    if result.modified_count != 1:
        return jsonify({"error": "Link invalido ou expirado"}), 400
    return jsonify({"message": "Senha atualizada"}), 200