"""Tests for the main Flask application."""

import pytest
from src.main import create_app


@pytest.fixture
def client():
    """Create a test client for the Flask app."""
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_health_check(client) -> None:
    """Health endpoint returns 200 with status healthy."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "healthy"


def test_list_users_empty(client) -> None:
    """Listing users on a fresh app returns an empty list."""
    response = client.get("/api/users")
    assert response.status_code == 200
    assert response.get_json()["users"] == []


def test_create_user(client) -> None:
    """Creating a user returns 201 with the new user data."""
    response = client.post(
        "/api/users",
        json={"name": "Alice", "email": "alice@example.com"},
    )
    assert response.status_code == 201
    data = response.get_json()["user"]
    assert data["name"] == "Alice"
    assert data["email"] == "alice@example.com"
    assert "id" in data


def test_create_user_missing_fields(client) -> None:
    """Creating a user without required fields returns 400."""
    response = client.post("/api/users", json={"name": "Bob"})
    assert response.status_code == 400


def test_get_user_not_found(client) -> None:
    """Getting a non-existent user returns 404."""
    response = client.get("/api/users/999")
    assert response.status_code == 404


def test_get_user_after_create(client) -> None:
    """After creating a user, it can be retrieved by ID."""
    create_resp = client.post(
        "/api/users",
        json={"name": "Charlie", "email": "charlie@example.com"},
    )
    user_id = create_resp.get_json()["user"]["id"]
    get_resp = client.get("/api/users/" + str(user_id))
    assert get_resp.status_code == 200
    assert get_resp.get_json()["user"]["name"] == "Charlie"
