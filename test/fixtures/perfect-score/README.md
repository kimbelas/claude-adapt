# Perfect Score

A robust, production-ready TypeScript library for user management and utility functions, built with best practices and comprehensive testing.

## Overview

Perfect Score provides a modular, type-safe API for managing users, performing common data transformations, and integrating with external services. Designed for scalability, maintainability, and developer experience.

## Installation

```bash
npm install perfect-score
```

Or with yarn:

```bash
yarn add perfect-score
```

### Prerequisites

- Node.js >= 18.0.0
- TypeScript >= 5.0.0

## Usage

```typescript
import { UserService, formatCurrency, slugify } from 'perfect-score';

// Create a user service instance
const userService = new UserService();

// Create a new user
const user = await userService.createUser({
  name: 'Jane Doe',
  email: 'jane@example.com',
  role: 'admin',
});

// Use utility functions
const price = formatCurrency(29.99, 'USD'); // "$29.99"
const slug = slugify('Hello World'); // "hello-world"
```

## API Reference

### UserService

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `createUser` | `CreateUserDto` | `Promise<User>` | Creates a new user |
| `getUserById` | `string` | `Promise<User \| null>` | Fetches a user by ID |
| `updateUser` | `string, UpdateUserDto` | `Promise<User>` | Updates an existing user |
| `deleteUser` | `string` | `Promise<void>` | Soft-deletes a user |
| `listUsers` | `ListUsersOptions` | `Promise<PaginatedResult<User>>` | Lists users with pagination |

### Utility Functions

- **`formatCurrency(amount: number, currency: string): string`** — Formats a number as a localized currency string.
- **`slugify(text: string): string`** — Converts a string into a URL-safe slug.
- **`debounce<T>(fn: T, ms: number): T`** — Returns a debounced version of the given function.
- **`deepClone<T>(obj: T): T`** — Creates a deep clone of the given object.
- **`truncate(str: string, maxLen: number): string`** — Truncates a string and appends an ellipsis if necessary.

## Architecture

The project follows a layered architecture:

```
src/
  index.ts          # Public API entry point
  services/         # Business logic layer
    user-service.ts
  utils/            # Pure utility functions
    helpers.ts
```

Each layer has a clear responsibility:

- **Entry point** re-exports the public API surface.
- **Services** encapsulate business logic and data access.
- **Utils** contain pure, stateless helper functions.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a detailed breakdown.

## Contributing

We welcome contributions. Please follow these steps:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feat/my-feature`).
3. Write tests for your changes.
4. Ensure all tests pass (`npm test`).
5. Run the linter (`npm run lint`).
6. Submit a pull request with a clear description.

### Code Style

- Follow the project ESLint and Prettier configurations.
- All exported functions must include JSDoc comments.
- Maintain 90%+ test coverage.

## License

MIT License. See [LICENSE](./LICENSE) for details.
