"""Tests for the User model and repository."""

import pytest
from src.models.user import User, UserRepository


class TestUser:
    """Tests for the User dataclass."""

    def test_user_creation(self) -> None:
        """A user can be created with required fields."""
        user = User(id=1, name="Alice", email="alice@example.com")
        assert user.id == 1
        assert user.name == "Alice"
        assert user.email == "alice@example.com"

    def test_user_is_frozen(self) -> None:
        """User instances are immutable."""
        user = User(id=1, name="Alice", email="alice@example.com")
        with pytest.raises(AttributeError):
            user.name = "Bob"

    def test_user_to_dict(self) -> None:
        """to_dict serializes all expected fields."""
        user = User(id=1, name="Alice", email="alice@example.com")
        result = user.to_dict()
        assert result["id"] == 1
        assert result["name"] == "Alice"
        assert result["email"] == "alice@example.com"
        assert "created_at" in result


class TestUserRepository:
    """Tests for the UserRepository."""

    def test_get_all_empty(self) -> None:
        """A fresh repository returns an empty list."""
        repo = UserRepository()
        assert repo.get_all() == []

    def test_create_assigns_incrementing_ids(self) -> None:
        """Each created user gets a unique, incrementing ID."""
        repo = UserRepository()
        user1 = repo.create(name="Alice", email="alice@example.com")
        user2 = repo.create(name="Bob", email="bob@example.com")
        assert user1.id == 1
        assert user2.id == 2

    def test_get_by_id_found(self) -> None:
        """get_by_id returns the correct user."""
        repo = UserRepository()
        created = repo.create(name="Alice", email="alice@example.com")
        found = repo.get_by_id(created.id)
        assert found is not None
        assert found.name == "Alice"

    def test_get_by_id_not_found(self) -> None:
        """get_by_id returns None for missing IDs."""
        repo = UserRepository()
        assert repo.get_by_id(999) is None

    def test_delete_existing(self) -> None:
        """Deleting an existing user returns True and removes it."""
        repo = UserRepository()
        user = repo.create(name="Alice", email="alice@example.com")
        assert repo.delete(user.id) is True
        assert repo.get_by_id(user.id) is None

    def test_delete_nonexistent(self) -> None:
        """Deleting a non-existent user returns False."""
        repo = UserRepository()
        assert repo.delete(999) is False
