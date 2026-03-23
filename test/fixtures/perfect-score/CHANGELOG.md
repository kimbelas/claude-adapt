# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2025-12-10

### Added

- `deepClone` utility for safely cloning nested objects.
- Pagination support for `UserService.listUsers`.

### Changed

- Improved error messages in `UserService.createUser` to include field-level details.

## [1.2.1] - 2025-11-22

### Fixed

- Fixed `slugify` stripping non-ASCII Unicode characters unexpectedly.

## [1.2.0] - 2025-11-01

### Added

- `truncate` utility function.
- `debounce` utility function with configurable leading/trailing edge.

### Changed

- Upgraded TypeScript from 5.3 to 5.5.

## [1.1.0] - 2025-09-15

### Added

- `UserService.updateUser` method.
- `UserService.deleteUser` with soft-delete support.

### Security

- Added input sanitisation to `createUser` to prevent stored XSS via name field.

## [1.0.0] - 2025-08-01

### Added

- Initial release with `UserService` (create, get, list).
- Utility functions: `formatCurrency`, `slugify`.
- Full test suite with >95% coverage.
- CI pipeline with GitHub Actions.
