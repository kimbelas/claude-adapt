"""Main application module for the Flask API."""

from __future__ import annotations

from flask import Flask, jsonify, request
from http import HTTPStatus

from models.user import User, UserRepository


def create_app() -> Flask:
    """Create and configure the Flask application."""
    app = Flask(__name__)
    repo = UserRepository()

    @app.get("/health")
    def health_check() -> tuple[dict[str, str], int]:
        """Return service health status."""
        return {"status": "healthy"}, HTTPStatus.OK

    @app.get("/api/users")
    def list_users() -> tuple[dict, int]:
        """List all users."""
        users = repo.get_all()
        return {"users": [u.to_dict() for u in users]}, HTTPStatus.OK

    @app.get("/api/users/<int:user_id>")
    def get_user(user_id: int) -> tuple[dict, int]:
        """Get a user by ID."""
        user = repo.get_by_id(user_id)
        if user is None:
            return {"error": "User not found"}, HTTPStatus.NOT_FOUND
        return {"user": user.to_dict()}, HTTPStatus.OK

    @app.post("/api/users")
    def create_user() -> tuple[dict, int]:
        """Create a new user from JSON request body."""
        data = request.get_json(silent=True)
        if not data or "name" not in data or "email" not in data:
            return {"error": "name and email are required"}, HTTPStatus.BAD_REQUEST
        user = repo.create(name=data["name"], email=data["email"])
        return {"user": user.to_dict()}, HTTPStatus.CREATED

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5000)
