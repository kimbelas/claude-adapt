import { describe, expect, it, beforeEach } from 'vitest';

import { UserService } from '../../src/services/user-service.js';
import type { CreateUserDto } from '../../src/services/user-service.js';

describe('UserService', () => {
  let service: UserService;

  const validDto: CreateUserDto = {
    name: 'Jane Doe',
    email: 'Jane@Example.COM',
    role: 'admin',
  };

  beforeEach(() => {
    service = new UserService();
  });

  describe('createUser', () => {
    it('creates a user with a generated ID', async () => {
      const user = await service.createUser(validDto);

      expect(user.id).toBeDefined();
      expect(user.name).toBe('Jane Doe');
      expect(user.email).toBe('jane@example.com');
      expect(user.role).toBe('admin');
      expect(user.deletedAt).toBeNull();
    });

    it('trims whitespace from name and email', async () => {
      const user = await service.createUser({
        name: '  Alice  ',
        email: '  ALICE@test.com  ',
        role: 'viewer',
      });

      expect(user.name).toBe('Alice');
      expect(user.email).toBe('alice@test.com');
    });
  });

  describe('getUserById', () => {
    it('returns the user when it exists', async () => {
      const created = await service.createUser(validDto);
      const found = await service.getUserById(created.id);

      expect(found).toEqual(created);
    });

    it('returns null for a non-existent ID', async () => {
      const found = await service.getUserById('non-existent');
      expect(found).toBeNull();
    });

    it('returns null for a soft-deleted user', async () => {
      const created = await service.createUser(validDto);
      await service.deleteUser(created.id);

      const found = await service.getUserById(created.id);
      expect(found).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('updates the specified fields', async () => {
      const created = await service.createUser(validDto);
      const updated = await service.updateUser(created.id, { name: 'Updated Name' });

      expect(updated.name).toBe('Updated Name');
      expect(updated.email).toBe(created.email);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    it('throws when the user does not exist', async () => {
      await expect(service.updateUser('bad-id', { name: 'X' })).rejects.toThrow(
        'User not found: bad-id',
      );
    });
  });

  describe('deleteUser', () => {
    it('soft-deletes the user', async () => {
      const created = await service.createUser(validDto);
      await service.deleteUser(created.id);

      const found = await service.getUserById(created.id);
      expect(found).toBeNull();
    });

    it('throws when the user does not exist', async () => {
      await expect(service.deleteUser('bad-id')).rejects.toThrow('User not found: bad-id');
    });
  });
});
