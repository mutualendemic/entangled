from backend.app import create_app
from backend.app.config import Config, _jwt_secret
from backend.app.database import configure_dns_resolver
from backend.app.osm_features import _overpass_query, parse_osm_elements
from backend.app.routes import auth, world
from backend.app.security import create_access_token
import dns.resolver
from pymongo.errors import ConfigurationError
from types import SimpleNamespace


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


def test_registration_explains_duplicate_username(monkeypatch):
    class DuplicateUsers:
        @staticmethod
        def insert_one(_user):
            from pymongo.errors import DuplicateKeyError

            raise DuplicateKeyError("duplicate key")

    class FakeDatabase:
        users = DuplicateUsers()

    monkeypatch.setattr(auth, "get_database", lambda: FakeDatabase())
    app = create_app()
    app.config["JWT_SECRET"] = "test-jwt-secret-with-at-least-32-bytes"

    response = app.test_client().post(
        "/api/auth/register",
        json={"username": "player_1", "password": "long-enough-password", "avatar": "moss"},
    )

    assert response.status_code == 409
    assert response.get_json() == {
        "error": "Este nome de jogador ja esta em uso. Entre na conta ou escolha outro nome."
    }


def test_configured_mongodb_dns_servers_are_applied():
    app = create_app()
    app.config["MONGODB_DNS_SERVERS"] = ["1.1.1.1", "8.8.8.8"]

    with app.app_context():
        configure_dns_resolver()

    assert dns.resolver.get_default_resolver().nameservers == ["1.1.1.1", "8.8.8.8"]


def test_world_center_is_initialized_once_for_shared_five_kilometer_area(monkeypatch):
    class FakeEvents:
        document = None

        def find_one(self, _query, _projection=None):
            return self.document

        def update_one(self, query, update, upsert=False):
            self.document = {
                "_id": query["_id"],
                **update.get("$setOnInsert", {}),
                **update["$set"],
            }
            return SimpleNamespace(upserted_id="local-event" if upsert else None, modified_count=1)

    events = FakeEvents()
    monkeypatch.setattr(world, "get_database", lambda: SimpleNamespace(events=events))
    app = create_app()
    app.config["JWT_SECRET"] = "test-jwt-secret-with-at-least-32-bytes"
    with app.app_context():
        token = create_access_token({"_id": "user-1", "username": "player_1", "avatar": "moss"})

    response = app.test_client().post(
        "/api/world/center",
        json={"lat": 38.72, "lon": -9.14},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.get_json() == {"center": {"lat": 38.72, "lon": -9.14}, "initialized": True}
    assert events.document["width_m"] == 5000
    assert events.document["height_m"] == 5000


def test_unconfigured_world_uses_five_kilometer_realtime_bounds():
    assert world._world_dimensions({"center": None, "width_m": 1200, "height_m": 800}) == (5000, 5000)


def test_configured_world_dimensions_are_capped_at_five_kilometers():
    assert world._world_dimensions(
        {"center": {"lat": 38.72, "lon": -9.14}, "width_m": 8000, "height_m": 6000}
    ) == (5000, 5000)


def test_osm_features_parse_named_buildings_and_pois_without_roads():
    elements = [
        {
            "type": "way",
            "id": 12,
            "center": {"lat": 0.001, "lon": 0.001},
            "geometry": [
                {"lat": 0.0005, "lon": 0.0005},
                {"lat": 0.0005, "lon": 0.0015},
                {"lat": 0.0015, "lon": 0.0015},
                {"lat": 0.0015, "lon": 0.0005},
            ],
            "tags": {"building": "museum", "name": "Museu Central", "building:levels": "4"},
        },
        {"type": "node", "id": 13, "lat": 0.0, "lon": 0.0, "tags": {"amenity": "cafe", "name": "Cafe da Praca"}},
        {"type": "way", "id": 14, "tags": {"building": "yes"}},
    ]

    features = parse_osm_elements(elements, {"lat": 0.0, "lon": 0.0}, 5000, 5000)

    assert [feature["name"] for feature in features] == ["Museu Central", "Cafe da Praca"]
    assert features[0]["kind"] == "building"
    assert features[0]["height_m"] == 12.8
    assert len(features[0]["points"]) == 4
    assert features[1]["kind"] == "poi"
    assert all(feature["kind"] != "road" for feature in features)
    assert '"highway"' not in _overpass_query({"lat": 0, "lon": 0}, 5000, 5000)


def test_world_features_returns_named_osm_items_for_configured_event(monkeypatch):
    class FakeEvents:
        @staticmethod
        def find_one(_query, _projection=None):
            return {
                "center": {"lat": 38.72, "lon": -9.14},
                "width_m": 5000,
                "height_m": 5000,
            }

    monkeypatch.setattr(world, "get_database", lambda: SimpleNamespace(events=FakeEvents()))
    monkeypatch.setattr(
        world,
        "get_osm_features",
        lambda *_args: [{"id": "way/12", "name": "Museu Central", "kind": "building"}],
    )
    app = create_app()
    app.config["JWT_SECRET"] = "test-jwt-secret-with-at-least-32-bytes"
    with app.app_context():
        token = create_access_token({"_id": "user-1", "username": "player_1", "avatar": "moss"})

    response = app.test_client().get(
        "/api/world/features",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.get_json() == {
        "features": [{"id": "way/12", "name": "Museu Central", "kind": "building"}],
        "attribution": "OpenStreetMap contributors",
    }
    assert response.headers["Cache-Control"] == "private, max-age=3600"


def test_private_profile_requires_authentication():
    response = create_app().test_client().get("/api/profiles/me")

    assert response.status_code == 401