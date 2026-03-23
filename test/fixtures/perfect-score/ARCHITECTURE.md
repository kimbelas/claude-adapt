# Architecture

## High-Level Design

Perfect Score uses a simple layered architecture optimised for testability and separation of concerns.

```
┌─────────────────────────┐
│       Entry Point        │   src/index.ts — public API surface
├─────────────────────────┤
│       Services           │   src/services/ — business logic
├─────────────────────────┤
│       Utilities          │   src/utils/ — pure helper functions
└─────────────────────────┘
```

## Layers

### Entry Point (`src/index.ts`)

Re-exports all public types and classes. Consumers should only import from the package root; internal module paths are not part of the public API.

### Services (`src/services/`)

Each service encapsulates a domain. Services accept dependencies through constructor injection so they can be easily mocked in tests.

### Utilities (`src/utils/`)

Pure, stateless functions with no side effects. Every utility must have a corresponding unit test.

## Data Flow

1. Consumer calls a service method.
2. The service validates input, applies business rules, and delegates to a data source.
3. Results are mapped to domain types and returned.

## Testing Strategy

- **Unit tests** cover utilities and service methods in isolation.
- **Integration tests** (future) will cover service-to-database interactions.
- Coverage target: 90%.
