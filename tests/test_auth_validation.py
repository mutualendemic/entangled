from backend.app import create_app


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


def test_private_profile_requires_authentication():
    response = create_app().test_client().get("/api/profiles/me")

    assert response.status_code == 401