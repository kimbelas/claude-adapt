/**
 * User management service.
 *
 * Encapsulates all user-related business logic including creation,
 * retrieval, update, and soft-deletion.
 */

import { randomUUID } from 'node:crypto';

/** Represents a persisted user entity. */
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Payload required to create a new user. */
export interface CreateUserDto {
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
}

/** Fields that may be updated on an existing user. */
export interface UpdateUserDto {
  name?: string;
  email?: string;
  role?: 'admin' | 'editor' | 'viewer';
}

/**
 * Service responsible for user CRUD operations.
 *
 * @example
 * ```ts
 * const service = new UserService();
 * const user = await service.createUser({ name: 'Ada', email: 'ada@example.com', role: 'admin' });
 * ```
 */
export class UserService {
  private readonly users: Map<string, User> = new Map();

  /** Creates a new user and returns the persisted entity. */
  async createUser(dto: CreateUserDto): Promise<User> {
    const now = new Date();
    const user: User = {
      id: randomUUID(),
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      role: dto.role,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.users.set(user.id, user);
    return user;
  }

  /** Retrieves a user by ID, or `null` if not found / deleted. */
  async getUserById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    if (!user || user.deletedAt !== null) {
      return null;
    }
    return user;
  }

  /** Updates selected fields on an existing user. */
  async updateUser(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error(`User not found: ${id}`);
    }
    const updated: User = {
      ...user,
      ...dto,
      updatedAt: new Date(),
    };
    this.users.set(id, updated);
    return updated;
  }

  /** Soft-deletes a user by setting the deletedAt timestamp. */
  async deleteUser(id: string): Promise<void> {
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error(`User not found: ${id}`);
    }
    user.deletedAt = new Date();
    this.users.set(id, user);
  }
}
