# Contributing to claude-adapt

Thank you for your interest in contributing to claude-adapt! This project aims to make any codebase Claude Code-ready by scoring, configuring, extending, and evolving your Claude Code setup. Whether you are fixing a bug, adding a feature, improving documentation, or creating a skill pack, your contributions are welcome.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [How to Contribute](#how-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Creating a Skill](#creating-a-skill)
  - [Adding an Analyzer](#adding-an-analyzer)
  - [Improving Scoring Calibration](#improving-scoring-calibration)
- [Pull Request Process](#pull-request-process)
- [Commit Conventions](#commit-conventions)
- [Code of Conduct](#code-of-conduct)

## Development Setup

1. **Fork the repository** on GitHub at [kimbelas/claude-adapt](https://github.com/kimbelas/claude-adapt).

2. **Clone your fork:**

   ```bash
   git clone https://github.com/<your-username>/claude-adapt.git
   cd claude-adapt
   ```

3. **Install dependencies:**

   ```bash
   npm install
   ```

4. **Build the project:**

   ```bash
   npm run build
   ```

5. **Run the tests to verify everything works:**

   ```bash
   npm test
   ```

You need Node.js >= 18. The project uses ESM modules exclusively.

### Useful Commands

| Command                  | Description                              |
| ------------------------ | ---------------------------------------- |
| `npm run build`          | Compile TypeScript with tsup             |
| `npm run dev`            | Watch mode for development               |
| `npm test`               | Run tests with vitest                    |
| `npm run test:coverage`  | Run tests with coverage report           |
| `npm run lint`           | Run ESLint                               |
| `npm run format`         | Run Prettier                             |
| `npm run typecheck`      | TypeScript type checking without emitting|
| `npm run score`          | Dogfood: run claude-adapt on itself      |

## Project Structure

```
src/
├── cli.ts                   # Commander.js entry point
├── types.ts                 # Shared type definitions (Signal, Evidence, etc.)
├── errors.ts                # Custom error classes
├── core/                    # Engine internals (zero dependencies on commands)
│   ├── pipeline/            # Orchestrator, stages, parallel executor, cache
│   ├── context/             # ScanContext, FileIndex, GitContext
│   ├── plugin/              # Plugin host, plugin API, hook registry
│   ├── scoring/             # Weighted aggregator, confidence, normalizer
│   ├── detection/           # Language, framework, tooling, monorepo detection
│   └── di/                  # IoC container and injection tokens
├── analyzers/               # 8 category analyzers (documentation, modularity, etc.)
│   └── _base.ts             # Abstract BaseAnalyzer class
├── commands/                # Thin CLI commands: score, init, skills, sync
├── enhance/                 # Enhancement utilities
├── generators/              # Config generators (CLAUDE.md, settings, hooks, etc.)
├── skills/                  # Skill system: registry, installer, mergers, validator
├── context/                 # Session tracking, knowledge store, updater
├── reporters/               # Terminal, JSON, and HTML report output
├── recommendations/         # Recommendation engine and templates
└── history/                 # Score history, diffs, and trends
```

Key directories outside `src/`:
- `test/fixtures/` -- Fake repositories used in tests (perfect-score, zero-score, etc.)
- `templates/` -- Handlebars templates for config generation
- `skills/` -- Built-in skill packs
- `docs/` -- Phase specifications and guides

## Code Standards

### TypeScript

- **Strict mode** is required. The `tsconfig.json` has `strict: true` enabled.
- Target ESM. All imports must include the `.js` extension for Node.js ESM compatibility.
- Use custom error classes extending `ClaudeAdaptError` from `src/errors.ts`.
- Prefer `structuredClone()` before mutating objects, especially in mergers.

### Naming Conventions

- **Files and variables:** `camelCase` (e.g., `scanContext.ts`, `fileIndex`)
- **Classes and interfaces:** `PascalCase` (e.g., `BaseAnalyzer`, `ScanContext`)
- **Constants:** `UPPER_SNAKE_CASE` for true constants, `camelCase` for derived values
- **Test files:** Place in `__tests__/` directories next to the source (e.g., `src/analyzers/__tests__/`)

### Import Ordering

Organize imports in three groups separated by blank lines:

```typescript
// 1. Node.js built-in modules
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// 2. External dependencies
import chalk from 'chalk';
import { Command } from 'commander';

// 3. Internal modules
import type { Signal } from '../types.js';
import { BaseAnalyzer } from './_base.js';
```

### General Rules

- **No default exports** except for the CLI entry point (`cli.ts`).
- **Async/await** is preferred over raw promise chains.
- Use `async/await` consistently; do not mix `.then()` and `await`.
- Keep functions focused. If a function exceeds roughly 50 lines, consider extracting helpers.
- Document public APIs with JSDoc comments.

## Testing

The project uses [vitest](https://vitest.dev/) as its test framework. There are currently 251 tests across 15 test files.

### Test Organization

- Tests live in `__tests__/` directories co-located with the source code they test.
- Test fixtures (fake repositories) are in `test/fixtures/`. Available fixtures include: `perfect-score`, `zero-score`, `typescript-messy`, `python-clean`, `laravel`, and `monorepo`.
- Snapshot testing is used for terminal output and JSON reports.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npx vitest --watch

# Run a specific test file
npx vitest src/analyzers/__tests__/documentation.test.ts

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

- Name test files with a `.test.ts` suffix.
- Use descriptive test names that explain the expected behavior.
- Use the fixture repositories when testing analyzers or scoring.

```typescript
import { describe, it, expect } from 'vitest';

describe('MyAnalyzer', () => {
  it('should detect missing documentation signals', async () => {
    // Arrange, Act, Assert
  });
});
```

## How to Contribute

### Reporting Bugs

If you find a bug, please [open an issue](https://github.com/kimbelas/claude-adapt/issues/new?template=bug_report.md) with:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Your environment: Node.js version, OS, claude-adapt version
- Any relevant error output or screenshots

### Suggesting Features

Feature ideas are welcome. [Open a feature request](https://github.com/kimbelas/claude-adapt/issues/new?template=feature_request.md) describing:

- The problem you are trying to solve
- Your proposed solution
- Any alternatives you have considered
- Whether you would be willing to implement it

### Creating a Skill

Skills are portable bundles of Claude Code configuration that the community can share. If you want to create a skill pack for a framework, tool, or workflow, see the dedicated guide at [docs/creating-skills.md](docs/creating-skills.md).

Skills follow the `claude-skill-*` npm naming convention and are published to the npm registry.

### Adding an Analyzer

Analyzers evaluate specific aspects of a codebase. Each analyzer extends the abstract `BaseAnalyzer` class in `src/analyzers/_base.ts`.

To add a new analyzer:

1. **Create a directory** under `src/analyzers/` for your category (e.g., `src/analyzers/accessibility/`).

2. **Extend `BaseAnalyzer`** and implement the required members:

   ```typescript
   import { BaseAnalyzer, type SignalDefinition } from '../_base.js';
   import type { AnalyzerCategory, Signal, AnalyzerResult } from '../../types.js';
   import type { ScanContext } from '../../core/context/scan-context.js';

   export class AccessibilityAnalyzer extends BaseAnalyzer {
     readonly category: AnalyzerCategory = 'accessibility';

     readonly signals: SignalDefinition[] = [
       {
         id: 'accessibility.aria-usage',
         name: 'ARIA Attribute Usage',
         unit: 'ratio',
         threshold: { poor: 0.2, fair: 0.5, good: 0.8 },
         claudeImpact: 'Helps Claude generate accessible components',
       },
     ];

     protected async evaluateSignal(
       signal: SignalDefinition,
       context: ScanContext,
     ): Promise<Signal> {
       // Evaluate the signal and return a result
     }
   }
   ```

3. **Define signals** with clear thresholds. Each signal needs an `id` following the pattern `category.signal-name`, a `unit` (ratio, count, lines), thresholds for poor/fair/good, and a `claudeImpact` explanation.

4. **Register the analyzer** by adding it to the analyzer registry so the pipeline picks it up.

5. **Write tests** in a `__tests__/` directory within your analyzer folder. Use the test fixtures to validate against known codebases.

### Improving Scoring Calibration

The scoring system uses 38 signals across 8 categories. If you believe a threshold or weight is miscalibrated:

1. Open an issue describing the miscalibration with concrete examples.
2. Reference the signal ID (e.g., `documentation.readme.quality`) and the current thresholds from `docs/phase1-spec.md`.
3. Propose new threshold values with rationale.
4. If submitting a PR, include test cases that demonstrate the improvement. Run `npm run score` on the fixture repositories to verify that scores remain reasonable.

Note: the scoring formula uses confidence adjustment (`adjustedScore = rawScore * confidence + 0.5 * (1 - confidence)`), so uncertain signals pull toward neutral, not zero.

## Pull Request Process

1. **Branch from `main`:**

   ```bash
   git checkout -b feat/my-feature main
   ```

2. **Make your changes.** Keep commits focused and atomic.

3. **Write or update tests** for any changed functionality. All new code should have test coverage.

4. **Run the full check suite before pushing:**

   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```

   All four must pass.

5. **Push your branch** and open a pull request against `main`.

6. **Describe your changes clearly** in the PR description:
   - What problem does this solve?
   - How does it work?
   - Are there any breaking changes?
   - How was it tested?

7. **Respond to review feedback.** Maintainers may request changes. Please keep the discussion constructive and on-topic.

8. **Squash or rebase** if requested. The maintainers may squash-merge your PR.

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must follow this format:

```
<type>(<optional scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type       | When to Use                                      |
| ---------- | ------------------------------------------------ |
| `feat`     | A new feature                                    |
| `fix`      | A bug fix                                        |
| `docs`     | Documentation changes only                       |
| `test`     | Adding or updating tests                         |
| `refactor` | Code changes that neither fix a bug nor add a feature |
| `chore`    | Build process, tooling, or dependency updates    |
| `perf`     | Performance improvements                         |
| `ci`       | CI/CD configuration changes                      |

### Examples

```
feat(analyzers): add accessibility analyzer with ARIA signal
fix(scoring): correct confidence adjustment for edge case at zero
docs: update CONTRIBUTING.md with analyzer guide
test(skills): add merge conflict resolution tests
refactor(pipeline): extract cache invalidation to separate module
chore: update vitest to v2.2.0
```

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold a welcoming, inclusive, and harassment-free environment for everyone.

If you experience or witness unacceptable behavior, please report it through [GitHub Issues](https://github.com/kimbelas/claude-adapt/issues) or by using [GitHub Security Advisories](https://github.com/kimbelas/claude-adapt/security/advisories) for sensitive matters.

---

Thank you for contributing to claude-adapt!
