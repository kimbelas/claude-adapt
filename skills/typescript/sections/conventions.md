## TypeScript Conventions

- Enable `strict: true` in tsconfig.json. Never weaken strict checks.
- Prefer `interface` over `type` for object shapes that may be extended.
- Use `unknown` instead of `any`. When `any` is unavoidable, add a `// eslint-disable` comment with justification.
- Prefer discriminated unions over optional fields for mutually exclusive states.
- Use `readonly` for properties that should not be reassigned after construction.
- Prefer `const` assertions (`as const`) for literal types.
- Use explicit return types on exported functions for API stability.
- Avoid `enum` in favor of `const` objects with `as const` for tree-shaking.
- Use `satisfies` operator for type-safe object literals when inference is desired.
- Prefer `Map` and `Set` over plain objects for dynamic key collections.
- Use `import type` for type-only imports to avoid runtime overhead.
- Handle `null` and `undefined` explicitly; avoid non-null assertions (`!`) except in tests.
