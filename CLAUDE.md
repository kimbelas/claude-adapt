# claude-adapt

An npm CLI tool that helps developers and projects adopt Claude Code at maximum effectiveness. Four-phase lifecycle: score → init → skills → sync.

## Overview

`claude-adapt` scans any codebase, produces a Claude Code Readiness Score (0–100), generates optimized `.claude/` configuration, supports community skill packs, and keeps config evolving across sessions.

**Package name:** `claude-adapt` (available on npm)
**License:** MIT
**Language:** TypeScript
**CLI framework:** Commander.js
**Node.js target:** >= 18

## Architecture

This is a pipeline-based CLI tool with a plugin system. The core engine has zero dependencies on CLI commands — commands are thin wrappers that delegate to core.

### Key Design Patterns

- **Pipeline**: Every `score` run flows through 6 stages: Detect → Index → Analyze → Score → Recommend → Report. Each stage receives the previous stage's output.
- **Tapable hooks**: Webpack-style hook system. Plugins (including skills from Phase 3) can tap into any pipeline stage via `AsyncSeriesHook`, `AsyncParallelHook`, and `AsyncSeriesWaterfallHook`.
- **IoC container**: Lightweight dependency injection for testability. All major services are injectable via tokens.
- **Worker threads**: Analyzers run in parallel via a worker thread pool. Never block the main thread on large repos.
- **Content-hash caching**: Files are hashed; unchanged files are skipped on re-scan.
- **Transaction-based merging**: Phase 3 skill installs are atomic — full success or full rollback.
- **Additive-only security**: Skills can add to denied lists but never remove from them.

### Project Structure

```
src/
├── core/                    # The engine (zero dependencies on commands)
│   ├── pipeline/            # Orchestrator, stages, parallel executor, cache
│   ├── context/             # ScanContext, FileIndex (virtual FS), GitContext
│   ├── plugin/              # Plugin host, plugin API, hook registry
│   ├── scoring/             # Weighted aggregator, confidence, normalizer, comparator
│   ├── detection/           # Detector chain: language, framework, tooling, monorepo
│   └── di/                  # IoC container + injection tokens
├── analyzers/               # 8 category analyzers, each self-contained
│   ├── _base.ts             # Abstract analyzer with lifecycle hooks
│   ├── documentation/       # signals/ + enhancers/
│   ├── modularity/
│   ├── conventions/
│   ├── type-safety/
│   ├── test-coverage/
│   ├── git-hygiene/
│   ├── cicd/
│   └── dependencies/
├── reporters/               # terminal/ (with widgets/themes), json/
├── recommendations/         # engine, catalog, effort-estimator, templates
├── history/                 # store, diff, trends
├── generators/              # Phase 2: claude-md, settings, hooks, commands, mcp
├── skills/                  # Phase 3: registry, installer, merger (5 sub-mergers), validator
├── context/                 # Phase 4: tracker, knowledge-store, updater
├── commands/                # Thin CLI commands: score.ts, init.ts, skills.ts, sync.ts
└── cli.ts                   # Commander.js entry point
```

### Build Order (Implementation Phases)

**Phase 1 — `score` (build first)**
Core pipeline, detection chain, all 8 analyzers (base signals), terminal reporter, history tracking, CLI command. This is the MVP.

**Phase 2 — `init`**
Generators for CLAUDE.md, settings.json, commands/, hooks/, mcp.json. Template engine (Handlebars partials). Depends on Phase 1 detection + scoring output.

**Phase 3 — `skills`**
Skill manifest format (`claude-skill.json`), 5 sub-mergers (CLAUDE.md, hooks, settings, commands, MCP), npm registry integration, skill validation, lockfile. The merge engine is the hardest engineering problem.

**Phase 4 — `sync`**
Session collector (git diff analysis), decision detector, hotspot tracker, convention drift detector, insight engine, CLAUDE.md updater. Depends on Phase 1 for quick re-scoring.

## Code Conventions

- **TypeScript strict mode** — `strict: true` in tsconfig.json
- **Naming**: camelCase for files and variables, PascalCase for classes and interfaces
- **Imports**: Node.js built-ins first, then external deps, then internal (with blank line separators)
- **No default exports** except for CLI entry point
- **Errors**: Use custom error classes extending a base `ClaudeAdaptError`
- **Async**: Prefer `async/await` over raw promises
- **Immutability**: Use `structuredClone()` before mutating objects, especially in mergers
- **Tests**: Co-located in `__tests__/` directories next to source files, using Vitest

## Key Types

The atomic unit of everything is the `Signal`:

```typescript
interface Signal {
  id: string;              // "documentation.readme.quality"
  category: string;        // "documentation"
  name: string;            // "README Quality"
  value: number;           // Raw measurement
  unit: string;            // "ratio", "count", "lines"
  score: number;           // Normalized 0–1
  confidence: number;      // 0–1
  evidence: Evidence[];    // Files/lines that contributed
  threshold: { poor: number; fair: number; good: number };
  claudeImpact: string;   // Why this matters for Claude Code
}
```

The scoring formula includes confidence adjustment:
`adjustedScore = rawScore × confidence + 0.5 × (1 - confidence)`

This means uncertain signals pull toward neutral (0.5), not zero.

## Scoring Categories

8 categories, 38 signals total. Tier 1 (20pts each): Documentation, Modularity, Conventions. Tier 2 (12/12/8): Type Safety, Test Coverage, Git Hygiene. Tier 3 (4pts each): CI/CD, Dependencies. Total: 100.

Full signal specifications are in `docs/phase1-spec.md`.

## Testing

- **Framework**: Vitest
- **Fixtures**: `test/fixtures/` contains fake repos (perfect-score, zero-score, typescript-messy, python-clean)
- **Snapshots**: Terminal output and JSON reports use snapshot testing
- **Run**: `npm test` or `npx vitest`
- **Coverage**: `npm run test:coverage`

## Common Tasks

- `npm run build` — Compile TypeScript
- `npm run dev` — Watch mode
- `npm test` — Run tests
- `npm run lint` — ESLint
- `npm run format` — Prettier
- `npm run score` — Dogfood: run claude-adapt on itself

## Dependencies (Planned)

- `commander` — CLI framework
- `chalk` — Terminal colors
- `ora` — Spinners
- `glob` / `fast-glob` — File matching
- `handlebars` — Template engine (Phase 2)
- `semver` — Version comparison
- `ci-info` — CI environment detection

Dev dependencies:
- `vitest` — Test framework
- `typescript` — Compiler
- `eslint` + `prettier` — Linting/formatting
- `tsup` — Bundler

## Gotchas

- The merge engine (Phase 3) is the most complex component. Source-tracking markers in CLAUDE.md use HTML comments (`<!-- claude-adapt:source:* -->`). These must be preserved exactly — corruption breaks removal.
- Hook composition uses block markers (`# --- claude-adapt:skill:name (priority: N) ---`). The parser is line-based and whitespace-sensitive.
- Settings merging is additive-only by design. If a test tries to verify that a skill removed a denied command, that's a security invariant violation, not a bug.
- `FileIndex` uses lazy AST parsing — don't call `.parse()` unless the analyzer actually needs AST data. Premature parsing on large repos kills performance.
- Worker threads: Analyzers must be serializable. Don't pass non-serializable objects (streams, sockets) to worker contexts.
- The recommendation ranking formula is `(gap × impact) / effortScore`. If you change the effort scale (currently 1/3/5), all recommendations shift.

## Reference Specs

Detailed specifications for each phase:
- `docs/phase1-spec.md` — Score: all 38 signals, thresholds, scoring math
- `docs/phase2-spec.md` — Init: 5 generators, template selection, safety presets
- `docs/phase3-spec.md` — Skills: manifest format, 5 sub-mergers, full algorithms
- `docs/phase4-spec.md` — Sync: decision detection, hotspot tracking, CLAUDE.md updater
