import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash


def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    return check_password_hash(password_hash, password)


def create_access_token(user: dict) -> str:
    secret = current_app.config["JWT_SECRET"]
    if not secret:
        raise RuntimeError("JWT_SECRET must be configured")

    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": user["_id"],
            "username": user["username"],
            "avatar": user["avatar"],
            "type": "access",
            "iat": now,
            "exp": now + timedelta(minutes=current_app.config["JWT_ACCESS_TOKEN_MINUTES"]),
        },
        secret,
        algorithm="HS256",
    )


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        authorization = request.headers.get("Authorization", "")
        scheme, _, token = authorization.partition(" ")
        secret = current_app.config["JWT_SECRET"]
        if scheme.lower() != "bearer" or not token or not secret:
            return jsonify({"error": "Autenticacao necessaria"}), 401

        try:
            claims = jwt.decode(token, secret, algorithms=["HS256"])
            if claims.get("type") != "access":
                raise jwt.InvalidTokenError("Wrong token type")
            g.user = {
                "id": claims["sub"],
                "username": claims["username"],
                "avatar": claims["avatar"],
            }
        except (jwt.InvalidTokenError, KeyError):
            return jsonify({"error": "Sessao invalida ou expirada"}), 401

        return view(*args, **kwargs)

    return wrapped


def new_action_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return token, token_hash


def hash_action_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()