"""User model and repository."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass(frozen=True)
class User:
    """Represents a user in the system.

    Attributes:
        id: Unique identifier for the user.
        name: Full name of the user.
        email: Email address, must be unique.
        created_at: Timestamp of account creation.
    """

    id: int
    name: str
    email: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict[str, str | int]:
        """Serialize the user to a dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "created_at": self.created_at.isoformat(),
        }


class UserRepository:
    """In-memory repository for User entities.

    Provides CRUD operations for users stored in memory.
    Intended as a test double for a real database-backed repository.
    """

    def __init__(self) -> None:
        self._users: dict[int, User] = {}
        self._next_id: int = 1

    def get_all(self) -> list[User]:
        """Return all users, ordered by ID."""
        return sorted(self._users.values(), key=lambda u: u.id)

    def get_by_id(self, user_id: int) -> User | None:
        """Return a user by ID, or None if not found."""
        return self._users.get(user_id)

    def create(self, *, name: str, email: str) -> User:
        """Create and store a new user.

        Args:
            name: The user full name.
            email: The user email address.

        Returns:
            The newly created User instance.
        """
        user = User(id=self._next_id, name=name, email=email)
        self._users[user.id] = user
        self._next_id += 1
        return user

    def delete(self, user_id: int) -> bool:
        """Delete a user by ID. Returns True if found and deleted."""
        if user_id in self._users:
            del self._users[user_id]
            return True
        return False
