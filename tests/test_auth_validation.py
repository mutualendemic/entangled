from backend.app import create_app
from backend.app.config import Config, _jwt_secret
from backend.app.database import configure_dns_resolver
from backend.app.routes import auth
import dns.resolver
from pymongo.errors import ConfigurationError


class MissingJwtConfig(Config):
    JWT_SECRET = ""


def test_jwt_secret_derives_separate_key_from_supabase_secret(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-supabase-signing-secret")

    derived_secret = _jwt_secret()

    assert derived_secret
    assert derived_secret != "test-supabase-signing-secret"
    assert derived_secret == _jwt_secret()


def test_jwt_secret_prefers_explicit_value(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("JWT_SECRET", "explicit-test-jwt-secret")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-supabase-signing-secret")

    assert _jwt_secret() == "explicit-test-jwt-secret"


def test_registration_rejects_invalid_username_without_database():
    client = create_app().test_client()

    response = client.post(
        "/api/auth/register",
        json={"username": "x", "password": "long-enough-password", "avatar": "moss"},
    )

    assert response.status_code == 400


def test_registration_rejects_short_password_without_database():
    client = create_app().test_client()

    response = client.post(
        "/api/auth/register",
        json={"username": "player_1", "password": "short", "avatar": "moss"},
    )

    assert response.status_code == 400


def test_registration_requires_jwt_secret_before_database(monkeypatch):
    def unexpected_database_call():
        raise AssertionError("Database should not be accessed without JWT_SECRET")

    monkeypatch.setattr(auth, "get_database", unexpected_database_call)
    client = create_app(MissingJwtConfig).test_client()

    response = client.post(
        "/api/auth/register",
        json={"username": "player_1", "password": "long-enough-password", "avatar": "moss"},
    )

    assert response.status_code == 503
    assert "JWT_SECRET" in response.get_json()["error"]


def test_registration_returns_service_unavailable_when_mongodb_dns_fails(monkeypatch):
    def fail_database():
        raise ConfigurationError("resolver unavailable")

    monkeypatch.setattr(auth, "get_database", fail_database)
    app = create_app()
    app.config["JWT_SECRET"] = "test-jwt-secret-with-at-least-32-bytes"
    client = app.test_client()

    response = client.post(
        "/api/auth/register",
        json={"username": "player_1", "password": "long-enough-password", "avatar": "moss"},
    )

    assert response.status_code == 503
    assert response.get_json() == {
        "error": "Banco indisponivel. Verifique a conexao e a configuracao DNS."
    }


def test_configured_mongodb_dns_servers_are_applied():
    app = create_app()
    app.config["MONGODB_DNS_SERVERS"] = ["1.1.1.1", "8.8.8.8"]

    with app.app_context():
        configure_dns_resolver()

    assert dns.resolver.get_default_resolver().nameservers == ["1.1.1.1", "8.8.8.8"]


def test_private_profile_requires_authentication():
    response = create_app().test_client().get("/api/profiles/me")

    assert response.status_code == 401